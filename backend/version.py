"""Application version information used throughout the backend."""

from __future__ import annotations

import os


DEFAULT_VERSION = "0.0.0-dev"


def _resolve_version() -> str:
    """Return the version string for the running application."""

    env_value = os.getenv("VLIER_APP_VERSION")
    if env_value:
        cleaned = env_value.strip()
        if cleaned:
            return cleaned

    return DEFAULT_VERSION


APP_VERSION = _resolve_version()

__all__ = ["APP_VERSION"]

