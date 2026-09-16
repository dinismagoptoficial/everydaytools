import io
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

from app import config
from app.db import connect, initialize
from app.main import app


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(config, "DB", tmp_path / "database" / "everyday.sqlite3")
    monkeypatch.setattr(config, "JOBS", tmp_path / "jobs")
    monkeypatch.setattr(config, "TEMP", tmp_path / "temp")
    monkeypatch.setattr(config, "MODELS", tmp_path / "models")
    initialize()
    with connect(True) as db:
        db.execute("UPDATE settings SET value='64' WHERE key='min_free_mb'")
    yield


@pytest.fixture
def client():
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as c:
        yield c


def authenticate(client, email="admin@example.test", setup=True):
    response = client.post("/api/setup" if setup else "/api/register", json={"email": email, "password": "good-test-password"})
    assert response.status_code == 200, response.text
    user = client.get("/api/me").json()
    client.headers["X-CSRF-Token"] = user["csrf"]
    return user


@pytest.fixture
def admin_client(client):
    authenticate(client)
    return client


@pytest.fixture
def pdf_bytes():
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(40, 750, "Private text on first page")
    c.showPage()
    c.drawString(40, 750, "Second page")
    c.save()
    return buf.getvalue()


def upload(client, content, name="document.pdf"):
    response = client.post("/api/jobs", json={"files": [{"name": name, "size": len(content)}]})
    assert response.status_code == 201, response.text
    jid = response.json()["id"]
    result = client.put(f"/api/jobs/{jid}/files/0", content=content, headers={"content-type": "application/octet-stream"})
    assert result.status_code == 200, result.text
    return jid


def fake_job(user, cls="HEAVY", created=None, **kwargs):
    jid = secrets.token_hex(16)
    with connect(True) as db:
        db.execute("INSERT INTO jobs(id,user_id,created,expires,files,class,ready,operation) VALUES (?,?,?,?,?,?,1,'video_convert')",
                   (jid, user, created or time.time(), time.time() + 3600, json.dumps([]), cls))
        for key, value in kwargs.items():
            assert key in {"state", "deleting", "expires", "running"}
            db.execute(f"UPDATE jobs SET {key}=? WHERE id=?", (value, jid))
    return jid
