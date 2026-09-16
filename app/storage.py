import json
import os
import re
import shutil
import time
import zipfile
from pathlib import Path

from fastapi import HTTPException
from filelock import FileLock, Timeout

from . import config
from .catalog import ALLOWED
from .db import connect

# libmagic identifies media containers precisely and ships with the runtime image.
# Windows development has no libmagic, and loading python-magic there aborts the
# interpreter instead of raising, so the signature fallback below is used instead.
if os.name == "nt":
    magic = None
else:
    try:
        import magic
    except (ImportError, OSError):
        magic = None


def job_dir(job_id):
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        raise HTTPException(404, "not_found")
    path = config.JOBS / job_id
    if path.is_symlink():
        raise HTTPException(400, "invalid_file")
    return path


def lock(job_id, timeout=15):
    job_dir(job_id)
    # Fixed lock stripes avoid retaining a filename/lock per deleted job.
    return FileLock(str(config.TEMP / ("slot-" + job_id[:3] + ".lock")), timeout=timeout, thread_local=False)


def owned_job(db, job_id, user_id):
    job_dir(job_id)
    row = db.execute("SELECT * FROM jobs WHERE id=? AND user_id=? AND expires>? AND deleting=0",
                     (job_id, user_id, time.time())).fetchone()
    if row is None:
        raise HTTPException(404, "not_found")
    return dict(row)


def used_space():
    return sum(f.stat().st_size for f in config.JOBS.rglob("*") if f.is_file() and not f.is_symlink())


def check_quota(db, size, prefs):
    reserved = db.execute("SELECT coalesce(sum(reserved),0) FROM jobs").fetchone()[0]
    budget = min(config.MAX_OUTPUT, max(size * 4, 128 * 1024**2)) + size
    if reserved + budget > prefs["max_storage_mb"] * 1024**2:
        raise HTTPException(507, "storage_full")
    if shutil.disk_usage(config.JOBS).free - reserved - budget < prefs["min_free_mb"] * 1024**2:
        raise HTTPException(507, "storage_full")
    return budget


