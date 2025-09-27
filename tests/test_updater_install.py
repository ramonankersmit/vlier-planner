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
    ) -> Path:
        helper_calls.append((target_executable, helper_installer_path, helper_args.copy()))
        return tmp_path / "restart-helper.ps1"

    monkeypatch.setattr(updater, "_write_restart_helper", fake_write_helper)

    launch_calls: list[tuple[Path, Path]] = []

    def fake_launch(script_path: Path, helper_updates_dir: Path) -> bool:
        launch_calls.append((script_path, helper_updates_dir))
        return True

    monkeypatch.setattr(updater, "_launch_restart_helper", fake_launch)

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
    assert launch_calls == [(tmp_path / "restart-helper.ps1", updates_dir)]
    assert popen_calls == []
    assert shutdown_requests == [None]
    assert timer_instances and timer_instances[0].interval == 1.0


def test_install_update_falls_back_when_helper_fails(monkeypatch, tmp_path: Path):
    info = _make_update_info()
    updates_dir, installer_path = _prepare_common_mocks(monkeypatch, tmp_path)

    helper_calls: list[tuple[Path, Path, list[str]]] = []

    def fake_write_helper(
        target_executable: Path,
        helper_updates_dir: Path,
        helper_installer_path: Path,
        helper_args: list[str],
    ) -> Path:
        helper_calls.append((target_executable, helper_installer_path, helper_args.copy()))
        return tmp_path / "restart-helper.ps1"

    monkeypatch.setattr(updater, "_write_restart_helper", fake_write_helper)

    def fake_launch(script_path: Path, helper_updates_dir: Path) -> bool:
        return False

    monkeypatch.setattr(updater, "_launch_restart_helper", fake_launch)

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


def test_launch_restart_helper_detects_immediate_exit(monkeypatch, tmp_path: Path):
    script = tmp_path / "helper.ps1"
    script.write_text("exit", encoding="utf-8")

    monkeypatch.setattr(updater, "_resolve_powershell_executable", lambda: "powershell.exe")

    sleeps: list[float] = []
    monkeypatch.setattr(updater.time, "sleep", lambda duration: sleeps.append(duration))

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

    assert updater._launch_restart_helper(script, tmp_path) is False
    assert sleeps == [0.2]
    assert popen_calls


def test_launch_restart_helper_succeeds_when_process_keeps_running(monkeypatch, tmp_path: Path):
    script = tmp_path / "helper.ps1"
    script.write_text("exit", encoding="utf-8")

    monkeypatch.setattr(updater, "_resolve_powershell_executable", lambda: "powershell.exe")

    sleeps: list[float] = []
    monkeypatch.setattr(updater.time, "sleep", lambda duration: sleeps.append(duration))

    class DummyProcess:
        pid = 456

        @staticmethod
        def poll() -> None:
            return None

    monkeypatch.setattr(updater.subprocess, "Popen", lambda *args, **kwargs: DummyProcess())

    assert updater._launch_restart_helper(script, tmp_path) is True
    assert sleeps == [0.2]
