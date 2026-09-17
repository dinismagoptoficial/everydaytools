# Everyday Tools

**Your digital Swiss Army knife.**

PDFs, documents, images, video, audio and everyday utilities in an application you can host on your own server. Portuguese and English interface, individual accounts and processing without external conversion services.

Created by [Dinis Mago](https://github.com/dinismagoptoficial). Open source under the [MIT license](LICENSE).

[Português](README.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## Install

You need Docker Compose v2 and a Linux kernel with Landlock. We recommend 4 GB of RAM and 10 GB of free disk space. Installation families include Ubuntu 22.04+, Debian 12+, Linux Mint 21+ and LMDE 6+. Docker Desktop also works with a compatible kernel.

From the project folder:

```bash
cp .env.example .env
docker compose up -d --build --wait
```

Open `http://SERVER-IP`. Initial setup creates the administrator, sets limits and presents the terms, privacy notice and operator responsibilities. There are no default credentials. Complete setup before giving other people access.

The first build downloads dependencies and the background removal model. Conversion works offline after installation. Set `PORT=8080` in `.env` to use a different port.

On Ubuntu, Debian and Linux Mint, you can use:

```bash
sudo bash install.sh
```

The installer prepares Docker, Compose and Avahi, installs into `/opt/everyday-tools` and displays the IP address and `everyday-tools.local`. The `.local` address requires mDNS support. Running the installer again preserves existing accounts, settings and data. Converters run inside the containers.

## Tools

| Area | Features |
| --- | --- |
| PDF | Merge, split, reorder, rotate, compress, protect, unlock, Portuguese and English OCR, extract text and images, fill forms, PDF/A and repair |
| PDF editor | Text, images, visual signatures, drawing, highlights, underlining, page numbers, watermarks and permanent redaction |
| Documents | Word, Excel, PowerPoint and OpenDocument to PDF; CSV, XLSX and ODS conversion |
| Images | Conversion, compression, resizing, metadata removal and local background removal |
| Video and audio | Conversion, compression, resolution, codecs, GIF, audio extraction, muting and volume normalisation |
| Archives | Create and extract ZIP, TAR, GZIP and 7z |
| Everyday | QR and barcodes, passwords, passphrases, text, comparisons, units, percentages, age and timestamps |

Compatible tools appear after selecting files. Batch operations can provide individual outputs and a ZIP containing all results.

The editor adds content rather than rewriting existing text. Signatures are visual, without digital certificates. Redacted pages are rebuilt as images. Office fidelity, OCR and background removal edges depend on the input. PDF/A is produced by OCRmyPDF without independent veraPDF validation. Forms support text and list fields, without XFA. GZIP accepts one file per operation.

## Smaller servers

The reduced-memory profile processes one task at a time, uses one thread and limits the worker to 1.5 GB of RAM. The web service is limited to 512 MB. Leave additional memory for the operating system; large files can exceed these limits.

```bash
docker compose -f compose.yaml -f compose.low-memory.yaml up -d --build --wait
```

Keep both Compose files in subsequent commands, including updates:

```bash
COMPOSE_FILE=compose.yaml:compose.low-memory.yaml bash update.sh
```

The normal queue allows up to 3 light, 2 medium and 1 heavy tasks, subject to a global limit and a budget based on container memory. These estimates control queue admission; Docker limits actual memory use. Configure CPU, threads and memory in `.env`.

## Accounts and data

Each account accesses its own files. **My account** contains your name, email, language and password settings. Changing your email requires your current password and signs out other sessions.

Files expire 60 minutes after task creation by default. Downloads and retries do not extend retention. Deletion stops processing and removes originals, outputs and temporary files. If a process is still stopping, access is revoked immediately and cleanup retries.

The Docker volume holds accounts, settings, temporary jobs and the model. There is no telemetry, remote font service or advertising. The worker has no network access. Text tools and calculators run in your browser. Optional SMTP is used only for account recovery.

The operator controls access, retention, backups and privacy contacts. The administrator interface cannot download other accounts' documents, but the server operator has technical access to storage. Snapshots, external backups and downloaded copies are outside the application's control. See [privacy and terms](docs/legal.md).

## Maintenance

```bash
bash backup.sh
bash update.sh
docker compose ps
```

Backups contain accounts, preferences and configuration, excluding documents, jobs and sessions. Updates create a backup, retain the previous image, rebuild and check service health. HTTPS, SMTP and restore procedures are in [the operations guide](docs/operations.md), in Portuguese.

Editable limits initially come from `.env`. After setup, change retention, quotas, registration and concurrency in **Administration**. Container resources and SMTP remain in `.env`.

## Development

React and TypeScript frontend, FastAPI and SQLite backend, with a separate converter supervisor. Redis is not required.

```bash
python -m venv .venv
# Activate the virtual environment before continuing.
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
python -m ruff check app tests scripts
cd web
npm ci
npm run build
```

Installer and sandbox tests require Linux. Browser and converter checks use the disposable Docker project `everyday-tools-test`, on port 8087. See [testing instructions](docs/testing.md).

Dependencies retain their own licenses, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Converter redistribution obligations also apply to Docker images.

© 2026 Dinis Mago and contributors. Developed in partnership with Lusyn Software.
