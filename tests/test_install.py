"""Installer logic checks.

The helpers in install.sh are sourced with EVERYDAY_INSTALL_LIB_ONLY=1, so the
platform detection, the Landlock gate and the project copy can be exercised
without root, apt or a real distribution.
"""
import shutil
import sys
import subprocess
import textwrap
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
INSTALLER = ROOT / "install.sh"
BASH = shutil.which("bash")
pytestmark = pytest.mark.skipif(BASH is None or sys.platform != 'linux', reason="Installer checks require Linux and bash; run tests/Dockerfile on other hosts")

# Real /etc/os-release contents from each supported system.
RELEASES = {
    "mint-21.3": """
        NAME="Linux Mint"
        VERSION="21.3 (Virginia)"
        ID=linuxmint
        ID_LIKE=ubuntu
        PRETTY_NAME="Linux Mint 21.3"
        VERSION_ID="21.3"
        VERSION_CODENAME=virginia
        UBUNTU_CODENAME=jammy
    """,
    "mint-22": """
        NAME="Linux Mint"
        VERSION="22 (Wilma)"
        ID=linuxmint
        ID_LIKE="ubuntu debian"
        PRETTY_NAME="Linux Mint 22"
        VERSION_ID="22"
        VERSION_CODENAME=wilma
        UBUNTU_CODENAME=noble
    """,
    "lmde-6": """
        PRETTY_NAME="LMDE 6 (faye)"
        NAME="LMDE"
        VERSION_ID="6"
        VERSION="6 (faye)"
        VERSION_CODENAME=faye
        ID=linuxmint
        ID_LIKE=debian
        DEBIAN_CODENAME=bookworm
    """,
    "ubuntu-24.04": """
        PRETTY_NAME="Ubuntu 24.04.1 LTS"
        NAME="Ubuntu"
        VERSION_ID="24.04"
        VERSION_CODENAME=noble
        ID=ubuntu
        ID_LIKE=debian
        UBUNTU_CODENAME=noble
    """,
    "debian-12": """
        PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
        NAME="Debian GNU/Linux"
        VERSION_ID="12"
        VERSION_CODENAME=bookworm
        ID=debian
    """,
    "pop-22.04": """
        NAME="Pop!_OS"
        VERSION="22.04 LTS"
        ID=pop
        ID_LIKE="ubuntu debian"
        PRETTY_NAME="Pop!_OS 22.04 LTS"
        VERSION_CODENAME=jammy
        UBUNTU_CODENAME=jammy
    """,
    "fedora-40": """
        NAME="Fedora Linux"
        VERSION="40 (Workstation Edition)"
        ID=fedora
        PRETTY_NAME="Fedora Linux 40 (Workstation Edition)"
        VERSION_ID=40
    """,
}


def bash(snippet, cwd=None):
    script = "EVERYDAY_INSTALL_LIB_ONLY=1 . '%s'\nset +e\n%s" % (INSTALLER.as_posix(), textwrap.dedent(snippet))
    result = subprocess.run([BASH, "-c", script], capture_output=True, text=True, cwd=cwd)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


@pytest.fixture
def release(tmp_path):
    def write(name):
        path = tmp_path / ("os-release-" + name)
        # Real os-release files use LF; write them faithfully whatever the host does.
        path.write_text(textwrap.dedent(RELEASES[name]).strip() + "\n", encoding="utf-8", newline="\n")
        return path.as_posix()
    return write


def detect(path):
    return bash(f"""
        if everyday_detect_platform '{path}'; then
          printf '%s|%s|%s' "$EVERYDAY_OS_ID" "$EVERYDAY_FAMILY" "$EVERYDAY_DOCKER_SUITE"
        else
          printf 'UNSUPPORTED'
        fi
    """)


