# Backend richtlijnen

Deze aanwijzingen gelden voor alle bestanden in `backend/`.

- Python-code gebruikt type hints en Pydantic-modellen; voeg annotaties toe bij nieuwe functies en parameters.
- Gebruik FastAPI-conventies: valideer input met `pydantic`-modellen of `Query`/`Body` parameters en werp `HTTPException` bij foutscenario's.
- Houd bestands- en functienamen beschrijvend en in het Engels; vertaal user-facing strings naar het Nederlands.
- Bij nieuwe afhankelijkheden update je `backend/requirements.txt` en beschrijf je in de commit waarom ze nodig zijn.
- Schrijf waar mogelijk doctests of unit-tests in `tests/` (pytest). Als testen niet haalbaar zijn, motiveer dat in de PR-beschrijving.
- Draai alle relevante backend-tests (pytest, linting, integratietests) zodra je wijzigingen aanbrengt; beperk je niet tot alleen de scenario's die rechtstreeks met de nieuwe functionaliteit te maken hebben als er bredere impact is.
- Respecteer de bestaande fallback-imports voor bundling; voeg geen nieuwe `try/except` rond imports toe tenzij het platformverschillen oplost.
- Houd de API altijd backwards compatible; introduceer breaking changes alleen via een uitgewerkt migratieplan met versiecommunicatie.
