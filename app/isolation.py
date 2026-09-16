"""Linux Landlock filesystem sandbox for untrusted document processors.

The worker has no network namespace connectivity in Compose. Landlock additionally
prevents child converters from reading other jobs, SQLite or host configuration.
"""
import ctypes
import os
import sys
from pathlib import Path


def isolate(folder: Path, models: Path):
    if sys.platform != "linux":
        if os.getenv("ALLOW_UNSANDBOXED_DEV") == "true":
            return
        raise RuntimeError("Linux sandbox required")
    libc = ctypes.CDLL(None, use_errno=True)
    abi = libc.syscall(444, 0, 0, 1)
    if abi < 1:
        raise RuntimeError("Landlock unavailable")
    class Ruleset(ctypes.Structure):
        _fields_ = [("handled_access_fs", ctypes.c_uint64)]
    class PathRule(ctypes.Structure):
        _pack_ = 1
        _fields_ = [("allowed_access", ctypes.c_uint64), ("parent_fd", ctypes.c_int32)]
    mask = (1 << (15 if abi >= 3 else 14 if abi >= 2 else 13)) - 1
    ruleset = Ruleset(mask)
    fd = libc.syscall(444, ctypes.byref(ruleset), ctypes.sizeof(ruleset), 0)
    if fd < 0:
        raise RuntimeError("Sandbox initialization failed")
    readonly = (1 << 0) | (1 << 2) | (1 << 3)
    allowed = [(Path(p), readonly) for p in ("/usr", "/lib", "/lib64", "/app", "/etc/fonts", "/etc/libreoffice", "/etc/ssl", "/etc/ld.so.cache", "/etc/localtime", "/etc/passwd", "/etc/group", "/proc/cpuinfo", "/proc/meminfo", "/sys/devices/system/cpu")]
    allowed += [(models, readonly), (folder, mask), (Path("/dev/null"), (1 << 1) | (1 << 2)), (Path("/dev/urandom"), 1 << 2), (Path("/dev/random"), 1 << 2)]
    try:
        for path, access in allowed:
            if not path.exists():
                continue
            if not path.is_dir():
                access &= (1 << 0) | (1 << 1) | (1 << 2) | ((1 << 14) if abi >= 3 else 0)
            target = os.open(path, os.O_PATH | os.O_CLOEXEC)
            try:
                rule = PathRule(access, target)
                if libc.syscall(445, fd, 1, ctypes.byref(rule), 0) < 0:
                    raise RuntimeError("Sandbox rule failed")
            finally:
                os.close(target)
        if libc.prctl(38, 1, 0, 0, 0) < 0 or libc.syscall(446, fd, 0) < 0:
            raise RuntimeError("Sandbox enforcement failed")
    finally:
        os.close(fd)
