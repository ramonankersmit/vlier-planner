"""Utilities for checking and installing application updates."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final
from urllib.error import URLError
from urllib.request import Request, urlopen

from packaging import version as packaging_version

from .version import APP_VERSION

LOGGER = logging.getLogger(__name__)

REPO_SLUG: Final[str] = os.getenv("VLIER_UPDATE_REPO", "ramonankersmit/vlier-planner")
API_LATEST: Final[str] = f"https://api.github.com/repos/{REPO_SLUG}/releases/latest"
APP_NAME: Final[str] = os.getenv("VLIER_UPDATE_APP_NAME", "VlierPlanner")
_CACHE_TTL_SECONDS: Final[int] = 15 * 60


class UpdateError(RuntimeError):
    """Raised when checking or installing an update fails."""


@dataclass(frozen=True, slots=True)
class UpdateInfo:
    """Information about an available update."""

    current_version: str
    latest_version: str
    asset_name: str
    download_url: str
    release_notes: str | None
    sha256: str | None


_CACHE: tuple[float, UpdateInfo | None] | None = None


def _user_agent() -> str:
    return f"{APP_NAME}/update-check"


def _http_get_json(url: str) -> Any:
    request = Request(url, headers={"User-Agent": _user_agent()})
    with urlopen(request, timeout=20) as response:  # noqa: S310 - controlled URL
        data = response.read()
    return json.loads(data.decode("utf-8"))


def _download(url: str, destination: Path) -> Path:
    request = Request(url, headers={"User-Agent": _user_agent()})
    with urlopen(request, timeout=60) as response, destination.open("wb") as file:  # noqa: S310
        shutil.copyfileobj(response, file)
    return destination


def _sha256sum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_version(value: str) -> packaging_version.Version | None:
    try:
        return packaging_version.Version(value)
    except packaging_version.InvalidVersion:
        LOGGER.warning("Ongeldige versiestring: %s", value)
        return None


def _extract_sha256(notes: str | None) -> str | None:
    if not notes:
        return None
    for line in notes.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        if key.strip().upper() == "SHA256":
            checksum = value.strip()
            if checksum:
                return checksum
    return None


def _pick_windows_asset(assets: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates: list[dict[str, Any]] = []
    for asset in assets:
        name = str(asset.get("name", ""))
        if not name.lower().endswith((".exe", ".msi")):
            continue
        if "win" not in name.lower() and "setup" not in name.lower():
            continue
        candidates.append(asset)

    if not candidates:
        return None

    for candidate in candidates:
        name = str(candidate.get("name", ""))
        if "setup" in name.lower() or "installer" in name.lower():
            return candidate

    return candidates[0]


def _resolve_updates_dir() -> Path:
    if sys.platform == "win32":
        base = os.getenv("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = os.getenv("XDG_DATA_HOME") or (Path.home() / ".local" / "share")

    updates_dir = Path(base) / APP_NAME / "updates"
    updates_dir.mkdir(parents=True, exist_ok=True)
    return updates_dir


def _fetch_update_info() -> UpdateInfo | None:
    try:
        payload = _http_get_json(API_LATEST)
    except URLError as exc:  # pragma: no cover - netwerkafhankelijk
        raise UpdateError(f"Kon release-informatie niet ophalen: {exc}") from exc
    except TimeoutError as exc:  # pragma: no cover - netwerkafhankelijk
        raise UpdateError("Timeout bij ophalen van release-informatie") from exc
    except Exception as exc:  # pragma: no cover - defensief
        raise UpdateError(f"Onbekende fout tijdens update-check: {exc}") from exc

    latest_tag = str(payload.get("tag_name", "")).strip()
    if not latest_tag:
        return None
    latest_version_str = latest_tag.lstrip("v")

    asset = _pick_windows_asset(payload.get("assets", []) or [])
    if not asset:
        LOGGER.info("Geen Windows release asset gevonden in release %s", latest_tag)
        return None

    latest_version = _parse_version(latest_version_str)
    current_version = _parse_version(APP_VERSION)

    if latest_version is None or current_version is None:
        return None

    if latest_version <= current_version:
        return None

    notes = payload.get("body")
    checksum = _extract_sha256(notes)

    download_url = str(asset.get("browser_download_url"))
    if not download_url:
        LOGGER.info("Release asset mist download URL")
        return None

    asset_name = str(asset.get("name", "")) or f"update-{latest_version_str}.exe"

    return UpdateInfo(
        current_version=APP_VERSION,
        latest_version=latest_version_str,
        asset_name=asset_name,
        download_url=download_url,
        release_notes=notes,
        sha256=checksum,
    )


def check_for_update(force: bool = False) -> UpdateInfo | None:
    """Return information about an available update, if any."""

    global _CACHE

    if not force and _CACHE is not None:
        timestamp, cached = _CACHE
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return cached

    info = _fetch_update_info()
    _CACHE = (time.time(), info)
    return info


def _should_use_silent_install() -> bool:
    return os.getenv("VLIER_UPDATE_SILENT", "").strip().lower() in {"1", "true", "yes", "on"}


def install_update(info: UpdateInfo, *, silent: bool | None = None) -> Path:
    """Download the installer for ``info`` and start the installation."""

    if sys.platform != "win32":
        raise UpdateError("Automatische updates worden alleen op Windows ondersteund")

    updates_dir = _resolve_updates_dir()
    destination = updates_dir / info.asset_name

    try:
        _download(info.download_url, destination)
    except URLError as exc:  # pragma: no cover - netwerkafhankelijk
        raise UpdateError(f"Download van update mislukt: {exc}") from exc
    except TimeoutError as exc:  # pragma: no cover - netwerkafhankelijk
        raise UpdateError("Timeout tijdens download van update") from exc
    except Exception as exc:  # pragma: no cover - defensief
        raise UpdateError(f"Onbekende fout tijdens download: {exc}") from exc

    if info.sha256:
        actual = _sha256sum(destination)
        if actual.lower() != info.sha256.lower():
            try:
                destination.unlink(missing_ok=True)
            except Exception:  # pragma: no cover - best effort
                LOGGER.warning("Kon corrupt updatebestand niet verwijderen: %s", destination)
            raise UpdateError("Controle van de bestandshandtekening is mislukt")

    flags: list[str] = []
    use_silent = _should_use_silent_install() if silent is None else silent
    if use_silent:
        flags.extend(["/VERYSILENT", "/NORESTART"])

    try:
        subprocess.Popen([str(destination), *flags], shell=False, close_fds=True)  # noqa: S603,S607
    except Exception as exc:  # pragma: no cover - afhankelijk van platform
        raise UpdateError(f"Kon installer niet starten: {exc}") from exc

    def _terminate() -> None:
        LOGGER.info("Applicatie wordt afgesloten voor update")
        os._exit(0)

    threading.Timer(2.0, _terminate).start()
    return destination


__all__ = ["UpdateError", "UpdateInfo", "check_for_update", "install_update"]

