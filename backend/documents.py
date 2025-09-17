"""Helpers for working with parsed documents and derived metadata."""

from __future__ import annotations

import json
from html import escape
from typing import Any, Iterable, Mapping, Sequence

from backend.paths import parsed_data_dir
from backend.schemas.normalized import NormalizedModel

DATA_DIR = parsed_data_dir()
INDEX_FILE = DATA_DIR / "index.json"


def load_index() -> list[dict[str, Any]]:
    """Return the stored index of parsed documents."""

    if INDEX_FILE.exists():
        with INDEX_FILE.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    return []


def save_index(index: list[dict[str, Any]]) -> None:
    """Persist the index of parsed documents."""

    with INDEX_FILE.open("w", encoding="utf-8") as fh:
        json.dump(index, fh, indent=2)


def load_normalized_model(parse_id: str) -> NormalizedModel | None:
    """Load a stored :class:`NormalizedModel` for the given identifier."""

    path = DATA_DIR / f"{parse_id}.json"
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as fh:
        return NormalizedModel.model_validate_json(fh.read())


def _collect_weeks_and_years(model: NormalizedModel) -> tuple[list[int], list[int]]:
    weeks = [w.week for w in model.weeks if w.week is not None]
    years = [w.year for w in model.weeks if w.year is not None]

    if not weeks:
        weeks.extend(s.week for s in model.sessions if s.week is not None)
    if not years:
        years.extend(s.year for s in model.sessions if s.year is not None)

    if not weeks:
        weeks.extend(a.week_due for a in model.assessments if a.week_due is not None)
    if not years:
        years.extend(a.year_due for a in model.assessments if a.year_due is not None)

    return weeks, years


def build_doc_meta(parse_id: str, source_file: str, model: NormalizedModel) -> dict[str, Any]:
    """Construct the document metadata expected by the frontend."""

    study_unit = model.study_units[0] if model.study_units else None
    vak = study_unit.name if study_unit else source_file
    niveau = (study_unit.level or "Onbekend").upper() if study_unit else "ONBEKEND"
    leerjaar = str(study_unit.year) if study_unit and study_unit.year is not None else ""
    periode = study_unit.period if study_unit and study_unit.period is not None else 1

    weeks, years = _collect_weeks_and_years(model)
    begin_week = min(weeks) if weeks else 1
    eind_week = max(weeks) if weeks else begin_week

    schooljaar: str | None = None
    if years:
        start_year = min(years)
        end_year = max(years)
        if end_year == start_year:
            schooljaar = f"{start_year}-{start_year + 1}"
        else:
            schooljaar = f"{start_year}-{end_year}"

    return {
        "fileId": parse_id,
        "bestand": source_file,
        "vak": vak,
        "niveau": niveau,
        "leerjaar": leerjaar,
        "periode": periode,
        "beginWeek": begin_week,
        "eindWeek": eind_week,
        "schooljaar": schooljaar,
        "parsedAt": model.meta.parsed_at,
    }


def _session_to_row(session) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    resources = [
        {"type": "link", "title": res.label, "url": res.url}
        for res in session.resources
        if getattr(res, "label", None) or getattr(res, "url", None)
    ]

    return {
        "week": session.week,
        "datum": session.date,
        "les": session.type.capitalize() if session.type else None,
        "onderwerp": session.topic,
        "leerdoelen": None,
        "huiswerk": None,
        "opdracht": None,
        "inleverdatum": None,
        "toets": None,
        "bronnen": resources or None,
        "notities": None,
        "klas_of_groep": None,
        "locatie": session.location,
    }


def _assessment_to_row(assessment) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    weight_pct = f"{round(assessment.weight * 100)}%" if assessment.weight is not None else None
    return {
        "week": assessment.week_due,
        "datum": None,
        "les": "Toets",
        "onderwerp": assessment.title,
        "leerdoelen": None,
        "huiswerk": None,
        "opdracht": None,
        "inleverdatum": None,
        "toets": {
            "type": "assessment",
            "weging": weight_pct,
            "herkansing": None,
        },
        "bronnen": None,
        "notities": None,
        "klas_of_groep": None,
        "locatie": None,
    }


def build_doc_rows(model: NormalizedModel) -> list[dict[str, Any]]:
    """Create tabular rows for the frontend based on the normalized model."""

    rows = [_session_to_row(session) for session in model.sessions]
    rows.extend(_assessment_to_row(assessment) for assessment in model.assessments)

    def sort_key(row: Mapping[str, Any]) -> tuple[int, str]:
        week = row.get("week") or 0
        datum = row.get("datum") or ""
        return int(week), str(datum)

    rows.sort(key=sort_key)
    return rows


def build_doc_preview_html(
    meta: Mapping[str, Any],
    rows: Sequence[Mapping[str, Any]],
    warnings: Iterable[Mapping[str, Any]] | Iterable[Any],
) -> str:
    """Render a tiny HTML preview summarising a parsed document."""

    warning_rows = "".join(
        f"<li><code>{escape(str(w.get('code', '')))}</code>: {escape(str(w.get('message', '')))}</li>"
        for w in warnings
    )
    warnings_html = (
        f"<ul>{warning_rows}</ul>" if warning_rows else "<p>Geen waarschuwingen gevonden.</p>"
    )

    table_rows = "".join(
        "<tr>"
        + "".join(
            f"<td>{escape(str(row.get(col, '') or ''))}</td>"
            for col in ("week", "datum", "les", "onderwerp", "locatie")
        )
        + "</tr>"
        for row in rows[:25]
    )

    table_html = (
        "<table border='1' cellpadding='4' cellspacing='0'>"
        "<thead><tr><th>Week</th><th>Datum</th><th>Les</th><th>Onderwerp</th><th>Locatie</th></tr></thead>"
        f"<tbody>{table_rows or '<tr><td colspan=5>Geen rijen gevonden.</td></tr>'}</tbody>"
        "</table>"
    )

    week_range = ""
    if meta.get("beginWeek") or meta.get("eindWeek"):
        start = meta.get("beginWeek") or "?"
        end = meta.get("eindWeek") or start
        week_range = f"{start}–{end}"

    info_pairs = [
        ("Bestand", meta.get("bestand", "")),
        ("Vak", meta.get("vak", "")),
        ("Niveau", meta.get("niveau", "")),
        ("Leerjaar", meta.get("leerjaar", "")),
        ("Periode", meta.get("periode", "")),
    ]
    if week_range:
        info_pairs.append(("Weekbereik", week_range))
    if meta.get("schooljaar"):
        info_pairs.append(("Schooljaar", meta.get("schooljaar")))

    info_html = "".join(
        f"<li><strong>{escape(label)}:</strong> {escape(str(value or ''))}</li>"
        for label, value in info_pairs
    )

    return (
        "<html><head><meta charset='utf-8'><title>Voorvertoning</title>"
        "<style>body{font-family:system-ui,sans-serif;margin:24px;}"
        "table{border-collapse:collapse;margin-top:16px;width:100%;}"
        "th,td{text-align:left;font-size:12px;}</style></head><body>"
        "<h1>Documentvoorvertoning</h1>"
        f"<ul>{info_html}</ul>"
        "<h2>Waarschuwingen</h2>"
        f"{warnings_html}"
        "<h2>Voorbeeldregels</h2>"
        f"{table_html}"
        "</body></html>"
    )


def find_index_entry(parse_id: str, index: Sequence[Mapping[str, Any]]) -> Mapping[str, Any] | None:
    for entry in index:
        if entry.get("id") == parse_id:
            return entry
    return None

