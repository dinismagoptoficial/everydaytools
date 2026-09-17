"""Delivery is exercised against a real socket, not a mocked sender."""
import email
import socket
import threading

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


def test_test_button_delivers_without_an_installation_address(admin_client):
    """The address only shapes the recovery link, so a test must not demand it."""
    sink = Sink()
    try:
        payload = configure(admin_client, sink)
        response = admin_client.post("/api/admin/smtp/test", json=payload)
        assert response.status_code == 200, response.text
        message = sink.wait()[0]
        assert message["To"] == "admin@example.test"
        assert "tools@example.test" in message["From"]
        assert message.is_multipart()
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
        body = "".join(part.get_payload(decode=True).decode("utf-8", "replace")
                       for part in message.walk() if part.get_content_type() == "text/plain")
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
        body = "".join(part.get_payload(decode=True).decode("utf-8", "replace")
                       for part in message.walk() if part.get_content_type() == "text/plain")
        assert "/#reset/" in body
        assert "://" in body.split("/#reset/")[0].rsplit("\n", 1)[-1]
    finally:
        sink.close()


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
