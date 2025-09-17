"""Helpers for resolving runtime paths.

These helpers ensure that writable directories are created alongside the
running application, both when executed from source and from a PyInstaller
bundle.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import sys


@lru_cache()
def runtime_base_dir() -> Path:
    """Return the directory where runtime data should be stored.

    When running from a PyInstaller bundle we prefer the directory that holds
    the executable instead of the temporary extraction directory. During local
    development the repository root is used.
    """

    if getattr(sys, "frozen", False):  # pragma: no cover - exercised in bundle
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


@lru_cache()
def parsed_data_dir() -> Path:
    """Directory where normalized parse results are stored."""

    return _ensure_dir(runtime_base_dir() / "data" / "parsed")


@lru_cache()
def uploads_dir() -> Path:
    """Directory used for temporarily storing uploaded files."""

    return _ensure_dir(runtime_base_dir() / "uploads")


@lru_cache()
def sources_dir() -> Path:
    """Directory where original uploaded documents are archived."""

    return _ensure_dir(runtime_base_dir() / "data" / "sources")
