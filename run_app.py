from __future__ import annotations

import logging
import os
import sys
import threading
import webbrowser
from copy import deepcopy
from pathlib import Path
from typing import Any, TYPE_CHECKING

import uvicorn
from uvicorn.config import LOGGING_CONFIG
from uvicorn.main import STARTUP_FAILURE

try:  # pragma: no cover - afhankelijk van platform
    import pystray
except Exception:  # pragma: no cover - afhankelijk van platform
    pystray = None

try:  # pragma: no cover - afhankelijk van platform
    from PIL import Image, ImageDraw
except Exception:  # pragma: no cover - afhankelijk van platform
    Image = None
    ImageDraw = None

if TYPE_CHECKING:  # pragma: no cover - alleen voor type checkers
    from pystray import Icon as TrayIcon
else:
    TrayIcon = Any  # type: ignore[assignment]

LOG_HANDLER_NAME = "vlier-planner-file"
LOG_LEVEL_ENV_VAR = "VLIER_LOG_LEVEL"
TRAY_THREAD_NAME = "vlier-planner-tray"
FILE_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_FILE_HANDLER_SETTINGS: dict[str, Any] | None = None
_ICON_FILENAMES = ("favicon.ico", "logo.png")
_ICON_SEARCH_DIRECTORIES = (
    "",
    "frontend",
    "frontend/public",
    "public",
    "dist",
    "static/dist",
    "backend/static",
    "backend/static/dist",
)

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


def _store_file_handler_settings(path: Path, level: int) -> None:
    global _FILE_HANDLER_SETTINGS
    _FILE_HANDLER_SETTINGS = {"path": path, "level": level}


def _configure_logging() -> None:
    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        if getattr(handler, "name", "") == LOG_HANDLER_NAME:
            if isinstance(handler, logging.FileHandler):
                _store_file_handler_settings(Path(handler.baseFilename), handler.level)
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
    file_handler.setFormatter(logging.Formatter(FILE_FORMAT))
    root_logger.addHandler(file_handler)
    if root_logger.level > log_level:
        root_logger.setLevel(log_level)

    _store_file_handler_settings(log_path, log_level)
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

    if _FILE_HANDLER_SETTINGS is not None:
        formatters.setdefault(
            "vlier-planner-file",
            {"()": "logging.Formatter", "fmt": FILE_FORMAT},
        )

        handlers = log_config.setdefault("handlers", {})
        handlers[LOG_HANDLER_NAME] = {
            "class": "logging.FileHandler",
            "formatter": "vlier-planner-file",
            "filename": str(_FILE_HANDLER_SETTINGS["path"]),
            "encoding": "utf-8",
            "level": logging.getLevelName(_FILE_HANDLER_SETTINGS["level"]),
        }

        loggers_config = log_config.setdefault("loggers", {})
        for logger_name in ("uvicorn", "uvicorn.access"):
            logger_cfg = loggers_config.get(logger_name)
            if isinstance(logger_cfg, dict):
                logger_handlers = logger_cfg.setdefault("handlers", [])
                if LOG_HANDLER_NAME not in logger_handlers:
                    logger_handlers.append(LOG_HANDLER_NAME)

        uvicorn_error_logger = loggers_config.setdefault("uvicorn.error", {"level": "INFO"})
        error_handlers = uvicorn_error_logger.setdefault("handlers", ["default"])
        if LOG_HANDLER_NAME not in error_handlers:
            error_handlers.append(LOG_HANDLER_NAME)

    return log_config


# Ensure the backend knows it should serve the built frontend before it is imported
os.environ.setdefault("SERVE_FRONTEND", "1")
_configure_logging()

from backend import app as backend_app

LOGGER = logging.getLogger(__name__)

_SERVER: uvicorn.Server | None = None
_TRAY_ICON: TrayIcon | None = None

FALSE_VALUES = {"0", "false", "no", "off"}


def should_enable(value: str | None, default: bool = True) -> bool:
    if value is None:
        return default
    return value.strip().lower() not in FALSE_VALUES


def open_browser(host: str, port: int, delay: float = 1.0) -> None:
    url = f"http://{host}:{port}"
    if delay <= 0:
        webbrowser.open(url, 2)
        return

    threading.Timer(delay, webbrowser.open, args=(url, 2)).start()


