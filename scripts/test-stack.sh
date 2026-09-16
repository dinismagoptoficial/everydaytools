#!/usr/bin/env bash
# Disposable Everyday Tools installation for browser and converter tests.
# Never touches the real installation: its own Compose project, port and volume.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

project=everyday-tools-test
port="${TEST_PORT:-8087}"

case "${1:-up}" in
  up)
    PORT="$port" BIND_ADDRESS=127.0.0.1 COOKIE_SECURE=false \
      docker compose -p "$project" up -d --build --wait --wait-timeout 300
    echo "Instalação de teste: http://127.0.0.1:$port"
    echo 'Executa primeiro os testes Playwright; criam a conta usada por tests/docker_smoke.py.'
    ;;
  down)
    docker compose -p "$project" down -v
    echo 'Containers e volume de teste eliminados.'
    ;;
  logs)
    docker compose -p "$project" logs --tail "${2:-50}"
    ;;
  *)
    echo "Utilização: bash scripts/test-stack.sh [up|down|logs]" >&2
    exit 1
    ;;
esac
