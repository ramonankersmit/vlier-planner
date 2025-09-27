from __future__ import annotations

import json
from pathlib import Path

import run_app


def test_run_update_plan_executes_installer_and_restarts(monkeypatch, tmp_path: Path):
    plan_path = tmp_path / "plan.json"
    log_path = tmp_path / "restart-helper.log"
    target = tmp_path / "VlierPlanner.exe"
    installer = tmp_path / "installer.exe"
    target.write_text("binary", encoding="utf-8")
    installer.write_text("installer", encoding="utf-8")

    plan = {
        "original_pid": 123,
        "target_executable": str(target),
        "installer_path": str(installer),
        "installer_args": ["/VERYSILENT"],
        "log_path": str(log_path),
    }
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    monkeypatch.setattr(run_app, "_configure_logging", lambda: None)
    monkeypatch.setattr(run_app.sys, "platform", "win32")
    monkeypatch.setattr(run_app, "_is_process_running", lambda pid: False)

    popen_calls: list[tuple[list[str], dict]] = []

    class DummyInstallerProcess:
        def wait(self) -> int:
            return 0

    def fake_popen(cmd, **kwargs):  # type: ignore[no-untyped-def]
        popen_calls.append((cmd, kwargs))
        if cmd[0] == str(installer):
            return DummyInstallerProcess()

        class DummyProcess:
            pass

        return DummyProcess()

    monkeypatch.setattr(run_app.subprocess, "Popen", fake_popen)

    assert run_app._run_update_plan(plan_path) == 0
    assert popen_calls[0][0] == [str(installer), "/VERYSILENT"]
    assert popen_calls[1][0] == [str(target)]
    assert not plan_path.exists()
    assert log_path.exists()


def test_run_update_plan_handles_missing_installer(monkeypatch, tmp_path: Path):
    plan_path = tmp_path / "plan.json"
    log_path = tmp_path / "restart-helper.log"
    target = tmp_path / "VlierPlanner.exe"
    target.write_text("binary", encoding="utf-8")

    plan = {
        "original_pid": 0,
        "target_executable": str(target),
        "installer_path": str(tmp_path / "missing.exe"),
        "installer_args": [],
        "log_path": str(log_path),
    }
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    monkeypatch.setattr(run_app, "_configure_logging", lambda: None)
    monkeypatch.setattr(run_app.sys, "platform", "win32")
    monkeypatch.setattr(run_app, "_is_process_running", lambda pid: False)
    monkeypatch.setattr(run_app.subprocess, "Popen", lambda *args, **kwargs: None)

    assert run_app._run_update_plan(plan_path) == 0
    assert log_path.exists()
