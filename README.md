# Vlier Studiewijzer Planner

Een planner voor studiewijzers van het voortgezet onderwijs. Upload een studiewijzer (PDF of DOCX) en bekijk per vak de lesstof, het huiswerk en alle belangrijke events.

## Belangrijkste schermen
- **Weekoverzicht** – compacte lijst van vakken per week.
- **Matrix overzicht** – tabelweergave waarmee je meerdere weken naast elkaar kunt volgen.
- **Belangrijke events** – filterbare lijst met toetsen en andere deadlines.
- **Uploads & instellingen** – beheer geüploade studiewijzers, zichtbare vakken en thema.

### Voorbeeldschermen

De onderstaande voorbeelden zijn direct afkomstig uit de `frontend/public` map en geven een indruk van de belangrijkste
flows in de applicatie.

**Studiewijzer uploaden** – Upload een PDF of DOCX, bekijk een voorbeeld van de herkende secties en kies het leerjaar en de
klas waarvoor het materiaal bedoeld is.

![Studiewijzer uploaden](frontend/public/voorbeeld_studiewijzer.png)

**Weekoverzicht** – Bekijk per week wat er gepland staat, voeg eigen taken toe en vink afgeronde taken af.

![Weekoverzicht](frontend/public/voorbeeld_weekoverzicht.png)

**Matrix overzicht** – Combineer meerdere weken in één grid zodat je trends per vak ziet en eenvoudig vooruit kunt plannen.

![Matrix overzicht](frontend/public/voorbeeld_matrix.png)

**Belangrijke events** – Filter toetsen, presentaties en andere deadlines en sorteer ze op datum of vak.

![Belangrijke events](frontend/public/voorbeeld_events.png)

## Huiswerk beheren
- Voeg eigen taken toe via de knop _“Eigen taak toevoegen”_ onder elke vaksectie.
- Bewerk bestaande items (zowel automatisch geïmporteerd als eigen notities) of verwijder ze.

## Functionaliteit
- FastAPI-backend met parsers voor PDF- en DOCX-bestanden.
- API levert genormaliseerde data voor weekoverzichten, matrix, agenda en events.
- React + Vite + Tailwind frontend met filters voor niveau, leerjaar en eigen vakselecties.
- Upload, lijst en verwijder studiewijzers via de API; bestanden worden tijdelijk op schijf bewaard.
- Diff-overzichten en waarschuwingen markeren veranderingen en mogelijke problemen tijdens reviews.
- Automatische update-check met optionele installer-start om nieuwe versies binnen de app te downloaden.

## Normalisatie-API versus studiewijzer-workflow
- **Snelle normalisatie (`backend/main.py`)** – eenvoudige FastAPI-app voor het testen van de parser. Nieuwe uploads landen in `uploads/` en elke parse wordt als JSON in `data/parsed/` opgeslagen. De API biedt alleen het noodzakelijke minimum: uploaden, basisstatus opvragen en eenvoudige weergave van weken, matrix, agenda en assessments.【F:backend/main.py†L1-L118】【F:vlier_parser/normalize.py†L33-L94】
- **Volledige studiewijzer-workflow (`backend/app.py`)** – complete backend voor versiebeheer, reviewflows, diff-berekeningen, waarschuwingen en bestandsbeheer. Ruwe uploads worden in `storage/uploads/` geplaatst; goedgekeurde versies krijgen een eigen map onder `storage/<guideId>/<versionId>/`. Lopende reviews en hun metadata staan tijdelijk in `storage/pending/`.【F:backend/app.py†L52-L377】【F:backend/app.py†L723-L918】
- Beide backends delen dezelfde `vlier_parser.normalize` helpers en kunnen dus naar `data/parsed/` schrijven wanneer de snelle workflow gebruikt wordt. Gebruik de minimalistische API om snel parserresultaten te testen, en de volledige app wanneer je de reviewwizard, versiehistorie of diff/warning-logica wilt uitproberen.【F:backend/main.py†L27-L118】【F:backend/app.py†L713-L918】

## Reviewwizard, versiebeheer en updates
- **Reviewwizard** – `/api/reviews` en `/api/reviews/{parseId}` leveren pending reviews met meta, regels, diff en waarschuwingen. `frontend/src/pages/Review.tsx` vormt hier de meerstapsreview rond, terwijl `frontend/src/pages/Uploads.tsx` pending reviews en hun waarschuwingen toont en naar de wizard linkt.【F:backend/app.py†L802-L918】【F:frontend/src/pages/Review.tsx†L518-L1160】【F:frontend/src/pages/Uploads.tsx†L20-L1298】
- **Versiebeheer & diffing** – commits naar `/api/reviews/{parseId}/commit` slaan een nieuwe versie van een studiewijzer weg en updaten de diff-geschiedenis. Bestanden en metadata blijven per versie beschikbaar via `/api/docs/...`-endpoints (rows, preview, download) zodat je oudere versies kunt vergelijken.【F:backend/app.py†L723-L918】
- **Automatische updates** – `/api/system/update` controleert op nieuwe releases, terwijl een POST naar hetzelfde endpoint een download/installer kan starten. De frontend start automatisch een check via `frontend/src/App.tsx` en biedt handmatige bediening op de instellingenpagina (`frontend/src/pages/Settings.tsx`).【F:backend/app.py†L323-L366】【F:frontend/src/App.tsx†L172-L188】【F:frontend/src/pages/Settings.tsx†L36-L396】

