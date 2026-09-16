import ctypes
import json
import os
import signal
import sys

from . import config
from .db import connect
from .storage import job_dir


def main():
    jid = sys.argv[1]
    folder = job_dir(jid)
    if sys.platform == "linux":
        import resource
        # Bound every output file, address space and CPU time in addition to container limits.
        resource.setrlimit(resource.RLIMIT_FSIZE, (config.MAX_OUTPUT, config.MAX_OUTPUT))
        memory = int(os.getenv("PROCESS_MEMORY_MB", "2048")) * 1024**2
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        resource.setrlimit(resource.RLIMIT_CPU, (config.JOB_TIMEOUT, config.JOB_TIMEOUT + 5))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        ctypes.CDLL(None).prctl(1, signal.SIGKILL)
    work = folder / "work"
    work.mkdir(exist_ok=True)
    for key in ("TMPDIR", "TEMP", "TMP", "HOME"):
        os.environ[key] = str(work)
    try:
        with connect() as db:
            row = db.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
        if row:
            from .isolation import isolate
            isolate(folder, config.MODELS)
            from .processors import process
            process(dict(row), folder)
    except Exception as exc:
        allowed = {"invalid_option", "invalid_pages", "too_many_pages", "pdf_password", "no_images", "no_forms",
                   "archive_limit", "unsafe_archive", "image_too_large", "single_file_required", "too_many_files"}
        code = str(exc) if isinstance(exc, ValueError) and str(exc) in allowed else "conversion_failed"
        (folder / "error.json").write_text(json.dumps({"code": code}), encoding="utf-8")
        sys.exit(1)


if __name__ == "__main__":
    main()
