import sys, pathlib; sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))
from pathlib import Path
import threading
from datetime import datetime

from fastapi.testclient import TestClient

import backend.main
from backend.schemas.normalized import Assessment, Meta, NormalizedModel, Session, StudyUnit, Week
from vlier_parser.normalize import parse_to_normalized
from backend.main import app


def setup_module(module):
    tmp = Path("tests/tmp.docx")
    tmp.write_text("dummy")
    parse_to_normalized(str(tmp))


client = TestClient(app)


def test_get_agenda():
    res = client.get("/api/agenda", params={"week": 38, "year": 2025})
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_upload_runs_parser_off_event_loop(monkeypatch):
    parse_thread: dict[str, int] = {}
    loop_thread: dict[str, int] = {}

    def fake_parse(path: str):
        parse_thread["id"] = threading.get_ident()
        meta = Meta(source=Path(path).name, parsed_at=datetime.utcnow().isoformat())
        model = NormalizedModel(
            meta=meta,
            study_units=[StudyUnit(id="su", name="Test", level="HBO", year=1, period=1)],
            weeks=[Week(week=1, year=2024, start="2024-01-01", end="2024-01-07")],
            sessions=[
                Session(
                    id="sess",
                    study_unit_id="su",
                    week=1,
                    year=2024,
                    date="2024-01-02",
                    type="lecture",
                    resources=[],
                )
            ],
            assessments=[
                Assessment(
                    id="ass",
                    study_unit_id="su",
                    week_due=1,
                    year_due=2024,
                    title="Toets",
                    weight=1.0,
                )
            ],
            warnings=[],
        )
        return "fake", model

    original_to_thread = backend.main.asyncio.to_thread

    async def record_to_thread(func, /, *args, **kwargs):
        loop_thread["id"] = threading.get_ident()
        return await original_to_thread(func, *args, **kwargs)

    monkeypatch.setattr("backend.main.parse_to_normalized", fake_parse)
    monkeypatch.setattr("backend.main.asyncio.to_thread", record_to_thread)

    file_content = b"dummy"
    response = client.post(
        "/api/uploads",
        files={"file": ("agenda.docx", file_content, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )

    assert response.status_code == 200
    assert parse_thread["id"] != loop_thread["id"]
