"""Installation/build step only. The application never downloads models at runtime."""
import hashlib
import sys
import urllib.request
from pathlib import Path

destination = Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)
model = destination / "u2netp.onnx"
expected = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8"
if not model.exists() or hashlib.sha256(model.read_bytes()).hexdigest() != expected:
    temporary = destination / "u2netp.download"
    urllib.request.urlretrieve("https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx", temporary)
    if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
        temporary.unlink()
        raise RuntimeError("Model integrity verification failed")
    temporary.replace(model)
print("u2netp installed; sha256=" + hashlib.sha256(model.read_bytes()).hexdigest())
