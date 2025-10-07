# ChromeOS-release maken

Deze handleiding beschrijft hoe je een distributiepakket maakt voor Chromebooks
met de Linux (Crostini) omgeving. Het hulpscript bouwt zowel een handmatig
uit te pakken archief als een `.deb`-installer zodat gebruikers de app kunnen
installeren door simpelweg op een pakket te dubbelklikken.

## Voorbereiding

1. Zorg dat Node.js, npm, PyInstaller en `dpkg-deb` in je pad beschikbaar zijn.
2. Controleer of `VERSION.ini` de juiste versie bevat. Pas je de versie aan,
   voer dan ook `npm run sync-version` uit in de map `frontend` zodat
   `package.json` en `package-lock.json` overeenkomen.
3. Werk je documentatie of configuratie bij? Commit die wijzigingen samen met de
   release-aanpassingen voor context.

## Pakket bouwen

Voer vanuit de projectroot het hulpscript uit:

```bash
python tools/build_chromeos_release.py
```

Het script voert de volgende stappen uit:

1. Frontend build (standaard met bestaande `node_modules`, zonder `npm install`).
2. PyInstaller build op basis van `VlierPlanner.spec`.
3. Bundelen van de output in `build/chromeos/VlierPlanner-ChromeOS-<versie>/`.
4. Aanmaken van `VlierPlanner-ChromeOS-<versie>.tar.gz` **én** een
   Debian-pakket `vlier-planner_<versie>_<architectuur>.deb`.

Gebruik de optionele vlaggen als je bepaalde stappen wilt overslaan:

- `--skip-frontend` – slaat het frontend buildproces over.
- `--with-install` – voert vooraf `npm install` uit zodat afhankelijkheden zijn
  bijgewerkt voordat de build start.
- `--skip-pyinstaller` – gebruikt de huidige inhoud van `dist/VlierPlanner`.

## Installatie op een Chromebook

### Standaard: via `.deb`-pakket

1. Kopieer het bestand `vlier-planner_<versie>_<architectuur>.deb` naar de Chromebook.
2. Dubbelklik op het bestand in de bestandsbeheerder en volg de installatie-
   dialoog van ChromeOS. De installer plaatst automatisch een starticoon in het
   app-overzicht.
3. Na installatie kun je Vlier Planner starten vanuit de launcher of via de
   terminal met `vlier-planner`.

### Alternatief: handmatige installatie

1. Kopieer `VlierPlanner-ChromeOS-<versie>.tar.gz` naar de Chromebook en pak het
   archief uit in een map naar keuze, bij voorkeur `~/Apps`.
2. Maak het startscript uitvoerbaar met `chmod +x start-vlier-planner.sh`.
3. (Optioneel) Kopieer `vlier-planner.desktop` naar `~/.local/share/applications/`
   voor een snelkoppeling in de launcher.
4. Start de applicatie vanuit dezelfde map met `./start-vlier-planner.sh`.
