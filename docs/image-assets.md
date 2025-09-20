# Beeldmateriaal exporteren

Deze repository bevat geen binaire afbeeldingen om problemen met het indienen van PR's te voorkomen. Alle gebruikte logo's en screenshots zijn als `data:`-URI opgeslagen in `frontend/src/assets/images.ts`. In de applicatie wordt automatisch eerst gekeken of er een bestand in de `public/`-map aanwezig is. Als dat ontbreekt, valt de UI terug op de ingebouwde base64-varianten.

## Afbeeldingen downloaden

1. Installeer de dependencies (Node en Python zijn al voldoende).
2. Voer het hulpscript uit:

```bash
python tools/export_images.py
```

Het script zet de afbeeldingen neer in `artifacts/images/` en schrijft tegelijk een `.base64.txt`-bestand per afbeelding. Met het `.png`-bestand kun je lokaal testen of assets vervangen. Het `.base64.txt`-bestand kun je gebruiken om de inline data in de code te vervangen.

## Logo vervangen

1. Zorg dat je het gewenste logo als `PNG` hebt.
2. Plaats het bestand in `frontend/public/logo.png` (overschrijf het bestaande bestand indien nodig).
3. Herstart eventueel de ontwikkelserver. De applicatie laadt automatisch het bestand uit de `public/`-map en valt alleen terug op de inline versie als het bestand ontbreekt.

> Tip: sla je logo onder dezelfde bestandsnaam op zodat bestaande referenties blijven werken.

## Voorbeeldschermen genereren

De screenshots voor de uitlegpagina kun je lokaal opnieuw opnemen op basis van de voorbeeldstudiewijzers.

1. Start de backend (bijvoorbeeld met `python run_app.py`).
2. Start in een tweede terminal de frontend (`npm run dev --prefix frontend`).
3. Laad alle voorbeeldbestanden via `python tools/load_samples.py`.
4. Installeer Playwright-browsers met `npm exec --prefix frontend playwright install` (eenmalig).
5. Maak de screenshots met:

   ```bash
   node frontend/scripts/captureScreenshots.mjs
   ```

De afbeeldingen worden opgeslagen in `frontend/public/screenshots/`. Omdat binaire bestanden niet worden meegestuurd in PR's kun je ze zelf toevoegen of delen buiten Git. De applicatie probeert eerst deze bestanden te laden en gebruikt anders de ingebouwde base64-varianten.

## Base64-data bijwerken

Wil je de inline afbeeldingen toch vervangen?

1. Plaats de nieuwe afbeelding (PNG-formaat) in een tijdelijke map.
2. Converteer het bestand naar een base64-string, bijvoorbeeld met:

   ```bash
   base64 -w0 pad/naar/bestand.png > nieuwe_afbeelding.base64.txt
   ```

3. Open `frontend/src/assets/images.ts` en vervang de bestaande base64-string (alles na `data:image/png;base64,`).
4. Draai `npm run build --prefix frontend` om te controleren dat alles werkt.