@pytest.mark.parametrize("name,expected", [
    # Linux Mint is supported on its own terms: the id stays linuxmint and the
    # Docker repository follows the Ubuntu or Debian release underneath it.
    ("mint-21.3", "linuxmint|ubuntu|jammy"),
    ("mint-22", "linuxmint|ubuntu|noble"),
    ("lmde-6", "linuxmint|debian|bookworm"),
    ("ubuntu-24.04", "ubuntu|ubuntu|noble"),
    ("debian-12", "debian|debian|bookworm"),
    ("pop-22.04", "pop|ubuntu|jammy"),
])
def test_supported_platforms_pick_the_right_docker_repository(release, name, expected):
    assert detect(release(name)) == expected


@pytest.mark.parametrize("name,arch,expected", [
    ("mint-21.3", "amd64", "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu jammy stable"),
    ("mint-22", "amd64", "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable"),
    ("lmde-6", "arm64", "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable"),
])
def test_apt_source_never_points_at_the_derivative(release, name, arch, expected):
    """download.docker.com has no linuxmint path and no wilma/faye suite."""
    line = bash(f"""
        everyday_detect_platform '{release(name)}'
        everyday_docker_source_line '{arch}' "$EVERYDAY_FAMILY" "$EVERYDAY_DOCKER_SUITE"
    """)
    assert line == expected
    assert "linuxmint" not in line


def test_docker_key_is_fetched_for_the_upstream_family():
    body = INSTALLER.read_text(encoding="utf-8")
    assert 'download.docker.com/linux/${EVERYDAY_FAMILY}/gpg' in body
    assert 'download.docker.com/linux/${EVERYDAY_OS_ID}' not in body


def test_unrelated_distributions_are_refused(release):
    assert detect(release("fedora-40")) == "UNSUPPORTED"


def test_missing_os_release_is_refused(tmp_path):
    assert detect((tmp_path / "absent").as_posix()) == "UNSUPPORTED"


@pytest.mark.parametrize("kernel,supported", [
    ("5.4.0-150-generic", False),    # Linux Mint 20.x: no Landlock
    ("5.13.0-52-generic", True),
    ("5.15.0-91-generic", True),     # Linux Mint 21.x
    ("6.8.0-45-generic", True),      # Linux Mint 22
    ("6.1.0-18-amd64", True),        # LMDE 6
    ("4.19.0-25-amd64", False),
])
def test_landlock_kernel_gate(kernel, supported):
    answer = bash(f"everyday_kernel_supports_landlock '{kernel}' && printf yes || printf no")
    assert answer == ("yes" if supported else "no")


def test_landlock_must_be_an_active_security_module(tmp_path):
    active = tmp_path / "lsm-active"
    active.write_text("lockdown,capability,landlock,yama,apparmor\n", encoding="utf-8")
    missing = tmp_path / "lsm-missing"
    missing.write_text("lockdown,capability,yama,apparmor\n", encoding="utf-8")
    assert bash(f"everyday_landlock_enabled '{active.as_posix()}' && printf yes || printf no") == "yes"
    assert bash(f"everyday_landlock_enabled '{missing.as_posix()}' && printf yes || printf no") == "no"
    # When the file is absent the kernel version alone decides.
    assert bash(f"everyday_landlock_enabled '{(tmp_path / 'absent').as_posix()}' && printf yes || printf no") == "yes"


def test_docker_repository_is_not_added_twice(tmp_path):
    sources = tmp_path / "sources.list.d"
    sources.mkdir()
    empty = tmp_path / "sources.list"
    empty.write_text("deb http://archive.ubuntu.com/ubuntu noble main\n", encoding="utf-8")

    def existing():
        return bash(f"everyday_docker_repository_exists '{sources.as_posix()}' '{empty.as_posix()}' && printf yes || printf no")

    assert existing() == "no"
    # Our own file must not stop us from refreshing it after a release upgrade.
    (sources / "everyday-docker.list").write_text("deb https://download.docker.com/linux/ubuntu noble stable\n", encoding="utf-8")
    assert existing() == "no"
    # A repository the person configured themselves must be left alone.
    (sources / "docker.list").write_text("deb https://download.docker.com/linux/ubuntu noble stable\n", encoding="utf-8")
    assert existing() == "yes"


