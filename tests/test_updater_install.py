from __future__ import annotations

from pathlib import Path

import pytest

from backend import updater


def _make_update_info() -> updater.UpdateInfo:
    return updater.UpdateInfo(
        current_version="1.0.0",
        latest_version="1.1.0",
        asset_name="VlierPlanner-Setup.exe",
        download_url="https://example.invalid/VlierPlanner-Setup.exe",
        release_notes=None,
        sha256=None,
    )


@pytest.fixture(autouse=True)
def patch_platform(monkeypatch):
    monkeypatch.setattr(updater.sys, "platform", "win32")
    yield


def _prepare_common_mocks(monkeypatch, tmp_path: Path) -> tuple[Path, Path]:
    updates_dir = tmp_path / "updates"
    updates_dir.mkdir()

    installer_path = updates_dir / "VlierPlanner-Setup.exe"

    monkeypatch.setattr(updater, "_resolve_updates_dir", lambda: updates_dir)

    def fake_download(url: str, destination: Path) -> Path:
        destination.write_text("installer", encoding="utf-8")
        return destination

    monkeypatch.setattr(updater, "_download", fake_download)
    monkeypatch.setattr(updater, "_should_use_silent_install", lambda: True)
    monkeypatch.setattr(
        updater.sys,
        "executable",
        str(tmp_path / "app" / "VlierPlanner.exe"),
    )

    return updates_dir, installer_path


def test_install_update_uses_restart_helper_for_installer(monkeypatch, tmp_path: Path):
    info = _make_update_info()
    updates_dir, installer_path = _prepare_common_mocks(monkeypatch, tmp_path)

    helper_calls: list[tuple[Path, Path, list[str]]] = []

    def fake_write_helper(
        target_executable: Path,
        helper_updates_dir: Path,
        helper_installer_path: Path,
        helper_args: list[str],
    ) -> updater.RestartPlanPaths:
        helper_calls.append((target_executable, helper_installer_path, helper_args.copy()))
        plan_path = tmp_path / "restart-plan.json"
        script_path = tmp_path / "restart-plan.ps1"
        log_path = tmp_path / "restart-helper.log"
        return updater.RestartPlanPaths(plan_path=plan_path, script_path=script_path, log_path=log_path)

    monkeypatch.setattr(updater, "_write_restart_plan", fake_write_helper)

    launch_calls: list[tuple[updater.RestartPlanPaths, Path]] = []

    def fake_launch(plan_paths: updater.RestartPlanPaths, helper_updates_dir: Path) -> bool:
        launch_calls.append((plan_paths, helper_updates_dir))
        return True

    monkeypatch.setattr(updater, "_launch_restart_helper", fake_launch)

    cleanup_calls: list[updater.RestartPlanPaths] = []

    monkeypatch.setattr(updater, "_cleanup_restart_plan", lambda plan: cleanup_calls.append(plan))

    popen_calls: list[list[str]] = []

    def fake_popen(cmd, **kwargs):  # type: ignore[no-untyped-def]
        popen_calls.append(cmd)
        raise AssertionError("Installer should not be started directly when helper succeeds")

    monkeypatch.setattr(updater.subprocess, "Popen", fake_popen)

    shutdown_requests: list[None] = []

    def fake_shutdown() -> None:
        shutdown_requests.append(None)

    monkeypatch.setattr(updater, "_request_app_shutdown", fake_shutdown)

    class DummyTimer:
        def __init__(self, interval: float, func):
            self.interval = interval
            self.func = func
            self.started = False

        def start(self) -> None:
            self.started = True
            self.func()

    timer_instances: list[DummyTimer] = []

    def fake_timer(interval: float, func):
        timer = DummyTimer(interval, func)
        timer_instances.append(timer)
        return timer

    monkeypatch.setattr(updater.threading, "Timer", fake_timer)

    result = updater.install_update(info)

    assert result.restart_initiated is True
    assert result.installer_path == installer_path
    assert helper_calls and helper_calls[0][1] == installer_path
    assert helper_calls[0][2] == ["/VERYSILENT", "/NORESTART"]
    assert launch_calls and launch_calls[0][0].plan_path == tmp_path / "restart-plan.json"
    assert launch_calls[0][1] == updates_dir
    assert popen_calls == []
    assert shutdown_requests == [None]
    assert timer_instances and timer_instances[0].interval == 1.0
    assert cleanup_calls == []