## Projectstructuur
```
vlier-planner/
  backend/      FastAPI-backend
  frontend/     React/Vite/Tailwind frontend
  docs/         Documentatie
  samples/      Voorbeeldbestanden
  tools/        Hulpscripts
```

## Versiebeheer
De applicatieversie staat één keer vastgelegd in `VERSION.ini` onder de sectie `[app]`. Dit bestand wordt tijdens builds gedeeld met:

- de backend (FastAPI) voor de API-responses,
- de frontend via Vite (`__APP_VERSION__`),
- de PyInstaller bundel en
- het Inno Setup-installatiescript.

Gebruik `npm run sync-version` (of een ander script dat `tools/sync-version.mjs` aanroept) om `package.json` en `package-lock.json` automatisch bij te werken op basis van de waarde uit `VERSION.ini`.

## Installatie & development
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload

cd frontend
npm install
npm run dev
```

### Tests en kwaliteitscontroles
- Backend-tests: `pytest`
- Frontend-tests: `npm test`

### Normalisatietests draaien
De huidige `vlier_parser.normalize` bevat een dummy-implementatie. Zodra de echte parserlogica is toegevoegd kun je specifieke normalisatietests opnemen (bijv. `tests/test_normalize.py`) en uitvoeren met `pytest -k normalize`. Gebruik de minimalistische API (`backend/main.py`) voor snelle feedback op parse-resultaten voordat je de volledige reviewflow (`backend/app.py`) doorloopt.【F:backend/main.py†L27-L118】【F:backend/app.py†L723-L918】【F:vlier_parser/normalize.py†L33-L94】

## Frontend build koppelen aan de backend
Gebruik het hulpscript om de Vite-build in `backend/static/dist` te plaatsen wanneer je een distributieversie wilt maken:

```bash
python tools/build_frontend.py  # optioneel: --skip-install of --no-build
```

Het script draait standaard `npm install`, bouwt de frontend en kopieert de inhoud van `frontend/dist` naar `backend/static/dist`.

## Alles-in-één backend starten (voor bundling/Windows)
Met `run_app.py` start je uvicorn, schakel je automatisch de statische frontend-serving in en wordt een browservenster geopend.

```bash
python run_app.py
```

Handige omgevingsvariabelen:

- `VLIER_HOST` / `VLIER_PORT` – pas host of poort aan (standaard `127.0.0.1:8000`).
- `VLIER_OPEN_BROWSER=0` – onderdruk het automatisch openen van een browser.
- `SERVE_FRONTEND=0` – forceer API-only modus (bijvoorbeeld voor lokale ontwikkeling met Vite).

## Windows distributie bouwen met PyInstaller
Volg deze stappen om een enkel `.exe`-bestand te maken voor Windows-gebruikers:

1. Zorg dat de frontend-build beschikbaar is in de backend:
   ```bash
   python tools/build_frontend.py
   ```
   Dit draait `npm install`, bouwt de frontend en kopieert de output naar `backend/static/dist`.
2. Installeer PyInstaller in je (virtuele) omgeving:
   ```bash
   pip install pyinstaller
   ```
3. Controleer of `VERSION.ini` de juiste versie bevat. De `VlierPlanner.spec` leest deze waarde en genereert automatisch een
   `build/file_version_info.txt` die als Windows version resource aan de executable wordt meegegeven.
4. Bouw de executable vanuit de projectroot:
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
   Pas opties als `--add-data` of `--collect-all` aan wanneer extra pakketten of assets nodig zijn. Wil je PyInstaller direct de
   spec laten gebruiken, run dan `pyinstaller VlierPlanner.spec`; dezelfde versie-resource wordt dan automatisch toegevoegd. In
   een eigen command-line configuratie kun je `--version-file build/file_version_info.txt` meegeven om de metadata te
   hergebruiken.
5. Het resultaat vind je in `dist/VlierPlanner.exe`. Kopieer dit bestand naar de Windows-machine en start het met een dubbelklik; het programma opent automatisch een browser op `http://127.0.0.1:8000`.

## Gebruik
1. Start de backend op poort 8000.
2. Start de frontend op poort 5173.
3. Upload één of meerdere studiewijzers via _Uploads_.
4. Beheer huiswerk in Weekoverzicht of Matrix overzicht en bekijk events via _Belangrijke events_.

## Onboarding tour
- Bij het eerste bezoek start automatisch een rondleiding met zes stappen: **Uitleg**, **Upload**, **Weekoverzicht**, **Matrix overzicht**, **Belangrijke events** en **Settings**.
- Enter of spatie gaat naar de volgende stap, Escape sluit de tour. Via het menu-item **Rondleiding** in de header kun je de tour later opnieuw starten.
- De status wordt opgeslagen in `localStorage` onder de sleutel `vlier.tourDone`.

## Licentie
MIT
