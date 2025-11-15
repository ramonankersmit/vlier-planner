from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, Set
from uuid import uuid4

from backend.models import DocMeta
from backend.parsers import RawEntry, extract_meta_from_docx, extract_entries_from_docx

try:  # pragma: no cover - pdf parsing is optional in CI
    from backend.parsers import extract_meta_from_pdf, extract_entries_from_pdf
except Exception:  # pragma: no cover
    extract_meta_from_pdf = extract_entries_from_pdf = None  # type: ignore
from backend.schemas.normalized import (
    Assessment,
    NormalizedModel,
    Session,
    StudyUnit,
    Week,
    Warning,
)

from backend.services.data_store import data_store

DATA_DIR = Path(__file__).resolve().parent / "data"


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
        try:
            start, end = _week_bounds(year, week)
        except ValueError:
            continue
        existing[(week, year)] = Week(week=week, year=year, start=start, end=end)


def _iter_weeks_from_meta(begin: int, end: int) -> Iterable[int]:
    if begin <= 0 or end <= 0:
        return []
    if begin <= end:
        return range(begin, end + 1)
    return list(range(begin, 54)) + list(range(1, end + 1))


def _week_in_meta_range(week: int, begin: int, end: int) -> bool:
    if begin <= 0 or end <= 0:
        return True
    if begin <= end:
        return begin <= week <= end
    return week >= begin or week <= end


