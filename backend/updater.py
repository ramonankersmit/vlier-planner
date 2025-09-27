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
from urllib.request import Request, urlopen

from packaging import version as packaging_version

try:  # pragma: no cover - allow running as module or package
    from .version import APP_VERSION
except ImportError:  # pragma: no cover - fallback when executed as a script
    from version import APP_VERSION  # type: ignore

LOGGER = logging.getLogger(__name__)

REPO_SLUG: Final[str] = os.getenv("VLIER_UPDATE_REPO", "ramonankersmit/vlier-planner")
API_LATEST: Final[str] = f"https://api.github.com/repos/{REPO_SLUG}/releases/latest"
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


def _user_agent() -> str:
    return f"{APP_NAME}/update-check"


def _http_get_json(url: str) -> Any:
    request = Request(url, headers={"User-Agent": _user_agent()})
    with urlopen(request, timeout=20) as response:  # noqa: S310 - controlled URL
        data = response.read()
    return json.loads(data.decode("utf-8"))


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
    candidates: list[dict[str, Any]] = []
    for asset in assets:
        name = str(asset.get("name", ""))
        if not name.lower().endswith((".exe", ".msi")):
            continue
        if "win" not in name.lower() and "setup" not in name.lower():
            continue
        candidates.append(asset)

    if not candidates:
        return None

    for candidate in candidates:
        name = str(candidate.get("name", ""))
        if "setup" in name.lower() or "installer" in name.lower():
            return candidate

    return candidates[0]


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
        payload = _http_get_json(API_LATEST)
    except URLError as exc:  # pragma: no cover - netwerkafhankelijk
        raise UpdateError(f"Kon release-informatie niet ophalen: {exc}") from exc
    except TimeoutError as exc:  # pragma: no cover - netwerkafhankelijk
        raise UpdateError("Timeout bij ophalen van release-informatie") from exc
    except Exception as exc:  # pragma: no cover - defensief
        raise UpdateError(f"Onbekende fout tijdens update-check: {exc}") from exc

    latest_tag = str(payload.get("tag_name", "")).strip()
    if not latest_tag:
        return None
    latest_version_str = latest_tag.lstrip("v")

    asset = _pick_windows_asset(payload.get("assets", []) or [])
    if not asset:
        LOGGER.info("Geen Windows release asset gevonden in release %s", latest_tag)
        return None

    latest_version = _parse_version(latest_version_str)
    current_version = _parse_version(APP_VERSION)

    if latest_version is None or current_version is None:
        return None

    if latest_version <= current_version:
        return None

    notes = payload.get("body")
    checksum = _extract_sha256(notes)

    download_url = str(asset.get("browser_download_url"))
    if not download_url:
        LOGGER.info("Release asset mist download URL")
        return None

    asset_name = str(asset.get("name", "")) or f"update-{latest_version_str}.exe"

    return UpdateInfo(
        current_version=APP_VERSION,
        latest_version=latest_version_str,
        asset_name=asset_name,
        download_url=download_url,
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
    return os.getenv("VLIER_UPDATE_SILENT", "").strip().lower() in {"1", "true", "yes", "on"}


def _powershell_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _build_restart_helper_script(plan_path: Path, log_path: Path) -> str:
    plan_literal = _powershell_quote(str(plan_path))
    log_literal = _powershell_quote(str(log_path))

    script = textwrap.dedent(
        f"""
        Set-StrictMode -Version Latest
        $ErrorActionPreference = 'Stop'
        $PlanPath = {plan_literal}
        $LogPath = {log_literal}
        $ScriptPath = $MyInvocation.MyCommand.Path

        function Write-HelperLog {{
            param([string]$Message)
            $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
            $line = "[{0}] {1}" -f $timestamp, $Message
            try {{
                $logDir = Split-Path -Path $LogPath -Parent
                if ($logDir -and -not (Test-Path -Path $logDir)) {{
                    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
                }}
                $line | Out-File -FilePath $LogPath -Append -Encoding UTF8
            }} catch {{}}
        }}

        function Wait-ForProcessExit {{
            param([int]$Pid)

            if ($Pid -le 0) {{
                Write-HelperLog "Geen geldig proces-ID ontvangen; ga direct verder."
                return
            }}

            Write-HelperLog ("Wachten tot proces {0} wordt afgesloten." -f $Pid)
            $deadline = (Get-Date).AddMinutes(5)

            while ((Get-Date) -lt $deadline) {{
                try {{
                    Get-Process -Id $Pid -ErrorAction Stop | Out-Null
                    Start-Sleep -Milliseconds 500
                }} catch {{
                    Write-HelperLog "Origineel proces is gestopt."
                    return
                }}
            }}

            try {{
                Get-Process -Id $Pid -ErrorAction Stop | Out-Null
                Write-HelperLog "Origineel proces draait nog na wachttijd; ga verder met herstart."
            }} catch {{
                Write-HelperLog "Origineel proces is gestopt."
            }}
        }}

        try {{
            if (-not (Test-Path -Path $PlanPath)) {{
                Write-HelperLog ("Herstartplan niet gevonden: {0}" -f $PlanPath)
                exit 1
            }}

            $Plan = Get-Content -Path $PlanPath -Raw | ConvertFrom-Json

            $TargetExecutable = [string]$Plan.target_executable
            $InstallerPath = [string]$Plan.installer_path
            $InstallerArgs = @()
            if ($Plan.installer_args -is [System.Array]) {{
                $InstallerArgs = $Plan.installer_args
            }} elseif ($Plan.installer_args) {{
                $InstallerArgs = @([string]$Plan.installer_args)
            }}

            Write-HelperLog ("Helper gestart. Doel: {0}; Installer: {1}" -f $TargetExecutable, $InstallerPath)

            $OriginalPid = 0
            if ($Plan.PSObject.Properties.Name -contains 'original_pid') {{
                $OriginalPid = [int]$Plan.original_pid
            }}
            Wait-ForProcessExit -Pid $OriginalPid

            if (-not (Test-Path -Path $InstallerPath)) {{
                Write-HelperLog ("Installerbestand niet gevonden: {0}" -f $InstallerPath)
            }} else {{
                Write-HelperLog "Installer wordt gestart."
                try {{
                    $installerProcess = Start-Process -FilePath $InstallerPath -ArgumentList $InstallerArgs -Wait -PassThru
                    if ($null -ne $installerProcess) {{
                        Write-HelperLog ("Installer afgerond met exitcode {0}." -f $installerProcess.ExitCode)
                    }} else {{
                        Write-HelperLog "Installer afgerond."
                    }}
                }} catch {{
                    Write-HelperLog ("Fout tijdens start van installer: {0}" -f $_.Exception.Message)
                }}
            }}

            $deadline = (Get-Date).AddMinutes(5)
            $launched = $false
            $missingLogged = $false
            $lockedLogged = $false

            while ((Get-Date) -lt $deadline) {{
                if (-not (Test-Path -Path $TargetExecutable)) {{
                    if (-not $missingLogged) {{
                        Write-HelperLog "Doelbestand nog niet gevonden; opnieuw proberen."
                        $missingLogged = $true
                    }}
                    Start-Sleep -Milliseconds 500
                    continue
                }}

                try {{
                    $stream = [System.IO.File]::Open(
                        $TargetExecutable,
                        [System.IO.FileMode]::Open,
                        [System.IO.FileAccess]::Read,
                        [System.IO.FileShare]::Read
                    )
                    $stream.Close()
                }} catch {{
                    if (-not $lockedLogged) {{
                        Write-HelperLog "Bestand nog vergrendeld; wachten tot het wordt vrijgegeven."
                        $lockedLogged = $true
                    }}
                    Start-Sleep -Milliseconds 500
                    continue
                }}

                try {{
                    Start-Process -FilePath $TargetExecutable -WorkingDirectory (Split-Path -Path $TargetExecutable -Parent) | Out-Null
                    Write-HelperLog "Herstart gelukt."
                    $launched = $true
                    break
                }} catch {{
                    Write-HelperLog ("Fout tijdens startpoging: {0}" -f $_.Exception.Message)
                    Start-Sleep -Milliseconds 500
                }}
            }}

            if (-not $launched) {{
                Write-HelperLog "Kon de applicatie niet automatisch herstarten binnen de wachttijd."
            }}
        }} catch {{
            Write-HelperLog ("Onverwachte fout in helper: {0}" -f $_.Exception.Message)
        }} finally {{
            try {{ Remove-Item -Path $PlanPath -Force -ErrorAction SilentlyContinue }} catch {{}}
            try {{ Remove-Item -Path $ScriptPath -Force -ErrorAction SilentlyContinue }} catch {{}}
        }}
        """
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
    }

    try:
        plan_path.write_text(json.dumps(plan), encoding="utf-8")
    except OSError as exc:  # pragma: no cover - best effort
        LOGGER.warning("Kon herstartplan niet schrijven: %s", exc)
        return None

    script_content = _build_restart_helper_script(plan_path, log_path)

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
    for path in (plan_paths.plan_path, plan_paths.script_path):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


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

    LOGGER.info("Herstarthelper gestart met proces-ID %s", process.pid)

    return True


def _launch_python_restart_helper(plan_paths: RestartPlanPaths) -> bool:
    """Fallback helper that reuses the packaged executable in helper mode."""

    target_executable = Path(sys.executable).resolve()
    try:
        process = subprocess.Popen(  # noqa: S603 - gecontroleerde command
            [
                str(target_executable),
                "--apply-update",
                str(plan_paths.plan_path),
            ],
            cwd=str(plan_paths.plan_path.parent),
            close_fds=False,
        )
    except Exception as exc:  # pragma: no cover - afhankelijk van platform
        LOGGER.warning("Kon Python-herstarthelper niet starten: %s", exc)
        return False

    time.sleep(0.2)
    exit_code = process.poll()
    if exit_code is not None:
        LOGGER.warning(
            "Python-herstarthelper stopte direct met code %s", exit_code
        )
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

    flags: list[str] = []
    use_silent = _should_use_silent_install() if silent is None else silent
    if use_silent:
        flags.extend(["/VERYSILENT", "/NORESTART"])

    restart_initiated = False
    target_executable = Path(sys.executable).resolve()

    helper_plan = _write_restart_plan(
        target_executable,
        updates_dir,
        destination,
        flags,
    )

    if helper_plan is not None:
        restart_initiated = _launch_restart_helper(helper_plan, updates_dir)
        if restart_initiated:
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
                LOGGER.warning("Kon herstartplan niet opnieuw schrijven voor Python-helper")

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

