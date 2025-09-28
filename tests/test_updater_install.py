from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend import updater


def test_pick_windows_asset_accepts_plain_executable() -> None:
    asset = {"name": "VlierPlanner-1.4.1.exe", "browser_download_url": "https://example.invalid"}
    result = updater._pick_windows_asset([asset])
    assert result is asset


def test_pick_windows_asset_prefers_setup_named_assets() -> None:
    plain = {"name": "VlierPlanner-1.4.1.exe", "browser_download_url": "https://example.invalid/plain"}
    setup = {"name": "VlierPlanner-Setup-1.4.1.exe", "browser_download_url": "https://example.invalid/setup"}
    result = updater._pick_windows_asset([plain, setup])
    assert result is setup


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


def test_install_update_prefers_python_helper(monkeypatch, tmp_path: Path):
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

    powershell_calls: list[tuple[updater.RestartPlanPaths, Path]] = []

    def fail_powershell(plan_paths: updater.RestartPlanPaths, helper_updates_dir: Path) -> bool:
        powershell_calls.append((plan_paths, helper_updates_dir))
        raise AssertionError("PowerShell helper mag niet worden aangeroepen als Python slaagt")

    monkeypatch.setattr(updater, "_launch_restart_helper", fail_powershell)

    python_helper_calls: list[updater.RestartPlanPaths] = []

    def python_helper(plan: updater.RestartPlanPaths) -> bool:
        python_helper_calls.append(plan)
        return True

    monkeypatch.setattr(updater, "_launch_python_restart_helper", python_helper)

    cleanup_calls: list[updater.RestartPlanPaths] = []

    monkeypatch.setattr(updater, "_cleanup_restart_plan", lambda plan: cleanup_calls.append(plan))

    popen_calls: list[list[str]] = []

    def fake_popen(cmd, **kwargs):  # type: ignore[no-untyped-def]
        popen_calls.append(cmd)
        raise AssertionError("Installer mag niet direct starten als helper slaagt")

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
    assert helper_calls[0][2] == list(updater._SILENT_INSTALL_FLAGS)
    assert python_helper_calls and python_helper_calls[0].plan_path == tmp_path / "restart-plan.json"
    assert powershell_calls == []
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

    python_helper_calls: list[updater.RestartPlanPaths] = []

    def fail_python_helper(plan: updater.RestartPlanPaths) -> bool:
        python_helper_calls.append(plan)
        return False

    monkeypatch.setattr(updater, "_launch_python_restart_helper", fail_python_helper)

    powershell_calls: list[tuple[updater.RestartPlanPaths, Path]] = []

    def fail_powershell(plan_paths: updater.RestartPlanPaths, helper_updates_dir: Path) -> bool:
        powershell_calls.append((plan_paths, helper_updates_dir))
        return False

    monkeypatch.setattr(updater, "_launch_restart_helper", fail_powershell)

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

    def fail_timer(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("Timer should not be used when helper is unavailable")

    monkeypatch.setattr(updater.threading, "Timer", fail_timer)

    result = updater.install_update(info)

    assert result.restart_initiated is False
    assert result.installer_path == installer_path
    assert helper_calls and helper_calls[0][1] == installer_path
    assert helper_calls[0][2] == list(updater._SILENT_INSTALL_FLAGS)
    assert python_helper_calls and len(python_helper_calls) == 2
    assert python_helper_calls[0].plan_path == tmp_path / "restart-plan.json"
    assert powershell_calls and powershell_calls[0][0].plan_path == tmp_path / "restart-plan.json"
    assert popen_calls == [[str(installer_path), *updater._SILENT_INSTALL_FLAGS]]
    assert shutdown_requests == [None]
    assert cleanup_calls and cleanup_calls[0].plan_path == tmp_path / "restart-plan.json"


def test_install_update_uses_powershell_when_python_fails(monkeypatch, tmp_path: Path):
    info = _make_update_info()
    updates_dir, installer_path = _prepare_common_mocks(monkeypatch, tmp_path)

    def fake_write_helper(
        target_executable: Path,
        helper_updates_dir: Path,
        helper_installer_path: Path,
        helper_args: list[str],
    ) -> updater.RestartPlanPaths:
        plan_path = tmp_path / "restart-plan.json"
        script_path = tmp_path / "restart-plan.ps1"
        log_path = tmp_path / "restart-helper.log"
        return updater.RestartPlanPaths(plan_path=plan_path, script_path=script_path, log_path=log_path)

    monkeypatch.setattr(updater, "_write_restart_plan", fake_write_helper)

    powershell_calls: list[tuple[updater.RestartPlanPaths, Path]] = []

    def powershell_helper(plan_paths: updater.RestartPlanPaths, helper_updates_dir: Path) -> bool:
        powershell_calls.append((plan_paths, helper_updates_dir))
        return True

    monkeypatch.setattr(updater, "_launch_restart_helper", powershell_helper)

    python_helper_calls: list[updater.RestartPlanPaths] = []

    def python_helper(plan: updater.RestartPlanPaths) -> bool:
        python_helper_calls.append(plan)
        return False

    monkeypatch.setattr(updater, "_launch_python_restart_helper", python_helper)

    cleanup_calls: list[updater.RestartPlanPaths] = []
    monkeypatch.setattr(updater, "_cleanup_restart_plan", lambda plan: cleanup_calls.append(plan))

    def fail_popen(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("Installer mag niet direct starten als helper slaagt")

    monkeypatch.setattr(updater.subprocess, "Popen", fail_popen)

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

    timers: list[DummyTimer] = []

    def fake_timer(interval: float, func):
        timer = DummyTimer(interval, func)
        timers.append(timer)
        return timer

    monkeypatch.setattr(updater.threading, "Timer", fake_timer)

    result = updater.install_update(info)

    assert result.restart_initiated is True
    assert result.installer_path == installer_path
    assert python_helper_calls and python_helper_calls[0].plan_path == tmp_path / "restart-plan.json"
    assert powershell_calls and powershell_calls[0][0].plan_path == tmp_path / "restart-plan.json"
    assert cleanup_calls == []
    assert shutdown_requests == [None]
    assert timers and timers[0].interval == 1.0


def test_install_update_rewrites_plan_when_helper_removed(monkeypatch, tmp_path: Path):
    info = _make_update_info()
    updates_dir, installer_path = _prepare_common_mocks(monkeypatch, tmp_path)

    helper_calls: list[updater.RestartPlanPaths] = []

    def fake_write_helper(
        target_executable: Path,
        helper_updates_dir: Path,
        helper_installer_path: Path,
        helper_args: list[str],
    ) -> updater.RestartPlanPaths:
        index = len(helper_calls)
        plan_path = tmp_path / f"restart-plan-{index}.json"
        script_path = tmp_path / f"restart-plan-{index}.ps1"
        log_path = tmp_path / "restart-helper.log"
        plan_path.write_text("{}", encoding="utf-8")
        script_path.write_text("Write-Output 'test'", encoding="utf-8")
        plan_paths = updater.RestartPlanPaths(plan_path=plan_path, script_path=script_path, log_path=log_path)
        helper_calls.append(plan_paths)
        return plan_paths

    monkeypatch.setattr(updater, "_write_restart_plan", fake_write_helper)

    def fake_launch(plan_paths: updater.RestartPlanPaths, helper_updates_dir: Path) -> bool:
        plan_paths.plan_path.unlink(missing_ok=True)
        plan_paths.script_path.unlink(missing_ok=True)
        return False

    monkeypatch.setattr(updater, "_launch_restart_helper", fake_launch)

    python_helper_calls: list[updater.RestartPlanPaths] = []

    def python_helper(plan: updater.RestartPlanPaths) -> bool:
        python_helper_calls.append(plan)
        # First attempt fails so that PowerShell runs and removes the plan
        return len(python_helper_calls) > 1

    monkeypatch.setattr(updater, "_launch_python_restart_helper", python_helper)

    cleanup_calls: list[updater.RestartPlanPaths] = []
    monkeypatch.setattr(updater, "_cleanup_restart_plan", lambda plan: cleanup_calls.append(plan))

    shutdown_requests: list[None] = []
    monkeypatch.setattr(updater, "_request_app_shutdown", lambda: shutdown_requests.append(None))

    timers: list[float] = []

    class DummyTimer:
        def __init__(self, interval: float, func):
            self.interval = interval
            timers.append(interval)
            self.func = func

        def start(self) -> None:
            self.func()

    monkeypatch.setattr(updater.threading, "Timer", DummyTimer)

    result = updater.install_update(info)

    assert result.restart_initiated is True
    assert result.installer_path == installer_path
    assert len(helper_calls) == 2
    assert helper_calls[0].plan_path.name == "restart-plan-0.json"
    assert helper_calls[1].plan_path.name == "restart-plan-1.json"
    assert python_helper_calls and python_helper_calls[-1] == helper_calls[1]
    assert cleanup_calls == []
    assert shutdown_requests == [None]
    assert timers and timers[0] == 1.0


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


def test_launch_python_restart_helper_copies_runtime(monkeypatch, tmp_path: Path):
    runtime_dir = tmp_path / "runtime"
    runtime_dir.mkdir()
    updates_dir = runtime_dir / "updates"
    updates_dir.mkdir()

    plan_paths = updater.RestartPlanPaths(
        plan_path=updates_dir / "restart-plan.json",
        script_path=updates_dir / "restart-plan.ps1",
        log_path=updates_dir / "restart-helper.log",
    )

    plan_paths.plan_path.write_text(json.dumps({}), encoding="utf-8")

    original_executable = runtime_dir / "VlierPlanner.exe"
    original_executable.write_bytes(b"binary")
    dll_file = runtime_dir / "python311.dll"
    dll_file.write_bytes(b"dll")
    data_dir = runtime_dir / "backend"
    data_dir.mkdir()
    (data_dir / "__init__.py").write_text("", encoding="utf-8")

    (updates_dir / "existing.txt").write_text("keep", encoding="utf-8")

    monkeypatch.setattr(updater.sys, "executable", str(original_executable))

    class DummyUuid:
        hex = "abc123"

    monkeypatch.setattr(updater.uuid, "uuid4", lambda: DummyUuid())

    sleeps: list[float] = []
    monkeypatch.setattr(updater.time, "sleep", lambda duration: sleeps.append(duration))

    class DummyProcess:
        pid = 999

        @staticmethod
        def poll() -> None:
            return None

    popen_calls: list[list[str]] = []

    def fake_popen(cmd, **kwargs):  # type: ignore[no-untyped-def]
        popen_calls.append(cmd)
        return DummyProcess()

    monkeypatch.setattr(updater.subprocess, "Popen", fake_popen)

    assert updater._launch_python_restart_helper(plan_paths) is True

    helper_dir = updates_dir / "python-helper-abc123"
    helper_path = helper_dir / "VlierPlanner.exe"
    assert helper_path.exists()
    assert helper_path.read_bytes() == original_executable.read_bytes()
    assert (helper_dir / "python311.dll").read_bytes() == dll_file.read_bytes()
    assert (helper_dir / "backend" / "__init__.py").exists()
    assert not any(child.name == "updates" for child in helper_dir.iterdir())
    assert sleeps == [0.2]
    assert popen_calls == [[str(helper_path), "--apply-update", str(plan_paths.plan_path)]]

    plan_data = json.loads(plan_paths.plan_path.read_text(encoding="utf-8"))
    assert plan_data["python_helper_executable"] == str(helper_path)
    assert plan_data["python_helper_cleanup_dir"] == str(helper_dir)


def test_cleanup_restart_plan_removes_helper(tmp_path: Path):
    plan_paths = updater.RestartPlanPaths(
        plan_path=tmp_path / "restart-plan.json",
        script_path=tmp_path / "restart-plan.ps1",
        log_path=tmp_path / "restart-helper.log",
    )

    helper_dir = tmp_path / "python-helper"
    helper_dir.mkdir()
    helper_path = helper_dir / "python-helper.exe"
    helper_path.write_text("helper", encoding="utf-8")
    (helper_dir / "extra.txt").write_text("data", encoding="utf-8")
    plan_paths.plan_path.write_text(
        json.dumps(
            {
                "python_helper_executable": str(helper_path),
                "python_helper_cleanup_dir": str(helper_dir),
            }
        ),
        encoding="utf-8",
    )
    plan_paths.script_path.write_text("Write-Output", encoding="utf-8")

    updater._cleanup_restart_plan(plan_paths)

    assert plan_paths.plan_path.exists() is False
    assert plan_paths.script_path.exists() is False
    assert helper_path.exists() is False
    assert helper_dir.exists() is False


def test_cleanup_python_helper_directories_removes_matches(tmp_path: Path):
    updates_dir = tmp_path / "updates"
    updates_dir.mkdir()

    helper_dir = updates_dir / "python-helper-xyz"
    helper_dir.mkdir()
    (helper_dir / "dummy.txt").write_text("data", encoding="utf-8")

    legacy_helper = updates_dir / "python-helper"
    legacy_helper.mkdir()

    keep_dir = updates_dir / "anders"
    keep_dir.mkdir()

    updater._cleanup_python_helper_directories(updates_dir)

    assert helper_dir.exists() is False
    assert legacy_helper.exists() is False
    assert keep_dir.exists() is True


def test_should_use_silent_install_defaults_to_true(monkeypatch):
    monkeypatch.delenv("VLIER_UPDATE_SILENT", raising=False)
    assert updater._should_use_silent_install() is True


@pytest.mark.parametrize(
    "value, expected",
    [
        ("0", False),
        ("false", False),
        ("no", False),
        ("off", False),
        ("1", True),
        ("true", True),
        ("yes", True),
        ("on", True),
        ("unexpected", True),
        ("   ", True),
    ],
)
def test_should_use_silent_install_env_overrides(monkeypatch, value, expected):
    monkeypatch.setenv("VLIER_UPDATE_SILENT", value)
    assert updater._should_use_silent_install() is expected


