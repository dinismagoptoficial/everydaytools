#!/usr/bin/env bash
# Everyday Tools installer for Ubuntu, Debian, Linux Mint, LMDE and other systems
# of the same family. Running it again is safe: accounts, configuration, Docker
# volumes and files in progress are preserved.
set -euo pipefail
umask 077

# --- Platform helpers -------------------------------------------------------
# Kept free of side effects so the installer logic can be tested on its own with
# EVERYDAY_INSTALL_LIB_ONLY=1, without touching a real system.

# Read one key from an os-release file without executing the file.
everyday_os_value() {
  local key="$1" file="$2" line value
  [[ -r "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" == "$key="* ]] || continue
    value="${line#*=}"
    value="${value%$'\r'}"
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    printf '%s' "$value"
    return 0
  done < "$file"
  return 1
}

# Identify Debian/Ubuntu-family systems and the Docker apt repository they need.
# Sets EVERYDAY_OS_ID, EVERYDAY_OS_NAME, EVERYDAY_FAMILY and EVERYDAY_DOCKER_SUITE.
everyday_detect_platform() {
  local file="${1:-/etc/os-release}" like
  EVERYDAY_OS_ID=""; EVERYDAY_OS_NAME=""; EVERYDAY_FAMILY=""; EVERYDAY_DOCKER_SUITE=""
  [[ -r "$file" ]] || return 1
  EVERYDAY_OS_ID="$(everyday_os_value ID "$file" || true)"
  EVERYDAY_OS_NAME="$(everyday_os_value PRETTY_NAME "$file" || true)"
  [[ -n "$EVERYDAY_OS_NAME" ]] || EVERYDAY_OS_NAME="$(everyday_os_value NAME "$file" || true)"
  like="$(everyday_os_value ID_LIKE "$file" || true)"
  # Linux Mint reports linuxmint for both its Ubuntu editions and for LMDE;
  # ID_LIKE is what tells the two apart. The same rule covers Pop!_OS, Zorin,
  # elementary and Raspberry Pi OS, so no distribution is rejected for its name.
  case " ${EVERYDAY_OS_ID} ${like} " in
    *" ubuntu "*) EVERYDAY_FAMILY=ubuntu ;;
    *" debian "*) EVERYDAY_FAMILY=debian ;;
    *) return 1 ;;
  esac
  # Docker publishes repositories for Ubuntu and Debian only, so derivatives must
  # use the codename of the release they are built on, not their own.
  if [[ "$EVERYDAY_FAMILY" == ubuntu ]]; then
    EVERYDAY_DOCKER_SUITE="$(everyday_os_value UBUNTU_CODENAME "$file" || true)"
  else
    EVERYDAY_DOCKER_SUITE="$(everyday_os_value DEBIAN_CODENAME "$file" || true)"
  fi
  if [[ -z "$EVERYDAY_DOCKER_SUITE" && ( "$EVERYDAY_OS_ID" == ubuntu || "$EVERYDAY_OS_ID" == debian ) ]]; then
    EVERYDAY_DOCKER_SUITE="$(everyday_os_value VERSION_CODENAME "$file" || true)"
  fi
  return 0
}

# Landlock, which isolates every converter, needs Linux 5.13 or later.
everyday_kernel_supports_landlock() {
  local release="${1:-$(uname -r)}" major minor rest
  major="${release%%.*}"
  rest="${release#*.}"
  minor="${rest%%.*}"
  minor="${minor%%[!0-9]*}"
  [[ "$major" =~ ^[0-9]+$ ]] || return 1
  [[ "$minor" =~ ^[0-9]+$ ]] || minor=0
  (( major > 5 || ( major == 5 && minor >= 13 ) ))
}

# Some kernels ship Landlock but leave it out of the active security modules.
everyday_landlock_enabled() {
  local lsm_file="${1:-/sys/kernel/security/lsm}"
  [[ -r "$lsm_file" ]] || return 0  # Cannot tell here; the version check decides.
  grep -q landlock "$lsm_file"
}

# The apt source for Docker. It names the upstream family, never the derivative:
# there is no download.docker.com/linux/linuxmint.
everyday_docker_source_line() {
  local architecture="$1" family="$2" suite="$3"
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' \
    "$architecture" "$family" "$suite"
}

# True when another apt source already provides Docker, so we add no duplicate.
everyday_docker_repository_exists() {
  local dir="${1:-/etc/apt/sources.list.d}" list="${2:-/etc/apt/sources.list}"
  grep -rlsF download.docker.com "$list" "$dir" 2>/dev/null \
    | grep -v '/everyday-docker\.list$' | grep -q .
}