def build_installation(tmp_path):
    """A source checkout and an installation that already holds real data."""
    source = tmp_path / "checkout"
    (source / "web").mkdir(parents=True)
    (source / "compose.yaml").write_text("name: everyday-tools\n", encoding="utf-8")
    (source / "install.sh").write_text("# updated installer\n", encoding="utf-8")
    (source / ".env.example").write_text("PORT=80\n", encoding="utf-8")
    (source / "web" / "index.html").write_text("<!doctype html>\n", encoding="utf-8")

    target = tmp_path / "opt"
    (target / "data" / "jobs" / "abc").mkdir(parents=True)
    (target / "backups").mkdir()
    (target / "data" / "jobs" / "abc" / "input.pdf").write_bytes(b"a file being processed")
    (target / "data" / "database").mkdir()
    (target / "data" / "database" / "everyday.sqlite3").write_bytes(b"accounts and settings")
    (target / ".env").write_text("PORT=8080\nMAX_UPLOAD_SIZE=512\n", encoding="utf-8")
    (target / "backups" / "everyday-tools-20260101T000000Z.tar.gz").write_bytes(b"backup")
    (target / "compose.yaml").write_text("name: everyday-tools\n# older\n", encoding="utf-8")
    return source, target


def test_running_the_installer_again_keeps_data_and_configuration(tmp_path):
    source, target = build_installation(tmp_path)
    for _ in range(2):  # Installing twice must be as safe as installing once.
        bash(f"everyday_sync_project '{source.as_posix()}' '{target.as_posix()}'")
        assert (target / "data" / "database" / "everyday.sqlite3").read_bytes() == b"accounts and settings"
        assert (target / "data" / "jobs" / "abc" / "input.pdf").read_bytes() == b"a file being processed"
        assert (target / ".env").read_text(encoding="utf-8") == "PORT=8080\nMAX_UPLOAD_SIZE=512\n"
        assert (target / "backups" / "everyday-tools-20260101T000000Z.tar.gz").exists()
        # The project itself is refreshed.
        assert (target / "install.sh").read_text(encoding="utf-8") == "# updated installer\n"
        assert (target / "web" / "index.html").exists()


def test_sync_refuses_to_copy_a_directory_onto_itself(tmp_path):
    source, _ = build_installation(tmp_path)
    bash(f"everyday_sync_project '{source.as_posix()}' '{source.as_posix()}'")
    assert (source / "compose.yaml").read_text(encoding="utf-8") == "name: everyday-tools\n"


@pytest.mark.parametrize("script", ["install.sh", "update.sh", "backup.sh", "scripts/test-stack.sh"])
def test_scripts_parse(script):
    assert subprocess.run([BASH, "-n", str(ROOT / script)], capture_output=True).returncode == 0


@pytest.mark.parametrize("script", ["install.sh", "update.sh"])
def test_installation_scripts_never_destroy_volumes_or_data(script):
    body = (ROOT / script).read_text(encoding="utf-8")
    # A named volume holds every account and file; installing or updating must not drop it.
    assert "down -v" not in body
    assert "volume rm" not in body
    assert "volume prune" not in body
    assert "system prune" not in body
    assert "rm -rf" not in body


def test_host_stays_free_of_converter_dependencies():
    """FFmpeg, LibreOffice, OCR and the model belong to the containers, not the host."""
    body = (ROOT / "install.sh").read_text(encoding="utf-8")
    installed = [line for line in body.splitlines() if "apt-get install" in line]
    assert installed, "the installer is expected to install its own prerequisites"
    for line in installed:
        for package in ("ffmpeg", "libreoffice", "ocrmypdf", "tesseract", "ghostscript", "qpdf", "python3-pip"):
            assert package not in line.lower(), f"{package} must stay inside the container image"


