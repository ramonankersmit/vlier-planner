# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

import configparser
import re
from pathlib import Path


def _load_version() -> str:
    config = configparser.ConfigParser()
    version_path = Path(__name__).resolve().parent / "VERSION.ini"
    if not config.read(version_path):
        raise FileNotFoundError(f"VERSION.ini niet gevonden op {version_path}.")

    possible_sections = list(config.sections())
    for section in possible_sections:
        if config.has_option(section, "version"):
            candidate = config.get(section, "version").strip()
            if candidate:
                return candidate

    if config.has_option(config.default_section, "version"):
        candidate = config.get(config.default_section, "version").strip()
        if candidate:
            return candidate

    raise ValueError("Kon geen 'version'-waarde vinden in VERSION.ini")


def _version_tuple(version: str):
    parts = []
    for raw_part in version.split('.'):
        match = re.match(r"(\d+)", raw_part)
        if match:
            parts.append(int(match.group(1)))
        else:
            parts.append(0)
        if len(parts) == 4:
            break

    while len(parts) < 4:
        parts.append(0)

    return tuple(parts[:4])


def _write_version_file(version: str) -> Path:
    build_dir = Path("build")
    build_dir.mkdir(exist_ok=True)
    version_file = build_dir / "file_version_info.txt"

    file_version_tuple = _version_tuple(version)
    file_version_string = ".".join(str(part) for part in file_version_tuple)
    version_file.write_text(
        """
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers={filevers},
    prodvers={prodvers},
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
    ),
  kids=[
    StringFileInfo([
      StringTable(
        '040904B0',
        [
        StringStruct('CompanyName', 'Vlier Planner'),
        StringStruct('FileDescription', 'Vlier Studiewijzer Planner'),
        StringStruct('FileVersion', '{file_version_string}'),
        StringStruct('InternalName', 'VlierPlanner'),
        StringStruct('LegalCopyright', '© 2025 Ramon Ankersmit'),
        StringStruct('OriginalFilename', 'VlierPlanner.exe'),
        StringStruct('ProductName', 'Vlier Planner'),
        StringStruct('ProductVersion', '{file_version_string}')
        ])
      ]),
    VarFileInfo([
      VarStruct('Translation', [1033, 1200])
    ])
  ]
)
""".format(
        filevers=file_version_tuple,
        prodvers=file_version_tuple,
        file_version_string=file_version_string,
    ),
        encoding="utf-8",
    )
    return version_file


APP_VERSION = _load_version()
VERSION_FILE = _write_version_file(APP_VERSION)

datas = [
    ('VERSION.ini', '.'),
    ('backend/static/dist', 'backend/static/dist'),
]
binaries = []
hiddenimports = []
tmp_ret = collect_all('vlier_parser')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('backend.parsers')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('email_validator')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['run_app.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='VlierPlanner',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version=str(VERSION_FILE),
)
