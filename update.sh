#!/usr/bin/env bash
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! docker compose version >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo 'Sem acesso ao Docker. Executa com sudo, ou adiciona a tua conta ao grupo docker:' >&2
  echo "  sudo usermod -aG docker \"\$USER\"   (depois termina sessão e volta a entrar)" >&2
  exit 1
fi
bash backup.sh
docker image tag everyday-tools:local everyday-tools:previous 2>/dev/null || true
if [[ -d .git ]] && git remote get-url origin >/dev/null 2>&1; then
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo 'Existem alterações locais. Guarda-as antes de atualizar; o backup foi criado.' >&2
    exit 1
  fi
  git pull --ff-only
else
  echo 'Instalação sem origem Git. A reconstruir a versão presente nesta pasta.'
fi
docker compose build --pull init
docker compose stop worker web
if docker compose up -d --no-build --wait --wait-timeout 180; then
  echo 'Everyday Tools atualizado. Contas e configuração preservadas.'
else
  echo 'A verificação de saúde falhou. O backup e a imagem everyday-tools:previous foram preservados.' >&2
  echo 'Consulta: docker compose logs --tail 50' >&2
  exit 1
fi