# Copy the project into the installation directory. Data, configuration and
# backups created by an earlier installation are never part of the copy.
everyday_sync_project() {
  local source="$1" target="$2"
  [[ -d "$source" && -d "$target" ]] || return 1
  [[ "$source" != "$target" ]] || return 0
  tar -C "$source" \
    --exclude=.git --exclude=.venv --exclude=node_modules --exclude=web/node_modules \
    --exclude=web/dist --exclude=web/test-results --exclude=__pycache__ \
    --exclude=data --exclude=backups --exclude=.env \
    -cf - . | tar -C "$target" -xf -
}

[[ -n "${EVERYDAY_INSTALL_LIB_ONLY:-}" ]] && return 0

# --- Installation -----------------------------------------------------------
if [[ ${EUID} -ne 0 ]]; then
  echo 'Executa com sudo: sudo bash install.sh' >&2
  exit 1
fi

if ! everyday_detect_platform /etc/os-release; then
  echo "Sistema não suportado: ${EVERYDAY_OS_NAME:-desconhecido}." >&2
  echo 'Este instalador suporta Ubuntu, Debian, Linux Mint, LMDE e outras distribuições da mesma família.' >&2
  echo 'Noutros sistemas, instala Docker Compose e executa: docker compose up -d' >&2
  exit 1
fi
echo "Sistema: ${EVERYDAY_OS_NAME} (base ${EVERYDAY_FAMILY}${EVERYDAY_DOCKER_SUITE:+ ${EVERYDAY_DOCKER_SUITE}})"

case "$(dpkg --print-architecture)" in
  amd64|arm64) ;;
  *) echo 'Arquitetura não suportada. Everyday Tools precisa de amd64 ou arm64.' >&2; exit 1 ;;
esac

if ! everyday_kernel_supports_landlock || ! everyday_landlock_enabled; then
  echo "O núcleo $(uname -r) não disponibiliza Landlock, necessário para isolar os conversores." >&2
  echo 'É preciso Linux 5.13 ou posterior: Ubuntu 22.04+, Debian 12+, Linux Mint 21+ ou LMDE 6+.' >&2
  exit 1
fi

need_engine=0
need_compose=0
command -v docker >/dev/null 2>&1 || need_engine=1
docker compose version >/dev/null 2>&1 || need_compose=1
if (( need_engine || need_compose )); then
  if [[ -z "$EVERYDAY_DOCKER_SUITE" ]]; then
    echo 'Não foi possível determinar a versão base desta distribuição para instalar o Docker.' >&2
    echo 'Instala o Docker Engine e o plugin Compose manualmente e executa novamente este script.' >&2
    exit 1
  fi
  apt-get update
  apt-get install -y ca-certificates curl gnupg git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${EVERYDAY_FAMILY}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  if ! everyday_docker_repository_exists; then
    everyday_docker_source_line "$(dpkg --print-architecture)" "$EVERYDAY_FAMILY" "$EVERYDAY_DOCKER_SUITE" \
      > /etc/apt/sources.list.d/everyday-docker.list
  fi
  apt-get update
  if (( need_engine )); then
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    # Docker came from elsewhere, such as the distribution's docker.io package;
    # only the Compose plugin is missing.
    apt-get install -y docker-compose-plugin
  fi
fi
# Containers carry FFmpeg, LibreOffice, OCR and the background-removal model, so
# nothing else is installed on this machine.
systemctl enable --now docker

docker_group_added=''
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != root ]] && id -u "$SUDO_USER" >/dev/null 2>&1; then
  if ! id -nG "$SUDO_USER" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
    usermod -aG docker "$SUDO_USER"
    docker_group_added="$SUDO_USER"
  fi
fi