def await_idle(job_id, timeout=25):
    """Wait for the supervisor to stop the converter process group for this job."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with connect() as db:
            row = db.execute("SELECT running FROM jobs WHERE id=?", (job_id,)).fetchone()
        if row is None or not row["running"]:
            return True
        time.sleep(0.2)
    return False


def delete_job(job_id):
    """Remove every stored copy of a job. Returns False when a retry is still needed."""
    folder = job_dir(job_id)
    with connect(True) as db:
        db.execute("UPDATE jobs SET deleting=1 WHERE id=?", (job_id,))
    # The job is already invisible and unusable; from here the removal may safely be retried.
    await_idle(job_id)
    try:
        with lock(job_id, timeout=40):
            if folder.exists():
                shutil.rmtree(folder)
            with connect(True) as db:
                db.execute("DELETE FROM jobs WHERE id=?", (job_id,))
    except Timeout:
        return False
    # Leave lock inode in place until startup (unlinking a held POSIX lock can create two locks).
    return True


def cleanup():
    now = time.time()
    with connect() as db:
        expired = [r[0] for r in db.execute("SELECT id FROM jobs WHERE expires<=? OR deleting=1", (now,))]
    for job_id in expired:
        delete_job(job_id)
    with connect(True) as db:
        db.execute("DELETE FROM sessions WHERE expires<=?", (now,))
        db.execute("DELETE FROM resets WHERE expires<=?", (now,))
        db.execute("DELETE FROM rate_limits WHERE expires<=?", (now,))
        db.execute("DELETE FROM scheduler WHERE user_id NOT IN (SELECT user_id FROM jobs)")
    with connect() as db:
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        known = {r[0] for r in db.execute("SELECT id FROM jobs")}
    for folder in config.JOBS.iterdir():
        if re.fullmatch(r"[a-f0-9]{32}", folder.name) and folder.name not in known:
            try:
                # Coordinate with upload creation before checking again.
                with lock(folder.name):
                    with connect() as db:
                        exists = db.execute("SELECT 1 FROM jobs WHERE id=?", (folder.name,)).fetchone()
                    if not exists and folder.exists():
                        shutil.rmtree(folder)
            except Timeout:
                continue  # Busy right now; the next sweep removes it.


def validate_file(path: Path, ext: str):
    if ext not in ALLOWED:
        raise HTTPException(400, "unsupported_format")
    header = path.open("rb").read(4096)
    valid = True
    if ext == "pdf":
        valid = header.startswith(b"%PDF-")
    elif ext in {"docx", "xlsx", "pptx", "odt", "ods", "odp", "zip"}:
        valid = zipfile.is_zipfile(path)
        if valid and ext != "zip":
            with zipfile.ZipFile(path) as z:
                names = z.namelist()
                valid = len(names) < 10000 and ("[Content_Types].xml" in names if ext in {"docx", "xlsx", "pptx"} else "mimetype" in names)
    elif ext in {"doc", "xls", "ppt"}:
        valid = header.startswith(bytes.fromhex("d0cf11e0a1b11ae1"))
    elif ext == "svg":
        from defusedxml import ElementTree
        try:
            root = ElementTree.parse(path).getroot()
            valid = root.tag.endswith("svg")
            for el in root.iter():
                for k, v in el.attrib.items():
                    if "href" in k and not v.startswith("#"):
                        valid = False
                    if "url(" in v.lower() or "@import" in v.lower():
                        valid = False
                if el.tag.endswith(("script", "foreignObject", "style")):
                    valid = False
        except Exception:
            valid = False
    elif ext in {"txt", "csv", "html", "rtf"}:
        valid = b"\x00" not in header and not header.startswith(b"MZ")
    else:
        mime = None
        if magic is not None:
            try:
                mime = magic.from_file(str(path), mime=True)
            except OSError:
                mime = None
        valid = media_matches(path, ext, header, mime)
    if not valid:
        raise HTTPException(400, "invalid_file")


MEDIA_FAMILIES = {
    "jpg": "image/", "jpeg": "image/", "png": "image/", "heic": "image/", "heif": "image/",
    "avif": "image/", "webp": "image/", "gif": "image/", "bmp": "image/", "tiff": "image/",
    "mp4": "video/", "mov": "video/", "mkv": "video/", "webm": "video/", "avi": "video/",
    "mp3": "audio/", "wav": "audio/", "flac": "audio/", "aac": "audio/", "m4a": "audio/", "ogg": "audio/",
}
MEDIA_SIGNATURES = {"gz": [b"\x1f\x8b"], "7z": [b"7z\xbc\xaf\x27\x1c"], "mp3": [b"ID3", b"\xff"],
                    "flac": [b"fLaC"], "wav": [b"RIFF"], "ogg": [b"OggS"], "aac": [b"\xff"],
                    "mkv": [b"\x1aE\xdf\xa3"], "webm": [b"\x1aE\xdf\xa3"], "avi": [b"RIFF"]}


def media_matches(path: Path, ext: str, header: bytes, mime):
    if mime is not None:
        if ext == "m4a" and mime == "video/mp4":
            return True
        if ext in MEDIA_FAMILIES:
            return mime.startswith(MEDIA_FAMILIES[ext])
        return mime in {"application/x-tar", "application/gzip", "application/x-gzip", "application/x-7z-compressed"}
    # Without libmagic: identify images through their decoder, otherwise match explicit signatures.
    # This mirrors what libmagic reports — the format, not the integrity of every chunk.
    if ext in {"jpg", "jpeg", "png", "heic", "heif", "avif", "webp", "gif", "bmp", "tiff"}:
        try:
            import pillow_heif
            from PIL import Image
            pillow_heif.register_heif_opener()
            with Image.open(path) as im:
                return bool(im.format)
        except Exception:
            return False
    if ext in {"mp4", "mov", "m4a"}:
        return header[4:8] in {b"ftyp", b"moov", b"mdat", b"wide"}
    if ext == "tar":
        import tarfile
        return tarfile.is_tarfile(path)
    return any(header.startswith(s) for s in MEDIA_SIGNATURES.get(ext, []))


def public_job(row):
    files = json.loads(row["files"])
    return {k: row[k] for k in ("id", "created", "expires", "state", "ready", "operation", "class", "error")} | {
        "files": [{"name": f["name"], "size": f["size"], "ext": f["ext"], "uploaded": f.get("uploaded", False)} for f in files],
        "outputs": json.loads(row["outputs"]),
    }
