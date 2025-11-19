"""Hulpscript om een distributiepakket voor ChromeOS samen te stellen.

Dit script combineert de PyInstaller-build met een startscript, levert een
handmatig uit te pakken `tar.gz` op en bouwt daarnaast een `.deb`-pakket voor
Chromebooks met de Linux-omgeving. Het script veronderstelt dat Node.js en
PyInstaller beschikbaar zijn; als `dpkg-deb` ontbreekt wordt een fallback in
puur Python gebruikt om het Debian-pakket te assembleren.
"""

from __future__ import annotations

import argparse
import configparser
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST_ROOT = ROOT / "dist"
BUILD_DIR = ROOT / "build" / "chromeos"
FRONTEND_LOGO = ROOT / "frontend" / "public" / "logo.png"


@dataclass
class BundleInfo:
    root: Path
    binary_name: str
    app_dir: Path


def read_version() -> str:
    config = configparser.ConfigParser()
    version_file = ROOT / "VERSION.ini"

    if not config.read(version_file):
        raise SystemExit(f"VERSION.ini niet gevonden of leeg op {version_file}.")

    # Zoek eerst naar een expliciet sectieveld 'version'.
    for section in config.sections():
        if config.has_option(section, "version"):
            value = config.get(section, "version").strip()
            if value:
                return value

    # Val terug op de default sectie indien aanwezig.
    if config.has_option(config.default_section, "version"):
        value = config.get(config.default_section, "version").strip()
        if value:
            return value

    raise SystemExit("Kon geen versie uitlezen uit VERSION.ini")


def resolve_tool(name: str) -> str:
    resolved = shutil.which(name)
    if not resolved:
        raise SystemExit(f"Kon hulpprogramma '{name}' niet vinden in PATH.")
    return resolved


def maybe_resolve_tool(name: str) -> str | None:
    return shutil.which(name)


def run(cmd: list[str], cwd: Path | None = None) -> None:
    subprocess.run(cmd, cwd=cwd, check=True)


def build_frontend(run_install: bool) -> None:
    script = ROOT / "tools" / "build_frontend.py"
    args = [] if run_install else ["--skip-install"]
    run([sys.executable, str(script), *args], cwd=ROOT)


def build_pyinstaller() -> None:
    pyinstaller = resolve_tool("pyinstaller")
    run([pyinstaller, "--noconfirm", "VlierPlanner.spec"], cwd=ROOT)


def prepare_bundle(version: str) -> BundleInfo:
    bundle_root = BUILD_DIR / f"VlierPlanner-ChromeOS-{version}"
    if bundle_root.exists():
        shutil.rmtree(bundle_root)
    bundle_root.mkdir(parents=True)

    app_target = bundle_root / "app"

    pyinstaller_dir = DIST_ROOT / "VlierPlanner"
    pyinstaller_exe = DIST_ROOT / "VlierPlanner.exe"

    if pyinstaller_dir.is_dir():
        shutil.copytree(pyinstaller_dir, app_target)
        binary_name = None
        for candidate in ("VlierPlanner", "VlierPlanner.exe"):
            if (app_target / candidate).exists():
                binary_name = candidate
                break
        if binary_name is None:
            raise SystemExit(
                "Kon geen uitvoerbaar bestand vinden in dist/VlierPlanner;"
                " verwacht 'VlierPlanner' of 'VlierPlanner.exe'."
            )
    else:
        file_candidate = None
        for candidate in (pyinstaller_dir, pyinstaller_exe):
            if candidate.is_file():
                file_candidate = candidate
                break

        if file_candidate is None:
            raise SystemExit(
                "PyInstaller-output niet gevonden. Draai eerst pyinstaller VlierPlanner.spec."
            )

        app_target.mkdir(parents=True, exist_ok=True)
        destination = app_target / file_candidate.name
        shutil.copy2(file_candidate, destination)
        binary_name = destination.name

    launcher = bundle_root / "start-vlier-planner.sh"
    launcher.write_text(
        f'''#!/bin/sh
set -e
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"
exec "$APP_DIR/{binary_name}" "$@"
''',
        encoding="utf-8",
    )
    launcher.chmod(0o755)

    desktop_entry = bundle_root / "vlier-planner.desktop"
    desktop_entry.write_text(
        """[Desktop Entry]
Type=Application
Name=Vlier Planner
Comment=Start de Vlier Planner applicatie
Exec=sh -c "exec \"$(dirname \"$1\")\"/start-vlier-planner.sh" _ "%k"
Icon=vlier-planner
Terminal=false
Categories=Education;
""",
        encoding="utf-8",
    )

    readme = bundle_root / "README-chromeos.md"
    readme.write_text(
        """# Vlier Planner – ChromeOS pakket

Dit pakket is bedoeld voor Chromebooks met de Linux (Crostini) omgeving.

## Installatie (handmatige methode)

1. Pak het archief uit in een map naar keuze, bij voorkeur in `~/Apps` of `~/Programma's`.
2. Zorg dat het script uitvoerbaar is: `chmod +x start-vlier-planner.sh`.
3. (Optioneel) Kopieer `vlier-planner.desktop` naar `~/.local/share/applications/`
   voor een snelkoppeling in de launcher.
4. Start de applicatie met `./start-vlier-planner.sh`. De backend en frontend worden samen gestart in één PyInstaller-build.
""",
        encoding="utf-8",
    )

    if FRONTEND_LOGO.exists():
        shutil.copy2(FRONTEND_LOGO, bundle_root / "vlier-planner.png")

    return BundleInfo(root=bundle_root, binary_name=binary_name, app_dir=app_target)


