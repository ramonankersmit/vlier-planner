Een eenvoudige planner voor studiewijzers van het voortgezet onderwijs. Upload een \*.pdf of \*.docx en krijg een weekoverzicht
met lesstof, huiswerk en deadlines per vak.

## Functionaliteit
- FastAPI-backend met parsers voor PDF en DOCX.
- Genormaliseerde JSON-output en eenvoudige API voor weeks, agenda, matrix en assessments.
- React + Vite + Tailwind frontend voor het tonen en filteren van weken.
- Upload, lijst en verwijder studiewijzers via de API.
- Tijdelijke opslag op schijf en in-memory index (MVP).

## Projectstructuur
```
vlier-planner/
  backend/      FastAPI-backend
  frontend/     React/Vite/Tailwind frontend
  docs/         Documentatie
  samples/      Voorbeeldbestanden
  tools/        Hulpscripts
```

## Local dev
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload

cd frontend
npm install
npm run dev
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
