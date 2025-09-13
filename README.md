# StuPlan (MVP)

Een super-simpele planner: upload studiewijzers (.pdf/.docx) en krijg per week wat je moet doen per vak.

## Projectstructuur
```
stuplan-mvp/
  backend/          FastAPI-backend met parser (.pdf/.docx -> gestandaardiseerde taken)
  frontend/         React + Vite + Tailwind UI (weekoverzicht + filters)
  .devcontainer/    Codespaces ontwikkelomgeving (Python 3.11 + Node 20)
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
1. Start backend (poort 8000).
2. Start frontend (poort 5173).
3. Upload een ZIP of losse bestanden (.pdf/.docx). Je krijgt een weekweergave met taken per vak.
4. Exporteer naar CSV/iCal via de UI-knoppen (placeholder in MVP).

## Deploy naar GitHub
```bash
git init
git add .
git commit -m "Init StuPlan MVP"
git branch -M main
git remote add origin https://github.com/<jouw-user>/stuplan-mvp.git
git push -u origin main
```

## Codespaces (GitHub)
- Open de repo in **Codespaces**; de **.devcontainer** installeert Python 3.11 en Node 20.
- Terminal 1: `cd backend && uvicorn app:app --host 0.0.0.0 --port 8000`
- Terminal 2: `cd frontend && npm run dev -- --host`

## Uitbreiding met ChatGPT “coding” (Codex/Assistants)
- Voeg een **.github/ISSUE_TEMPLATE** toe en gebruik ChatGPT om parsingregels te verfijnen (prompt in `backend/parser/PROMPTS.md`).
- Koppel de repo in ChatGPT (upload/links) en vraag gerichte refactors.
- Alternatief: gebruik **GitHub Copilot Chat** in Codespaces voor inline aanpassingen.

## Licentie
MIT