install_dir="${INSTALL_DIR:-/opt/everyday-tools}"
if [[ "$install_dir" != /* || "$install_dir" == / ]]; then
  echo 'INSTALL_DIR deve ser um diretório absoluto dedicado.' >&2
  exit 1
fi
mkdir -p "$install_dir"
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || pwd)"
if [[ -f "$source_dir/compose.yaml" ]]; then
  everyday_sync_project "$source_dir" "$install_dir"
elif [[ -f "$install_dir/compose.yaml" ]]; then
  echo 'Instalação existente encontrada; dados e configuração preservados.'
elif [[ -n "${EVERYDAY_TOOLS_REPOSITORY:-}" ]]; then
  git clone --depth 1 -- "$EVERYDAY_TOOLS_REPOSITORY" "$install_dir"
else
  echo 'Executa este script na pasta do projeto ou define EVERYDAY_TOOLS_REPOSITORY com o URL do teu repositório.' >&2
  exit 1
fi
cd "$install_dir"
if [[ ! -f .env ]]; then cp .env.example .env; chmod 600 .env; fi

docker compose up -d --build --wait --wait-timeout 300

port="$(sed -n 's/^PORT=//p' .env | head -n 1)"
port="${port:-80}"
bind="$(sed -n 's/^BIND_ADDRESS=//p' .env | head -n 1)"
probe_host='127.0.0.1'
if [[ -n "$bind" && "$bind" != '0.0.0.0' ]]; then probe_host="$bind"; fi
ip="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([^ ]*\).*/\1/p' | head -n 1)"
ip="${ip:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
suffix=""; [[ "$port" == 80 ]] || suffix=":$port"

if [[ -n "$ip" ]]; then
  # Linux Mint and most desktop systems already run Avahi; only fill in what is missing.
  if ! command -v avahi-publish-address >/dev/null 2>&1 || ! systemctl cat avahi-daemon.service >/dev/null 2>&1; then
    apt-get install -y avahi-daemon avahi-utils libnss-mdns
  fi
  # Publish the name for the address the machine actually has, and republish if
  # DHCP hands out a different one, so the name survives reboots and lease changes.
  cat > /usr/local/bin/everyday-tools-mdns <<'MDNS'
#!/usr/bin/env bash
set -uo pipefail
current_address() {
  ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([^ ]*\).*/\1/p' | head -n 1
}
address="$(current_address)"
[[ -n "$address" ]] || exit 1
avahi-publish-address -R everyday-tools.local "$address" &
publisher=$!
trap 'kill "$publisher" 2>/dev/null || true' EXIT TERM INT
while kill -0 "$publisher" 2>/dev/null; do
  sleep 30
  [[ "$(current_address)" == "$address" ]] || break
done
MDNS
  chmod 0755 /usr/local/bin/everyday-tools-mdns
  cat > /etc/systemd/system/everyday-tools-mdns.service <<'UNIT'
[Unit]
Description=Everyday Tools local network name (everyday-tools.local)
After=network-online.target avahi-daemon.service
Wants=network-online.target
Requires=avahi-daemon.service

[Service]
Type=simple
ExecStart=/usr/local/bin/everyday-tools-mdns
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
  systemctl enable --now avahi-daemon
  systemctl daemon-reload
  systemctl enable everyday-tools-mdns
  systemctl restart everyday-tools-mdns
fi

# Compose already waited for the containers' own healthchecks; this confirms the
# published port answers from outside the container as well.
healthy=''
probed=''
if command -v curl >/dev/null 2>&1; then
  probed=1
  for _ in $(seq 1 30); do
    if curl -fsS -m 3 "http://${probe_host}:${port}/api/health" >/dev/null 2>&1; then healthy=1; break; fi
    sleep 2
  done
fi

echo
if [[ -n "$healthy" || -z "$probed" ]]; then
  echo 'Everyday Tools está a funcionar.'
else
  echo 'Os containers arrancaram, mas a porta publicada ainda não respondeu.' >&2
  echo "Consulta: cd $install_dir && docker compose ps && docker compose logs --tail 50" >&2
fi
echo "Endereço local:  http://everyday-tools.local${suffix}"
echo "Acesso por IP:   http://${ip:-IP-DO-SERVIDOR}${suffix}"
echo 'Se .local não funcionar nesta rede, utiliza o endereço IP.'
echo 'Na primeira visita, cria a conta de administrador.'
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi 'Status: active'; then
  if ! ufw status 2>/dev/null | grep -q 5353; then
    echo
    echo 'Aviso: a firewall (ufw) está ativa e não permite mDNS, por isso outros'
    echo '       dispositivos podem não encontrar everyday-tools.local.'
    echo '       Para permitir:  sudo ufw allow 5353/udp'
    echo '       O acesso por IP não é afetado: o Docker publica as portas fora do ufw.'
  fi
fi
if [[ -n "$docker_group_added" ]]; then
  echo
  echo "O utilizador ${docker_group_added} foi adicionado ao grupo docker."
  echo 'Termina sessão e volta a entrar para usar docker e os scripts sem sudo.'
fi
