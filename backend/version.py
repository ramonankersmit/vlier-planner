"""Application version information used throughout the backend."""

from __future__ import annotations

import os
import sys
from configparser import ConfigParser, Error as ConfigParserError
from pathlib import Path
from typing import Iterable


DEFAULT_VERSION = "0.0.0-dev"


def _candidate_version_paths() -> Iterable[Path]:
    """Yield potential locations of ``VERSION.ini`` in priority order."""

    repo_root = Path(__file__).resolve().parent.parent
    yield repo_root / "VERSION.ini"

    env_override = os.getenv("VLIER_VERSION_FILE")
    if env_override:
        yield Path(env_override)

    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            yield Path(meipass) / "VERSION.ini"
        try:
            yield Path(sys.executable).resolve().parent / "VERSION.ini"
        except (OSError, RuntimeError):
            pass


def _load_version_from_file() -> str | None:
    """Load the application version from the shared version INI file if possible."""

    for path in _candidate_version_paths():
        parser = ConfigParser()
        try:
            with path.open(encoding="utf8") as handle:
                parser.read_file(handle)
        except (OSError, ConfigParserError):
            continue

        try:
            value = parser.get("app", "version", fallback="").strip()
        except (ConfigParserError, ValueError):
            continue

        if value:
            return value

    return None


def _resolve_version() -> str:
    """Return the version string for the running application."""

    env_value = os.getenv("VLIER_APP_VERSION")
    if env_value:
        cleaned = env_value.strip()
        if cleaned:
            return cleaned

    file_version = _load_version_from_file()
    if file_version:
        return file_version

    return DEFAULT_VERSION


APP_VERSION = _resolve_version()

__all__ = ["APP_VERSION"]

