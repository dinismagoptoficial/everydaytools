import hashlib
import re
import secrets
import time
import unicodedata

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import HTTPException, Request

from . import config
from .db import connect, settings

hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(value):
    if not 10 <= len(value) <= 128:
        raise HTTPException(400, "password_length")
    return hasher.hash(value)


def verify(encoded, password):
    try:
        return hasher.verify(encoded or DUMMY_HASH, password[:129])
    except (VerificationError, InvalidHashError):
        return False


def email_address(value):
    value = value.strip().lower()
    if len(value) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        raise HTTPException(400, "invalid_email")
    return value


def safe_name(value):
    value = unicodedata.normalize("NFC", value.replace("\\", "/").split("/")[-1])
    value = "".join(c for c in value if unicodedata.category(c)[0] != "C" and c not in '<>:"|?*')
    return value.strip(" .")[:180] or "file"


def rate_limit(key, limit, seconds):
    now = time.time()
    with connect(True) as db:
        db.execute("DELETE FROM rate_limits WHERE expires <= ?", (now,))
        row = db.execute("SELECT * FROM rate_limits WHERE key=?", (digest(key),)).fetchone()
        if row and row["count"] >= limit:
            raise HTTPException(429, "rate_limited", headers={"Retry-After": str(max(1, int(row["expires"] - now)))})
        db.execute("INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
                   (digest(key), now + seconds))


def ip(request):
    return request.client.host if request.client else "local"


def session(request: Request):
    token = request.cookies.get("everyday_session", "")
    with connect() as db:
        row = db.execute("""SELECT u.*, s.csrf FROM sessions s JOIN users u ON u.id=s.user_id
                            WHERE s.token=? AND s.expires>? AND u.disabled=0""", (digest(token), time.time())).fetchone()
    if not row:
        raise HTTPException(401, "unauthorized")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not secrets.compare_digest(request.headers.get("x-csrf-token", ""), row["csrf"]):
            raise HTTPException(403, "csrf")
    return dict(row)


def admin(request: Request):
    user = session(request)
    if user["role"] != "ADMIN":
        raise HTTPException(403, "forbidden")
    if request.method not in ("GET", "HEAD"):
        rate_limit("admin:" + user["id"], settings()["admin_limit"], 60)
    return user


def new_session(db, response, user_id, request):
    old = request.cookies.get("everyday_session", "")
    db.execute("DELETE FROM sessions WHERE token=?", (digest(old),))
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.execute("INSERT INTO sessions VALUES (?,?,?,?)", (digest(token), user_id, csrf, time.time() + config.SESSION_SECONDS))
    response.set_cookie("everyday_session", token, httponly=True, secure=config.COOKIE_SECURE or request.url.scheme == "https",
                        samesite="lax", max_age=config.SESSION_SECONDS, path="/")
    return csrf
