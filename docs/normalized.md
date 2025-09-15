# Genormaliseerd datamodel

Dit document beschrijft het schema waarop zowel parser als API gebaseerd zijn. Alle data wordt naar dit model genormaliseerd en als JSON opgeslagen.

## Structuur

```json
{
  "meta": {"source": "<bestandsnaam>", "parsed_at": "<ISO8601>"},
  "study_units": [
    {"id": "SU-1", "name": "Wiskunde", "level": "HBO", "year": 2, "period": 1}
  ],
  "weeks": [
    {"week": 38, "year": 2025, "start": "2025-09-15", "end": "2025-09-21"}
  ],
  "sessions": [
    {
      "id": "S-1",
      "study_unit_id": "SU-1",
      "week": 38,
      "year": 2025,
      "date": "2025-09-18",
      "type": "lecture",
      "topic": "Differentiaalrekening",
      "location": "B2.14",
      "resources": [{"label": "Slides", "url": "https://..."}]
    }
  ],
  "assessments": [
    {
      "id": "A-1",
      "study_unit_id": "SU-1",
      "week_due": 41,
      "year_due": 2025,
      "title": "Tussentoets",
      "weight": 0.3
    }
  ],
  "warnings": [
    {"code": "WEEK_OUT_OF_RANGE", "message": "Week 54 aangetroffen", "context": {"week": 54}}
  ]
}
```

### Regels
- `week` is altijd een geheel getal 1–52 (soms 53). Buiten dit bereik wordt een warning toegevoegd.
- `date` is een ISO‑8601 datumstring `YYYY-MM-DD`.
- `sessions.type` is één van `lecture`, `workshop`, `exam`, `deadline` of `other`.
- IDs zijn strings en stabiel binnen één parse-run.
- `warnings` is optioneel maar wordt gevuld wanneer onregelmatigheden gedetecteerd worden.
