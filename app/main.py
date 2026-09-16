import asyncio
import json
import secrets
import shutil
import smtplib
import ssl
import time
import os
from contextlib import asynccontextmanager
from email.message import EmailMessage
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import __version__, config, security, storage
from .catalog import ALLOWED, OPERATIONS, available, catalog
from .db import connect, initialize, settings


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
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
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


class Setup(Credentials):
    installation_name: str = Field(default="Everyday Tools", min_length=1, max_length=60)
    registration: bool = True
    max_upload_mb: int = Field(default=256, ge=1, le=10240)
    retention_minutes: int = Field(default=60, ge=5, le=1440)


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
    return {k: user[k] for k in ("id", "email", "role")}


@app.get("/api/status")
def status():
    with connect() as db:
        setup = not db.execute("SELECT 1 FROM users LIMIT 1").fetchone()
    prefs = settings()
    return {"setup": setup, "name": prefs["installation_name"], "registration": prefs["registration"],
            "retention_minutes": prefs["retention_minutes"], "max_upload_mb": prefs["max_upload_mb"],
            "smtp": bool(os.getenv("SMTP_HOST")), "version": __version__}


@app.get("/api/health")
def health():
    with connect() as db:
        row = db.execute("SELECT value FROM system WHERE key='worker'").fetchone()
    return {"status": "ok", "worker": bool(row and time.time() - float(row[0]) < 20), "version": __version__}


@app.post("/api/setup")
def setup(body: Setup, request: Request, response: Response):
    security.rate_limit("setup:" + security.ip(request), 5, 60)
    email, hashed = security.email_address(body.email), security.password_hash(body.password)
    with connect(True) as db:
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            raise HTTPException(409, "already_setup")
        uid = secrets.token_hex(16)
        db.execute("INSERT INTO users VALUES (?,?,?,'ADMIN',0,?)", (uid, email, hashed, time.time()))
        for key in ("installation_name", "registration", "max_upload_mb", "retention_minutes"):
            db.execute("UPDATE settings SET value=? WHERE key=?", (json.dumps(getattr(body, key)), key))
        security.new_session(db, response, uid, request)
    return {"ok": True}


@app.post("/api/register")
def register(body: Credentials, request: Request, response: Response):
    security.rate_limit("register:" + security.ip(request), settings()["register_limit"], 600)
    email, hashed = security.email_address(body.email), security.password_hash(body.password)
    with connect(True) as db:
        if not settings(db)["registration"] or not db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            raise HTTPException(403, "registration_closed")
        if db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(409, "account_exists")
        uid = secrets.token_hex(16)
        db.execute("INSERT INTO users VALUES (?,?,?,'USER',0,?)", (uid, email, hashed, time.time()))
        security.new_session(db, response, uid, request)
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
        security.new_session(db, response, user["id"], request)
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(security.session)):
    return user_public(user) | {"csrf": user["csrf"]}


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
    if not os.getenv("SMTP_HOST") or not os.getenv("PUBLIC_URL"):
        raise HTTPException(400, "smtp_unavailable")
    email = security.email_address(body.email)
    with connect(True) as db:
        user = db.execute("SELECT id FROM users WHERE email=? AND disabled=0", (email,)).fetchone()
        if user:
            token = secrets.token_urlsafe(32)
            db.execute("DELETE FROM resets WHERE user_id=?", (user[0],))
            db.execute("INSERT INTO resets VALUES (?,?,?)", (security.digest(token), user[0], time.time() + 1800))
    if user:
        message = EmailMessage()
        message["From"] = os.getenv("SMTP_FROM", "everyday-tools@localhost")
        message["To"] = email
        message["Subject"] = "Everyday Tools — password"
        message.set_content("Alterar palavra-passe / Reset password (30 min):\n" + os.environ["PUBLIC_URL"].rstrip("/") + "/#reset/" + token)
        try:
            with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587")), timeout=10) as smtp:
                if os.getenv("SMTP_STARTTLS", "true") == "true":
                    smtp.starttls(context=ssl.create_default_context())
                if os.getenv("SMTP_USER"):
                    smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
                smtp.send_message(message)
        except Exception:
            print("password recovery delivery failed", flush=True)
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
                    out.write(chunk)
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
    storage.delete_job(job_id)
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
    return FileResponse(storage.job_dir(job_id) / "input" / f"{index}.{f['ext']}", filename=f["name"], media_type="application/octet-stream")


@app.get("/api/jobs/{job_id}/download/{index}")
def download(job_id: str, index: int, user=Depends(security.session)):
    with connect() as db:
        row = storage.owned_job(db, job_id, user["id"])
    outputs = json.loads(row["outputs"])
    if row["state"] != "COMPLETED" or index < 0 or index >= len(outputs):
        raise HTTPException(404, "not_found")
    return FileResponse(storage.job_dir(job_id) / "output" / outputs[index]["path"], filename=outputs[index]["name"], media_type="application/octet-stream")


@app.get("/api/admin")
def admin_overview(user=Depends(security.admin)):
    with connect() as db:
        users = [dict(r) for r in db.execute("SELECT id,email,role,disabled,created FROM users ORDER BY created")]
        job_rows = [dict(r) for r in db.execute("SELECT id,state,class,created FROM jobs WHERE expires>?", (time.time(),))]
        reserved = db.execute("SELECT coalesce(sum(reserved),0) FROM jobs").fetchone()[0]
    disk = shutil.disk_usage(config.JOBS)
    return {"users": users, "jobs": job_rows, "settings": settings(),
            "storage": {"used": storage.used_space(), "free": disk.free, "reserved": reserved}, "system": health()}


@app.put("/api/admin/settings")
def admin_settings(body: Preferences, user=Depends(security.admin)):
    with connect(True) as db:
        for key, value in body.model_dump().items():
            db.execute("UPDATE settings SET value=? WHERE key=?", (json.dumps(value), key))
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
        storage.delete_job(jid)
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
