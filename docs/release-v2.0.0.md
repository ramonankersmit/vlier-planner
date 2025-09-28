# Release v2.0.0

Deze handleiding beschrijft hoe we de eerste stabiele release (v2.0.0) van Vlier Planner voorbereiden en communiceren.

## Stappenplan voor publicatie
1. **Versie bepalen**  
   - Actualiseer `VERSION.ini` naar `2.0.0` en voer in `frontend/` `npm run sync-version` uit zodat de frontend dezelfde versie gebruikt.  
   - Controleer dat het versienummer zichtbaar is in de app (instellingen → updates) na een lokale build.
2. **Code valideren**  
   - Draai `pytest` voor de backend en `npm test` voor de frontend.  
   - Bouw de distributie met `python tools/build_frontend.py` en `pyinstaller VlierPlanner.spec` voor een end-to-end rooktest.
3. **Release candidate controleren**  
   - Volg de checklist uit `docs/windows-update-testing.md` om de automatische updateflow te valideren.  
   - Test minimaal één import van een studiewijzer (DOCX of PDF) en controleer week-, matrix- en eventoverzicht.
4. **Installers en artifacts publiceren**  
   - Maak een Git-tag `v2.0.0` en upload `VlierPlanner-Setup-2.0.0.exe` plus de standalone `VlierPlanner-2.0.0.exe` naar de release.  
   - Voeg een `SHA256: ...` regel toe aan de releasenotes zodat de automatische updater de download kan verifiëren.
5. **Communicatie**  
   - Publiceer de releasenotes (zie hieronder) op het intranet of de projectpagina.  
   - Informeer pilotdocenten en leerlingen dat ze de nieuwe versie via de automatische update ontvangen.

## Releasenotes v2.0.0
- Eerste publieke versie met volledige studiewijzer-workflow: uploaden, normaliseren, reviewen en publiceren vanuit één applicatie.  
- Complete plannerervaring met week- en matrixoverzicht, filterbare eventlijst en thema-editor voor een gepersonaliseerde look & feel.  
- Onboarding-tour voor nieuwe gebruikers en automatische updatecontrole met optionele handmatige installatie.  
- Ingebouwde ondersteuning voor schoolvakanties via rijksoverheid.nl zodat lesvrije dagen meteen zichtbaar zijn in de planning.  
- Windows distributie met geïntegreerde frontend-build en automatische self-update voor toekomstige releases.
