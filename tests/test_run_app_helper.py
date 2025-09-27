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
    helper_dir = tmp_path / "python-helper"
    helper_dir.mkdir()
    helper_executable = helper_dir / "python-helper.exe"

    plan_path.write_text(
        json.dumps(
            {
                "original_pid": 4321,
                "target_executable": str(target_executable),
                "installer_path": str(installer_path),
                "installer_args": ["/VERYSILENT"],
                "log_path": str(log_path),
                "script_path": str(script_path),
                "python_helper_executable": str(helper_executable),
                "python_helper_cleanup_dir": str(helper_dir),
            }
        ),
        encoding="utf-8",
    )

    script_path.write_text("Write-Output 'helper'", encoding="utf-8")
    helper_executable.write_text("helper", encoding="utf-8")

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
    assert helper_executable.exists() is False
    assert helper_dir.exists() is False
    assert any(message.startswith("Python helper gestart.") for _, message in log_calls)


def test_process_running_windows_active(monkeypatch):
    monkeypatch.setattr(run_app, "_IS_WINDOWS", True)

    class FakeKernel32:
        def __init__(self) -> None:
            self.closed: list[int] = []

        def OpenProcess(self, access: int, inherit: bool, pid: int) -> int:  # noqa: N802
            assert access == run_app._PROCESS_ACCESS_FLAGS
            assert inherit is False
            assert pid == 123
            return 99

        def GetExitCodeProcess(self, handle: int, exit_code) -> int:  # noqa: N802
            assert handle == 99
            pointer = run_app.ctypes.cast(
                exit_code,
                run_app.ctypes.POINTER(run_app.ctypes.c_ulong),
            )
            pointer.contents.value = run_app._STILL_ACTIVE
            return 1

        def CloseHandle(self, handle: int) -> int:  # noqa: N802
            self.closed.append(handle)
            return 1

    fake_kernel32 = FakeKernel32()
    monkeypatch.setattr(run_app, "_KERNEL32", fake_kernel32)
    monkeypatch.setattr(run_app.ctypes, "get_last_error", lambda: 0, raising=False)

    calls: list[int] = []

    def fake_set_last_error(value: int) -> None:
        calls.append(value)

    monkeypatch.setattr(run_app.ctypes, "set_last_error", fake_set_last_error, raising=False)

    assert run_app._process_running(123) is True
    assert fake_kernel32.closed == [99]
    assert calls == [0]


def test_process_running_windows_access_denied(monkeypatch):
    monkeypatch.setattr(run_app, "_IS_WINDOWS", True)

    class FakeKernel32:
        def OpenProcess(self, access: int, inherit: bool, pid: int) -> int:  # noqa: N802
            return 0

    monkeypatch.setattr(run_app, "_KERNEL32", FakeKernel32())
    monkeypatch.setattr(
        run_app.ctypes,
        "get_last_error",
        lambda: run_app._ERROR_ACCESS_DENIED,
        raising=False,
    )
    monkeypatch.setattr(run_app.ctypes, "set_last_error", lambda value: None, raising=False)

    assert run_app._process_running(555) is True


def test_process_running_windows_exited(monkeypatch):
    monkeypatch.setattr(run_app, "_IS_WINDOWS", True)

    class FakeKernel32:
        def OpenProcess(self, access: int, inherit: bool, pid: int) -> int:  # noqa: N802
            return 42

        def GetExitCodeProcess(self, handle: int, exit_code) -> int:  # noqa: N802
            pointer = run_app.ctypes.cast(
                exit_code,
                run_app.ctypes.POINTER(run_app.ctypes.c_ulong),
            )
            pointer.contents.value = 0
            return 1

        def CloseHandle(self, handle: int) -> int:  # noqa: N802
            return 1

    monkeypatch.setattr(run_app, "_KERNEL32", FakeKernel32())
    monkeypatch.setattr(run_app.ctypes, "get_last_error", lambda: 0, raising=False)
    monkeypatch.setattr(run_app.ctypes, "set_last_error", lambda value: None, raising=False)

    assert run_app._process_running(777) is False
