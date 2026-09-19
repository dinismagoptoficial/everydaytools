from email.message import EmailMessage

import pytest
from fastapi.testclient import TestClient

from app import mail, security
from app.db import connect
from app.legal import VERSION
from app.main import app


def setup_account(client, address, language, admin=False):
    path = "/api/setup" if admin else "/api/register"
    payload = {
        "email": address,
        "password": "good-test-password",
        "language": language,
    }
    if admin:
        payload["legal_version"] = VERSION
    response = client.post(path, json=payload)
    assert response.status_code == 200, response.text
    account = client.get("/api/me").json()
    client.headers["X-CSRF-Token"] = account["csrf"]
    return account


def plain(message: EmailMessage):
    return "".join(
        part.get_payload(decode=True).decode("utf-8", "replace")
        for part in message.walk()
        if part.get_content_type() == "text/plain"
    ).strip()


@pytest.mark.parametrize(
    ("language", "admin_phrase", "progress_phrase", "complete_phrase"),
    [
        ("pt-PT", "Novo comentário recebido", "está agora em tratamento", "marcado como concluído"),
        ("en", "New feedback received", "now being reviewed", "marked as completed"),
    ],
)
def test_complete_feedback_flow_in_both_languages(
    client, monkeypatch, language, admin_phrase, progress_phrase, complete_phrase
):
    admin = setup_account(client, "admin@example.test", language, admin=True)
    sent = []
    with connect(True) as db:
        db.execute(
            "UPDATE settings SET value='\"https://tools.example.test\"' WHERE key='smtp_public_url'"
        )

    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as person:
        account = setup_account(person, f"person-{language}@example.test", language)
        monkeypatch.setattr(mail, "send", lambda message, installation: sent.append(message))
        response = person.post(
            "/api/feedback",
            json={
                "type": "BUG",
                "title": "PDF preview position",
                "description": "The selected item moves away from the pointer.",
                "related": "PDF editor",
                "route": "pdf",
                "language": language,
            },
        )
        assert response.status_code == 201, response.text
        report = response.json()
        report_id = report["id"]
        assert report["status"] == "NEW"
        assert report["user"]["id"] == account["id"]
        assert report["app_version"]
        assert report["created"] == report["updated"]
        assert report["completed"] is None
        assert person.get("/api/admin/feedback").status_code == 403
        assert person.put(f"/api/admin/feedback/{report_id}", json={"status": "COMPLETED"}).status_code == 403

        assert len(sent) == 1
        admin_message = sent[0]
        assert admin_message["To"] == admin["email"]
        admin_text = plain(admin_message)
        assert admin_phrase.lower() in admin_message["Subject"].lower()
        assert "PDF preview position" in admin_text
        assert "person-" in admin_text
        assert "The selected item moves away" in admin_text
        assert f"/#admin/feedback/{report_id}" in admin_text

        listing = client.get("/api/admin/feedback", params={"status": "NEW", "type": "BUG"})
        assert listing.status_code == 200, listing.text
        assert listing.json()["total"] == 1
        assert listing.json()["items"][0]["id"] == report_id
        assert "description" not in listing.json()["items"][0]

        detail = client.get(f"/api/admin/feedback/{report_id}")
        assert detail.status_code == 200
        assert detail.json()["description"].startswith("The selected")

        progress = client.put(f"/api/admin/feedback/{report_id}", json={"status": "IN_PROGRESS"})
        assert progress.status_code == 200, progress.text
        assert progress.json()["status"] == "IN_PROGRESS"
        assert sent[-1]["To"] == account["email"]
        assert progress_phrase in plain(sent[-1])

        completed = client.put(f"/api/admin/feedback/{report_id}", json={"status": "COMPLETED"})
        assert completed.status_code == 200, completed.text
        assert completed.json()["completed"] is not None
        assert complete_phrase in plain(sent[-1])

        message_count = len(sent)
        reset = client.put(f"/api/admin/feedback/{report_id}", json={"status": "NEW"})
        assert reset.status_code == 200
        assert reset.json()["completed"] is None
        assert len(sent) == message_count

        deleted = client.delete(f"/api/admin/feedback/{report_id}")
        assert deleted.status_code == 200
        assert client.get(f"/api/admin/feedback/{report_id}").status_code == 404