def _iter_icon_candidates() -> list[Path]:
    roots: list[Path] = []

    if getattr(sys, "frozen", False):  # pragma: no cover - platform afhankelijk
        exe_path = Path(sys.executable).resolve()
        roots.append(exe_path.parent)
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            roots.append(Path(meipass))

    module_root = Path(__file__).resolve().parent
    roots.append(module_root)

    candidates: list[Path] = []
    seen: set[Path] = set()

    for root in roots:
        for directory in _ICON_SEARCH_DIRECTORIES:
            for filename in _ICON_FILENAMES:
                candidate = (root / directory / filename).resolve()
                if candidate in seen:
                    continue
                seen.add(candidate)
                candidates.append(candidate)

    return candidates


def _load_icon_from_disk(size: tuple[int, int]) -> "Image.Image" | None:
    if Image is None:  # pragma: no cover - afhankelijk van import
        return None

    for candidate in _iter_icon_candidates():
        if not candidate.is_file():
            continue

        try:
            with Image.open(candidate) as source:
                image = source.convert("RGBA")
        except Exception:  # pragma: no cover - afhankelijk van IO
            LOGGER.warning("Kon system tray icoon %s niet laden", candidate)
            continue

        if image.size != size:
            resample = getattr(Image, "LANCZOS", Image.BICUBIC)
            image = image.resize(size, resample=resample)

        LOGGER.debug("System tray icoon geladen vanaf %s", candidate)
        return image

    return None


def _create_tray_image() -> "Image.Image":
    size = (64, 64)
    image = _load_icon_from_disk(size)
    if image is not None:
        return image

    fallback = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(fallback)
    draw.ellipse((8, 8, 56, 56), fill=(12, 77, 162, 255))
    draw.rectangle((22, 28, 42, 46), fill=(255, 255, 255, 255))
    return fallback


def _request_shutdown() -> None:
    server = _SERVER
    if server is None:
        os._exit(0)
    server.should_exit = True


def _stop_tray_icon() -> None:
    icon = _TRAY_ICON
    if icon is None:
        return

    try:
        icon.visible = False
        icon.stop()
    except Exception:  # pragma: no cover - afhankelijk van platform
        LOGGER.exception("Kon system tray icoon niet stoppen")


def _start_tray_icon(host: str, port: int) -> None:
    if pystray is None or Image is None or ImageDraw is None:
        LOGGER.info("System tray niet beschikbaar: pystray of Pillow ontbreekt")
        return

    def on_open(icon: TrayIcon, item: Any) -> None:  # pragma: no cover - UI callback
        open_browser(host, port, delay=0.0)

    def on_quit(icon: TrayIcon, item: Any) -> None:  # pragma: no cover - UI callback
        LOGGER.info("Stop aangevraagd via system tray")
        _request_shutdown()
        icon.visible = False
        icon.stop()

    def run_tray() -> None:  # pragma: no cover - UI thread
        global _TRAY_ICON
        try:
            icon = pystray.Icon(
                "VlierPlanner",
                _create_tray_image(),
                "Vlier Planner",
                menu=pystray.Menu(
                    pystray.MenuItem("Openen in browser", on_open),
                    pystray.MenuItem("Stoppen", on_quit),
                ),
            )
        except Exception:
            LOGGER.exception("Kon system tray icoon niet initialiseren")
            return

        _TRAY_ICON = icon
        try:
            icon.run()
        finally:
            _TRAY_ICON = None

    try:
        threading.Thread(target=run_tray, name=TRAY_THREAD_NAME, daemon=True).start()
    except Exception:  # pragma: no cover - afhankelijk van platform
        LOGGER.exception("Kon system tray thread niet starten")


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    os.chdir(base_dir)

    host = os.getenv("VLIER_HOST", "127.0.0.1")
    port = int(os.getenv("VLIER_PORT", "8000"))

    if should_enable(os.getenv("VLIER_OPEN_BROWSER")):
        open_browser(host, port)

    _start_tray_icon(host, port)

    config = uvicorn.Config(
        backend_app.app,
        host=host,
        port=port,
        log_level=os.getenv("UVICORN_LOG_LEVEL", "info"),
        log_config=get_uvicorn_log_config(),
    )

    server = uvicorn.Server(config)

    global _SERVER
    _SERVER = server
    try:
        server.run()
    finally:
        _SERVER = None
        _stop_tray_icon()

    if not server.started:
        sys.exit(STARTUP_FAILURE)


if __name__ == "__main__":
    main()
