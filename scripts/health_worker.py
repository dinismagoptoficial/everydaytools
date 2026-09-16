import os
import sqlite3
import time
from pathlib import Path

db = sqlite3.connect(Path(os.getenv("DATA_DIR", "/data")) / "database" / "everyday.sqlite3")
row = db.execute("SELECT value FROM system WHERE key='worker'").fetchone()
db.close()
raise SystemExit(0 if row and time.time() - float(row[0]) < 20 else 1)
