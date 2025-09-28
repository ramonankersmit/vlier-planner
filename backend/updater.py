"""Utilities for checking and installing application updates."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Final
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from packaging import version as packaging_version
from httpx import HTTPError

try:  # pragma: no cover - allow running as module or package
    from .version import __version__
    from . import update_checker
except ImportError:  # pragma: no cover - fallback when executed as a script
    from version import __version__  # type: ignore
    import update_checker  # type: ignore

APP_VERSION = __version__

LOGGER = logging.getLogger(__name__)

REPO_SLUG: Final[str] = os.getenv("VLIER_UPDATE_REPO", "ramonankersmit/vlier-planner")
APP_NAME: Final[str] = os.getenv("VLIER_UPDATE_APP_NAME", "VlierPlanner")
_CACHE_TTL_SECONDS: Final[int] = 15 * 60


class UpdateError(RuntimeError):
    """Raised when checking or installing an update fails."""


@dataclass(frozen=True, slots=True)
class UpdateInfo:
    """Information about an available update."""

    current_version: str
    latest_version: str
    asset_name: str
    download_url: str
    release_notes: str | None
    sha256: str | None


@dataclass(frozen=True, slots=True)
class InstallResult:
    """Details about an update installation attempt."""

    installer_path: Path
    restart_initiated: bool


@dataclass(frozen=True, slots=True)
class RestartPlanPaths:
    """File-system locations that make up the restart helper plan."""

    plan_path: Path
    script_path: Path
    log_path: Path


_CACHE: tuple[float, UpdateInfo | None] | None = None
_SHUTDOWN_CALLBACK: Callable[[], None] | None = None
_FORCED_EXIT_DELAY_SECONDS: Final[float] = 30.0
_TRUE_VALUES: Final[set[str]] = {"1", "true", "yes", "on"}
_FALSE_VALUES: Final[set[str]] = {"0", "false", "no", "off"}
_SILENT_INSTALL_FLAGS: Final[tuple[str, ...]] = (
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/SP-",
    "/NOCANCEL",
    "/NORESTART",
    "/CLOSEAPPLICATIONS",
    "/RESTARTAPPLICATIONS=No",
    "/LANG=nl",
)


def _user_agent() -> str:
    return f"{APP_NAME}/update-check"


def _download(url: str, destination: Path) -> Path:
    request = Request(url, headers={"User-Agent": _user_agent()})
    with urlopen(request, timeout=60) as response, destination.open("wb") as file:  # noqa: S310
        shutil.copyfileobj(response, file)
    return destination


def _sha256sum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_version(value: str) -> packaging_version.Version | None:
    try:
        return packaging_version.Version(value)
    except packaging_version.InvalidVersion:
        LOGGER.warning("Ongeldige versiestring: %s", value)
        return None


def _extract_sha256(notes: str | None) -> str | None:
    if not notes:
        return None
    for line in notes.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        if key.strip().upper() == "SHA256":
            checksum = value.strip()
            if checksum:
                return checksum
    return None


def _pick_windows_asset(assets: list[dict[str, Any]]) -> dict[str, Any] | None:
    preferred: list[dict[str, Any]] = []
    fallbacks: list[dict[str, Any]] = []
    for asset in assets:
        name = str(asset.get("name", ""))
        if not name.lower().endswith((".exe", ".msi")):
            continue

        lowered = name.lower()
        if any(keyword in lowered for keyword in ("setup", "installer", "win")):
            preferred.append(asset)
        else:
            fallbacks.append(asset)

    if preferred:
        return preferred[0]

    if fallbacks:
        return fallbacks[0]

    return None


def _resolve_updates_dir() -> Path:
    if sys.platform == "win32":
        base = os.getenv("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = os.getenv("XDG_DATA_HOME") or (Path.home() / ".local" / "share")

    updates_dir = Path(base) / APP_NAME / "updates"
    updates_dir.mkdir(parents=True, exist_ok=True)
    return updates_dir


def _fetch_update_info() -> UpdateInfo | None:
    try:
        latest = update_checker.fetch_latest_release(include_prereleases=True)
    except HTTPError as exc:  # pragma: no cover - netwerkafhankelijk
        raise UpdateError(f"Kon release-informatie niet ophalen: {exc}") from exc
    except Exception as exc:  # pragma: no cover - defensief
        raise UpdateError(f"Onbekende fout tijdens update-check: {exc}") from exc

    if not latest:
        return None

    latest_version_str = str(latest.get("version", "")).strip()
    if not latest_version_str:
        return None

    latest_version = _parse_version(latest_version_str)
    current_version = _parse_version(APP_VERSION)

    if latest_version is None or current_version is None:
        return None

    if latest_version <= current_version:
        return None

    download_url = latest.get("asset_url")
    if not download_url:
        LOGGER.info("Geen Windows release asset gevonden in release %s", latest_version_str)
        return None

    asset_name = latest.get("asset_name")
    if not asset_name:
        parsed = urlparse(str(download_url))
        asset_name = Path(parsed.path).name or f"update-{latest_version_str}.exe"

    notes = latest.get("notes")
    checksum = _extract_sha256(notes)

    return UpdateInfo(
        current_version=APP_VERSION,
        latest_version=latest_version_str,
        asset_name=str(asset_name),
        download_url=str(download_url),
        release_notes=notes,
        sha256=checksum,
    )


def register_shutdown_callback(callback: Callable[[], None] | None) -> None:
    """Register a callable that requests a graceful application shutdown."""

    global _SHUTDOWN_CALLBACK
    _SHUTDOWN_CALLBACK = callback


def check_for_update(force: bool = False) -> UpdateInfo | None:
    """Return information about an available update, if any."""

    global _CACHE

    if not force and _CACHE is not None:
        timestamp, cached = _CACHE
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return cached

    info = _fetch_update_info()
    _CACHE = (time.time(), info)
    return info


def _should_use_silent_install() -> bool:
    value = os.getenv("VLIER_UPDATE_SILENT")
    if value is None:
        return True

    lowered = value.strip().lower()
    if not lowered:
        return True

    if lowered in _TRUE_VALUES:
        return True

    if lowered in _FALSE_VALUES:
        return False

    return True


def _powershell_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _build_restart_helper_script() -> str:
    script = textwrap.dedent(
        '''
        param([string]$PlanJsonPath)

        $ErrorActionPreference = "Stop"
        $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        if (-not $PlanJsonPath) {
          $PlanJsonPath = Get-ChildItem -LiteralPath $ScriptDir -Filter "apply-update-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }
        }
        if (-not (Test-Path $PlanJsonPath)) { throw "Plan JSON niet gevonden in $ScriptDir" }

        function Write-Log([string]$msg) {
          $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
          $line = "[$ts] $msg"
          Write-Output $line
          if ($global:LOG_PATH) { Add-Content -LiteralPath $global:LOG_PATH -Value $line }
        }
        function Read-Json([string]$p) { Get-Content -LiteralPath $p -Raw | ConvertFrom-Json }
        function Wait-For-ProcessExit([int]$pid,[int]$t=300){ if(-not $pid){return $true};$sw=[Diagnostics.Stopwatch]::StartNew();while($sw.Elapsed.TotalSeconds -lt $t){try{Get-Process -Id $pid -ErrorAction Stop|Out-Null;Start-Sleep -Milliseconds 500}catch{return $true}};return $false}
        function Wait-For-FileUnlock([string]$path,[int]$t=120){$sw=[Diagnostics.Stopwatch]::StartNew();$dir=Split-Path -Parent $path;$tmp=Join-Path $dir ("."+[IO.Path]::GetFileName($path)+".lockcheck");while($sw.Elapsed.TotalSeconds -lt $t){try{if(Test-Path $tmp){Remove-Item $tmp -Force -ErrorAction SilentlyContinue};Rename-Item $path (Split-Path -Leaf $tmp);Rename-Item $tmp (Split-Path -Leaf $path);return $true}catch{Start-Sleep -Milliseconds 700}};return $false}
        function Try-DeleteOrQuarantine([string]$path,[int]$t=20){if(-not(Test-Path $path)){return $true};$sw=[Diagnostics.Stopwatch]::StartNew();while($sw.Elapsed.TotalSeconds -lt $t){try{Remove-Item $path -Force;return $true}catch{try{$old="$path.old";if(Test-Path $old){Remove-Item $old -Force -ErrorAction SilentlyContinue};Move-Item $path $old -Force;return $true}catch{Start-Sleep -Milliseconds 500}}};return $false}

        # ---- Start ----
        $Plan = Read-Json $PlanJsonPath
        $global:LOG_PATH = if ($Plan.log_path) { $Plan.log_path } else { Join-Path $ScriptDir "restart-helper.log" }
        "--- VlierPlanner update helper gestart ---" | Set-Content -LiteralPath $global:LOG_PATH

        $originalPid      = [int]$Plan.original_pid
        $targetExecutable = [string]$Plan.target_executable
        $installerPath    = [string]$Plan.installer_path

        $installerLog = Join-Path $ScriptDir "installer.log"
        $installerArgs = @("/VERYSILENT","/SUPPRESSMSGBOXES","/SP-","/NOCANCEL","/NORESTART","/CLOSEAPPLICATIONS","/RESTARTAPPLICATIONS=No","/LANG=nl","/LOG=""$installerLog"")

        Write-Log "Plan: PID=$originalPid"
        Write-Log "EXE : $targetExecutable"
        Write-Log "Installer: $installerPath"
        Write-Log "Args: $($installerArgs -join ' ')"
        Write-Log "Installerlog: $installerLog"

        if ($originalPid -gt 0) {
          Write-Log "Wachten op proces $originalPid…"
          if (Wait-For-ProcessExit -pid $originalPid -timeoutSec 300) { Write-Log "Origineel proces is gestopt." } else { Write-Log "Time-out bij wachten op proces" }
        }

        if ($targetExecutable -and (Test-Path $targetExecutable)) {
          Write-Log "Controleren of $targetExecutable vrijgegeven is…"
          if (Wait-For-FileUnlock -path $targetExecutable -timeoutSec 120) {
            Write-Log "EXE lijkt vrij (rename-check ok). Probeer te verwijderen/verplaatsen…"
            if (Try-DeleteOrQuarantine -path $targetExecutable -timeoutSec 20) { Write-Log "Oude EXE verwijderd of naar .old verplaatst." }
            else { Write-Log "WAARSCHUWING: EXE blijft gelockt; installer moet het afsluiten." }
          } else { Write-Log "WAARSCHUWING: rename-check faalde; installer moet het afsluiten." }
        }

        if (-not (Test-Path $installerPath)) { throw "Installer niet gevonden: $installerPath" }
        Write-Log "Start installer…"
        $proc = Start-Process -FilePath $installerPath -ArgumentList $installerArgs -Wait -PassThru -ErrorAction Stop
        $code = $proc.ExitCode
        Write-Log "Installer exit code: $code"

        $cleanupTargets = @()
        $oldCandidate = "$targetExecutable.old"
        if (Test-Path $oldCandidate) { $cleanupTargets += $oldCandidate }
        if (Test-Path $installerPath) { $cleanupTargets += $installerPath }

        if ($code -eq 0 -and $targetExecutable) {
          try {
            Write-Log "Start nieuwe app: $targetExecutable"
            Start-Process -FilePath $targetExecutable | Out-Null
            Write-Log "Herstart gelukt."
          } catch { Write-Log "Kon app niet starten: $($_.Exception.Message)" }
          foreach ($c in $cleanupTargets) {
            try { Remove-Item -LiteralPath $c -Force; Write-Log "Opgeruimd: $c" } catch { Write-Log "Kon niet opruimen: $c ($($_.Exception.Message))" }
          }
        } else {
          Write-Log "Installer geen succes; zie $installerLog voor detail."
        }
        Write-Log "--- Helper klaar ---"
        '''
    ).strip()

    return script + "\n"

def _write_restart_plan(
    target_executable: Path,
    updates_dir: Path,
    installer_path: Path,
    installer_args: list[str],
) -> RestartPlanPaths | None:
    plan_id = uuid.uuid4().hex
    plan_path = updates_dir / f"apply-update-{plan_id}.json"
    script_path = plan_path.with_suffix(".ps1")
    log_path = updates_dir / "restart-helper.log"

    try:
        log_path.write_text("", encoding="utf-8")
    except OSError as exc:  # pragma: no cover - best effort
        LOGGER.warning("Kon helperlog niet initialiseren: %s", exc)

    plan = {
        "original_pid": os.getpid(),
        "target_executable": str(target_executable),
        "installer_path": str(installer_path),
        "installer_args": installer_args,
        "log_path": str(log_path),
        "script_path": str(script_path),
        "python_helper_executable": None,
        "python_helper_cleanup_dir": None,
    }

    try:
        plan_path.write_text(json.dumps(plan), encoding="utf-8")
    except OSError as exc:  # pragma: no cover - best effort
        LOGGER.warning("Kon herstartplan niet schrijven: %s", exc)
        return None

    script_content = _build_restart_helper_script()

    try:
        script_path.write_text(script_content, encoding="utf-8")
    except OSError as exc:  # pragma: no cover - best effort
        LOGGER.warning("Kon helper script niet schrijven: %s", exc)
        try:
            plan_path.unlink(missing_ok=True)
        except OSError:
            pass
        return None

    return RestartPlanPaths(plan_path=plan_path, script_path=script_path, log_path=log_path)


def _resolve_powershell_executable() -> Path | None:
    names = ("powershell.exe", "pwsh.exe")

    path_env = os.getenv("PATH")
    if path_env:
        for entry in path_env.split(os.pathsep):
            entry = entry.strip()
            if not entry:
                continue
            for name in names:
                candidate = Path(entry) / name
                if candidate.exists():
                    return candidate

    system_root = os.getenv("SystemRoot")
    if system_root:
        system_root_path = Path(system_root)
        system32_candidate = system_root_path / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        if system32_candidate.exists():
            return system32_candidate
        syswow_candidate = system_root_path / "SysWOW64" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        if syswow_candidate.exists():
            return syswow_candidate

    for env_var in ("ProgramFiles", "ProgramFiles(x86)"):
        base = os.getenv(env_var)
        if not base:
            continue
        root = Path(base) / "PowerShell"
        if not root.exists():
            continue
        try:
            candidate_dirs = sorted(root.iterdir(), reverse=True)
        except OSError:
            continue
        for candidate_dir in candidate_dirs:
            candidate = candidate_dir / "pwsh.exe"
            if candidate.exists():
                return candidate

    return None


def _cleanup_restart_plan(plan_paths: RestartPlanPaths) -> None:
    helper_executable: Path | None = None
    helper_cleanup_dir: Path | None = None

    try:
        raw = plan_paths.plan_path.read_text(encoding="utf-8")
    except OSError:
        raw = None

    if raw:
        try:
            plan_data = json.loads(raw)
        except json.JSONDecodeError:
            plan_data = None
        else:
            helper_value = plan_data.get("python_helper_executable") if isinstance(plan_data, dict) else None
            if isinstance(helper_value, str) and helper_value:
                helper_executable = Path(helper_value)

            cleanup_value = (
                plan_data.get("python_helper_cleanup_dir")
                if isinstance(plan_data, dict)
                else None
            )
            if isinstance(cleanup_value, str) and cleanup_value:
                helper_cleanup_dir = Path(cleanup_value)

    for path in (plan_paths.plan_path, plan_paths.script_path):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass

    if helper_executable is not None:
        try:
            helper_executable.unlink(missing_ok=True)
        except OSError:
            pass

    if helper_cleanup_dir is not None:
        shutil.rmtree(helper_cleanup_dir, ignore_errors=True)


def _launch_restart_helper(plan_paths: RestartPlanPaths, updates_dir: Path) -> bool:
    powershell = _resolve_powershell_executable()
    if powershell is None:
        LOGGER.warning("Kon PowerShell niet vinden; helper wordt niet gestart")
        return False

    creationflags = 0
    if hasattr(subprocess, "DETACHED_PROCESS"):
        creationflags |= getattr(subprocess, "DETACHED_PROCESS")
    if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
        creationflags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP")

    if hasattr(subprocess, "CREATE_NO_WINDOW"):
        creationflags |= getattr(subprocess, "CREATE_NO_WINDOW")

    try:
        process = subprocess.Popen(  # noqa: S603 - gecontroleerde command
            [
                str(powershell),
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(plan_paths.script_path),
            ],
            cwd=str(updates_dir),
            creationflags=creationflags,
            close_fds=False,
        )
    except Exception as exc:  # pragma: no cover - afhankelijk van platform
        LOGGER.warning("Kon herstartproces niet starten: %s", exc)
        return False

    time.sleep(0.2)
    exit_code = process.poll()
    if exit_code is not None:
        LOGGER.warning(
            "Herstarthelper stopte direct met code %s; val terug naar directe installatie",
            exit_code,
        )
        return False

    LOGGER.info("PowerShell-herstarthelper gestart met proces-ID %s", process.pid)

    return True


def _launch_python_restart_helper(plan_paths: RestartPlanPaths) -> bool:
    """Fallback helper that reuses the packaged runtime in helper mode."""

    target_executable = Path(sys.executable).resolve()
    helper_dir = plan_paths.plan_path.parent / f"python-helper-{uuid.uuid4().hex}"
    updates_root = plan_paths.plan_path.parent.resolve()

    def _ignore_updates(directory: str, names: list[str]) -> set[str]:
        ignored: set[str] = set()
        for name in names:
            candidate = Path(directory) / name
            try:
                resolved = candidate.resolve()
            except OSError:
                resolved = candidate

            if resolved == updates_root:
                ignored.add(name)
                continue

            if name.lower() == "updates":
                ignored.add(name)
        return ignored

    try:
        shutil.copytree(
            target_executable.parent,
            helper_dir,
            ignore=_ignore_updates,
        )
    except OSError as exc:
        LOGGER.warning("Kon helpermap niet kopiëren: %s", exc)
        shutil.rmtree(helper_dir, ignore_errors=True)
        return False

    helper_executable = helper_dir / target_executable.name

    if not helper_executable.exists():
        LOGGER.warning("Helper-executable ontbrak na kopiëren; helper wordt verwijderd")
        shutil.rmtree(helper_dir, ignore_errors=True)
        return False

    try:
        raw = plan_paths.plan_path.read_text(encoding="utf-8")
    except OSError as exc:
        LOGGER.warning("Kon herstartplan niet openen voor helperkopie: %s", exc)
        shutil.rmtree(helper_dir, ignore_errors=True)
        return False

    try:
        plan_data = json.loads(raw)
    except json.JSONDecodeError as exc:
        LOGGER.warning("Kon herstartplan niet bijwerken voor helperkopie: %s", exc)
        shutil.rmtree(helper_dir, ignore_errors=True)
        return False

    if not isinstance(plan_data, dict):
        LOGGER.warning("Onverwachte structuur in herstartplan; helpermap wordt verwijderd")
        shutil.rmtree(helper_dir, ignore_errors=True)
        return False

    plan_data["python_helper_executable"] = str(helper_executable)
    plan_data["python_helper_cleanup_dir"] = str(helper_dir)

    try:
        plan_paths.plan_path.write_text(json.dumps(plan_data), encoding="utf-8")
    except OSError as exc:
        LOGGER.warning("Kon herstartplan niet opslaan voor helperkopie: %s", exc)
        shutil.rmtree(helper_dir, ignore_errors=True)
        return False

    try:
        process = subprocess.Popen(  # noqa: S603 - gecontroleerde command
            [
                str(helper_executable),
                "--apply-update",
                str(plan_paths.plan_path),
            ],
            cwd=str(helper_dir),
            close_fds=False,
        )
    except Exception as exc:  # pragma: no cover - afhankelijk van platform
        LOGGER.warning("Kon Python-herstarthelper niet starten: %s", exc)
        shutil.rmtree(helper_dir, ignore_errors=True)
        return False

    time.sleep(0.2)
    exit_code = process.poll()
    if exit_code is not None:
        LOGGER.warning(
            "Python-herstarthelper stopte direct met code %s", exit_code
        )
        shutil.rmtree(helper_dir, ignore_errors=True)
        return False

    LOGGER.info("Python-herstarthelper gestart met proces-ID %s", process.pid)
    return True


def _request_app_shutdown() -> None:
    """Ask the running application to exit, falling back to ``os._exit``."""

    callback = _SHUTDOWN_CALLBACK
    if callback is None:
        os._exit(0)
        return

    try:
        callback()
    except Exception as exc:  # pragma: no cover - defensief
        LOGGER.warning("Automatische afsluitcallback mislukte: %s", exc)
        os._exit(0)
        return

    def _force_exit() -> None:
        LOGGER.info("Geforceerd afsluiten na update")
        os._exit(0)

    threading.Timer(_FORCED_EXIT_DELAY_SECONDS, _force_exit).start()


def install_update(info: UpdateInfo, *, silent: bool | None = None) -> InstallResult:
    """Download the installer for ``info`` and start the installation.

    Returns an :class:`InstallResult` describing the started installation.
    """

    if sys.platform != "win32":
        raise UpdateError("Automatische updates worden alleen op Windows ondersteund")

    updates_dir = _resolve_updates_dir()
    destination = updates_dir / info.asset_name

    try:
        _download(info.download_url, destination)
    except URLError as exc:  # pragma: no cover - netwerkafhankelijk
        raise UpdateError(f"Download van update mislukt: {exc}") from exc
    except TimeoutError as exc:  # pragma: no cover - netwerkafhankelijk
        raise UpdateError("Timeout tijdens download van update") from exc
    except Exception as exc:  # pragma: no cover - defensief
        raise UpdateError(f"Onbekende fout tijdens download: {exc}") from exc

    if info.sha256:
        actual = _sha256sum(destination)
        if actual.lower() != info.sha256.lower():
            try:
                destination.unlink(missing_ok=True)
            except Exception:  # pragma: no cover - best effort
                LOGGER.warning("Kon corrupt updatebestand niet verwijderen: %s", destination)
            raise UpdateError("Controle van de bestandshandtekening is mislukt")

    use_silent = _should_use_silent_install() if silent is None else silent
    flags: list[str] = list(_SILENT_INSTALL_FLAGS) if use_silent else []

    restart_initiated = False
    target_executable = Path(sys.executable).resolve()

    helper_plan = _write_restart_plan(
        target_executable,
        updates_dir,
        destination,
        flags,
    )

    if helper_plan is not None:
        python_helper_started = _launch_python_restart_helper(helper_plan)
        if python_helper_started:
            restart_initiated = True
            LOGGER.info(
                "Automatische herstart wordt uitgevoerd door de Python-helper"
            )
        else:
            powershell_started = _launch_restart_helper(helper_plan, updates_dir)
            if powershell_started:
                restart_initiated = True
                LOGGER.info(
                    "Automatische herstart en installatie worden uitgevoerd via %s",
                    helper_plan.script_path,
                )
            else:
                if not helper_plan.plan_path.exists():
                    helper_plan = _write_restart_plan(
                        target_executable,
                        updates_dir,
                        destination,
                        flags,
                    )

                if helper_plan is not None:
                    python_helper_started = _launch_python_restart_helper(helper_plan)
                    if python_helper_started:
                        restart_initiated = True
                        LOGGER.info(
                            "Automatische herstart wordt uitgevoerd door de Python-helper"
                        )
                    else:
                        _cleanup_restart_plan(helper_plan)
                else:
                    LOGGER.warning(
                        "Kon herstartplan niet opnieuw schrijven voor Python-helper"
                    )

    if not restart_initiated:
        try:
            subprocess.Popen(  # noqa: S603,S607 - gecontroleerde command
                [str(destination), *flags],
                shell=False,
                close_fds=True,
            )
        except Exception as exc:  # pragma: no cover - afhankelijk van platform
            raise UpdateError(f"Kon installer niet starten: {exc}") from exc

    def _terminate() -> None:
        LOGGER.info("Applicatie wordt afgesloten voor update")
        _request_app_shutdown()

    if restart_initiated:
        threading.Timer(1.0, _terminate).start()
    else:
        _terminate()
    return InstallResult(installer_path=destination, restart_initiated=restart_initiated)


__all__ = [
    "InstallResult",
    "UpdateError",
    "UpdateInfo",
    "register_shutdown_callback",
    "check_for_update",
    "install_update",
]

