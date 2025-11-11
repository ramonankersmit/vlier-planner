import json
import pathlib
import sys
from datetime import UTC, datetime
from uuid import uuid4

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from vlier_parser.normalize import DATA_DIR
from backend.server import app


client = TestClient(app)


def _write_normalized_dataset(study_units):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    index_path = DATA_DIR / "index.json"
    if index_path.exists():
        index = json.loads(index_path.read_text())
    else:
        index = []

    parse_id = uuid4().hex
    meta = {
        "source": "test-matrix.docx",
        "parsed_at": datetime.now(tz=UTC).isoformat(),
    }

    normalized = {
        "meta": meta,
        "study_units": [],
        "weeks": [],
        "sessions": [],
        "assessments": [],
        "warnings": [],
    }

    weeks: dict[tuple[int, int], dict] = {}
    for unit in study_units:
        normalized["study_units"].append(
            {
                "id": unit["id"],
                "name": unit.get("name", unit["id"]),
                "level": unit.get("level", "HBO"),
                "year": unit.get("year", 2),
                "period": unit["period"],
            }
        )

        for idx, session in enumerate(unit["sessions"]):
            week_key = (session["week"], session["year"])
            weeks.setdefault(
                week_key,
                {
                    "week": session["week"],
                    "year": session["year"],
                    "start": session.get("start", f"{session['year']}-01-01"),
                    "end": session.get("end", f"{session['year']}-01-07"),
                },
            )

            normalized["sessions"].append(
                {
                    "id": f"{unit['id']}-S{idx}-{session['year']}",
                    "study_unit_id": unit["id"],
                    "week": session["week"],
                    "year": session["year"],
                    "date": session.get("date", f"{session['year']}-01-{idx + 1:02d}"),
                    "type": session.get("type", "lecture"),
                    "topic": session.get("topic"),
                    "location": session.get("location"),
                    "resources": session.get("resources", []),
                }
            )

    normalized["weeks"] = list(weeks.values())

    out_path = DATA_DIR / f"{parse_id}.json"
    out_path.write_text(json.dumps(normalized, indent=2))

    index.append(
        {
            "id": parse_id,
            "source_file": meta["source"],
            "created_at": meta["parsed_at"],
            "status": "ready",
        }
    )
    index_path.write_text(json.dumps(index, indent=2))


def _seed_multi_period_dataset():
    _write_normalized_dataset(
        [
            {
                "id": "SU-P1-A",
                "period": 1,
                "sessions": [
                    {"week": 10, "year": 2025},
                    {"week": 11, "year": 2025},
                ],
            },
            {
                "id": "SU-P1-B",
                "period": 1,
                "sessions": [
                    {"week": 12, "year": 2025},
                    {"week": 14, "year": 2024},
                ],
            },
            {
                "id": "SU-P1-C",
                "period": "1",
                "sessions": [
                    {"week": 13, "year": 2025},
                ],
            },
            {
                "id": "SU-P2-A",
                "period": 2,
                "sessions": [
                    {"week": 15, "year": 2025},
                ],
            },
            {
                "id": "SU-P3-A",
                "period": "Alle",
                "sessions": [
                    {"week": 16, "year": 2025},
                ],
            },
        ]
    )


def test_get_matrix_filters_by_period():
    _seed_multi_period_dataset()

    res_period1 = client.get("/api/matrix", params={"period": 1, "year": 2025})
    assert res_period1.status_code == 200
    matrix_period1 = res_period1.json()

    assert set(matrix_period1) == {"SU-P1-A", "SU-P1-B", "SU-P1-C"}
    assert matrix_period1["SU-P1-A"] == {"10": 1, "11": 1}
    assert matrix_period1["SU-P1-B"] == {"12": 1}
    assert matrix_period1["SU-P1-C"] == {"13": 1}

    res_period2 = client.get("/api/matrix", params={"period": 2, "year": 2025})
    assert res_period2.status_code == 200
    matrix_period2 = res_period2.json()

    assert set(matrix_period2) == {"SU-P2-A"}
    assert matrix_period2["SU-P2-A"] == {"15": 1}


def test_get_matrix_all_periods_includes_everything():
    _seed_multi_period_dataset()

    res_all = client.get("/api/matrix", params={"period": "ALLE", "year": 2025})
    assert res_all.status_code == 200
    matrix_all = res_all.json()

    assert set(matrix_all) == {"SU-P1-A", "SU-P1-B", "SU-P1-C", "SU-P2-A", "SU-P3-A"}
    assert matrix_all["SU-P3-A"] == {"16": 1}
