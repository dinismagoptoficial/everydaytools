import asyncio
import json
import secrets
import shutil
import time
from contextlib import asynccontextmanager
from urllib.parse import urlparse
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import __version__, config, legal, mail, security, storage
from .catalog import ALLOWED, OPERATIONS, available, catalog
from .db import connect, initialize, settings
from .downloads import DownloadResponse


@asynccontextmanager
async def lifespan(app):
    initialize()
    await run_in_threadpool(storage.cleanup)
    async def sweeper():
        while True:
            await asyncio.sleep(30)
            try:
                await run_in_threadpool(storage.cleanup)
            except Exception:
                print("cleanup retry scheduled", flush=True)
    task = asyncio.create_task(sweeper())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Everyday Tools", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class BodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        is_upload = scope["method"] == "PUT" and scope["path"].startswith("/api/jobs/")
        limit = settings()["max_upload_mb"] * 1024**2 if is_upload else 2 * 1024**2
        total = 0
        async def limited_receive():
            nonlocal total
            message = await receive()
            total += len(message.get("body", b""))
            if total > limit:
                raise HTTPException(413, "too_large")
            return message
        await self.app(scope, limited_receive, send)


app.add_middleware(BodyLimit)


@app.middleware("http")
async def protections(request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if request.headers.get("x-requested-with") != "EverydayTools" or (origin and urlparse(origin).netloc != request.headers.get("host")):
            return JSONResponse({"detail": "csrf"}, status_code=403)
    try:
        response = await call_next(request)
    except Exception:
        return JSONResponse({"detail": "internal_error"}, status_code=500, headers={"Cache-Control": "no-store"})
    response.headers.update({
        "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
        # 'wasm-unsafe-eval' is required by the bundled PDF.js image decoders; no remote origin is allowed.
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    })
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, private"
    return response


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    return JSONResponse({"detail": "invalid_input"}, status_code=422)


class Credentials(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class Registration(Credentials):
    website: str = Field(default="", max_length=200)
    language: Literal["pt-PT", "en"] = "pt-PT"


class MailSettings(BaseModel):
    provider: Literal[tuple(mail.PROVIDERS)] = "custom"
    host: str = Field(default="", max_length=255)
    port: int = Field(default=587, ge=1, le=65535)
    security: Literal["starttls", "ssl", "none"] = "starttls"
    user: str = Field(default="", max_length=255)
    password: str = Field(default="", max_length=255)
    sender: str = Field(default="", max_length=254)
    public_url: str = Field(default="", max_length=255)


def validate_mail_settings(body: MailSettings):
    if body.public_url:
        address = urlparse(body.public_url)
        if address.scheme not in ("http", "https") or not address.netloc:
            raise HTTPException(400, "invalid_option")
    if body.sender:
        security.email_address(body.sender)
    if any("\r" in value or "\n" in value for value in (body.host, body.user)):
        raise HTTPException(400, "invalid_option")


def mail_settings_values(body: MailSettings):
    return {"smtp_provider": body.provider, "smtp_host": body.host.strip(), "smtp_port": body.port,
            "smtp_security": body.security, "smtp_user": body.user.strip(),
            "smtp_from": body.sender.strip().lower(), "smtp_public_url": body.public_url.strip().rstrip("/")}


class Setup(Credentials):
    legal_version: Literal[legal.VERSION]
    installation_name: str = Field(default="Everyday Tools", min_length=1, max_length=60)
    registration: bool = True
    max_upload_mb: int = Field(default=256, ge=1, le=10240)
    retention_minutes: int = Field(default=60, ge=5, le=1440)
    language: Literal["pt-PT", "en"] = "pt-PT"
    smtp: MailSettings | None = None


class Preferences(BaseModel):
    installation_name: str = Field(min_length=1, max_length=60)
    registration: bool
    retention_minutes: int = Field(ge=5, le=1440)
    max_upload_mb: int = Field(ge=1, le=10240)
    max_storage_mb: int = Field(ge=64, le=1048576)
    min_free_mb: int = Field(ge=64, le=1048576)
    light_concurrency: int = Field(ge=1, le=8)
    medium_concurrency: int = Field(ge=1, le=4)
    heavy_concurrency: int = Field(ge=1, le=2)
    max_pending: int = Field(ge=1, le=20)
    login_limit: int = Field(ge=1, le=100)
    upload_limit: int = Field(ge=1, le=100)
    register_limit: int = Field(ge=1, le=100)
    admin_limit: int = Field(ge=1, le=100)
    job_limit: int = Field(ge=1, le=100)


def user_public(user):
    with connect() as db:
        prefs = db.execute("SELECT name,language FROM user_preferences WHERE user_id=?", (user["id"],)).fetchone()
    return {k: user[k] for k in ("id", "email", "role", "created")} | {"name": prefs["name"] if prefs else "", "language": prefs["language"] if prefs else None}


@app.get("/api/legal")
def legal_information():
    return legal.information()


@app.get("/api/status")
def status():
    with connect() as db:
        setup = not db.execute("SELECT 1 FROM users LIMIT 1").fetchone()
    prefs = settings()
    return {"setup": setup, "name": prefs["installation_name"], "registration": prefs["registration"],
            "retention_minutes": prefs["retention_minutes"], "max_upload_mb": prefs["max_upload_mb"],
            "smtp": mail.available(), "language": prefs["default_language"],
            "mail_providers": mail.PROVIDERS,
            "version": __version__, "legal_version": legal.VERSION}


@app.get("/api/health")
def health():
    with connect() as db:
        row = db.execute("SELECT value FROM system WHERE key='worker'").fetchone()
    return {"status": "ok", "worker": bool(row and time.time() - float(row[0]) < 20), "version": __version__}


@app.post("/api/setup")
def setup(body: Setup, request: Request, response: Response):
    security.rate_limit("setup:" + security.ip(request), 5, 60)
    email, hashed = security.email_address(body.email), security.password_hash(body.password)
    if body.smtp:
        validate_mail_settings(body.smtp)
        if not body.smtp.host.strip() or not body.smtp.sender.strip():
            raise HTTPException(400, "smtp_unavailable")
    with connect(True) as db:
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            raise HTTPException(409, "already_setup")
        uid = secrets.token_hex(16)
        db.execute("INSERT INTO users VALUES (?,?,?,'ADMIN',0,?)", (uid, email, hashed, time.time()))
        for key in ("installation_name", "registration", "max_upload_mb", "retention_minutes"):
            db.execute("UPDATE settings SET value=? WHERE key=?", (json.dumps(getattr(body, key)), key))
        db.execute("UPDATE settings SET value=? WHERE key='default_language'", (json.dumps(body.language),))
        db.execute("INSERT OR REPLACE INTO user_preferences VALUES (?,?,?)", (uid, "", body.language))
        if body.smtp:
            for key, value in mail_settings_values(body.smtp).items():
                db.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, json.dumps(value)))
            db.execute("INSERT OR REPLACE INTO settings VALUES ('smtp_password',?)",
                       (json.dumps(body.smtp.password),))
        for key, value in (("legal_version", body.legal_version), ("legal_reviewed_at", time.time())):
            db.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, json.dumps(value)))
        security.new_session(db, response, uid, request)
    mail.send_welcome("", email, body.language, body.installation_name)
    return {"ok": True}


