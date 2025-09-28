# Windows-updateflow testen

Deze checklist beschrijft het volledige traject om een Windows-release te bouwen, een oudere versie te installeren en vervolgens de automatische update binnen de applicatie te valideren.

## 1. Voorbereiding
- Zorg voor een werkende Node/Python-omgeving en voer een productie-build van de frontend uit met `python tools/build_frontend.py`. Dit script installeert dependencies, bouwt de Vite-app en kopieert de output naar `backend/static/dist`, wat noodzakelijk is voor PyInstaller en het Inno Setup-script.【F:README.md†L120-L158】
- Controleer `VERSION.ini` en synchroniseer de frontend-versie eventueel via `npm run sync-version` zodat backend, frontend, PyInstaller en de installer dezelfde versie gebruiken.【F:README.md†L101-L111】

## 2. PyInstaller-build maken
1. Verwijder oude buildoutput (`build/`, `dist/`) om verwarring met eerdere versies te voorkomen.
2. Bouw de Windows-binary met de projectspec:
   ```bash
   pyinstaller VlierPlanner.spec
   ```
   De spec bundelt o.a. `backend/static/dist`, de versie-informatie en alle benodigde Python-modules tot `dist/VlierPlanner/VlierPlanner.exe` (one-folder) of `dist/VlierPlanner.exe` (one-file).【F:README.md†L132-L158】

## 3. Windows-installer samenstellen
1. Open Inno Setup op Windows of gebruik de commandline-compiler:
   ```powershell
   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
   ```
2. Het script leest `VERSION.ini`, kopieert standaard de one-folder PyInstaller-output naar `%LOCALAPPDATA%\VlierPlanner` en produceert `build\installer\VlierPlanner-Setup-<versie>.exe`. Deze installer sluit actieve processen en biedt optioneel een desktop-snelkoppeling.【F:installer.iss†L1-L74】

## 4. Release publiceren voor de update-check
- Maak op GitHub (of het repo dat je via `VLIER_UPDATE_REPO` instelt) een release-tag `v<versie>` en voeg de zojuist gebouwde installer als asset toe. De updater zoekt standaard naar `VlierPlanner-Setup-<versie>.exe` in de nieuwste release en gebruikt de GitHub API met een herkenbare user-agent.【F:backend/updater.py†L27-L115】【F:backend/updater.py†L189-L237】
- Vermeld optioneel een `SHA256: ...` regel in de releasenotes; die checksum wordt door de updater gecontroleerd voordat de installer wordt uitgevoerd.【F:backend/updater.py†L137-L172】

## 5. Oude versie installeren op het test-systeem
1. De-installeer bestaande builds via **Apps & Features** op Windows.
2. Voer de oudere setup (bijv. `VlierPlanner-Setup-1.0.0.exe`) uit en start de applicatie. Het venster opent automatisch een browser en meldt de huidige versie via `/api/system/version`.【F:README.md†L149-L158】【F:backend/app.py†L362-L378】

## 6. Automatische update uitvoeren
1. Open **Instellingen → Updates** in de app en druk op _“Update installeren”_. De backend haalt de nieuwste release-informatie op en start de download naar `%LOCALAPPDATA%\VlierPlanner\updates`.【F:backend/app.py†L368-L409】【F:backend/updater.py†L105-L180】
2. Tijdens de installatie schrijft de updater een herstartplan (`apply-update-<id>.json`) en PowerShell-script in dezelfde updates-map. De helperlog (`restart-helper.log`) bevat timestamps van het stoppen van het oude proces, het starten van de installer en het opnieuw openen van `VlierPlanner.exe`. Controleer deze log om te bevestigen dat de helper heeft gedraaid.【F:backend/updater.py†L389-L432】【F:run_app.py†L262-L366】
3. Na afloop moet de browser automatisch vernieuwen zodra het backend-proces opnieuw draait. De API-respons van `POST /api/system/update` geeft ook aan of een automatische herstart is gestart (`restartInitiated`).【F:backend/app.py†L390-L409】

## 7. Verwachte uitkomsten
- De installer draait stil (zonder extra prompts) en sluit af met exitcode 0; dit is terug te vinden in `restart-helper.log`.【F:run_app.py†L300-L340】
- `VlierPlanner.exe` wordt opnieuw gestart nadat het bestand niet langer is vergrendeld. Zie je de melding “Herstart gelukt.” in de log, dan is het traject succesvol doorlopen.【F:run_app.py†L341-L366】
- In de app moet nu de nieuwe versie zichtbaar zijn via **Instellingen** en `/api/system/version`; er is geen handmatige herstart meer nodig.【F:backend/app.py†L362-L409】

Volg deze stappen telkens wanneer je een nieuwe Windows-release klaarzet. Daarmee test je dezelfde flow als eindgebruikers ervaren: installer bouwen, release uploaden, automatische download, helper-uitvoering en herstart van de applicatie.
