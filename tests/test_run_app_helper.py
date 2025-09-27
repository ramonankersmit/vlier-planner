from __future__ import annotations

import json
from pathlib import Path

import run_app


def test_execute_update_plan_invokes_steps(monkeypatch, tmp_path: Path):
    plan_path = tmp_path / "apply-update.json"
    script_path = tmp_path / "apply-update.ps1"
    log_path = tmp_path / "restart-helper.log"
    target_executable = tmp_path / "VlierPlanner.exe"
    installer_path = tmp_path / "VlierPlanner-Setup.exe"

    plan_path.write_text(
        json.dumps(
            {
                "original_pid": 4321,
                "target_executable": str(target_executable),
                "installer_path": str(installer_path),
                "installer_args": ["/VERYSILENT"],
                "log_path": str(log_path),
                "script_path": str(script_path),
            }
        ),
        encoding="utf-8",
    )

    script_path.write_text("Write-Output 'helper'", encoding="utf-8")

    log_calls: list[tuple[Path | None, str]] = []
    monkeypatch.setattr(run_app, "_append_helper_log", lambda path, message: log_calls.append((path, message)))

    wait_calls: list[tuple[int, Path | None]] = []
    monkeypatch.setattr(
        run_app,
        "_wait_for_process_exit",
        lambda pid, path: wait_calls.append((pid, path)),
    )

    installer_calls: list[tuple[Path, list[str], Path | None]] = []

    def fake_run_installer(installer: Path, args: list[str], log: Path | None) -> None:
        installer_calls.append((installer, args, log))

    monkeypatch.setattr(run_app, "_run_installer", fake_run_installer)

    launch_calls: list[tuple[Path, Path | None]] = []
    monkeypatch.setattr(
        run_app,
        "_wait_for_target_and_launch",
        lambda target, path: launch_calls.append((target, path)),
    )

    exit_code = run_app._execute_update_plan(plan_path)

    assert exit_code == 0
    assert wait_calls == [(4321, log_path)]
    assert installer_calls == [(installer_path, ["/VERYSILENT"], log_path)]
    assert launch_calls == [(target_executable, log_path)]
    assert plan_path.exists() is False
    assert script_path.exists() is False
    assert any(message.startswith("Python helper gestart.") for _, message in log_calls)