@app.post("/api/register")
def register(body: Registration, request: Request, response: Response):
    security.rate_limit("register:" + security.ip(request), settings()["register_limit"], 600)
    email = security.email_address(body.email)
    security.rate_limit("register-email:" + email, 2, 3600)
    if body.website:
        raise HTTPException(400, "invalid_input")
    hashed = security.password_hash(body.password)
    with connect(True) as db:
        prefs = settings(db)
        if not prefs["registration"] or not db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            raise HTTPException(403, "registration_closed")
        if db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(409, "account_exists")
        uid = secrets.token_hex(16)
        db.execute("INSERT INTO users VALUES (?,?,?,'USER',0,?)", (uid, email, hashed, time.time()))
        db.execute("INSERT INTO user_preferences VALUES (?,?,?)", (uid, "", body.language))
        security.new_session(db, response, uid, request)
    mail.send_welcome("", email, body.language, prefs["installation_name"])
    return {"ok": True}


@app.post("/api/login")
def login(body: Credentials, request: Request, response: Response):
    prefs = settings()
    email = security.email_address(body.email)
    for key in ("login-ip:" + security.ip(request), "login-account:" + email):
        security.rate_limit(key, prefs["login_limit"], 60)
    with connect() as db:
        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not security.verify(user["password"] if user else None, body.password) or not user or user["disabled"]:
        raise HTTPException(401, "invalid_credentials")
    with connect(True) as db:
        current = db.execute("SELECT password,disabled FROM users WHERE id=?", (user["id"],)).fetchone()
        if not current or current["disabled"] or current["password"] != user["password"]:
            raise HTTPException(401, "invalid_credentials")
        security.new_session(db, response, user["id"], request)
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(security.session)):
    return user_public(user) | {"csrf": user["csrf"]}


