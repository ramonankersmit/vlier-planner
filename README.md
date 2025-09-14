# Vlier Planner

Een eenvoudige planner voor studiewijzers van het voortgezet onderwijs. Upload een \*.pdf of \*.docx en krijg een weekoverzicht met lesstof, huiswerk en deadlines per vak.

## Functionaliteit
- FastAPI-backend met parsers voor PDF en DOCX.
- React + Vite + Tailwind frontend voor het tonen en filteren van weken.
- Upload, lijst en verwijder studiewijzers via de API.
- Tijdelijke opslag op schijf en in-memory index (MVP).

## Projectstructuur
```
vlier-planner/
  backend/      FastAPI-backend (parsen + API)
  frontend/     React/Vite/Tailwind frontend
  samples/      Voorbeeldbestanden
  tools/        Hulpscripts
```

## Snel starten (lokaal)
### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

## Gebruik
1. Start de backend (poort 8000).
2. Start de frontend (poort 5173).
3. Upload een studiewijzer (.pdf/.docx).
4. Bekijk taken per week en verwijder documenten indien gewenst.

## Ontwikkeling
- De repository bevat een `.devcontainer` voor gebruik in GitHub Codespaces (Python 3.11 en Node 20).
- Exporteer naar CSV/iCal is nog niet geïmplementeerd.

## Licentie
MIT
