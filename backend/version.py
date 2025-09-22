"""Application version information used throughout the backend."""

from __future__ import annotations

import os
from pathlib import Path


DEFAULT_VERSION = "0.0.0-dev"


def _version_file() -> Path:
    """Return the path to the repository-wide version file."""

    return Path(__file__).resolve().parent.parent / "VERSION"


def _load_version_from_file() -> str | None:
    """Load the application version from the shared VERSION file if possible."""

    path = _version_file()
    try:
        contents = path.read_text(encoding="utf8")
    except OSError:
        return None

    cleaned = contents.strip()
    return cleaned or None


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

