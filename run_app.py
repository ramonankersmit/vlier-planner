from __future__ import annotations

import logging
import os
import sys
import threading
import webbrowser
from copy import deepcopy
from pathlib import Path
from typing import Any

import uvicorn
from uvicorn.config import LOGGING_CONFIG

LOG_HANDLER_NAME = "vlier-planner-file"
LOG_LEVEL_ENV_VAR = "VLIER_LOG_LEVEL"


def _get_configured_log_level(default: int = logging.WARNING) -> int:
    """Resolve the desired log level from the environment."""

    value = os.getenv(LOG_LEVEL_ENV_VAR)
    if not value:
        return default

    value = value.strip()
    if not value:
        return default

    # Allow numeric levels ("10") as well as textual levels ("DEBUG").
    try:
        numeric_level = int(value)
    except ValueError:
        level_name = value.upper()
        resolved = getattr(logging, level_name, None)
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

    return Path(__file__).resolve().parent / "vlier-planner.log"


def _configure_logging() -> None:
    root_logger = logging.getLogger()
    if any(getattr(handler, "name", "") == LOG_HANDLER_NAME for handler in root_logger.handlers):
        return

    log_path = _default_log_path()
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_path, encoding="utf-8")
    except Exception as exc:  # pragma: no cover - afhankelijk van IO
        logging.getLogger(__name__).warning("Kon logbestand niet initialiseren: %s", exc)
        return

    file_handler.set_name(LOG_HANDLER_NAME)
    log_level = _get_configured_log_level()

    file_handler.setLevel(log_level)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root_logger.addHandler(file_handler)
    if root_logger.level > log_level:
        root_logger.setLevel(log_level)

    logging.getLogger(__name__).info("Logbestand: %s", log_path)


def get_uvicorn_log_config() -> dict[str, Any]:
    """Return a logging configuration that avoids isatty() calls in Uvicorn."""

    log_config: dict[str, Any] = deepcopy(LOGGING_CONFIG)
    formatters = log_config.get("formatters", {})

    for formatter_name in ("default", "access"):
        formatter = formatters.get(formatter_name)
        if isinstance(formatter, dict):
            # Ensure Uvicorn does not call isatty() on replaced stdio streams.
            formatter = {**formatter, "use_colors": False}
            formatters[formatter_name] = formatter

    return log_config


# Ensure the backend knows it should serve the built frontend before it is imported
os.environ.setdefault("SERVE_FRONTEND", "1")
_configure_logging()

from backend import app as backend_app

FALSE_VALUES = {"0", "false", "no", "off"}


def should_enable(value: str | None, default: bool = True) -> bool:
    if value is None:
        return default
    return value.strip().lower() not in FALSE_VALUES


def open_browser(host: str, port: int) -> None:
    url = f"http://{host}:{port}"
    threading.Timer(1.0, webbrowser.open, args=(url, 2)).start()


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    os.chdir(base_dir)

    host = os.getenv("VLIER_HOST", "127.0.0.1")
    port = int(os.getenv("VLIER_PORT", "8000"))

    if should_enable(os.getenv("VLIER_OPEN_BROWSER")):
        open_browser(host, port)

    uvicorn.run(
        backend_app.app,
        host=host,
        port=port,
        log_level=os.getenv("UVICORN_LOG_LEVEL", "info"),
        log_config=get_uvicorn_log_config(),
    )


if __name__ == "__main__":
    main()
