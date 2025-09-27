from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from uuid import uuid4

from backend.models import DocMeta, DocRow
from backend.parsers import extract_meta_from_docx, extract_rows_from_docx

try:  # pragma: no cover - pdf parsing is optional in CI
    from backend.parsers import extract_meta_from_pdf, extract_rows_from_pdf
except Exception:  # pragma: no cover
    extract_meta_from_pdf = extract_rows_from_pdf = None  # type: ignore

from backend.schemas.normalized import (
    Assessment,
    NormalizedModel,
    Session,
    StudyUnit,
    Week,
    Warning,
)

from backend.services.data_store import data_store


def _parse_school_year(value: Optional[str]) -> Optional[Tuple[int, int]]:
    if not value:
        return None

    cleaned = value.replace("-", " ").replace("_", " ").replace("/", " ")
    parts = [p for p in cleaned.split() if p.isdigit()]
    if len(parts) < 2:
        return None

    def _normalize_year(fragment: str) -> Optional[int]:
        try:
            year = int(fragment)
        except ValueError:
            return None
        if year < 100:
            year += 2000 if year < 70 else 1900
        if year < 1900 or year > 2100:
            return None
        return year

    start = _normalize_year(parts[0])
    end = _normalize_year(parts[1])
    if start is None or end is None:
        return None
    if end < start:
        end, start = start, end
    return start, end


def _resolve_year_for_week(
    week: int,
    school_year: Optional[Tuple[int, int]],
    reference_date: Optional[str],
) -> int:
    if reference_date:
        try:
            return date.fromisoformat(reference_date).isocalendar().year
        except ValueError:
            pass
    if school_year:
        start, end = school_year
        return start if week >= 30 else end
    return datetime.now(timezone.utc).year


def _week_bounds(year: int, week: int) -> Tuple[str, str]:
    monday = date.fromisocalendar(year, week, 1)
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


def _parse_weight(value: Optional[str]) -> Tuple[float, bool]:
    if value is None:
        return 0.0, False
    cleaned = value.replace("%", " ").replace(",", ".").strip()
    for token in cleaned.split():
        try:
            numeric = float(token)
        except ValueError:
            continue
        if numeric > 1:
            numeric /= 100.0
        return numeric, True
    return 0.0, False


def _ensure_weeks(
    existing: Dict[Tuple[int, int], Week],
    week_numbers: Iterable[int],
    school_year: Optional[Tuple[int, int]],
    reference_date: Optional[str],
) -> None:
    for week in week_numbers:
        if not (1 <= week <= 53):
            continue
        year = _resolve_year_for_week(week, school_year, reference_date)
        if (week, year) in existing:
            continue
        start, end = _week_bounds(year, week)
        existing[(week, year)] = Week(week=week, year=year, start=start, end=end)


