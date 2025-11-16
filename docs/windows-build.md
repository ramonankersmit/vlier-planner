# Windows-build stappenplan

Dit document beschrijft hoe je de Vlier Planner als enkel `VlierPlanner.exe`-bestand bouwt
voor distributie naar Windows-gebruikers. De stappen zijn grotendeels gelijk aan de
samenvatting in [`README.md`](../README.md#windows-distributie), maar hieronder staat een
uitgewerkte checklist met context per stap.

## 1. Voorbereiding
1. Gebruik een schone virtuele omgeving waarin zowel backend- als frontendafhankelijkheden
   aanwezig zijn.
2. Controleer dat `VERSION.ini` de juiste versie bevat. PyInstaller gebruikt deze waarde om
   het Windows-bestand van de juiste versie-informatie te voorzien.
3. Zorg dat de frontend-build straks in `backend/static/dist` staat (zie stap 2).

## 2. Frontend-build inpakken
```bash
python tools/build_frontend.py  # installeert dependencies en bouwt Vite-output
```
Dit script draait `npm install`, voert `npm run build` uit en kopieert daarna de inhoud van
`frontend/dist` naar `backend/static/dist`. De executable kan daardoor de statische assets
mee verpakken.

## 3. Backend-dependencies installeren
```bash
pip install -r backend/requirements.txt
pip install pyinstaller
```
`pyinstaller` is alleen nodig voor het bouwproces; de overige requirements zijn nodig om
`run_app.py` zonder ontbrekende modules te bundelen.

## 4. PyInstaller draaien
Vanuit de projectroot:
```bash
pyinstaller run_app.py \
  --name VlierPlanner \
  --onefile \
  --noconsole \
  --noconfirm \
  --add-data "backend/static/dist;backend/static/dist" \
  --add-data "VERSION.ini;." \
  --collect-all vlier_parser \
  --collect-all backend.parsers
```
> Tip: je kunt ook `pyinstaller VlierPlanner.spec` gebruiken. Dat bestand bevat dezelfde
> opties en voegt automatisch `build/file_version_info.txt` toe op basis van `VERSION.ini`.

## 5. Resultaat testen
1. Het buildproces plaatst het uitvoerbare bestand in `dist/VlierPlanner.exe`.
2. Kopieer het bestand naar een Windows-machine, dubbelklik en wacht tot de browser
   automatisch opent op `http://127.0.0.1:8000`.
3. Controleer of uploads, week-/matrixoverzichten en updatechecks functioneren.

## 6. Optioneel: installer genereren
Wil je een installer met snelkoppelingen en uninstall-ondersteuning? Installeer dan Inno
Setup op Windows en open `installer.iss`. Bouw de installer; het resultaat komt in
`build/installer/VlierPlanner-Setup-[versie].exe` te staan.

## 7. Automatische updates testen
Voor de volledige updateketen (PyInstaller + Inno Setup) staat een walkthrough in
[`docs/windows-update-testing.md`](windows-update-testing.md).