def test_install_update_falls_back_when_helper_fails(monkeypatch, tmp_path: Path):
    info = _make_update_info()
    updates_dir, installer_path = _prepare_common_mocks(monkeypatch, tmp_path)

    helper_calls: list[tuple[Path, Path, list[str]]] = []

    def fake_write_helper(
        target_executable: Path,
        helper_updates_dir: Path,
        helper_installer_path: Path,
        helper_args: list[str],
    ) -> updater.RestartPlanPaths:
        helper_calls.append((target_executable, helper_installer_path, helper_args.copy()))
        plan_path = tmp_path / "restart-plan.json"
        script_path = tmp_path / "restart-plan.ps1"
        log_path = tmp_path / "restart-helper.log"
        return updater.RestartPlanPaths(plan_path=plan_path, script_path=script_path, log_path=log_path)

    monkeypatch.setattr(updater, "_write_restart_plan", fake_write_helper)

    def fake_launch(plan_paths: updater.RestartPlanPaths, helper_updates_dir: Path) -> bool:
        return False

    monkeypatch.setattr(updater, "_launch_restart_helper", fake_launch)

    cleanup_calls: list[updater.RestartPlanPaths] = []

    monkeypatch.setattr(updater, "_cleanup_restart_plan", lambda plan: cleanup_calls.append(plan))

    popen_calls: list[list[str]] = []

    def fake_popen(cmd, **kwargs):  # type: ignore[no-untyped-def]
        popen_calls.append(cmd)

        class DummyProc:
            pass

        return DummyProc()

    monkeypatch.setattr(updater.subprocess, "Popen", fake_popen)

    shutdown_requests: list[None] = []

    def fake_shutdown() -> None:
        shutdown_requests.append(None)

    monkeypatch.setattr(updater, "_request_app_shutdown", fake_shutdown)

    class DummyTimer:
        def __init__(self, interval: float, func):
            self.interval = interval
            self.func = func
            self.started = False

        def start(self) -> None:
            self.started = True
            self.func()

    monkeypatch.setattr(updater.threading, "Timer", lambda interval, func: DummyTimer(interval, func))

    result = updater.install_update(info)

    assert result.restart_initiated is False
    assert result.installer_path == installer_path
    assert helper_calls and helper_calls[0][1] == installer_path
    assert helper_calls[0][2] == ["/VERYSILENT", "/NORESTART"]
    assert popen_calls == [[str(installer_path), "/VERYSILENT", "/NORESTART"]]
    assert shutdown_requests == [None]
    assert cleanup_calls and cleanup_calls[0].plan_path == tmp_path / "restart-plan.json"


def test_launch_restart_helper_detects_immediate_exit(monkeypatch, tmp_path: Path):
    plan_paths = updater.RestartPlanPaths(
        plan_path=tmp_path / "restart-plan.json",
        script_path=tmp_path / "restart-plan.ps1",
        log_path=tmp_path / "restart-helper.log",
    )

    sleeps: list[float] = []
    monkeypatch.setattr(updater.time, "sleep", lambda duration: sleeps.append(duration))

    powershell_path = Path("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
    monkeypatch.setattr(updater, "_resolve_powershell_executable", lambda: powershell_path)

    class DummyProcess:
        pid = 123

        @staticmethod
        def poll() -> int:
            return 1

    popen_calls: list[tuple[tuple, dict]] = []

    def fake_popen(*args, **kwargs):  # type: ignore[no-untyped-def]
        popen_calls.append((args, kwargs))
        return DummyProcess()

    monkeypatch.setattr(updater.subprocess, "Popen", fake_popen)

    cleanup_calls: list[updater.RestartPlanPaths] = []
    monkeypatch.setattr(updater, "_cleanup_restart_plan", lambda plan: cleanup_calls.append(plan))

    assert updater._launch_restart_helper(plan_paths, tmp_path) is False
    assert sleeps == [0.2]
    assert popen_calls
    assert popen_calls[0][0][0] == [
        str(powershell_path),
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(plan_paths.script_path),
    ]
    assert cleanup_calls == [plan_paths]


def test_launch_restart_helper_succeeds_when_process_keeps_running(monkeypatch, tmp_path: Path):
    plan_paths = updater.RestartPlanPaths(
        plan_path=tmp_path / "restart-plan.json",
        script_path=tmp_path / "restart-plan.ps1",
        log_path=tmp_path / "restart-helper.log",
    )

    sleeps: list[float] = []
    monkeypatch.setattr(updater.time, "sleep", lambda duration: sleeps.append(duration))

    powershell_path = Path("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
    monkeypatch.setattr(updater, "_resolve_powershell_executable", lambda: powershell_path)

    class DummyProcess:
        pid = 456

        @staticmethod
        def poll() -> None:
            return None

    monkeypatch.setattr(updater.subprocess, "Popen", lambda *args, **kwargs: DummyProcess())

    cleanup_calls: list[updater.RestartPlanPaths] = []
    monkeypatch.setattr(updater, "_cleanup_restart_plan", lambda plan: cleanup_calls.append(plan))

    assert updater._launch_restart_helper(plan_paths, tmp_path) is True
    assert sleeps == [0.2]
    assert cleanup_calls == []
