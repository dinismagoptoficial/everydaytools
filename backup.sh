#!/usr/bin/env bash
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! docker compose version >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo 'Sem acesso ao Docker. Executa com sudo, ou adiciona a tua conta ao grupo docker:' >&2
  echo "  sudo usermod -aG docker \"\$USER\"   (depois termina sessão e volta a entrar)" >&2
  exit 1
fi
backup_dir="${BACKUP_DIR:-$PWD/backups}"
mkdir -p "$backup_dir"
work_dir="$(mktemp -d "$backup_dir/.backup-XXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT
docker compose exec -T web python scripts/export_database.py > "$work_dir/database.sqlite3"
cp compose.yaml "$work_dir/compose.yaml"
if [[ -f .env ]]; then cp .env "$work_dir/.env"; fi
archive="$backup_dir/everyday-tools-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar -C "$work_dir" -czf "$archive" .
chmod 600 "$archive"
echo "Backup: $archive"
echo 'Inclui apenas contas e configuração. Não inclui sessões, tarefas ou ficheiros temporários.'