class AccountUpdate(BaseModel):
    name: str = Field(max_length=80)
    email: str = Field(max_length=254)
    language: Literal["pt-PT", "en"]
    current_password: str = Field(default="", max_length=128)


@app.put("/api/me")
def update_account(body: AccountUpdate, request: Request, response: Response, user=Depends(security.session)):
    security.rate_limit("account:" + user["id"], 10, 60)
    email = security.email_address(body.email)
    if email != user["email"] and not security.verify(user["password"], body.current_password):
        raise HTTPException(400, "invalid_credentials")
    with connect(True) as db:
        current = db.execute("SELECT * FROM users WHERE id=? AND disabled=0", (user["id"],)).fetchone()
        if not current or current["password"] != user["password"]:
            raise HTTPException(401, "unauthorized")
        if current["email"] != user["email"]:
            raise HTTPException(409, "invalid_state")
        if db.execute("SELECT 1 FROM users WHERE email=? AND id<>?", (email, user["id"])).fetchone():
            raise HTTPException(409, "account_exists")
        db.execute("INSERT OR REPLACE INTO user_preferences VALUES (?,?,?)", (user["id"], body.name.strip(), body.language))
        if email != current["email"]:
            db.execute("UPDATE users SET email=? WHERE id=?", (email, user["id"]))
            db.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
            db.execute("DELETE FROM resets WHERE user_id=?", (user["id"],))
            security.new_session(db, response, user["id"], request)
    return {"ok": True}


@app.post("/api/logout")
def logout(request: Request, response: Response, user=Depends(security.session)):
    with connect(True) as db:
        db.execute("DELETE FROM sessions WHERE token=?", (security.digest(request.cookies.get("everyday_session", "")),))
    response.delete_cookie("everyday_session", path="/")
    return {"ok": True}


class PasswordChange(BaseModel):
    current: str = Field(max_length=128)
    password: str = Field(max_length=128)


@app.post("/api/password")
def change_password(body: PasswordChange, request: Request, response: Response, user=Depends(security.session)):
    security.rate_limit("password:" + user["id"], 5, 60)
    if not security.verify(user["password"], body.current):
        raise HTTPException(400, "invalid_credentials")
    hashed = security.password_hash(body.password)
    with connect(True) as db:
        current = db.execute("SELECT password,disabled FROM users WHERE id=?", (user["id"],)).fetchone()
        if not current or current["disabled"] or current["password"] != user["password"]:
            raise HTTPException(401, "unauthorized")
        db.execute("UPDATE users SET password=? WHERE id=?", (hashed, user["id"]))
        db.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
        db.execute("DELETE FROM resets WHERE user_id=?", (user["id"],))
        security.new_session(db, response, user["id"], request)
    return {"ok": True}


