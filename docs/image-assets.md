# Beeldmateriaal exporteren

Deze repository bevat geen binaire afbeeldingen om problemen met het indienen van PR's te voorkomen. Alle gebruikte logo's en screenshots zijn als `data:`-URI opgeslagen in `frontend/src/assets/images.ts`.

## Afbeeldingen downloaden

1. Installeer de dependencies (Node en Python zijn al voldoende).
2. Voer het hulpscript uit:

```bash
python tools/export_images.py
```

Het script zet de afbeeldingen neer in `artifacts/images/` en schrijft tegelijk een `.base64.txt`-bestand per afbeelding. Met het `.png`-bestand kun je lokaal testen of assets vervangen. Het `.base64.txt`-bestand kun je gebruiken om de inline data in de code te vervangen.

## Afbeeldingen bijwerken

Wil je een afbeelding vervangen?

1. Plaats de nieuwe afbeelding (PNG-formaat) in een tijdelijke map.
2. Converteer het bestand naar een base64-string, bijvoorbeeld met:

```bash
base64 -w0 pad/naar/bestand.png > nieuwe_afbeelding.base64.txt
```

3. Open `frontend/src/assets/images.ts` en vervang de bestaande base64-string (alles na `data:image/png;base64,`).
4. Draai `npm run build` om te controleren dat alles werkt.

> Tip: het meegeleverde logo is een tijdelijke placeholder. Vervang de base64-string door het officiële logo om de branding te laten aansluiten bij de huisstijl.
