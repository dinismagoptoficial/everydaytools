"""Consistent account/configuration backup, never copies transient rows or free pages."""
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

source = sqlite3.connect(Path(os.getenv("DATA_DIR", "/data")) / "database" / "everyday.sqlite3")
source.execute("BEGIN")
with tempfile.TemporaryDirectory() as temporary:
    target_path = Path(temporary) / "database.sqlite3"
    target = sqlite3.connect(target_path)
    schema = source.execute("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC").fetchall()
    for (sql,) in schema:
        target.execute(sql)
    for table in ("users", "settings", "user_preferences", "feedback"):
        rows = source.execute("SELECT * FROM " + table).fetchall()
        if rows:
            placeholders = ",".join("?" for _ in rows[0])
            target.executemany("INSERT INTO " + table + " VALUES (" + placeholders + ")", rows)
    target.execute("PRAGMA user_version=" + str(source.execute("PRAGMA user_version").fetchone()[0]))
    target.commit()
    target.close()
    source.close()
    with target_path.open("rb") as stream:
        import shutil
        shutil.copyfileobj(stream, sys.stdout.buffer)
