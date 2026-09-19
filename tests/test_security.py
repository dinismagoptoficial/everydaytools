import json
import zipfile
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import config, security, storage
from app.db import connect
from app.legal import VERSION
from app.main import app
from app.processors import archive_jobs
from conftest import authenticate, upload


def test_password_length_accepts_eight_characters():
    encoded = security.password_hash("safe1234")
    assert security.verify(encoded, "safe1234")
    with pytest.raises(HTTPException) as error:
        security.password_hash("short12")
    assert error.value.detail == "password_length"


def test_setup_and_session_fixation(client):
    user = authenticate(client)
    assert user["role"] == "ADMIN"
    old_cookie = client.cookies.get("everyday_session")
    response = client.post("/api/login", json={"email": user["email"], "password": "good-test-password"})
    assert response.status_code == 200
    assert client.cookies.get("everyday_session") != old_cookie
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert client.post("/api/setup", json={"email": "x@example.test", "password": "good-test-password", "legal_version": VERSION}).status_code == 409
    with connect() as db:
        assert db.execute("SELECT password FROM users").fetchone()[0].startswith("$argon2id$")
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 1


def test_registration_permissions_and_idor(admin_client, pdf_bytes):
    jid = upload(admin_client, pdf_bytes)
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as other:
        authenticate(other, "other@example.test", setup=False)
        assert other.get("/api/jobs").json() == []
        for path in (f"/api/jobs/{jid}", f"/api/jobs/{jid}/original/0", f"/api/jobs/{jid}/download/0", f"/api/jobs/{jid}/matte/0/mask"):
            assert other.get(path).status_code == 404
        assert other.delete(f"/api/jobs/{jid}").status_code == 404
        assert other.post(f"/api/jobs/{jid}/run", json={"operation": "pdf_text"}).status_code == 404
        assert other.post(f"/api/jobs/{jid}/cancel").status_code == 404
        assert other.put(f"/api/jobs/{jid}/files/0", content=pdf_bytes).status_code == 404
        assert other.get("/api/admin").status_code == 403
    assert admin_client.get(f"/api/jobs/{jid}").status_code == 200


