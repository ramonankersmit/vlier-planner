# Studiewijzer-versiebeheer en reviewwizard

Deze release introduceert versiebeheer voor alle studiewijzers en een verplichte reviewstap vóór publicatie. Belangrijkste punten:

## Versiebeheer

- Elke studiewijzer krijgt een stabiel `guideId` op basis van vak/niveau/leerjaar/periode en behoudt een eigen versiereeks (`versionId`).
- Nieuwe uploads komen binnen als pending review en worden pas na commit toegevoegd als nieuwe versie. Bij commit schrijft de backend het bronbestand weg naar `storage/uploads/{guideId}/{versionId}`.
- De backend berekent diff-samenvattingen en detaildifferences op rij- én veldniveau. Deze worden opgeslagen in `state.json` zodat diffinformatie ook na herstart beschikbaar blijft.
- API-endpoints:
  - `GET /api/study-guides` → lijst van gidsen met laatst bekende versie.
  - `GET /api/study-guides/{guideId}/versions` → alle versies (nieuwste eerst).
  - `GET /api/study-guides/{guideId}/diff/{versionId}` → diffdetail van een specifieke versie.
  - Bestaande `/api/docs/*`-routes accepteren optioneel `versionId` voor backwards compatibility.

## Reviewwizard

- `POST /api/uploads` retourneert nu een lijst pending parses met `parseId`, diffresultaat en parserwaarschuwingen (onbekend vak, ontbrekende week, dubbele datum).
- Pending parses worden zowel in-memory als onder `storage/pending/{parseId}.json` bewaard en kunnen tussentijds worden aangepast via:
  - `GET /api/reviews/{parseId}`
  - `PATCH /api/reviews/{parseId}`
  - `POST /api/reviews/{parseId}/commit`
  - `DELETE /api/reviews/{parseId}`
- De frontend opent na upload automatisch de reviewwizard. Zolang er waarschuwingen actief zijn, blijft de commitknop uitgeschakeld. De gebruiker kan metadata en rijen corrigeren en het diff-overzicht bekijken voordat hij commit.
- Na een succesvolle commit hydrate de planner-store meteen met de nieuwe versie; bestaande consumenten kunnen via de oude endpoints blijven werken.

### Navigatie en openstaande reviews

- De uploadspagina toont een amberkleurige callout zodra er pending reviews klaarstaan. Van daaruit kun je direct naar de reviewwizard springen of een specifieke review kiezen.
- In de wizard zie je links een lijst met openstaande reviews inclusief diff-samenvatting en waarschuwingen. Klik op een item om over te schakelen; het actieve item wordt gemarkeerd.

### Onzekerheden oplossen

| Waarschuwing        | Betekenis & oplossing |
| ------------------- | --------------------- |
| **Vak onbekend**    | Vul het vak in bij de metadata en kies *Wijzigingen opslaan* om het vak te bevestigen. |
| **Week ontbreekt**  | Controleer welke rijen in de tabel het label *Weeknummer ontbreekt* tonen. Vul het weeknummer in of verwijder de rij als deze niet meegenomen hoeft te worden. |
| **Dubbele datum**   | Dezelfde datum komt meerdere keren voor. Pas de datum aan of gebruik de knop *Rij verwijderen* om dubbelen te schrappen. Sla daarna de review op. |

Je kunt rijen direct in de tabel aanpassen, inclusief het verwijderen van rijen die niet gepubliceerd hoeven te worden. Elke wijziging wordt visueel gemarkeerd zodat je precies ziet welke velden aandacht vragen.

## Frontendwijzigingen

- Uploadpagina bevat nu een versiehistoriepaneel inclusief diffkleuren per veld.
- Nieuwe pagina `/review` begeleidt de gebruiker door upload → correctie → commit.
- Store (`frontend/src/app/store.ts`) houdt versies, diffs, pending reviews en commitresultaten bij.

Zie de backendtests (`tests/test_study_guides_api.py`) en frontendtests (`frontend/src/app/store.test.ts`, `frontend/src/pages/__tests__/Review.test.tsx`) voor concrete scenario's.
