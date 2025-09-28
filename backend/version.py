"""Resolve the running application version in a robust way."""
from __future__ import annotations

import os
import sys
from configparser import ConfigParser, Error as ConfigParserError
from importlib import metadata
from pathlib import Path
from typing import Iterator

_FALLBACK_VERSION = "0.0.0"
_DISTRIBUTION_NAME = "vlier-planner"


def _clean(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    return value or None


def _load_from_env() -> str | None:
    return _clean(os.getenv("VLIER_APP_VERSION"))


def _load_from_metadata() -> str | None:
    try:
        return _clean(metadata.version(_DISTRIBUTION_NAME))
    except metadata.PackageNotFoundError:
        return None
    except Exception:
        return None


def _candidate_version_paths() -> Iterator[Path]:
    module_root = Path(__file__).resolve().parent
    yield module_root / "VERSION.ini"

    parent = module_root.parent
    if parent != module_root:
        yield parent / "VERSION.ini"

    if getattr(sys, "frozen", False):  # pragma: no cover - only in packaged builds
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            yield Path(meipass) / "VERSION.ini"
        try:
            yield Path(sys.executable).resolve().parent / "VERSION.ini"
        except (OSError, RuntimeError):
            pass


def _load_from_version_ini() -> str | None:
    parser = ConfigParser()

    for path in _candidate_version_paths():
        try:
            with path.open(encoding="utf-8") as handle:
                parser.read_file(handle)
        except (OSError, ConfigParserError):
            continue

        try:
            value = parser.get("app", "version", fallback="")
        except (ConfigParserError, ValueError):
            continue

        cleaned = _clean(value)
        if cleaned:
            return cleaned

    return None


def _resolve_version() -> str:
    for loader in (_load_from_env, _load_from_metadata, _load_from_version_ini):
        value = loader()
        if value:
            return value
    return _FALLBACK_VERSION


__version__ = _resolve_version()

__all__ = ["__version__"]
