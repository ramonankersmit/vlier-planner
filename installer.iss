; installer.iss — Inno Setup voor Vlier Planner (user install, géén admin)
; Compile met Inno Setup. Past in %LOCALAPPDATA%, dus geen UAC prompt.

#define MyAppId        "{{0B6482E5-DC3B-4761-9A9C-1234567890AB}"  ; kies 1 GUID en verander nooit meer
#define MyAppName      "VlierPlanner"
#define MyAppExeName   "VlierPlanner.exe"
#define MyAppVersion   Trim(ReadIni(AddBackslash(SourcePath) + "VERSION.ini", "app", "version", "0.0.0"))
#define MyPublisher    "Ramon Ankersmit"
#define MyURL          "https://github.com/ramonankersmit/vlier-planner"
#define MyOutputDir    "build\installer"

; --- PyInstaller output:
; Gebruik bij voorkeur one-folder: dist\VlierPlanner\VlierPlanner.exe (+ libs)
#define MyOneFolderDir "dist\VlierPlanner"
; Fallback voor one-file: dist\VlierPlanner.exe
#define MyOneFileExe   "dist\VlierPlanner.exe"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyPublisher}
AppPublisherURL={#MyURL}
AppSupportURL={#MyURL}
AppUpdatesURL={#MyURL}

; ---- USER INSTALL (geen admin) ----
PrivilegesRequired=lowest
DefaultDirName={localappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
DisableDirPage=no
DisableProgramGroupPage=yes
UsePreviousAppDir=yes

OutputDir={#MyOutputDir}
OutputBaseFilename={#MyAppName}-Setup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern

; Sluit draaiende app tijdens (un)install
CloseApplications=yes
CloseApplicationsFilter={#MyAppExeName}
RestartApplications=no

; (Optioneel) later codesigning inschakelen:
; SignTool=signtool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /f "C:\keys\codesign.pfx" /p "WACHTWOORD" $f
; SignedUninstaller=yes

[Languages]
Name: "dutch";   MessagesFile: "compiler:Languages\Dutch.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "Extra snelkoppelingen:"; Flags: unchecked

[Files]
; ---- Copy PyInstaller build ----
; One-folder build (voorkeur)
#ifexist "{#MyOneFolderDir}\{#MyAppExeName}"
Source: "{#MyOneFolderDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
#else
; One-file fallback (enkel het exe-bestand)
Source: "{#MyOneFileExe}"; DestDir: "{app}"; Flags: ignoreversion
#endif

[Icons]
Name: "{group}\{#MyAppName}";     Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Start app na installatie (niet bij /SILENT of /VERYSILENT)
Filename: "{app}\{#MyAppExeName}"; Description: "{#MyAppName} starten"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; (optioneel) opruimen van cache/logs:
; Type: filesandordirs; Name: "{app}\logs"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