def test_feedback_validation_duplicate_limits_and_mail_failure(client, monkeypatch):
    setup_account(client, "admin@example.test", "pt-PT", admin=True)
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as person:
        account = setup_account(person, "person@example.test", "en")
        invalid = person.post(
            "/api/feedback",
            json={"type": "BUG", "title": "No", "description": "Too short", "language": "en"},
        )
        assert invalid.status_code == 400
        assert invalid.json()["detail"] == "feedback_invalid"

        monkeypatch.setattr(mail, "send", lambda *args: (_ for _ in ()).throw(RuntimeError("offline")))
        payload = {
            "type": "FEATURE",
            "title": "Keyboard workflow",
            "description": "Add a quicker keyboard workflow for repeated tasks.",
            "related": "Everyday tools",
            "route": "everyday",
            "language": "en",
        }
        created = person.post("/api/feedback", json=payload)
        assert created.status_code == 201, created.text
        duplicate_payload = {
            **payload,
            "title": "  KEYBOARD WORKFLOW  ",
            "description": "Add a quicker  keyboard workflow for repeated tasks.",
            "route": "home",
        }
        duplicate = person.post("/api/feedback", json=duplicate_payload)
        assert duplicate.status_code == 409
        assert duplicate.json()["detail"] == "feedback_duplicate"

        too_many_links = person.post(
            "/api/feedback",
            json={
                "type": "OTHER",
                "title": "Suspicious link burst",
                "description": " ".join(f"https://example.test/{index}" for index in range(9)),
                "language": "en",
            },
        )
        assert too_many_links.status_code == 400
        assert too_many_links.json()["detail"] == "feedback_invalid"

        hidden_control = person.post(
            "/api/feedback",
            json={
                "type": "OTHER",
                "title": "Hidden\u202econtrol",
                "description": "This text contains a hidden direction control character.",
                "language": "en",
            },
        )
        assert hidden_control.status_code == 400
        assert hidden_control.json()["detail"] == "feedback_invalid"

        with connect(True) as db:
            db.execute(
                "UPDATE rate_limits SET count=20 WHERE key=?",
                (security.digest("feedback-day:" + account["id"]),),
            )
        daily_limit = person.post(
            "/api/feedback",
            json={
                "type": "OTHER",
                "title": "Daily limit check",
                "description": "This valid report must be stopped by the daily limit.",
                "language": "en",
            },
        )
        assert daily_limit.status_code == 429

        updated = client.put(
            f"/api/admin/feedback/{created.json()['id']}", json={"status": "IN_PROGRESS"}
        )
        assert updated.status_code == 200


def test_feedback_filters_rate_limit_and_user_deletion_cascade(client):
    setup_account(client, "admin@example.test", "pt-PT", admin=True)
    with TestClient(app, headers={"X-Requested-With": "EverydayTools"}) as person:
        account = setup_account(person, "person@example.test", "pt-PT")
        ids = []
        for index in range(6):
            response = person.post(
                "/api/feedback",
                json={
                    "type": "OTHER",
                    "title": f"Comment {index}",
                    "description": f"Description for distinct comment number {index}.",
                    "route": "home",
                    "language": "pt-PT",
                },
            )
            assert response.status_code == 201, response.text
            ids.append(response.json()["id"])
        limited = person.post(
            "/api/feedback",
            json={
                "type": "OTHER",
                "title": "One too many",
                "description": "This report must be rejected by the hourly limit.",
                "language": "pt-PT",
            },
        )
        assert limited.status_code == 429

        today = min(item["created"] for item in client.get("/api/admin/feedback").json()["items"])
        filtered = client.get(
            "/api/admin/feedback",
            params={"type": "OTHER", "created_from": today - 1, "created_to": today + 60},
        )
        assert filtered.status_code == 200
        assert filtered.json()["total"] == 6

        assert client.delete(f"/api/admin/users/{account['id']}").status_code == 200
        with connect() as db:
            assert db.execute("SELECT count(*) FROM feedback WHERE user_id=?", (account["id"],)).fetchone()[0] == 0
