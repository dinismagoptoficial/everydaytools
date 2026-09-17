import os
from pathlib import Path

CLASS_MEMORY_MB = {"LIGHT": 96, "MEDIUM": 384, "HEAVY": 768}


def processing_budget_mb():
    configured = os.getenv("PROCESSING_BUDGET_MB")
    if configured:
        return max(768, int(configured))
    for path in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            limit = int(Path(path).read_text().strip()) // 1024**2
            if limit < 1048576:
                return max(768, int(limit * 0.7))
        except (OSError, ValueError):
            pass
    return 2048


def has_capacity(db, cls):
    rows = db.execute("SELECT class, count(*) AS n FROM jobs WHERE running=1 GROUP BY class").fetchall()
    active = sum(row["n"] for row in rows)
    reserved = sum(CLASS_MEMORY_MB[row["class"]] * row["n"] for row in rows)
    return active < int(os.getenv("MAX_ACTIVE_JOBS", "6")) and reserved + CLASS_MEMORY_MB[cls] <= processing_budget_mb()
