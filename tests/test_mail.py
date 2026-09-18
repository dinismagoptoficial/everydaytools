"""Delivery is exercised against a real socket, not a mocked sender."""
import email
import socket
import threading

from app.legal import VERSION
from conftest import authenticate

CONFIGURED = {"provider": "custom", "host": "127.0.0.1", "port": 0, "security": "none",
              "user": "", "password": "", "sender": "tools@example.test", "public_url": ""}


class Sink:
    """A throwaway SMTP server that keeps whatever it is handed."""

    def __init__(self):
        self.messages = []
        self.socket = socket.socket()
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind(("127.0.0.1", 0))
        self.socket.listen(4)
        self.port = self.socket.getsockname()[1]
        self.thread = threading.Thread(target=self.serve, daemon=True)
        self.thread.start()

    def serve(self):
        while True:
            try:
                connection, _ = self.socket.accept()
            except OSError:
                return
            threading.Thread(target=self.session, args=(connection,), daemon=True).start()

    def session(self, connection):
        with connection, connection.makefile("rwb") as stream:
            stream.write(b"220 sink\r\n")
            stream.flush()
            body, collecting = [], False
            for raw in stream:
                line = raw.decode("utf-8", "replace")
                if collecting:
                    if line.strip() == ".":
                        self.messages.append(email.message_from_string("".join(body)))
                        body, collecting = [], False
                        stream.write(b"250 ok\r\n")
                        stream.flush()
                    else:
                        body.append(line[1:] if line.startswith("..") else line)
                    continue
                command = line.split(" ")[0].strip().upper()
                if command in ("EHLO", "HELO"):
                    stream.write(b"250-sink\r\n250 SIZE 35882577\r\n")
                elif command == "DATA":
                    collecting = True
                    stream.write(b"354 go\r\n")
                elif command == "QUIT":
                    stream.write(b"221 bye\r\n")
                    stream.flush()
                    return
                else:
                    stream.write(b"250 ok\r\n")
                stream.flush()

    def close(self):
        self.socket.close()

    def wait(self, count=1, seconds=10):
        deadline = threading.Event()
        for _ in range(int(seconds * 50)):
            if len(self.messages) >= count:
                return self.messages
            deadline.wait(0.02)
        raise AssertionError(f"no message arrived, got {len(self.messages)}")


def configure(client, sink, **overrides):
    payload = CONFIGURED | {"port": sink.port} | overrides
    response = client.put("/api/admin/smtp", json=payload)
    assert response.status_code == 200, response.text
    return payload


def plain(message):
    return "".join(part.get_payload(decode=True).decode("utf-8", "replace")
                   for part in message.walk() if part.get_content_type() == "text/plain").strip()


def test_initial_setup_can_store_smtp_and_send_the_welcome_message(client):
    sink = Sink()
    try:
        smtp = CONFIGURED | {"port": sink.port, "public_url": "http://everyday-tools.local"}
        response = client.post("/api/setup", json={
            "email": "admin@example.test", "password": "good-test-password",
            "legal_version": VERSION, "language": "en", "smtp": smtp,
        })
        assert response.status_code == 200, response.text
        welcome = sink.wait()[0]
        assert welcome["To"] == "admin@example.test"
        assert "account was created successfully" in plain(welcome)
        assert client.get("/api/status").json()["smtp"] is True
        saved = client.get("/api/admin/smtp").json()["settings"]
        assert saved["smtp_host"] == "127.0.0.1"
        assert saved["smtp_public_url"] == "http://everyday-tools.local"
        assert saved["password_set"] is False
    finally:
        sink.close()


def test_test_button_delivers_without_an_installation_address(admin_client):
    sink = Sink()
    try:
        payload = configure(admin_client, sink)
        response = admin_client.post("/api/admin/smtp/test", json=payload)
        assert response.status_code == 200, response.text
        message = sink.wait()[0]
        assert message["To"] == "admin@example.test"
        assert "tools@example.test" in message["From"]
        assert message.is_multipart()
        assert plain(message) == "Teste do sistema, tudo ok!"
        html = next(part for part in message.walk() if part.get_content_type() == "text/html")
        assert "cid:" in html.get_payload(decode=True).decode("utf-8")
    finally:
        sink.close()


def test_recovery_sends_a_working_link(client):
    authenticate(client)
    sink = Sink()
    try:
        configure(client, sink, public_url="http://everyday-tools.local")
        assert client.get("/api/status").json()["smtp"] is True
        assert client.post("/api/recover", json={"email": "admin@example.test"}).status_code == 200
        message = sink.wait()[0]
        body = plain(message)
        token = body.split("/#reset/")[1].split()[0].strip()
        assert len(token) > 20
        assert client.post("/api/reset", json={"token": token, "password": "brand-new-password"}).status_code == 200
        assert client.post("/api/login", json={"email": "admin@example.test", "password": "brand-new-password"}).status_code == 200
        # A recovery link only works once.
        assert client.post("/api/reset", json={"token": token, "password": "another-password"}).status_code == 400
    finally:
        sink.close()


def test_recovery_link_falls_back_to_the_request_address(client):
    authenticate(client)
    sink = Sink()
    try:
        configure(client, sink)
        assert client.post("/api/recover", json={"email": "admin@example.test"}).status_code == 200
        message = sink.wait()[0]
        body = plain(message)
        assert "/#reset/" in body
        assert "://" in body.split("/#reset/")[0].rsplit("\n", 1)[-1]
    finally:
        sink.close()


def test_messages_follow_each_accounts_language(admin_client):
    sink = Sink()
    try:
        payload = configure(admin_client, sink)
        me = admin_client.get("/api/me").json()
        assert admin_client.put("/api/me", json={"name": "Admin", "email": me["email"],
                                                 "language": "en"}).status_code == 200
        assert admin_client.post("/api/admin/smtp/test", json=payload).status_code == 200
        assert plain(sink.wait()[0]) == "System test, everything is OK!"

        address = "new-english-user@example.test"
        response = admin_client.post("/api/register", json={"email": address,
                                     "password": "good-test-password", "language": "en"})
        assert response.status_code == 200, response.text
        welcome = sink.wait(2)[1]
        assert welcome["To"] == address
        assert "account was created successfully" in plain(welcome)
        assert admin_client.get("/api/me").json()["language"] == "en"

        assert admin_client.post("/api/recover", json={"email": address}).status_code == 200
        recovery = sink.wait(3)[2]
        assert "Set a new password" in plain(recovery)
    finally:
        sink.close()


def test_email_html_escapes_account_and_installation_names():
    from app import mail

    message = mail.build("<b>Dinis</b>", "person@example.test", "https://example.test/?a=1&b=2",
                         "pt-PT", "Tools <Local>")
    html = next(part for part in message.walk() if part.get_content_type() == "text/html")
    body = html.get_payload(decode=True).decode("utf-8")
    assert "<b>Dinis</b>" not in body
    assert "&lt;b&gt;Dinis&lt;/b&gt;" in body
    assert "Tools &lt;Local&gt;" in body
    assert "a=1&amp;b=2" in body


def test_unknown_address_reveals_nothing_and_sends_nothing(client):
    authenticate(client)
    sink = Sink()
    try:
        configure(client, sink)
        assert client.post("/api/recover", json={"email": "stranger@example.test"}).status_code == 200
        threading.Event().wait(0.6)
        assert sink.messages == []
    finally:
        sink.close()
