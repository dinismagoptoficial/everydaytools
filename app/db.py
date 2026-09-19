import json
import sqlite3
import time
from contextlib import contextmanager

from . import config


@contextmanager
def connect(write=False):
    db = sqlite3.connect(config.DB, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA secure_delete=ON")
    try:
        if write:
            db.execute("BEGIN IMMEDIATE")
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


def initialize():
    for folder in (config.DB.parent, config.JOBS, config.TEMP, config.MODELS):
        folder.mkdir(parents=True, exist_ok=True)
    from filelock import FileLock
    with FileLock(str(config.TEMP / "migrations.lock"), timeout=60), connect() as db:
        db.execute("PRAGMA journal_mode=WAL")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version < 1:
            db.executescript("""
                BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('USER','ADMIN')), disabled INTEGER NOT NULL DEFAULT 0,
                    created REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    csrf TEXT NOT NULL, expires REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS resets (
                    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created REAL NOT NULL, expires REAL NOT NULL, state TEXT NOT NULL DEFAULT 'PENDING',
                    ready INTEGER NOT NULL DEFAULT 0, operation TEXT NOT NULL DEFAULT '',
                    class TEXT NOT NULL DEFAULT 'LIGHT', files TEXT NOT NULL, options TEXT NOT NULL DEFAULT '{}',
                    outputs TEXT NOT NULL DEFAULT '[]', reserved INTEGER NOT NULL DEFAULT 0,
                    error TEXT, started REAL, finished REAL, deleting INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(state, ready, class, created);
                CREATE INDEX IF NOT EXISTS jobs_expiry ON jobs(expires);
                CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS scheduler (user_id TEXT NOT NULL, class TEXT NOT NULL, served REAL NOT NULL,
                    PRIMARY KEY(user_id,class));
                CREATE TABLE IF NOT EXISTS system (key TEXT PRIMARY KEY, value REAL NOT NULL);
                PRAGMA user_version=1;
                COMMIT;
            """)
        for key, value in config.DEFAULTS.items():
            db.execute("INSERT OR IGNORE INTO settings VALUES (?,?)", (key, json.dumps(value)))
        if db.execute("PRAGMA user_version").fetchone()[0] < 2:
            db.execute("ALTER TABLE jobs ADD COLUMN running INTEGER NOT NULL DEFAULT 0")
            db.execute("PRAGMA user_version=2")
        if db.execute("PRAGMA user_version").fetchone()[0] < 3:
            db.execute("""CREATE TABLE user_preferences (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT 'pt-PT'
            )""")
            db.execute("CREATE INDEX jobs_owner ON jobs(user_id, expires)")
            db.execute("PRAGMA user_version=3")
        if db.execute("PRAGMA user_version").fetchone()[0] < 4:
            db.executescript("""
                CREATE TABLE feedback (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL CHECK(type IN ('BUG','FEATURE','OTHER')),
                    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 140),
                    description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 5000),
                    status TEXT NOT NULL DEFAULT 'NEW'
                        CHECK(status IN ('NEW','IN_PROGRESS','COMPLETED')),
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    related TEXT NOT NULL DEFAULT '',
                    route TEXT NOT NULL DEFAULT '',
                    language TEXT NOT NULL CHECK(language IN ('pt-PT','en')),
                    app_version TEXT NOT NULL,
                    created REAL NOT NULL,
                    updated REAL NOT NULL,
                    completed REAL
                );
                CREATE INDEX feedback_created ON feedback(created DESC);
                CREATE INDEX feedback_filters ON feedback(status, type, created DESC);
                CREATE INDEX feedback_owner ON feedback(user_id, created DESC);
                PRAGMA user_version=4;
            """)


def settings(db=None):
    if db is None:
        with connect() as conn:
            return settings(conn)
    return {r["key"]: json.loads(r["value"]) for r in db.execute("SELECT * FROM settings")}


def heartbeat():
    with connect(True) as db:
        db.execute("INSERT OR REPLACE INTO system VALUES ('worker',?)", (time.time(),))
