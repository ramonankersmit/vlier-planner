"""Shared logging helpers for CLI entrypoints and ASGI servers."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Any, Final

LOG_HANDLER_NAME: Final = "vlier-planner-file"
LOG_LEVEL_ENV_VAR: Final = "VLIER_LOG_LEVEL"
FILE_FORMAT: Final = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"

_FILE_HANDLER_SETTINGS: dict[str, Any] | None = None


def _get_configured_log_level(default: int = logging.INFO) -> int:
    """Resolve the desired log level from the environment."""

    value = os.getenv(LOG_LEVEL_ENV_VAR)
    if not value:
        return default

    value = value.strip()
    if not value:
        return default

    try:
        numeric_level = int(value)
    except ValueError:
        resolved = getattr(logging, value.upper(), None)
        if isinstance(resolved, int):
            return resolved
        return default
    else:
        return numeric_level


def _default_log_path() -> Path:
    override = os.getenv("VLIER_LOG_FILE")
    if override:
        return Path(override).expanduser()

    if getattr(sys, "frozen", False):
        exe_path = Path(sys.executable).resolve()
        return exe_path.parent / "vlier-planner.log"

    return Path.cwd() / "vlier-planner.log"


def configure_file_logging(default_level: int = logging.INFO) -> dict[str, Any] | None:
    """Ensure the root logger writes to a file so parser logs are persisted."""

    global _FILE_HANDLER_SETTINGS

    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        if getattr(handler, "name", "") == LOG_HANDLER_NAME:
            if isinstance(handler, logging.FileHandler):
                _FILE_HANDLER_SETTINGS = {
                    "path": Path(handler.baseFilename),
                    "level": handler.level,
                }
            return _FILE_HANDLER_SETTINGS

    log_path = _default_log_path()
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_path, encoding="utf-8")
    except OSError as exc:  # pragma: no cover - afhankelijk van IO
        logging.getLogger(__name__).warning("Kon logbestand niet initialiseren: %s", exc)
        _FILE_HANDLER_SETTINGS = None
        return None

    log_level = _get_configured_log_level(default_level)
    file_handler.set_name(LOG_HANDLER_NAME)
    file_handler.setLevel(log_level)
    file_handler.setFormatter(logging.Formatter(FILE_FORMAT))

    root_logger.addHandler(file_handler)
    if root_logger.level > log_level:
        root_logger.setLevel(log_level)

    _FILE_HANDLER_SETTINGS = {"path": log_path, "level": log_level}
    logging.getLogger(__name__).info("Logbestand: %s", log_path)
    return _FILE_HANDLER_SETTINGS


def announce_log_destination() -> None:
    """Echo the configured log destination so devs know where to look."""

    settings = _FILE_HANDLER_SETTINGS
    if not settings:
        print("[logging] Console logging actief (geen logbestand geconfigureerd).")
        return

    path = settings["path"]
    level = logging.getLevelName(settings["level"])
    print(
        "[logging] Backendlogs worden naar",
        f" {path} geschreven (niveau {level}).",
        " Zet VLIER_LOG_LEVEL=DEBUG voor extra details.",
    )


def get_file_handler_settings() -> dict[str, Any] | None:
    """Return the stored handler metadata so other systems can reuse it."""

    return _FILE_HANDLER_SETTINGS