def parse_to_normalized(path: str) -> Tuple[str, NormalizedModel]:
    source_path = Path(path)
    source = source_path.name
    parsed_at = datetime.now(timezone.utc).isoformat()

    meta: Optional[DocMeta] = None
    rows: List[DocRow] = []

    suffix = source_path.suffix.lower()
    parse_error: Optional[Exception] = None
    if suffix == ".docx":
        try:
            meta = extract_meta_from_docx(str(source_path), source)
            rows = extract_rows_from_docx(str(source_path), source)
        except Exception as exc:  # pragma: no cover - defensive
            parse_error = exc
            meta = None
            rows = []
    elif suffix == ".pdf" and extract_meta_from_pdf and extract_rows_from_pdf:
        try:
            meta = extract_meta_from_pdf(str(source_path), source)
            rows = extract_rows_from_pdf(str(source_path), source)
        except Exception as exc:  # pragma: no cover - defensive
            parse_error = exc
            meta = None
            rows = []
    else:
        raise ValueError(f"Unsupported file type: {suffix or 'unknown'}")

    warnings: List[Warning] = []

    if parse_error is not None:
        warnings.append(
            Warning(
                code="PARSING_FAILED",
                message="Bestand kon niet worden geparsed.",
                context={"source": source, "error": str(parse_error)},
            )
        )

    if meta is None:
        warnings.append(
            Warning(
                code="META_MISSING",
                message="Kon geen metadata extraheren uit het document.",
                context={"source": source},
            )
        )

    school_year = _parse_school_year(meta.schooljaar if meta else None)

    study_unit_id = meta.fileId if meta else f"SU-{uuid4().hex[:8]}"
    study_units: List[StudyUnit] = []
    if meta:
        try:
            leerjaar = int(meta.leerjaar)
        except (TypeError, ValueError):
            leerjaar = 0
            warnings.append(
                Warning(
                    code="INVALID_YEAR",
                    message="Leerjaar kon niet worden geïnterpreteerd als een getal.",
                    context={"value": meta.leerjaar},
                )
            )
        study_units.append(
            StudyUnit(
                id=study_unit_id,
                name=meta.vak,
                level=meta.niveau,
                year=leerjaar,
                period=meta.periode,
            )
        )
    else:
        fallback_name = source_path.stem or source
        study_units.append(
            StudyUnit(
                id=study_unit_id,
                name=fallback_name,
                level="UNKNOWN",
                year=0,
                period=0,
            )
        )

    weeks: Dict[Tuple[int, int], Week] = {}
    if meta:
        _ensure_weeks(weeks, range(meta.beginWeek, meta.eindWeek + 1), school_year, None)

    sessions: List[Session] = []
    assessments: List[Assessment] = []
    session_counter = 0
    assessment_counter = 0

    for row in rows:
        week = row.week
        if week is None and row.datum:
            try:
                week = date.fromisoformat(row.datum).isocalendar().week
            except ValueError:
                week = None
        if week is None:
            warnings.append(
                Warning(
                    code="WEEK_MISSING",
                    message="Lesregel zonder weeknummer gevonden.",
                    context={"source": source},
                )
            )
            continue

        if meta and (week < meta.beginWeek or week > meta.eindWeek):
            warnings.append(
                Warning(
                    code="WEEK_OUT_OF_RANGE",
                    message="Week valt buiten de periode van de studiewijzer.",
                    context={"week": week, "begin": meta.beginWeek, "end": meta.eindWeek},
                )
            )

        reference_date = row.datum
        if not reference_date:
            warnings.append(
                Warning(
                    code="SESSION_DATE_MISSING",
                    message="Geen datum gevonden voor week.",
                    context={"week": week, "source": source},
                )
            )

        year = _resolve_year_for_week(week, school_year, reference_date)
        start, _ = _week_bounds(year, week)
        _ensure_weeks(weeks, [week], school_year, reference_date)

        session_counter += 1
        session_id = f"{study_unit_id}-S{session_counter:03d}"
        session_type = "lecture"
        if row.toets:
            session_type = "exam"
        elif row.inleverdatum:
            session_type = "deadline"
        elif row.huiswerk or row.opdracht:
            session_type = "workshop"

        session_date = reference_date or start
        topic = row.onderwerp or row.les

        resources = []
        if row.bronnen:
            for item in row.bronnen:
                if not isinstance(item, dict):
                    continue
                url = item.get("url")
                if not url:
                    continue
                label = item.get("title") or url
                resources.append({"label": label, "url": url})

        sessions.append(
            Session(
                id=session_id,
                study_unit_id=study_unit_id,
                week=week,
                year=year,
                date=session_date,
                type=session_type,
                topic=topic,
                location=row.locatie,
                resources=resources,
            )
        )

        toets_info = row.toets if isinstance(row.toets, dict) else None
        if toets_info or row.inleverdatum:
            weight, parsed_weight = _parse_weight(toets_info.get("weging") if toets_info else None)
            if toets_info and not parsed_weight:
                warnings.append(
                    Warning(
                        code="ASSESSMENT_WEIGHT_UNKNOWN",
                        message="Geen geldige weging gevonden voor toets.",
                        context={"week": week},
                    )
                )

            due_date = row.inleverdatum or reference_date or session_date
            due_year = year
            due_week = week
            try:
                due_dt = date.fromisoformat(due_date)
                iso = due_dt.isocalendar()
                due_year = iso.year
                due_week = iso.week
            except ValueError:
                pass

            assessment_counter += 1
            title = (toets_info or {}).get("type") if toets_info else None
            if not title:
                title = row.opdracht or row.onderwerp or row.les or "Assessment"

            assessments.append(
                Assessment(
                    id=f"{study_unit_id}-A{assessment_counter:03d}",
                    study_unit_id=study_unit_id,
                    week_due=due_week,
                    year_due=due_year,
                    title=title,
                    weight=weight,
                )
            )

    weeks_sorted = [weeks[key] for key in sorted(weeks)]

    model = NormalizedModel(
        meta={"source": source, "parsed_at": parsed_at},
        study_units=study_units,
        weeks=weeks_sorted,
        sessions=sessions,
        assessments=assessments,
        warnings=warnings,
    )

    parse_id = uuid4().hex
    data_store.write_normalized_model(parse_id, model.model_dump())
    data_store.append_normalized_index_entry(
        {
            "id": parse_id,
            "source_file": source,
            "created_at": parsed_at,
            "status": "ready",
        }
    )

    return parse_id, model

