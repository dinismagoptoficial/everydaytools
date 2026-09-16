import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from filelock import FileLock, Timeout as FileLockTimeout

from . import config, storage
from .db import connect, heartbeat, initialize, settings

stopping = threading.Event()


def claim(cls):
    now = time.time()
    with connect(True) as db:
        limit = settings(db)[cls.lower() + "_concurrency"]
        active = db.execute("SELECT count(*) FROM jobs WHERE running=1 AND class=?", (cls,)).fetchone()[0]
        if active >= limit:
            return None
        row = db.execute("""SELECT j.* FROM jobs j JOIN users u ON u.id=j.user_id
            LEFT JOIN scheduler s ON s.user_id=j.user_id AND s.class=j.class
            WHERE j.class=? AND j.state='PENDING' AND j.ready=1 AND j.deleting=0 AND j.expires>? AND u.disabled=0
            ORDER BY coalesce(s.served,0), j.created LIMIT 1""", (cls, now)).fetchone()
        if not row:
            return None
        db.execute("UPDATE jobs SET state='PROCESSING',running=1,started=? WHERE id=?", (now, row["id"]))
        db.execute("INSERT OR REPLACE INTO scheduler VALUES (?,?,?)", (row["user_id"], cls, now))
        return dict(row)


def kill_tree(process):
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


def clear_work(folder, keep_output):
    for p in folder.iterdir():
        if p.name == "input" or (p.name == "output" and keep_output):
            continue
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink(missing_ok=True)


def folder_size(folder):
    return sum(p.stat().st_size for p in folder.rglob("*") if p.is_file())


def start_converter(jid):
    """Launch the disposable job process. Returns None when the job no longer wants running."""
    with storage.lock(jid, timeout=60):
        with connect() as db:
            current = db.execute("SELECT deleting,state FROM jobs WHERE id=?", (jid,)).fetchone()
        if not current or current["deleting"] or current["state"] != "PROCESSING":
            return None
        env = os.environ.copy()
        for key in list(env):
            if key.startswith("SMTP_"):
                env.pop(key)
        env.update({"OMP_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1", "PYTHONUNBUFFERED": "1"})
        return subprocess.Popen([sys.executable, "-m", "app.run_job", jid], env=env,
                                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                start_new_session=os.name != "nt")


def supervise(proc, jid, folder, reserved):
    """Watch a running converter: cancellation, expiry, timeout and disk budget."""
    begin = time.monotonic()
    checked = 0.0
    error = None
    try:
        while proc.poll() is None:
            with connect() as db:
                state = db.execute("SELECT state,expires,deleting FROM jobs WHERE id=?", (jid,)).fetchone()
            if stopping.is_set() or not state or state["deleting"] or state["state"] != "PROCESSING" or state["expires"] <= time.time():
                error = "interrupted"
                break
            elapsed = time.monotonic() - begin
            if elapsed > config.JOB_TIMEOUT:
                error = "timeout"
                break
            # Walking the job tree is the expensive check, so it runs on a slower cadence.
            if elapsed - checked >= 2:
                checked = elapsed
                if not folder.exists():
                    error = "interrupted"
                    break
                if folder_size(folder) > reserved or shutil.disk_usage(folder).free < settings()["min_free_mb"] * 1024**2:
                    error = "storage_full"
                    break
            time.sleep(0.4)
    finally:
        kill_tree(proc)
    return error


def execute(row):
    jid, folder = row["id"], storage.job_dir(row["id"])
    try:
        proc = start_converter(jid)
        if proc is None:
            return
        # The lock is released while the converter runs so that deletion, cleanup and
        # uploads are never blocked behind a long conversion.
        error = supervise(proc, jid, folder, row["reserved"])
        outputs, used = [], 0
        with storage.lock(jid, timeout=60):
            if folder.exists():
                if not error and proc.returncode == 0 and (folder / "result.json").exists():
                    outputs = json.loads((folder / "result.json").read_text(encoding="utf-8"))
                    if folder_size(folder) > row["reserved"]:
                        error, outputs = "storage_full", []
                else:
                    error = error or "conversion_failed"
                    if (folder / "error.json").exists() and error == "conversion_failed":
                        error = json.loads((folder / "error.json").read_text(encoding="utf-8"))["code"]
                clear_work(folder, bool(outputs))
                used = folder_size(folder)
            else:
                error = error or "interrupted"
            # A finished job releases the unused part of its reservation; a failed one keeps
            # the full budget so that trying again still has room for a result.
            reserved = min(row["reserved"], used) if outputs else row["reserved"]
            with connect(True) as db:
                db.execute("""UPDATE jobs SET state=?,outputs=?,options='{}',error=?,finished=?,reserved=?
                              WHERE id=? AND state='PROCESSING' AND deleting=0""",
                           ("COMPLETED" if outputs else "FAILED", json.dumps(outputs), error, time.time(),
                            reserved, jid))
        print("job " + jid[:8] + (" completed" if outputs else " failed") + " as " + row["operation"], flush=True)
    except Exception:
        # Never leave a job stuck in PROCESSING because supervision itself failed.
        with connect(True) as db:
            db.execute("""UPDATE jobs SET state='FAILED',error='interrupted',options='{}'
                          WHERE id=? AND state='PROCESSING' AND deleting=0""", (jid,))
        raise
    finally:
        with connect(True) as db:
            db.execute("UPDATE jobs SET running=0 WHERE id=?", (jid,))


def recover():
    with connect(True) as db:
        rows = db.execute("SELECT id FROM jobs WHERE state='PROCESSING'").fetchall()
        db.execute("UPDATE jobs SET state='FAILED',error='interrupted',options='{}' WHERE state='PROCESSING'")
        db.execute("UPDATE jobs SET running=0")
    for row in rows:
        folder = storage.job_dir(row[0])
        try:
            with storage.lock(row[0]):
                if folder.exists():
                    clear_work(folder, False)
        except FileLockTimeout:
            continue
    storage.cleanup()


def main():
    initialize()
    # Only one scheduler per installation; concurrency belongs to classes, not replicas.
    with FileLock(str(config.TEMP / "worker.lock"), timeout=0):
        recover()
        def stop(*args):
            stopping.set()
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        futures = []
        last_clean = last_beat = 0.0
        with ThreadPoolExecutor(max_workers=14) as pool:
            while not stopping.is_set():
                now = time.monotonic()
                if now - last_beat > 5:
                    heartbeat()
                    last_beat = now
                for future in list(futures):
                    if future.done():
                        try:
                            future.result()
                        except Exception:
                            print("job supervision failed", flush=True)
                        futures.remove(future)
                for cls in ("LIGHT", "MEDIUM", "HEAVY"):
                    while row := claim(cls):
                        futures.append(pool.submit(execute, row))
                if now - last_clean > 30:
                    last_clean = now
                    try:
                        storage.cleanup()
                    except Exception:
                        print("cleanup retry scheduled", flush=True)
                stopping.wait(0.5)


if __name__ == "__main__":
    main()