def create_archive(bundle_root: Path) -> Path:
    archive_path = BUILD_DIR / f"{bundle_root.name}.tar.gz"
    if archive_path.exists():
        archive_path.unlink()

    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(bundle_root, arcname=bundle_root.name)

    return archive_path


def ensure_logo(target_path: Path) -> None:
    if not FRONTEND_LOGO.exists():
        return

    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FRONTEND_LOGO, target_path)


def detect_deb_architecture(binary_path: Path) -> str:
    if not binary_path.exists():
        raise SystemExit(
            f"PyInstaller-binary niet gevonden op {binary_path}; bouw eerst de applicatie."
        )

    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        return "amd64"
    if machine in {"aarch64", "arm64"}:
        return "arm64"
    if machine in {"armv7l", "armhf"}:
        return "armhf"

    # Val terug op amd64 zodat dpkg-deb een consistente naam heeft; documenteer dit in de output.
    print(
        "Waarschuwing: onbekende architectuur '{machine}', val terug op 'amd64'.".format(
            machine=machine
        )
    )
    return "amd64"


def _format_ar_field(value: str, width: int) -> bytes:
    return value.encode("ascii").ljust(width, b" ")


def write_ar_archive(target: Path, members: list[tuple[str, bytes]]) -> None:
    with target.open("wb") as fh:
        fh.write(b"!<arch>\n")
        timestamp = str(int(time.time()))
        for name, payload in members:
            if len(name) > 15:
                raise SystemExit(
                    "Bestandsnaam '{name}' is te lang voor het ar-formaat in de fallback-bouwer.".format(
                        name=name
                    )
                )
            header = b"".join(
                [
                    _format_ar_field(f"{name}/", 16),
                    _format_ar_field(timestamp, 12),
                    _format_ar_field("0", 6),
                    _format_ar_field("0", 6),
                    _format_ar_field(format(0o100644, "o"), 8),
                    _format_ar_field(str(len(payload)), 10),
                    b"`\n",
                ]
            )
            fh.write(header)
            fh.write(payload)
            if len(payload) % 2 == 1:
                fh.write(b"\n")


def build_deb_fallback(package_root: Path, deb_path: Path) -> None:
    control_dir = package_root / "DEBIAN"
    if not control_dir.is_dir():
        raise SystemExit("Geen DEBIAN-map gevonden tijdens fallback-build van het deb-pakket.")

    data_roots = [path for path in package_root.iterdir() if path.name != "DEBIAN"]
    if not data_roots:
        raise SystemExit("Geen data-inhoud gevonden om in het deb-pakket op te nemen.")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        control_tar = tmp_path / "control.tar.gz"
        with tarfile.open(control_tar, "w:gz") as tar:
            for path in sorted(control_dir.iterdir(), key=lambda p: p.name):
                tar.add(path, arcname=path.name)

        data_tar = tmp_path / "data.tar.gz"
        with tarfile.open(data_tar, "w:gz") as tar:
            for path in sorted(data_roots, key=lambda p: p.name):
                tar.add(path, arcname=str(path.relative_to(package_root)))

        members = [
            ("debian-binary", b"2.0\n"),
            ("control.tar.gz", control_tar.read_bytes()),
            ("data.tar.gz", data_tar.read_bytes()),
        ]
        write_ar_archive(deb_path, members)