class Recovery(BaseModel):
    email: str = Field(max_length=254)


@app.post("/api/recover")
def recover(body: Recovery, request: Request):
    security.rate_limit("recover:" + security.ip(request), 3, 600)
    if not mail.available():
        raise HTTPException(400, "smtp_unavailable")
    prefs = settings()
    email = security.email_address(body.email)
    security.rate_limit("recover-account:" + email, 3, 3600)
    with connect(True) as db:
        user = db.execute("""SELECT u.id, coalesce(p.name,'') AS name, coalesce(p.language,?) AS language
                             FROM users u LEFT JOIN user_preferences p ON p.user_id=u.id
                             WHERE u.email=? AND u.disabled=0""", (prefs["default_language"], email)).fetchone()
        if user:
            token = secrets.token_urlsafe(32)
            db.execute("DELETE FROM resets WHERE user_id=?", (user["id"],))
            db.execute("INSERT INTO resets VALUES (?,?,?)", (security.digest(token), user["id"], time.time() + 1800))
    if user:
        base = prefs["smtp_public_url"].rstrip("/") or str(request.base_url).rstrip("/")
        mail.send_recovery(user["name"], email, base + "/#reset/" + token,
                           user["language"], prefs["installation_name"])
    return {"ok": True}


class Reset(BaseModel):
    token: str = Field(max_length=100)
    password: str = Field(max_length=128)


@app.post("/api/reset")
def reset(body: Reset, request: Request):
    security.rate_limit("reset:" + security.ip(request), 5, 60)
    hashed = security.password_hash(body.password)
    with connect(True) as db:
        row = db.execute("SELECT * FROM resets WHERE token=? AND expires>?", (security.digest(body.token), time.time())).fetchone()
        if not row:
            raise HTTPException(400, "invalid_token")
        db.execute("UPDATE users SET password=? WHERE id=?", (hashed, row["user_id"]))
        db.execute("DELETE FROM sessions WHERE user_id=?", (row["user_id"],))
        db.execute("DELETE FROM resets WHERE user_id=?", (row["user_id"],))
    return {"ok": True}


@app.get("/api/tools")
def tools(user=Depends(security.session)):
    return catalog()


class FileSpec(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0)


class UploadSpec(BaseModel):
    files: list[FileSpec] = Field(min_length=1, max_length=50)


@app.post("/api/jobs", status_code=201)
def create_job(body: UploadSpec, user=Depends(security.session)):
    prefs = settings()
    security.rate_limit("upload:" + user["id"], prefs["upload_limit"], 600)
    files = []
    for f in body.files:
        name = security.safe_name(f.name)
        ext = name.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED:
            raise HTTPException(400, "unsupported_format")
        files.append({"name": name, "ext": ext, "size": f.size, "uploaded": False})
    size = sum(f["size"] for f in files)
    if size > prefs["max_upload_mb"] * 1024**2:
        raise HTTPException(413, "too_large")
    uid = secrets.token_hex(16)
    with storage.lock(uid):
        with connect(True) as db:
            pending = db.execute("SELECT count(*) FROM jobs WHERE user_id=? AND state IN ('PENDING','PROCESSING')", (user["id"],)).fetchone()[0]
            if pending >= prefs["max_pending"]:
                raise HTTPException(429, "pending_limit")
            budget = storage.check_quota(db, size, prefs)
            now = time.time()
            db.execute("INSERT INTO jobs (id,user_id,created,expires,files,reserved) VALUES (?,?,?,?,?,?)",
                       (uid, user["id"], now, now + prefs["retention_minutes"] * 60, json.dumps(files), budget))
            folder = storage.job_dir(uid)
            folder.mkdir()
            (folder / "input").mkdir()
    return {"id": uid}