def test_installation_directory_is_accessible_and_failures_show_logs():
    body = INSTALLER.read_text(encoding="utf-8")
    assert 'chmod 0755 "$install_dir"' in body
    assert "docker compose ps -a >&2" in body
    assert "docker compose logs --tail 100 worker web >&2" in body


def extract_mdns_helper():
    """The publisher script install.sh writes to /usr/local/bin/everyday-tools-mdns."""
    body = INSTALLER.read_text(encoding="utf-8")
    start = body.index("<<'MDNS'\n") + len("<<'MDNS'\n")
    return body[start:body.index("\nMDNS\n", start)] + "\n"


def stub(directory, name, script):
    path = directory / name
    path.write_text("#!/usr/bin/env bash\n" + textwrap.dedent(script), encoding="utf-8", newline="\n")
    path.chmod(0o755)
    return path


@pytest.mark.parametrize("route", [
    "1.1.1.1 via 192.168.1.1 dev enp3s0 src 192.168.1.50 uid 1000 \n    cache \n",
    "1.1.1.1 dev wlp2s0 src 192.168.1.50 uid 1000 \n    cache \n",
])
def test_mdns_helper_publishes_the_current_address(tmp_path, route):
    binaries = tmp_path / "bin"
    binaries.mkdir()
    log = tmp_path / "published"
    stub(binaries, "ip", f"printf '%s' {route!r}\n")
    stub(binaries, "avahi-publish-address", f"printf '%s\n' \"$*\" >> '{log.as_posix()}'\nsleep 60\n")
    helper = tmp_path / "everyday-tools-mdns"
    helper.write_text(extract_mdns_helper(), encoding="utf-8", newline="\n")
    helper.chmod(0o755)

    environment = {"PATH": binaries.as_posix() + ":" + "/usr/bin:/bin"}
    subprocess.run([BASH, "-c", f"timeout 5 '{helper.as_posix()}' || true"], env=environment,
                   capture_output=True, text=True, timeout=60)
    assert log.exists(), "the helper never called avahi-publish-address"
    assert log.read_text(encoding="utf-8").strip() == "-R everyday-tools.local 192.168.1.50"


def test_mdns_helper_stops_when_no_address_is_available(tmp_path):
    binaries = tmp_path / "bin"
    binaries.mkdir()
    log = tmp_path / "published"
    stub(binaries, "ip", "exit 1\n")
    stub(binaries, "avahi-publish-address", f"printf 'called' >> '{log.as_posix()}'\n")
    helper = tmp_path / "everyday-tools-mdns"
    helper.write_text(extract_mdns_helper(), encoding="utf-8", newline="\n")
    helper.chmod(0o755)

    environment = {"PATH": binaries.as_posix() + ":" + "/usr/bin:/bin"}
    result = subprocess.run([BASH, "-c", f"'{helper.as_posix()}'"], env=environment,
                            capture_output=True, text=True, timeout=60)
    # No address means nothing to publish; systemd restarts the unit until there is one.
    assert result.returncode != 0
    assert not log.exists()


def test_mdns_unit_starts_on_boot_and_recovers():
    body = INSTALLER.read_text(encoding="utf-8")
    assert "WantedBy=multi-user.target" in body, "the name must be published again after a reboot"
    assert "Restart=always" in body
    assert "systemctl enable everyday-tools-mdns" in body
    assert "systemctl enable --now docker" in body, "containers must come back after a reboot"


@pytest.mark.parametrize("script", ["install.sh", "update.sh", "backup.sh", "scripts/test-stack.sh"])
def test_shell_scripts_use_unix_line_endings(script):
    """A carriage return makes bash fail on the first function, so it is worth pinning."""
    assert b"\r\n" not in (ROOT / script).read_bytes()