def parse_to_normalized(path: str) -> Tuple[str, NormalizedModel]:
    source_path = Path(path)
    source = source_path.name
    parsed_at = datetime.now(timezone.utc).isoformat()

    meta: Optional[DocMeta] = None
    entries: List[RawEntry] = []

    suffix = source_path.suffix.lower()
    parse_error: Optional[Exception] = None
    if suffix == ".docx":
        try:
            meta = extract_meta_from_docx(str(source_path), source)
            entries = extract_entries_from_docx(str(source_path), source)
        except Exception as exc:  # pragma: no cover - defensive
            parse_error = exc
            meta = None
            entries = []
    elif suffix == ".pdf" and extract_meta_from_pdf and extract_entries_from_pdf:
        try:
            meta = extract_meta_from_pdf(str(source_path), source)
            entries = extract_entries_from_pdf(str(source_path), source)
        except Exception as exc:  # pragma: no cover - defensive
            parse_error = exc
            meta = None
            entries = []
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
        _ensure_weeks(
            weeks,
            _iter_weeks_from_meta(meta.beginWeek, meta.eindWeek),
            school_year,
            None,
        )

    sessions: List[Session] = []
    assessments: List[Assessment] = []
    session_counter = 0
    assessment_counter = 0

    for entry in entries:
        week_candidates: List[int] = []
        if entry.weeks:
            week_candidates.extend([wk for wk in entry.weeks if isinstance(wk, int)])
        if not week_candidates and entry.week_span_start and entry.week_span_end:
            start = entry.week_span_start
            end = entry.week_span_end
            if start <= end:
                week_candidates.extend(list(range(start, end + 1)))
            else:
                week_candidates.extend([start, end])
        elif not week_candidates and entry.week_span_start:
            week_candidates.append(entry.week_span_start)
        elif not week_candidates and entry.week_span_end:
            week_candidates.append(entry.week_span_end)

        normalized_weeks: List[int] = []
        seen_weeks: Set[int] = set()
        for candidate in week_candidates:
            if not isinstance(candidate, int):
                continue
            if 1 <= candidate <= 53 and candidate not in seen_weeks:
                seen_weeks.add(candidate)
                normalized_weeks.append(candidate)

        week_numbers = normalized_weeks
        if not week_numbers and entry.start_date:
            try:
                derived = date.fromisoformat(entry.start_date).isocalendar().week
                if 1 <= derived <= 53:
                    week_numbers = [derived]
            except ValueError:
                week_numbers = []

        if not week_numbers:
            warnings.append(
                Warning(
                    code="WEEK_MISSING",
                    message="Lesregel zonder weeknummer gevonden.",
                    context={"source": source, "rowId": entry.source_row_id},
                )
            )
            continue

        anchor_week = week_numbers[0]

        if meta:
            out_of_range = [wk for wk in week_numbers if not _week_in_meta_range(wk, meta.beginWeek, meta.eindWeek)]
            if out_of_range:
                warnings.append(
                    Warning(
                        code="WEEK_OUT_OF_RANGE",
                        message="Week valt buiten de periode van de studiewijzer.",
                        context={
                            "weeks": out_of_range,
                            "begin": meta.beginWeek,
                            "end": meta.eindWeek,
                            "rowId": entry.source_row_id,
                        },
                    )
                )

        if not (entry.start_date or entry.end_date):
            warnings.append(
                Warning(
                    code="SESSION_DATE_MISSING",
                    message="Geen datum gevonden voor week.",
                    context={"weeks": week_numbers, "source": source, "rowId": entry.source_row_id},
                )
            )

        week_dates: Dict[int, Optional[str]] = {}
        if entry.start_date:
            week_dates[anchor_week] = entry.start_date
        if entry.end_date:
            week_dates[week_numbers[-1]] = entry.end_date

        for wk in week_numbers:
            ref = week_dates.get(wk)
            if ref is None and entry.end_date and wk == week_numbers[-1]:
                ref = entry.end_date
            if ref is None:
                ref = entry.start_date
            _ensure_weeks(weeks, [wk], school_year, ref)

        session_type = "lecture"
        if entry.is_holiday:
            session_type = "holiday"
        elif entry.exam:
            session_type = "exam"
        elif entry.due_date or entry.deadline_text:
            session_type = "deadline"
        elif entry.homework or entry.assignment:
            session_type = "workshop"

        topic = entry.topic or entry.lesson
        if entry.is_holiday and not topic:
            topic = entry.deadline_text or "Vakantie"

        resources: List[Dict[str, str]] = []
        if entry.resources:
            for item in entry.resources:
                if not isinstance(item, dict):
                    continue
                url = item.get("url")
                if not url:
                    continue
                label = item.get("title") or item.get("label") or url
                resources.append({"label": label, "url": url})

        session_dates: Dict[int, str] = {}
        for wk in week_numbers:
            ref = week_dates.get(wk)
            if ref is None and entry.end_date and wk == week_numbers[-1]:
                ref = entry.end_date
            if ref is None:
                ref = entry.start_date
            iso_year = _resolve_year_for_week(wk, school_year, ref)
            start, _ = _week_bounds(iso_year, wk)
            session_date = ref or start
            session_counter += 1
            session_id = f"{study_unit_id}-S{session_counter:03d}"
            sessions.append(
                Session(
                    id=session_id,
                    study_unit_id=study_unit_id,
                    week=wk,
                    year=iso_year,
                    date=session_date,
                    type=session_type,
                    topic=topic,
                    location=entry.location,
                    resources=resources,
                )
            )
            session_dates[wk] = session_date

        toets_info = entry.exam if isinstance(entry.exam, dict) else None
        deadline_hint = entry.deadline_text
        has_deadline = bool(toets_info or entry.due_date or deadline_hint)
        if has_deadline:
            weight, parsed_weight = _parse_weight(toets_info.get("weging") if toets_info else None)
            if toets_info and not parsed_weight:
                warnings.append(
                    Warning(
                        code="ASSESSMENT_WEIGHT_UNKNOWN",
                        message="Geen geldige weging gevonden voor toets.",
                        context={"weeks": week_numbers, "rowId": entry.source_row_id},
                    )
                )

            due_date = entry.due_date or entry.end_date or session_dates.get(week_numbers[-1])
            if not due_date and deadline_hint:
                due_date = session_dates.get(anchor_week) or entry.start_date
            if not due_date:
                due_date = session_dates.get(week_numbers[-1]) or session_dates.get(anchor_week)

            due_year = _resolve_year_for_week(anchor_week, school_year, due_date)
            due_week = anchor_week
            try:
                if due_date:
                    due_dt = date.fromisoformat(due_date)
                    iso = due_dt.isocalendar()
                    due_year = iso.year
                    due_week = iso.week
            except ValueError:
                pass

            assessment_counter += 1
            title = (toets_info or {}).get("type") if toets_info else None
            if not title:
                title = deadline_hint or entry.assignment or entry.topic or entry.lesson or "Assessment"

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

    weeks_sorted = sorted(weeks.values(), key=lambda item: (item.year, item.week))

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

