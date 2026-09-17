FROM node:24-bookworm-slim AS frontend
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DATA_DIR=/data WEB_DIR=/app/web/dist MODELS_DIR=/data/models \
    OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=1 HOME=/tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libreoffice-writer libreoffice-calc libreoffice-impress ghostscript qpdf \
    ocrmypdf tesseract-ocr-por tesseract-ocr-eng libmagic1 libcairo2 fonts-dejavu-core \
    fonts-liberation fontconfig ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade "pip>=26.2" && pip install --no-cache-dir -r requirements.txt
COPY scripts/download_model.py /app/scripts/download_model.py
RUN python /app/scripts/download_model.py /opt/models
COPY app/ /app/app/
COPY scripts/ /app/scripts/
COPY LICENSE THIRD_PARTY_NOTICES.md /app/
COPY --from=frontend /build/web/dist /app/web/dist
RUN groupadd -g 10001 everyday && useradd -u 10001 -g everyday -M everyday \
    && mkdir -p /data && chown everyday:everyday /data
USER 10001:10001
EXPOSE 8000
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