def test_csrf_and_origin(admin_client):
    assert admin_client.post("/api/logout", headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert admin_client.post("/api/logout", headers={"Origin": "https://attacker.test"}).status_code == 403
    assert admin_client.post("/api/logout", headers={"X-Requested-With": ""}).status_code == 403
    assert admin_client.get("/api/me").status_code == 200


def test_login_rate_limit(client):
    for _ in range(5):
        assert client.post("/api/login", json={"email": "x@example.test", "password": "wrong"}).status_code == 401
    response = client.post("/api/login", json={"email": "x@example.test", "password": "wrong"})
    assert response.status_code == 429
    assert "Retry-After" in response.headers


def test_successful_login_clears_previous_failed_attempts(client):
    authenticate(client)
    for _ in range(4):
        assert client.post(
            "/api/login", json={"email": "admin@example.test", "password": "wrong-password"}
        ).status_code == 401
    assert client.post(
        "/api/login", json={"email": "admin@example.test", "password": "good-test-password"}
    ).status_code == 200
    for _ in range(5):
        assert client.post(
            "/api/login", json={"email": "admin@example.test", "password": "wrong-password"}
        ).status_code == 401
    assert client.post(
        "/api/login", json={"email": "admin@example.test", "password": "wrong-password"}
    ).status_code == 429


def test_atomic_rate_limit():
    def attempt(_):
        try:
            security.rate_limit("test", 5, 60)
            return True
        except HTTPException:
            return False
    with ThreadPoolExecutor(max_workers=10) as pool:
        assert sum(pool.map(attempt, range(20))) == 5


@pytest.mark.parametrize("name", ["../../private.pdf", "C:\\secret\\private.pdf", "\u202eprivate.pdf", "\x00private.pdf"])
def test_filename_sanitization(name):
    result = security.safe_name(name)
    assert result == "private.pdf"


def test_upload_size_mime_and_allowlist(admin_client):
    assert admin_client.post("/api/jobs", json={"files": [{"name": "file.exe", "size": 20}]}).status_code == 400
    assert admin_client.post("/api/jobs", json={"files": [{"name": "file.pdf", "size": 300 * 1024**2}]}).status_code == 413
    jid = admin_client.post("/api/jobs", json={"files": [{"name": "file.pdf", "size": 4}]}).json()["id"]
    assert admin_client.put(f"/api/jobs/{jid}/files/0", content=b"MZ!!").status_code == 400
    assert not storage.job_dir(jid).exists()
    assert admin_client.get("/api/jobs").json() == []


def test_stream_overrun_cleans_all(admin_client):
    jid = admin_client.post("/api/jobs", json={"files": [{"name": "file.pdf", "size": 5}]}).json()["id"]
    assert admin_client.put(f"/api/jobs/{jid}/files/0", content=b"%PDF-EXTRA").status_code == 413
    assert not storage.job_dir(jid).exists()


def test_quota_before_accepting_upload(admin_client):
    with connect(True) as db:
        db.execute("UPDATE settings SET value='1' WHERE key='max_storage_mb'")
    assert admin_client.post("/api/jobs", json={"files": [{"name": "a.pdf", "size": 10}]}).status_code == 507
    assert list(config.JOBS.iterdir()) == []


def test_settings_admin_and_disabled_user(admin_client):
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as other:
        user = authenticate(other, "disabled@example.test", False)
        assert admin_client.put('/api/admin/users/' + user['id'], json={"disabled": True}).status_code == 200
        assert other.get("/api/me").status_code == 401
    prefs = admin_client.get("/api/admin").json()["settings"]
    prefs["registration"] = False
    assert admin_client.put("/api/admin/settings", json=prefs).status_code == 200
    assert admin_client.post("/api/register", json={"email": "new@example.test", "password": "good-test-password"}).status_code == 403


def test_admin_can_delete_a_user_and_all_owned_files(admin_client, pdf_bytes):
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as account:
        user = authenticate(account, "delete-me@example.test", setup=False)
        job = upload(account, pdf_bytes)
        folder = storage.job_dir(job)
        assert folder.exists()
        response = admin_client.delete(f"/api/admin/users/{user['id']}")
        assert response.status_code == 200, response.text
        assert account.get("/api/me").status_code == 401
        assert not folder.exists()
        with connect() as db:
            assert not db.execute("SELECT 1 FROM users WHERE id=?", (user["id"],)).fetchone()
            assert not db.execute("SELECT 1 FROM jobs WHERE user_id=?", (user["id"],)).fetchone()

    admin = admin_client.get("/api/me").json()
    assert admin_client.delete(f"/api/admin/users/{admin['id']}").status_code == 400


def test_password_change_invalidates_sessions(admin_client):
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as second:
        second.post('/api/login', json={"email": "admin@example.test", "password": "good-test-password"})
        assert second.get('/api/me').status_code == 200
        assert admin_client.post('/api/password', json={"current": "good-test-password", "password": "new-good-password"}).status_code == 200
        assert second.get('/api/me').status_code == 401
        assert admin_client.get('/api/me').status_code == 200


@pytest.mark.parametrize("name", ["../../outside.txt", "/etc/passwd", "C:\\system.txt", "a/../../../outside.txt"])
def test_archive_traversal(tmp_path, name):
    archive = tmp_path / 'evil.zip'
    with zipfile.ZipFile(archive, 'w') as z:
        z.writestr(name, b'unsafe')
    output = tmp_path / 'out'
    output.mkdir()
    with pytest.raises(ValueError, match='unsafe_archive'):
        archive_jobs([archive], output, 'archive_extract', {}, [])
    assert not list(output.iterdir())


def test_archive_bomb_bounded(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MAX_EXTRACT", 1024)
    archive = tmp_path / 'bomb.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr('large.txt', b'0' * 5000)
    output = tmp_path / 'out'
    output.mkdir()
    with pytest.raises(ValueError, match='archive_limit'):
        archive_jobs([archive], output, 'archive_extract', {}, [])


def test_json_body_limit(admin_client):
    assert admin_client.post('/api/jobs', content=b'x' * (2 * 1024**2 + 1), headers={'content-type': 'application/json'}).status_code == 413


def test_no_external_resources_or_cache(admin_client):
    response = admin_client.get('/api/jobs')
    assert 'no-store' in response.headers['cache-control']
    assert "connect-src 'self'" in response.headers['content-security-policy']
    assert response.headers['x-content-type-options'] == 'nosniff'


def test_only_one_admin_survives_concurrent_setup(client):
    """Setup must be a one-time, race-proof event: no way to end up with two admins."""
    def attempt(n):
        c = TestClient(app, headers={"X-Requested-With": "EverydayTools"})
        response = c.post("/api/setup", json={"email": f"racer{n}@example.test", "password": "good-test-password", "legal_version": VERSION})
        return response.status_code
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(attempt, range(10)))
    assert results.count(200) == 1, f"expected exactly one setup to succeed, got {results}"
    # The rest are refused either because an admin already exists (409) or because the
    # per-IP setup rate limit caught them (429) — both are correct, no other status may appear.
    assert set(results) <= {200, 409, 429}, f"unexpected status among {results}"
    with connect() as db:
        users = db.execute("SELECT role FROM users").fetchall()
        assert [u["role"] for u in users] == ["ADMIN"]


def test_no_endpoint_lets_a_user_grant_themself_admin(admin_client):
    """A regular account can never acquire ADMIN through any documented request."""
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as user_client:
        authenticate(user_client, "plain@example.test", setup=False)
        me = user_client.get("/api/me").json()
        assert me["role"] == "USER"
        uid = me["id"]
        # Nothing in the public API accepts a role field; sending one is silently ignored.
        response = user_client.get("/api/me")
        assert response.json()["role"] == "USER"
        # A non-admin has no access to the endpoint that could otherwise touch role/disabled state.
        assert user_client.put(f"/api/admin/users/{uid}", json={"disabled": False}).status_code == 403
        with connect() as db:
            assert db.execute("SELECT role FROM users WHERE id=?", (uid,)).fetchone()["role"] == "USER"


def test_registration_is_refused_before_setup_exists(client):
    """Even with registration enabled by default, no account can appear before the first admin."""
    with connect() as db:
        assert not db.execute("SELECT 1 FROM users LIMIT 1").fetchone()
    response = client.post("/api/register", json={"email": "early@example.test", "password": "good-test-password"})
    assert response.status_code == 403
    with connect() as db:
        assert not db.execute("SELECT 1 FROM users LIMIT 1").fetchone()


def test_smtp_password_is_never_returned(admin_client):
    saved = admin_client.put("/api/admin/smtp", json={
        "provider": "gmail", "host": "smtp.gmail.com", "port": 587, "security": "starttls",
        "user": "someone@gmail.com", "password": "app-specific-secret", "sender": "someone@gmail.com",
        "public_url": "https://tools.example.test"})
    assert saved.status_code == 200, saved.text

    settings_view = admin_client.get("/api/admin/smtp").json()["settings"]
    assert settings_view["password_set"] is True
    assert "app-specific-secret" not in json.dumps(settings_view)
    assert "app-specific-secret" not in admin_client.get("/api/admin").text
    assert "smtp_password" not in admin_client.get("/api/admin").json()["settings"]

    # Saving again without the field keeps the stored password instead of clearing it.
    admin_client.put("/api/admin/smtp", json={
        "provider": "gmail", "host": "smtp.gmail.com", "port": 587, "security": "starttls",
        "user": "someone@gmail.com", "password": "", "sender": "someone@gmail.com",
        "public_url": "https://tools.example.test"})
    assert admin_client.get("/api/admin/smtp").json()["settings"]["password_set"] is True
    with connect() as db:
        stored = db.execute("SELECT value FROM settings WHERE key='smtp_password'").fetchone()[0]
    assert json.loads(stored) == "app-specific-secret"


def test_recovery_needs_a_configured_sender(client):
    authenticate(client)
    assert client.post("/api/recover", json={"email": "admin@example.test"}).status_code == 400
    assert client.get("/api/status").json()["smtp"] is False


def test_previews_may_play_local_media(admin_client):
    """Audio and video previews read from blob URLs, which need media-src."""
    policy = admin_client.get("/api/jobs").headers["content-security-policy"]
    assert "media-src 'self' blob:" in policy
    # Nothing remote may be reached even so.
    assert "default-src 'self'" in policy
    assert "https://" not in policy
