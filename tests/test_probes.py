"""Active probes against the endpoints that serve files or accept paths."""
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import processors, storage
from app.db import connect
from app.main import app
from conftest import authenticate, upload

# A NUL byte never survives an HTTP client, so it is probed against the helper
# directly rather than over the wire.
TRAVERSAL = [
    "../../../etc/passwd",
    "..%2f..%2fsecret",
    "....//....//etc/shadow",
    "/etc/passwd",
    r"C:\Windows\win.ini",
    ".",
    "..",
]
NAMES = TRAVERSAL + ["mask.png" + chr(0) + ".txt"]


def background_job(client, monkeypatch):
    buffer = io.BytesIO()
    Image.new("RGB", (60, 40), "#3a6ea5").save(buffer, "PNG")

    def fake(source):
        result = source.convert("RGBA")
        alpha = Image.new("L", source.size, 255)
        result.putalpha(alpha)
        return result

    monkeypatch.setattr(processors, "background", fake)
    jid = upload(client, buffer.getvalue(), "pessoa.png")
    with connect(True) as db:
        db.execute("UPDATE jobs SET operation='image_background' WHERE id=?", (jid,))
    with connect() as db:
        row = dict(db.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone())
    processors.process(row, storage.job_dir(jid))
    outputs = (storage.job_dir(jid) / "result.json").read_text(encoding="utf-8")
    with connect(True) as db:
        db.execute("UPDATE jobs SET state='COMPLETED',outputs=? WHERE id=?", (outputs, jid))
    return jid


@pytest.mark.parametrize("attempt", TRAVERSAL)
def test_matte_asset_refuses_path_tricks(admin_client, monkeypatch, attempt):
    jid = background_job(admin_client, monkeypatch)
    response = admin_client.get(f"/api/jobs/{jid}/matte/0/{attempt}")
    assert response.status_code in (404, 422), response.text
    assert b"root:" not in response.content


def test_matte_asset_belongs_to_its_owner(admin_client, monkeypatch):
    jid = background_job(admin_client, monkeypatch)
    assert admin_client.get(f"/api/jobs/{jid}/matte/0/mask").status_code == 200
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as other:
        authenticate(other, "intruso@example.test", setup=False)
        for asset in ("mask", "source"):
            assert other.get(f"/api/jobs/{jid}/matte/0/{asset}").status_code == 404


@pytest.mark.parametrize("index", [-1, 1, 99, 100000])
def test_matte_asset_checks_the_index(admin_client, monkeypatch, index):
    jid = background_job(admin_client, monkeypatch)
    assert admin_client.get(f"/api/jobs/{jid}/matte/{index}/mask").status_code in (404, 422)


def test_matte_asset_is_gone_once_the_job_is(admin_client, monkeypatch):
    jid = background_job(admin_client, monkeypatch)
    assert admin_client.get(f"/api/jobs/{jid}/matte/0/mask").status_code == 200
    assert admin_client.delete(f"/api/jobs/{jid}").status_code == 200
    assert admin_client.get(f"/api/jobs/{jid}/matte/0/mask").status_code == 404
    assert not storage.job_dir(jid).exists()


@pytest.mark.parametrize("name", NAMES)
def test_local_file_only_serves_names_inside_the_folder(tmp_path, name):
    inside = tmp_path / "job"
    inside.mkdir()
    (inside / "real.png").write_bytes(b"content")
    (tmp_path / "outside.txt").write_bytes(b"secret")
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        storage.local_file(inside, name)


def test_admin_cannot_reach_another_account_documents(admin_client, pdf_bytes):
    """An administrator manages the installation, not other people's files."""
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as member:
        authenticate(member, "membro@example.test", setup=False)
        jid = upload(member, pdf_bytes, "privado.pdf")
    for path in (f"/api/jobs/{jid}", f"/api/jobs/{jid}/original/0", f"/api/jobs/{jid}/download/0"):
        assert admin_client.get(path).status_code == 404
    assert admin_client.delete(f"/api/jobs/{jid}").status_code == 404


def test_registration_honeypot_blocks_silent_bots(client):
    authenticate(client)
    filled = client.post("/api/register", json={
        "email": "bot@example.test", "password": "good-test-password", "website": "http://spam.test"})
    assert filled.status_code == 400
    with connect() as db:
        assert not db.execute("SELECT 1 FROM users WHERE email='bot@example.test'").fetchone()


def test_one_address_cannot_farm_accounts(client):
    authenticate(client)
    for attempt in range(2):
        client.post("/api/register", json={"email": f"pessoa{attempt}@example.test", "password": "good-test-password"})
    blocked = client.post("/api/register", json={"email": "pessoa0@example.test", "password": "good-test-password"})
    assert blocked.status_code in (409, 429)
