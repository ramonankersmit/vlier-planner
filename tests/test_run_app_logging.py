from __future__ import annotations

import importlib


def test_uvicorn_log_config_disables_colors(monkeypatch, tmp_path):
    monkeypatch.setenv("VLIER_LOG_FILE", str(tmp_path / "vlier.log"))
    run_app = importlib.import_module("run_app")

    config = run_app.get_uvicorn_log_config()

    assert config["formatters"]["default"]["use_colors"] is False
    assert config["formatters"]["access"]["use_colors"] is False