@app.put("/api/jobs/{job_id}/files/{index}")
async def upload(job_id: str, index: int, request: Request, user=Depends(security.session)):
    with connect() as db:
        row = storage.owned_job(db, job_id, user["id"])
    files = json.loads(row["files"])
    if index < 0 or index >= len(files) or row["ready"] or row["state"] != "PENDING":
        raise HTTPException(409, "invalid_state")
    guard = storage.lock(job_id)
    await run_in_threadpool(guard.acquire)
    failed = False
    try:
        with connect() as db:
            row = storage.owned_job(db, job_id, user["id"])
        files = json.loads(row["files"])
        if files[index]["uploaded"] or row["ready"]:
            raise HTTPException(409, "invalid_state")
        path = storage.job_dir(job_id) / "input" / f"{index}.{files[index]['ext']}"
        count = 0
        # Allow for a slow home network: roughly 1 MB/s, with a generous floor.
        async with asyncio.timeout(max(180, files[index]["size"] // (1024**2))):
            with path.open("xb") as out:
                async for chunk in request.stream():
                    count += len(chunk)
                    if count > files[index]["size"]:
                        raise HTTPException(413, "too_large")
                    if time.time() >= row["expires"]:
                        raise HTTPException(410, "expired")
                    if shutil.disk_usage(config.JOBS).free < settings()["min_free_mb"] * 1024**2:
                        raise HTTPException(507, "storage_full")
                    await run_in_threadpool(out.write, chunk)
        if count != files[index]["size"]:
            raise HTTPException(400, "incomplete_upload")
        await run_in_threadpool(storage.validate_file, path, files[index]["ext"])
        files[index]["uploaded"] = True
        with connect(True) as db:
            storage.owned_job(db, job_id, user["id"])
            db.execute("UPDATE jobs SET files=? WHERE id=?", (json.dumps(files), job_id))
    except BaseException:
        failed = True
        raise
    finally:
        await run_in_threadpool(guard.release)
        if failed:
            await run_in_threadpool(storage.delete_job, job_id)
    return {"ok": True}


class RunSpec(BaseModel):
    operation: str = Field(max_length=60)
    options: dict = Field(default_factory=dict)


@app.post("/api/jobs/{job_id}/run")
def run(job_id: str, body: RunSpec, user=Depends(security.session)):
    security.rate_limit("job:" + user["id"], settings()["job_limit"], 600)
    if body.operation not in OPERATIONS:
        raise HTTPException(400, "unsupported_operation")
    exts, cls, dep, batch = OPERATIONS[body.operation]
    if not available(dep):
        raise HTTPException(503, "tool_unavailable")
    if len(json.dumps(body.options)) > 1500000:
        raise HTTPException(413, "too_large")
    with storage.lock(job_id):
        with connect(True) as db:
            row = storage.owned_job(db, job_id, user["id"])
            files = json.loads(row["files"])
            if row["state"] not in ("PENDING", "FAILED", "CANCELLED") or row["running"] or (row["state"] == "PENDING" and row["ready"]) or not all(f["uploaded"] for f in files):
                raise HTTPException(409, "invalid_state")
            pending = db.execute("SELECT count(*) FROM jobs WHERE user_id=? AND state IN ('PENDING','PROCESSING')", (user["id"],)).fetchone()[0]
            if row["state"] != "PENDING" and pending >= settings(db)["max_pending"]:
                raise HTTPException(429, "pending_limit")
            if any(f["ext"] not in exts for f in files) or (not batch and len(files) > 1):
                raise HTTPException(400, "unsupported_operation")
            if sum(f["size"] for f in files) > 20 * 1024**2 and cls == "LIGHT":
                cls = "MEDIUM"
            db.execute("""UPDATE jobs SET operation=?,options=?,class=?,ready=1,state='PENDING',
                          error=NULL,outputs='[]',started=NULL,finished=NULL WHERE id=?""",
                       (body.operation, json.dumps(body.options), cls, job_id))
    return {"ok": True}


@app.get("/api/jobs")
def jobs(user=Depends(security.session)):
    with connect() as db:
        rows = db.execute("SELECT * FROM jobs WHERE user_id=? AND expires>? AND deleting=0 ORDER BY created DESC", (user["id"], time.time())).fetchall()
        result = []
        for row in rows:
            item = storage.public_job(row)
            if row["ready"] and row["state"] == "PENDING":
                item["queue_ahead"] = db.execute("SELECT count(*) FROM jobs WHERE class=? AND ready=1 AND state='PENDING' AND created<? AND expires>?", (row["class"], row["created"], time.time())).fetchone()[0]
            result.append(item)
        return result


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, user=Depends(security.session)):
    with connect() as db:
        return storage.public_job(storage.owned_job(db, job_id, user["id"]))


@app.delete("/api/jobs/{job_id}")
def delete(job_id: str, user=Depends(security.session)):
    with connect() as db:
        storage.owned_job(db, job_id, user["id"])
    if not storage.delete_job(job_id):
        return JSONResponse({"ok": True, "pending": True}, status_code=202)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/cancel")
def cancel(job_id: str, user=Depends(security.session)):
    with connect(True) as db:
        storage.owned_job(db, job_id, user["id"])
        db.execute("UPDATE jobs SET state='CANCELLED',options='{}' WHERE id=? AND state IN ('PENDING','PROCESSING')", (job_id,))
    return {"ok": True}


@app.get("/api/jobs/{job_id}/original/{index}")
def original(job_id: str, index: int, user=Depends(security.session)):
    with connect() as db:
        row = storage.owned_job(db, job_id, user["id"])
    files = json.loads(row["files"])
    if index < 0 or index >= len(files) or not files[index]["uploaded"]:
        raise HTTPException(404, "not_found")
    f = files[index]
    return DownloadResponse(storage.job_dir(job_id) / "input", f"{index}.{f['ext']}", filename=f["name"])


@app.get("/api/jobs/{job_id}/download/{index}")
def download(job_id: str, index: int, user=Depends(security.session)):
    with connect() as db:
        row = storage.owned_job(db, job_id, user["id"])
    outputs = json.loads(row["outputs"])
    if row["state"] != "COMPLETED" or index < 0 or index >= len(outputs):
        raise HTTPException(404, "not_found")
    return DownloadResponse(storage.job_dir(job_id) / "output", outputs[index]["path"], filename=security.safe_name(outputs[index]["name"]))


@app.get("/api/jobs/{job_id}/matte/{index}/{asset}")
def matte_asset(job_id: str, index: int, asset: Literal["mask", "source"], user=Depends(security.session)):
    with connect() as db:
        row = storage.owned_job(db, job_id, user["id"])
    files = json.loads(row["files"])
    if row["state"] != "COMPLETED" or row["operation"] != "image_background" or index < 0 or index >= len(files):
        raise HTTPException(404, "not_found")
    suffix = "mask.png" if asset == "mask" else "source.webp"
    return DownloadResponse(storage.job_dir(job_id) / "editor", f"{index}.{suffix}", filename=f"{asset}.{suffix.split('.')[-1]}")


@app.get("/api/admin")
def admin_overview(user=Depends(security.admin)):
    with connect() as db:
        users = [dict(r) for r in db.execute("SELECT id,email,role,disabled,created FROM users ORDER BY created")]
        job_rows = [dict(r) for r in db.execute("SELECT id,state,class,created FROM jobs WHERE expires>?", (time.time(),))]
        reserved = db.execute("SELECT coalesce(sum(reserved),0) FROM jobs").fetchone()[0]
    disk = shutil.disk_usage(config.JOBS)
    exposed = {k: v for k, v in settings().items() if k != "smtp_password"}
    return {"users": users, "jobs": job_rows, "settings": exposed,
            "storage": {"used": storage.used_space(), "free": disk.free, "reserved": reserved}, "system": health()}


@app.put("/api/admin/settings")
def admin_settings(body: Preferences, user=Depends(security.admin)):
    with connect(True) as db:
        for key, value in body.model_dump().items():
            db.execute("UPDATE settings SET value=? WHERE key=?", (json.dumps(value), key))
    return {"ok": True}


@app.get("/api/admin/smtp")
def admin_mail(user=Depends(security.admin)):
    return {"providers": mail.PROVIDERS, "settings": mail.configuration()}


@app.put("/api/admin/smtp")
def admin_mail_save(body: MailSettings, user=Depends(security.admin)):
    validate_mail_settings(body)
    values = mail_settings_values(body)
    with connect(True) as db:
        for key, value in values.items():
            db.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, json.dumps(value)))
        # An empty field keeps the stored password; it is never sent back to the browser.
        if body.password:
            db.execute("INSERT OR REPLACE INTO settings VALUES ('smtp_password',?)", (json.dumps(body.password),))
        elif not body.host:
            db.execute("INSERT OR REPLACE INTO settings VALUES ('smtp_password','\"\"')")
    return {"ok": True}


