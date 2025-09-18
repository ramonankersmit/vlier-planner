from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Tuple
from uuid import uuid4

from backend.schemas.normalized import (
    Assessment,
    NormalizedModel,
    Session,
    StudyUnit,
    Week,
    Warning,
)



def _user_data_base() -> Path:
    if sys.platform == "win32":
        root = os.getenv("LOCALAPPDATA") or Path.home() / "AppData" / "Local"
    elif sys.platform == "darwin":
        root = Path.home() / "Library" / "Application Support"
    else:
        root = os.getenv("XDG_DATA_HOME") or Path.home() / ".local" / "share"
    return Path(root) / "VlierPlanner"


def _default_data_dir() -> Path:
    custom = os.getenv("VLIER_DATA_DIR")
    if custom:
        return Path(custom)

    if getattr(sys, "frozen", False):
        return _user_data_base() / "parsed"

    project_root = Path(__file__).resolve().parent.parent
    return project_root / "data" / "parsed"


DATA_DIR = _default_data_dir()
DATA_DIR.mkdir(parents=True, exist_ok=True)
INDEX_FILE = DATA_DIR / "index.json"


def _load_index() -> list:
    if INDEX_FILE.exists():
        with INDEX_FILE.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    return []


def _save_index(index: list) -> None:
    with INDEX_FILE.open("w", encoding="utf-8") as fh:
        json.dump(index, fh, indent=2)


def parse_to_normalized(path: str) -> Tuple[str, NormalizedModel]:
    """Very small demo normalizer.

    This function does not perform real parsing; it simply returns a
    predictable structure so that the backend and tests have a stable
    contract to work with. When the real parser is integrated, the mapping
    can be placed here.
    """

    source = Path(path).name
    parsed_at = datetime.utcnow().isoformat()

    su = StudyUnit(id="SU-1", name="Wiskunde", level="HBO", year=2, period=1)
    wk = Week(week=38, year=2025, start="2025-09-15", end="2025-09-21")
    session = Session(
        id="S-1001",
        study_unit_id=su.id,
        week=38,
        year=2025,
        date="2025-09-18",
        type="lecture",
        topic="Differentiaalrekening",
        location="B2.14",
        resources=[],
    )
    assessment = Assessment(
        id="A-2001",
        study_unit_id=su.id,
        week_due=41,
        year_due=2025,
        title="Tussentoets",
        weight=0.3,
    )
    warnings: list[Warning] = []

    if "warning" in source.lower():
        session.week = 54
        warnings.append(
            Warning(
                code="WEEK_OUT_OF_RANGE",
                message=f"Week {session.week} aangetroffen in {source}",
                context={"week": session.week},
            )
        )

    model = NormalizedModel(
        meta={"source": source, "parsed_at": parsed_at},
        study_units=[su],
        weeks=[wk],
        sessions=[session],
        assessments=[assessment],
        warnings=warnings,
    )

    parse_id = uuid4().hex
    out_path = DATA_DIR / f"{parse_id}.json"
    with out_path.open("w", encoding="utf-8") as fh:
        fh.write(model.model_dump_json(indent=2))

    index = _load_index()
    index.append(
        {
            "id": parse_id,
            "source_file": source,
            "created_at": parsed_at,
            "status": "ready",
        }
    )
    _save_index(index)

    return parse_id, model
