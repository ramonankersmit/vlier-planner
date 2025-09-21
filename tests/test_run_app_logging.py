from __future__ import annotations

import importlib
import logging
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _remove_log_handler() -> None:
    root_logger = logging.getLogger()
    for handler in list(root_logger.handlers):
        if getattr(handler, "name", "") == "vlier-planner-file":
            root_logger.removeHandler(handler)
            handler.close()


def _import_run_app():
    existing = sys.modules.get("run_app")
    if existing is not None:
        return importlib.reload(existing)
    return importlib.import_module("run_app")


@pytest.fixture(autouse=True)
def clean_logging_handlers():
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    sys.modules.pop("run_app", None)
    _remove_log_handler()
    yield
    _remove_log_handler()
    sys.modules.pop("run_app", None)


def test_uvicorn_log_config_disables_colors(monkeypatch, tmp_path):
    monkeypatch.setenv("VLIER_LOG_FILE", str(tmp_path / "vlier.log"))
    run_app = _import_run_app()
    config = run_app.get_uvicorn_log_config()

    assert config["formatters"]["default"]["use_colors"] is False
    assert config["formatters"]["access"]["use_colors"] is False

def test_file_log_level_can_be_configured(monkeypatch, tmp_path):
    monkeypatch.setenv("VLIER_LOG_FILE", str(tmp_path / "vlier.log"))
    monkeypatch.setenv("VLIER_LOG_LEVEL", "DEBUG")

    _import_run_app()

    root_logger = logging.getLogger()
    handler_levels = {
        handler.level
        for handler in root_logger.handlers
        if getattr(handler, "name", "") == "vlier-planner-file"
    }

    assert handler_levels == {logging.DEBUG}
    assert root_logger.level == logging.DEBUG

