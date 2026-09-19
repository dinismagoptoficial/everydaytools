# Everyday Tools

**Your digital Swiss Army knife.**

Convert PDFs, documents, images, video and audio on your own server. Files never leave
your network, they delete themselves after an hour, and nobody needs to know what a
codec is to use them.

Created by [Dinis Mago](https://github.com/dinismagoptoficial). Open source under the [MIT license](LICENSE).

[Portugues](README.md) - [Operations](docs/operations.md) - [Security](SECURITY.md) - [Contributing](CONTRIBUTING.md)

---

## Install

On a server or PC running Ubuntu, Debian, Linux Mint or LMDE, paste this into a terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/dinismagoptoficial/everydaytools/main/install.sh | sudo bash
```

That is the whole thing. The installer handles Docker, fetches the project, starts the
services and prints the address when it is done. Open that address and create the
administrator account. Setup asks for the main language, initial limits and optional
SMTP details for account recovery. There are no default passwords to change and no
configuration files to edit.

Running the command again updates the installation without touching accounts, settings
or files still being processed.

### What the installer does for you

- Installs Docker and the Compose plugin if you do not have them
- Adds your account to the `docker` group so you are not typing `sudo` all day
- Installs into `/opt/everyday-tools` and starts the services
- Sets up Avahi so `everyday-tools.local` resolves on your network
- Re-announces that name by itself if your router hands out a new address
- Checks that the application answers before it finishes

FFmpeg, LibreOffice, OCR and the background removal model all live inside the
containers. Only Docker, Compose and Avahi are installed on your system.

### What you need

| | |
| --- | --- |
| System | Ubuntu 22.04+, Debian 12+, Linux Mint 21+, LMDE 6+ or another of the same family |
| Kernel | Linux 5.13 or later, for converter isolation |
| Memory | 4 GB recommended. With 2 GB use the reduced profile below |
| Disk | 10 GB free |
| Architecture | amd64 or arm64 |

The first start downloads dependencies and the background removal model, so it needs
internet. After that, conversions work offline.

### Installing by hand

If you would rather read what you are running first, or you are on another system with
Docker:

```bash
git clone https://github.com/dinismagoptoficial/everydaytools.git
cd everydaytools
cp .env.example .env
docker compose up -d --build --wait
```

To change the port, set `PORT=8080` in `.env` before starting.

## Tools

| Area | Features |
| --- | --- |
| PDF | Merge, split, reorder, rotate, compress, protect, unlock, Portuguese and English OCR, convert to Word, PNG, JPG or WebP, extract text and images, fill forms, PDF/A and repair |
| PDF editor | Text, images, visual signatures, drawing, highlights, underlining, page numbers, watermarks and permanent redaction |
| Documents | Word, Excel, PowerPoint and OpenDocument to PDF; CSV, XLSX and ODS conversion |
| Images | Conversion, compression, resizing, metadata removal, local background removal and manual mask adjustment |
| Video and audio | Conversion, compression, resolution, codecs, GIF, audio extraction, muting and volume normalisation |
| Archives | Create and extract ZIP, TAR, GZIP and 7z |
| Everyday | QR and barcodes, passwords, passphrases, text, comparisons, units, percentages, age and timestamps |

Compatible tools appear after selecting files. Batch operations can provide individual outputs and a ZIP containing all results. Images, PDF, DOCX, XLSX, ODS, CSV and text can be previewed with zoom and drag navigation. After background removal, you can correct the mask, choose a colour or upload another image and prepare the final PNG in the browser.

Existing PDF text and pictures can be replaced, moved or resized by covering their original position and placing editable content above it. Signatures are visual, without digital certificates. Redacted pages are rebuilt as images. Office and PDF to Word fidelity, OCR and background removal edges depend on the input. PDF/A is produced by OCRmyPDF without independent veraPDF validation. Forms support text and list fields, without XFA. GZIP accepts one file per operation.

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

Each account accesses its own files. **My account** contains your name, email, language and password settings. Changing your email requires your current password and signs out other sessions. Administrators can disable or delete regular accounts; deletion revokes sessions and removes associated files.

Files expire 60 minutes after task creation by default. Downloads and retries do not extend retention. Deletion stops processing and removes originals, outputs and temporary files. If a process is still stopping, access is revoked immediately and cleanup retries.

The Docker volume holds accounts, settings, temporary jobs and the model. There is no telemetry, remote font service or advertising. The worker has no network access. Text tools and calculators run in your browser. Optional SMTP sends account recovery, account creation and configuration test messages. Their content follows each account's language; the first account and defaults use the language selected during setup.

Signed-in users can report bugs and suggest features from the account menu. Administration collects these submissions, with filters and status tracking. When SMTP is configured, administrators receive new reports and authors receive status updates in their account language.

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
