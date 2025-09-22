"""Application version information used throughout the backend."""

from __future__ import annotations

import os
from configparser import ConfigParser, Error as ConfigParserError
from pathlib import Path


DEFAULT_VERSION = "0.0.0-dev"


def _version_file() -> Path:
    """Return the path to the repository-wide version file."""

    return Path(__file__).resolve().parent.parent / "VERSION.ini"


def _load_version_from_file() -> str | None:
    """Load the application version from the shared version INI file if possible."""

    path = _version_file()
    parser = ConfigParser()

    try:
        with path.open(encoding="utf8") as handle:
            parser.read_file(handle)
    except (OSError, ConfigParserError):
        return None

    try:
        value = parser.get("app", "version", fallback="").strip()
    except (ConfigParserError, ValueError):
        return None

    return value or None


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

