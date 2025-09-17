from __future__ import annotations

import os
import threading
import webbrowser
from pathlib import Path

import uvicorn

from backend import main as backend_main

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

    os.environ.setdefault("SERVE_FRONTEND", "1")

    if should_enable(os.getenv("VLIER_OPEN_BROWSER")):
        open_browser(host, port)

    uvicorn.run(
        backend_main.app,
        host=host,
        port=port,
        log_level=os.getenv("UVICORN_LOG_LEVEL", "info"),
    )


if __name__ == "__main__":
    main()
