# Vlier Studiewijzer Planner

Een planner voor studiewijzers van het voortgezet onderwijs. Upload een studiewijzer (PDF of DOCX) en bekijk per vak de lesstof, het huiswerk en alle belangrijke events.

## Belangrijkste schermen
- **Weekoverzicht** – compacte lijst van vakken per week.
- **Matrix overzicht** – tabelweergave waarmee je meerdere weken naast elkaar kunt volgen.
- **Belangrijke events** – filterbare lijst met toetsen en andere deadlines.
- **Uploads & instellingen** – beheer geüploade studiewijzers, zichtbare vakken en thema.

## Huiswerk beheren
- Voeg eigen huiswerk toe via de knop _“Eigen huiswerk toevoegen”_ onder elke vaksectie.
- Bewerk bestaande items (zowel automatisch geïmporteerd als eigen notities) of verwijder ze.

## Functionaliteit
- FastAPI-backend met parsers voor PDF- en DOCX-bestanden.
- API levert genormaliseerde data voor weekoverzichten, matrix, agenda en events.
- React + Vite + Tailwind frontend met filters voor niveau, leerjaar en eigen vakselecties.
- Upload, lijst en verwijder studiewijzers via de API; bestanden worden tijdelijk op schijf bewaard.

## Projectstructuur
```
vlier-planner/
  backend/      FastAPI-backend
  frontend/     React/Vite/Tailwind frontend
  docs/         Documentatie
  samples/      Voorbeeldbestanden
  tools/        Hulpscripts
```

## Installatie & development
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload

cd frontend
npm install
npm run dev
```

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
3. Bouw de executable vanuit de projectroot:
   ```bash
   pyinstaller run_app.py \
     --name VlierPlanner \
     --onefile \
     --noconfirm \
     --add-data "backend/static/dist;backend/static/dist" \
     --collect-all vlier_parser \
     --collect-all backend.parsers
   ```
   Pas opties als `--add-data` of `--collect-all` aan wanneer extra pakketten of assets nodig zijn.
4. Het resultaat vind je in `dist/VlierPlanner.exe`. Kopieer dit bestand naar de Windows-machine en start het met een dubbelklik; het programma opent automatisch een browser op `http://127.0.0.1:8000`.

## Gebruik
1. Start de backend op poort 8000.
2. Start de frontend op poort 5173.
3. Upload één of meerdere studiewijzers via _Uploads_.
4. Beheer huiswerk in Weekoverzicht of Matrix overzicht en bekijk events via _Belangrijke events_.


## Voorbeeldbestanden
Het PR-systeem accepteert geen binaire bestanden. Daarom staan de voorbeeldstudiewijzers opgeslagen als Base64 in `samples/voorbeeld-studiewijzer.pdf.base64` en `samples/voorbeeld-studiewijzer.docx.base64`.

Genereer lokaal de echte PDF- en DOCX-bestanden met:

```bash
node tools/decode_samples.mjs
```

De bestanden worden genegeerd door git, maar kun je wel gebruiken om snel de applicatie te vullen of nieuwe screenshots te maken.


## Licentie
MIT
