# Handmatige validatie backend/frontend (10 november 2025)

## Samenvatting
- OneDrive-samples gedownload via `tools/fetch_onedrive_folder.py` met de gedeelde Google Drive-link.
- Backend gestart met Uvicorn en upload-API gecontroleerd met een studiewijzer uit `samples/2526_Studiewijzers/4 vwo/Periode 2`.
- Frontend dev-server via Vite gestart en bevestigd dat hij HTML teruggeeft.

## Details
1. `.env` geconfigureerd met de gedeelde link en `python tools/fetch_onedrive_folder.py` uitgevoerd om de ZIP (≈18 MB) te downloaden en uit te pakken naar `samples/`. Dit leverde 128 bestanden op, inclusief de gevraagde `4 vwo/Periode 2`-map.
2. Backend afhankelijkheden gecontroleerd met `pip install -r backend/requirements.txt` en de FastAPI-app gestart via `uvicorn backend.main:app --host 0.0.0.0 --port 8000`.
3. Frontend afhankelijkheden bijgewerkt met `npm install` in `frontend/` en de dev-server gestart via `npm run dev -- --host 0.0.0.0 --port 5173`.
4. `curl -I http://127.0.0.1:5173` gebruikt om te bevestigen dat de frontend 200 OK en HTML retourneert.
5. `curl -X POST -F "file=@samples/2526_Studiewijzers/4 vwo/Periode 2/Maatschappijleer_4vwo_p2.docx" http://127.0.0.1:8000/api/uploads` aangeroepen. De backend antwoordde met een `parse_id` en status `ready` zonder waarschuwingen.

## Resultaat
Alle stappen verliepen succesvol: downloads geslaagd, beide servers draaien lokaal en de bestandupload is geaccepteerd door de backend.
