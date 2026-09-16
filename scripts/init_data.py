import os
import shutil
from pathlib import Path

root = Path(os.getenv("DATA_DIR", "/data"))
for name in ("database", "jobs", "temp", "models"):
    path = root / name
    path.mkdir(parents=True, exist_ok=True)
    os.chown(path, 10001, 10001)
    os.chmod(path, 0o700)
model = root / "models" / "u2netp.onnx"
if not model.exists():
    shutil.copy2("/opt/models/u2netp.onnx", model)
    os.chown(model, 10001, 10001)
