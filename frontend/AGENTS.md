# Frontend richtlijnen

Deze afspraken gelden voor alle bestanden in `frontend/` en de onderliggende mappen.

- Gebruik functionele React-componenten met hooks; voorkom klassecomponenten.
- Typ alle nieuwe state en props met TypeScript types of interfaces. Houd shared types in `frontend/src/app` of `frontend/src/lib` als ze door meerdere modules worden gebruikt.
- UI-tekst en validatiemeldingen zijn in het Nederlands. Houd component- en variabelenamen in het Engels voor consistentie met de bestaande code.
- Styling verloopt via Tailwind utility-klassen en bestaande CSS-modules; voeg geen globale CSS toe zonder noodzaak.
- Als je nieuwe iconen nodig hebt, kies ze uit `lucide-react` om de bundel consistent te houden.
- Voor nieuwe logica schrijf je Vitest/Testing Library tests waar dat zinvol is. Motiveer in de PR als een test niet haalbaar is.
- Draai `npm test` bij wijzigingen in `src/` en vermeld het resultaat in je rapportage.
