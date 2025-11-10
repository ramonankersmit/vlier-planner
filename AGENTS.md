# Richtlijnen voor deze repository

Deze afspraken gelden voor de volledige broncode en documentatie in `vlier-planner`.

- Schrijf commit- en PR-teksten in het Nederlands.
- Houd gebruikersgerichte teksten (UI, notificaties, documentatie) in het Nederlands; technische identifier- en codecommentaar mag in het Engels zolang het consequent is binnen het bestand.
- Pas `VERSION.ini` alleen aan wanneer je een release voorbereidt en voer dan direct `npm run sync-version` uit vanuit de map `frontend` zodat versies gelijk blijven.
- Voeg bij wijzigingen in documentatie of configuratie steeds een korte toelichting toe in dezelfde commit zodat reviewers de context hebben.
- Draai waar mogelijk de relevante tests voor de onderdelen die je aanpast (zie de meer specifieke AGENTS in submappen) en vermeld het resultaat in je eindrapportage.
- Werk lockfiles (`package-lock.json`, `backend/requirements.txt` e.d.) altijd mee als je afhankelijkheden wijzigt.
- Introduceer je nieuwe functionaliteit die gebruikersdata raakt (zoals schema's, thema's of taken), zorg dan dat je de migratie
  vanaf de laatst uitgebrachte versie bijwerkt zodat bestaande installaties correct worden meegenomen.
- Heb je samplebestanden nodig, haal deze dan op met `tools/fetch_onedrive_folder.py` zodat ze automatisch in `/samples` terechtkomen.