@app.post("/api/admin/smtp/test")
def admin_mail_test(body: MailSettings, request: Request, user=Depends(security.admin)):
    security.rate_limit("smtptest:" + user["id"], 5, 300)
    validate_mail_settings(body)
    prefs = settings()
    host = body.host.strip()
    sender = body.sender.strip().lower()
    if not host or not sender:
        raise HTTPException(400, "smtp_unavailable")
    account = user_public(user)
    message = mail.build_test(user["email"], account["language"] or prefs["default_language"],
                              prefs["installation_name"])
    message["From"] = mail.formataddr((mail.clean_header(prefs["installation_name"]), sender))
    try:
        mail.deliver(host, body.port, body.security, body.user.strip(), body.password or prefs["smtp_password"] or "", message)
    except Exception:
        raise HTTPException(502, "smtp_failed") from None
    return {"ok": True}


class UserState(BaseModel):
    disabled: bool


@app.put("/api/admin/users/{uid}")
def disable_user(uid: str, body: UserState, user=Depends(security.admin)):
    with connect(True) as db:
        target = db.execute("SELECT role FROM users WHERE id=?", (uid,)).fetchone()
        if not target or target[0] == "ADMIN":
            raise HTTPException(400, "protected_admin")
        db.execute("UPDATE users SET disabled=? WHERE id=?", (int(body.disabled), uid))
        db.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
        db.execute("UPDATE jobs SET state='CANCELLED' WHERE user_id=? AND state IN ('PENDING','PROCESSING')", (uid,))
    return {"ok": True}


@app.delete("/api/admin/users/{uid}")
def remove_user(uid: str, user=Depends(security.admin)):
    disable_user(uid, UserState(disabled=True), user)
    with connect() as db:
        ids = [r[0] for r in db.execute("SELECT id FROM jobs WHERE user_id=?", (uid,))]
    for jid in ids:
        if not storage.delete_job(jid):
            raise HTTPException(409, "deletion_pending")
    with connect(True) as db:
        db.execute("DELETE FROM scheduler WHERE user_id=?", (uid,))
        db.execute("DELETE FROM users WHERE id=?", (uid,))
    return {"ok": True}


@app.post("/api/admin/jobs/{job_id}/cancel")
def admin_cancel(job_id: str, user=Depends(security.admin)):
    storage.job_dir(job_id)
    with connect(True) as db:
        db.execute("UPDATE jobs SET state='CANCELLED',options='{}' WHERE id=? AND state IN ('PENDING','PROCESSING')", (job_id,))
    return {"ok": True}


if config.WEB.exists():
    app.mount("/", StaticFiles(directory=config.WEB, html=True), name="web")
