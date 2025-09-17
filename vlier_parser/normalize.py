from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, List, Tuple
from uuid import uuid4

from backend.documents import load_index, save_index
from backend.models import DocMeta, DocRow
from backend.parsers import (
    extract_meta_from_docx,
    extract_meta_from_pdf,
    extract_rows_from_docx,
    extract_rows_from_pdf,
)
from backend.paths import parsed_data_dir
from backend.schemas.normalized import (
    NormalizedModel,
    Resource,
    Session,
    StudyUnit,
    Week,
    Warning,
)


DATA_DIR = parsed_data_dir()


def _parse_schooljaar(value: str | None) -> tuple[int | None, int | None]:
    if not value:
        return None, None
    parts = value.replace("-", "/").split("/")
    if len(parts) != 2:
        return None, None
    try:
        start = int(parts[0])
        end = int(parts[1])
    except ValueError:
        return None, None
    if start < 100:
        start += 2000
    if end < 100:
        end += 2000
    return start, end


def _ensure_year(week: int, datum: str | None, schooljaar: str | None) -> int:
    if datum:
        try:
            return date.fromisoformat(datum).year
        except ValueError:
            pass
    start, end = _parse_schooljaar(schooljaar)
    if start and end:
        return start if week >= 32 else end
    return datetime.utcnow().year


def _iso_week_bounds(year: int, week: int) -> tuple[str, str]:
    try:
        monday = date.fromisocalendar(year, week, 1)
        sunday = date.fromisocalendar(year, week, 7)
    except ValueError:
        today = datetime.utcnow().date()
        return today.isoformat(), today.isoformat()
    return monday.isoformat(), sunday.isoformat()


def _build_resources(bronnen: Iterable[dict[str, str]] | None) -> list[Resource]:
    if not bronnen:
        return []
    resources: list[Resource] = []
    for entry in bronnen:
        title = entry.get("title") or entry.get("label") or entry.get("url") or "Bron"
        url = entry.get("url") or ""
        if not url:
            continue
        resources.append(Resource(label=title, url=url))
    return resources


def _build_sessions(
    meta: DocMeta, rows: List[DocRow], study_unit_id: str
) -> tuple[list[Session], list[Warning]]:
    sessions: list[Session] = []
    warnings: list[Warning] = []

    for idx, row in enumerate(rows, start=1):
        if row.week is None:
            warnings.append(
                Warning(
                    code="ROW_MISSING_WEEK",
                    message="Rij zonder weeknummer overgeslagen",
                    context={"row": idx},
                )
            )
            continue

        year = _ensure_year(row.week, row.datum, meta.schooljaar)

        session_type = "lecture"
        if row.toets:
            session_type = "exam"

        try:
            parsed_date = date.fromisoformat(row.datum) if row.datum else date.fromisocalendar(year, row.week, 1)
        except ValueError:
            parsed_date = date.fromisocalendar(year, row.week, 1)

        deadline = None
        if row.inleverdatum:
            try:
                deadline = date.fromisoformat(row.inleverdatum)
            except ValueError:
                deadline = None

        resources = _build_resources(row.bronnen)

        session = Session(
            id=f"{study_unit_id}-S{idx}",
            study_unit_id=study_unit_id,
            week=row.week,
            year=year,
            date=parsed_date,
            type=session_type,
            topic=row.onderwerp,
            location=row.locatie,
            label=row.les,
            objectives=row.leerdoelen,
            homework=row.huiswerk,
            assignment=row.opdracht,
            deadline=deadline,
            test=row.toets,
            notes=row.notities,
            class_group=row.klas_of_groep,
            resources=resources,
        )
        sessions.append(session)

    return sessions, warnings


def _build_weeks(sessions: Iterable[Session]) -> list[Week]:
    by_key: dict[tuple[int, int], Week] = {}
    for session in sessions:
        key = (session.year, session.week)
        if key in by_key:
            continue
        start, end = _iso_week_bounds(session.year, session.week)
        by_key[key] = Week(week=session.week, year=session.year, start=start, end=end)
    return [by_key[key] for key in sorted(by_key)]


def _build_study_unit(meta: DocMeta) -> StudyUnit:
    try:
        year = int(meta.leerjaar)
    except (TypeError, ValueError):
        year = 0
    return StudyUnit(
        id=f"SU-{meta.fileId}",
        name=meta.vak,
        level=meta.niveau,
        year=year,
        period=meta.periode,
    )


def _extract_document(path: Path) -> tuple[DocMeta, list[DocRow]]:
    filename = path.name
    suffix = path.suffix.lower()

    if suffix == ".docx":
        meta = extract_meta_from_docx(str(path), filename)
        rows = extract_rows_from_docx(str(path), filename)
    elif suffix == ".pdf":
        if extract_meta_from_pdf is None or extract_rows_from_pdf is None:
            raise RuntimeError("PDF ondersteuning is niet beschikbaar in deze omgeving")
        meta = extract_meta_from_pdf(str(path), filename)
        rows = extract_rows_from_pdf(str(path), filename)
    else:
        raise RuntimeError(f"Bestandstype {suffix} wordt niet ondersteund")

    if meta is None:
        meta = DocMeta(
            fileId=uuid4().hex[:12],
            bestand=filename,
            vak=filename,
            niveau="ONBEKEND",
            leerjaar="0",
            periode=1,
            beginWeek=1,
            eindWeek=1,
            schooljaar=None,
        )

    return meta, rows or []


def parse_to_normalized(path: str) -> Tuple[str, NormalizedModel]:
    source_path = Path(path)
    if not source_path.exists():
        raise FileNotFoundError(path)

    source = source_path.name
    parsed_at = datetime.utcnow().isoformat()

    meta, rows = _extract_document(source_path)
    study_unit = _build_study_unit(meta)
    sessions, warnings = _build_sessions(meta, rows, study_unit.id)
    weeks = _build_weeks(sessions)

    model = NormalizedModel(
        meta={"source": source, "parsed_at": parsed_at},
        study_units=[study_unit],
        weeks=weeks,
        sessions=sessions,
        assessments=[],
        warnings=warnings,
    )

    parse_id = uuid4().hex
    out_path = DATA_DIR / f"{parse_id}.json"
    with out_path.open("w", encoding="utf-8") as fh:
        fh.write(model.model_dump_json(indent=2))

    index = load_index()
    index.append(
        {
            "id": parse_id,
            "source_file": source,
            "created_at": parsed_at,
            "status": "ready",
        }
    )
    save_index(index)

    return parse_id, model
