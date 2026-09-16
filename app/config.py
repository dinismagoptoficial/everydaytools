import os
from pathlib import Path

DATA = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB = DATA / "database" / "everyday.sqlite3"
JOBS = DATA / "jobs"
TEMP = DATA / "temp"
MODELS = Path(os.environ.get("MODELS_DIR", str(DATA / "models"))).resolve()
WEB = Path(os.environ.get("WEB_DIR", "web/dist")).resolve()

DEFAULTS = {
    "installation_name": "Everyday Tools",
    "registration": True,
    "retention_minutes": int(os.getenv("FILE_RETENTION_MINUTES", "60")),
    "max_upload_mb": int(os.getenv("MAX_UPLOAD_SIZE", "256")),
    "max_storage_mb": int(os.getenv("MAX_STORAGE_USAGE", "10240")),
    "min_free_mb": int(os.getenv("MIN_FREE_DISK_SPACE", "1024")),
    "light_concurrency": int(os.getenv("LIGHT_CONCURRENCY", "3")),
    "medium_concurrency": int(os.getenv("MEDIUM_CONCURRENCY", "2")),
    "heavy_concurrency": int(os.getenv("HEAVY_CONCURRENCY", "1")),
    "max_pending": int(os.getenv("MAX_PENDING_JOBS", "5")),
    "login_limit": int(os.getenv("LOGIN_RATE_LIMIT", "5")),
    "upload_limit": int(os.getenv("UPLOAD_RATE_LIMIT", "20")),
    "register_limit": int(os.getenv("REGISTER_RATE_LIMIT", "5")),
    "admin_limit": int(os.getenv("ADMIN_RATE_LIMIT", "30")),
    "job_limit": int(os.getenv("JOB_RATE_LIMIT", "20")),
}
JOB_TIMEOUT = int(os.getenv("JOB_TIMEOUT_SECONDS", "900"))
MAX_OUTPUT = int(os.getenv("MAX_OUTPUT_MB", "1024")) * 1024**2
MAX_EXTRACT = int(os.getenv("MAX_EXTRACT_MB", "512")) * 1024**2
MAX_PAGES = int(os.getenv("MAX_PDF_PAGES", "500"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
SESSION_SECONDS = 7 * 86400