def create_deb_package(bundle: BundleInfo, version: str) -> Path:
    architecture = detect_deb_architecture(bundle.app_dir / bundle.binary_name)
    package_root = BUILD_DIR / f"vlierplanner_{version}_{architecture}"
    if package_root.exists():
        shutil.rmtree(package_root)

    control_dir = package_root / "DEBIAN"
    control_dir.mkdir(parents=True)

    # Data directories
    opt_dir = package_root / "opt" / "vlier-planner"
    shutil.copytree(bundle.app_dir, opt_dir)

    launcher_target = package_root / "usr" / "bin" / "vlier-planner"
    launcher_target.parent.mkdir(parents=True, exist_ok=True)
    launcher_target.write_text(
        f"""#!/bin/sh
set -e
APP_DIR="/opt/vlier-planner"
exec "$APP_DIR/{bundle.binary_name}" "$@"
""",
        encoding="utf-8",
    )
    launcher_target.chmod(0o755)

    desktop_target = package_root / "usr" / "share" / "applications" / "vlier-planner.desktop"
    desktop_target.parent.mkdir(parents=True, exist_ok=True)
    desktop_target.write_text(
        """[Desktop Entry]
Type=Application
Name=Vlier Planner
Comment=Plan lessen en studiewijzers voor het Vlier
Exec=vlier-planner
Icon=vlier-planner
Terminal=false
Categories=Education;
""",
        encoding="utf-8",
    )

    icon_target = package_root / "usr" / "share" / "icons" / "hicolor" / "256x256" / "apps" / "vlier-planner.png"
    ensure_logo(icon_target)

    readme_target = package_root / "usr" / "share" / "doc" / "vlier-planner"
    readme_target.mkdir(parents=True, exist_ok=True)
    shutil.copy2(bundle.root / "README-chromeos.md", readme_target / "README.md")

    control_fields = f"""Package: vlier-planner
Version: {version}
Section: utils
Priority: optional
Architecture: {architecture}
Maintainer: Vlier Planner Team
Description: Vlier Planner applicatie voor Chromebooks
"""
    (control_dir / "control").write_text(control_fields, encoding="utf-8")

    postinst = control_dir / "postinst"
    postinst.write_text(
        """#!/bin/sh
set -e
chmod +x /opt/vlier-planner/* || true
update-desktop-database >/dev/null 2>&1 || true
exit 0
""",
        encoding="utf-8",
    )
    postinst.chmod(0o755)

    prerm = control_dir / "prerm"
    prerm.write_text(
        """#!/bin/sh
set -e
update-desktop-database >/dev/null 2>&1 || true
exit 0
""",
        encoding="utf-8",
    )
    prerm.chmod(0o755)

    deb_path = BUILD_DIR / f"vlier-planner_{version}_{architecture}.deb"
    if deb_path.exists():
        deb_path.unlink()

    dpkg_deb = maybe_resolve_tool("dpkg-deb")
    if dpkg_deb:
        run([dpkg_deb, "--build", str(package_root), str(deb_path)])
    else:
        print(
            "Waarschuwing: 'dpkg-deb' niet gevonden, gebruik Python-fallback om het deb-pakket te maken."
        )
        build_deb_fallback(package_root, deb_path)

    return deb_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bouw een ChromeOS-release door frontend en PyInstaller-output te bundelen."
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Sla het opnieuw bouwen van de frontend over (verwacht bestaande dist).",
    )
    parser.add_argument(
        "--with-install",
        action="store_true",
        help="Voer ook 'npm install' uit voordat de frontend wordt gebouwd.",
    )
    parser.add_argument(
        "--skip-pyinstaller",
        action="store_true",
        help="Herbruik de huidige PyInstaller-output in dist/VlierPlanner.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    version = read_version()

    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    if not args.skip_frontend:
        build_frontend(run_install=args.with_install)

    if not args.skip_pyinstaller:
        build_pyinstaller()

    bundle = prepare_bundle(version)
    archive = create_archive(bundle.root)
    deb_path = create_deb_package(bundle, version)

    print(f"ChromeOS-build klaar in {bundle.root}")
    print(f"Archief: {archive}")
    print(f"Debian-pakket: {deb_path}")


if __name__ == "__main__":
    main()
