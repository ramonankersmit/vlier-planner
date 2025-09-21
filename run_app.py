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
    file_handler.setLevel(logging.WARNING)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root_logger.addHandler(file_handler)
    if root_logger.level > logging.WARNING:
        root_logger.setLevel(logging.WARNING)

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
