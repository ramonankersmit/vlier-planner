# Vlier Studiewijzer Planner

Vlier Planner helpt leerlingen en docenten om studiewijzers uit het voortgezet onderwijs overzichtelijk te plannen. Upload een studiewijzer (PDF of DOCX), bekijk per vak de lesstof, houd huiswerk bij en volg belangrijke events zoals toetsen en deadlines.

## Inhoud
1. [Functioneel overzicht](#functioneel-overzicht)
2. [Onboarding tour](#onboarding-tour)
3. [Voorbeeldschermen](#voorbeeldschermen)
4. [Technische architectuur](#technische-architectuur)
5. [Projectstructuur](#projectstructuur)
6. [Installatie en ontwikkeling](#installatie-en-ontwikkeling)
7. [Gebruik van de applicatie](#gebruik-van-de-applicatie)
8. [Review-, versie- en updateflows](#review--versie--en-updateflows)
9. [Frontend-build koppelen](#frontend-build-koppelen)
10. [Alles-in-één backend](#alles-in-één-backend)
11. [Windows distributie](#windows-distributie)
12. [Licentie](#licentie)

## Functioneel overzicht
### Belangrijkste schermen
- **Weekoverzicht** – compacte lijst van vakken per week met huiswerk en lessen.
- **Matrix overzicht** – tabelweergave waarmee je meerdere weken naast elkaar kunt volgen.
- **Belangrijke events** – filterbare lijst met toetsen, presentaties en andere deadlines.
- **Uploads & instellingen** – beheer geüploade studiewijzers, zichtbare vakken, thema en app-instellingen.

### Kernfeatures
- Studiewijzers uploaden in PDF of DOCX en automatisch laten normaliseren.
- Handmatig huiswerk toevoegen, aanpassen en afvinken naast geïmporteerde items.
- Filteren op leerjaar, niveau en zelfgekozen vakselecties.
- Diff-overzichten en waarschuwingen tijdens reviews om wijzigingen en mogelijke problemen te tonen.
- Automatische updatecontrole met de mogelijkheid om nieuwe versies vanuit de applicatie te downloaden.
- Automatisch vakantieschema's ophalen om vrije dagen en vakanties meteen in de planning te verwerken.
- Zelf thema's ontwerpen en opslaan voor een gepersonaliseerde look & feel van de planner.
- Onboarding tour die nieuwe gebruikers stap voor stap door de belangrijkste schermen leidt.

## Onboarding tour
- Bij het eerste bezoek start een rondleiding met zes stappen: **Uitleg**, **Upload**, **Weekoverzicht**, **Matrix overzicht**, **Belangrijke events** en **Settings**.
- Enter of spatie gaat naar de volgende stap, Escape sluit de tour. Via het menu-item **Rondleiding** kun je de tour later opnieuw starten.
- De status wordt opgeslagen in `localStorage` onder de sleutel `vlier.tourDone`.

## Voorbeeldschermen
De onderstaande voorbeelden komen uit `frontend/public` en tonen de belangrijkste flows.

**Studiewijzer uploaden** – Upload een PDF of DOCX, bekijk een voorbeeld van de herkende secties en kies het leerjaar en de klas waarvoor het materiaal bedoeld is.

![Studiewijzer uploaden](frontend/public/voorbeeld_studiewijzer.png)

**Weekoverzicht** – Bekijk per week wat er gepland staat, voeg eigen taken toe en vink afgeronde taken af.

![Weekoverzicht](frontend/public/voorbeeld_weekoverzicht.png)

**Matrix overzicht** – Combineer meerdere weken in één grid zodat je trends per vak ziet en eenvoudig vooruit kunt plannen.

![Matrix overzicht](frontend/public/voorbeeld_matrix.png)

**Belangrijke events** – Filter toetsen, presentaties en andere deadlines en sorteer ze op datum of vak.

![Belangrijke events](frontend/public/voorbeeld_events.png)

## Technische architectuur
### Backend
- Gebouwd met FastAPI en ingericht als twee entrypoints:
  - `backend/main.py` biedt een minimalistische API voor snelle parser-tests met endpoints voor uploaden, status en basisoverzichten.
  - `backend/app.py` levert de volledige studiewijzer-backend met reviewflows, versiebeheer, diffs, waarschuwingen en documentendownloads.
- Uploads, reviews en genormaliseerde resultaten worden opgeslagen via de gedeelde `DataStore` service in `backend/services/data_store.py`. De opslaglocatie kan worden overschreven met `VLIER_DATA_DIR` of `VLIER_STORAGE_DIR`.

### Frontend
- Gebouwd met React, Vite en Tailwind CSS.
- Pagina’s voor uploads, reviewwizard, week- en matrixoverzichten, events en instellingen.
- Maakt verbinding met de backend via REST API’s en toont waarschuwingen, diff-informatie en update-notificaties.

### Parser
- `vlier_parser/normalize.py` bevat de normalisatielogica voor studiewijzers en wordt door beide backend-entrypoints gebruikt.
- Dummy-implementatie is aanwezig; breid deze uit met de daadwerkelijke parser en voeg gerichte tests toe.

### Dataflows
- Zowel de snelle normalisatie-API als de volledige workflow schrijven naar dezelfde opslagstructuur (`backend/storage/`).
- Goedgekeurde versies worden per studiewijzer en versie-id opgeslagen zodat diffing en historische downloads beschikbaar blijven.

## Projectstructuur
```
vlier-planner/
  backend/      FastAPI-backend en opslagservices
  frontend/     React/Vite/Tailwind frontend
  docs/         Documentatie en handleidingen
  samples/      Voorbeeldbestanden voor testen
  tools/        Hulpscripts (build, utilities)
```

## Installatie en ontwikkeling
### Basisinstallatie
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload

cd frontend
npm install
npm run dev
```

### Versiebeheer synchroniseren
De applicatieversie staat in `VERSION.ini` onder `[app]`. Gebruik `npm run sync-version` (of een script dat `tools/sync-version.mjs` aanroept) om `package.json` en `package-lock.json` automatisch bij te werken op basis van deze waarde.

### Tests en kwaliteitscontroles
- Backend-tests: `pytest`
- Frontend-tests: `npm test`
- Specifieke parser- of normalisatietests kun je draaien met `pytest -k normalize` zodra echte parserlogica aanwezig is.

## Gebruik van de applicatie
1. Start de backend op poort 8000 (minimalistische API) of start `backend/app.py` voor de volledige workflow.
2. Start de frontend op poort 5173 met `npm run dev`.
3. Upload één of meerdere studiewijzers via het Uploads-scherm.
4. Beheer huiswerk via Weekoverzicht of Matrix overzicht en bekijk events via het Belangrijke events-scherm.
5. Gebruik de reviewwizard om nieuwe versies te beoordelen en committen.

## Review-, versie- en updateflows
- **Reviewwizard** – `/api/reviews` en `/api/reviews/{parseId}` leveren pending reviews met metadata, regels, diff en waarschuwingen. De frontend toont deze in de uploads- en reviewpagina’s.
- **Versiebeheer** – Commits naar `/api/reviews/{parseId}/commit` bewaren nieuwe versies en houden diff-geschiedenis en bestanden per versie beschikbaar via `/api/docs/...`.
- **Automatische updates** – `/api/system/update` controleert op nieuwe releases. De frontend voert automatisch checks uit en biedt handmatige bediening via de instellingenpagina.
- **Windows-updateflow testen** – Raadpleeg [`docs/windows-update-testing.md`](docs/windows-update-testing.md) voor het doorlopen van de volledige updateketen met PyInstaller en Inno Setup.

## Frontend-build koppelen
Gebruik het hulpscript om de Vite-build in `backend/static/dist` te plaatsen wanneer je een distributieversie wilt maken:

```bash
python tools/build_frontend.py  # optioneel: --skip-install of --no-build
```

Het script draait standaard `npm install`, bouwt de frontend en kopieert de inhoud van `frontend/dist` naar `backend/static/dist`.

## Alles-in-één backend
Met `run_app.py` start je uvicorn, wordt automatisch statische frontend-serving ingeschakeld en opent er optioneel een browservenster.

```bash
python run_app.py
```

Handige omgevingsvariabelen:

- `VLIER_HOST` / `VLIER_PORT` – pas host of poort aan (standaard `127.0.0.1:8000`).
- `VLIER_OPEN_BROWSER=0` – onderdrukt het automatisch openen van een browser.
- `SERVE_FRONTEND=0` – forceert API-only modus (bijvoorbeeld voor lokale ontwikkeling met Vite).

## Windows distributie
Volg deze stappen om een enkel `.exe`-bestand te maken voor Windows-gebruikers:

1. Zorg dat de frontend-build beschikbaar is in de backend:
   ```bash
   python tools/build_frontend.py
   ```
2. Installeer PyInstaller in je (virtuele) omgeving:
   ```bash
   pip install pyinstaller
   ```
3. Controleer de waarde in `VERSION.ini`. `VlierPlanner.spec` gebruikt deze om `build/file_version_info.txt` te genereren voor de Windows-version resource.
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
   Pas opties als `--add-data` of `--collect-all` aan wanneer extra pakketten of assets nodig zijn. Je kunt ook `pyinstaller VlierPlanner.spec` gebruiken; dezelfde version resource wordt dan automatisch toegevoegd.
5. Het resultaat vind je in `dist/VlierPlanner.exe`. Kopieer dit bestand naar een Windows-machine en start het met een dubbelklik; de app opent automatisch op `http://127.0.0.1:8000`.

## Licentie
MIT
