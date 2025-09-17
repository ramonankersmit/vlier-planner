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
- Verborgen taken blijven beschikbaar in een _“Verborgen huiswerk”_-lijst zodat je ze eenvoudig kunt herstellen.

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

## Gebruik
1. Start de backend op poort 8000.
2. Start de frontend op poort 5173.
3. Upload één of meerdere studiewijzers via _Uploads_.
4. Beheer huiswerk in Weekoverzicht of Matrix overzicht en bekijk events via _Belangrijke events_.

## Overige info
- De repo bevat een `.devcontainer` voor GitHub Codespaces (Python 3.11 + Node 20).
- Exporteren naar CSV/iCal is nog niet geïmplementeerd.

## Licentie
MIT
