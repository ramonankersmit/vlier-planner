import io
import sys
from pathlib import Path
from typing import Iterator


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pytest
from fastapi.testclient import TestClient

from backend.models import DocMeta, DocRow
import backend.app as backend_app
from backend.services.data_store import data_store


@pytest.fixture()
def app_test_env(tmp_path):
    original_base = data_store.base_path
    data_store.set_base_path(tmp_path)
    backend_app._ensure_state_dir()
    backend_app.GUIDES.clear()
    backend_app.DOCS.clear()
    backend_app.PENDING_PARSES.clear()
    backend_app._load_state()
    backend_app._load_pending()

    yield tmp_path

    backend_app.GUIDES.clear()
    backend_app.DOCS.clear()
    backend_app.PENDING_PARSES.clear()
    data_store.set_base_path(original_base)
    backend_app._ensure_state_dir()
    backend_app._load_state()
    backend_app._load_pending()


@pytest.fixture()
def api_client(app_test_env):
    return TestClient(backend_app.app)


@pytest.fixture()
def normalized_api_client(app_test_env):
    from backend.main import app as normalized_app

    return TestClient(normalized_app)


def _scenario_initial() -> tuple[DocMeta, list[DocRow]]:
    meta = DocMeta(
        fileId="legacy",
        bestand="demo.docx",
        vak="",
        niveau="VWO",
        leerjaar="5",
        periode=1,
        beginWeek=1,
        eindWeek=5,
        schooljaar="2024/2025",
    )
    rows = [
        DocRow(week=None, datum="2024-01-08", les="Les 1", onderwerp="Intro"),
        DocRow(week=None, datum="2024-01-08", les="Les 2", onderwerp="Verdieping"),
    ]
    return meta, rows


def _scenario_second_version() -> tuple[DocMeta, list[DocRow]]:
    meta = DocMeta(
        fileId="legacy",
        bestand="demo.docx",
        vak="Wiskunde",
        niveau="VWO",
        leerjaar="5",
        periode=1,
        beginWeek=1,
        eindWeek=5,
        schooljaar="2024/2025",
    )
    rows = [
        DocRow(week=1, datum="2024-01-08", les="Les 1", onderwerp="Intro"),
        DocRow(week=2, datum="2024-01-15", les="Les 2", onderwerp="Nieuw thema", huiswerk="Lezen"),
        DocRow(week=3, datum="2024-01-22", les="Les 3", onderwerp="Samenvatting"),
    ]
    return meta, rows


def _scenario_week_duplicate() -> tuple[DocMeta, list[DocRow]]:
    meta = DocMeta(
        fileId="guide-dup",
        bestand="week-dup.docx",
        vak="Aardrijkskunde",
        niveau="VWO",
        leerjaar="4",
        periode=1,
        beginWeek=40,
        eindWeek=46,
        schooljaar="2025/2026",
    )
    rows = [
        DocRow(week=44, datum="2025-10-28", onderwerp="Week 44"),
        DocRow(week=44, datum="2025-10-28", onderwerp="Week 44 herhaling"),
        DocRow(week=45, datum="2025-11-04", onderwerp="Week 45"),
    ]
    return meta, rows


def _scenario_identical_duplicate() -> tuple[DocMeta, list[DocRow]]:
    meta = DocMeta(
        fileId="guide-identical",
        bestand="week-identical.docx",
        vak="Biologie",
        niveau="VWO",
        leerjaar="4",
        periode=1,
        beginWeek=40,
        eindWeek=46,
        schooljaar="2025/2026",
    )
    rows = [
        DocRow(week=44, datum="2025-10-28", onderwerp="Week 44"),
        DocRow(week=44, datum="2025-10-28", onderwerp="Week 44"),
        DocRow(week=45, datum="2025-11-04", onderwerp="Week 45"),
    ]
    return meta, rows


def _scenario_week_date_mismatch() -> tuple[DocMeta, list[DocRow]]:
    meta = DocMeta(
        fileId="guide-date",
        bestand="week-date.docx",
        vak="Duits",
        niveau="VWO",
        leerjaar="4",
        periode=2,
        beginWeek=1,
        eindWeek=10,
        schooljaar="2025/2026",
    )
    rows = [
        DocRow(
            week=4,
            datum="2026-01-12",
            datum_eind="2026-01-16",
            onderwerp="Toetsweek 2",
        )
    ]
    return meta, rows


def _configure_parser(monkeypatch: pytest.MonkeyPatch, scenarios: Iterator[tuple[DocMeta, list[DocRow]]]) -> None:
    def fake_extract_all(path: str, name: str):
        try:
            meta, rows = next(scenarios)
        except StopIteration:  # pragma: no cover - defensive
            return []
        return [(meta, rows)]

    monkeypatch.setattr(backend_app, "extract_all_periods_from_docx", fake_extract_all)


def _upload_file(client: TestClient) -> list[dict]:
    response = client.post(
        "/api/uploads",
        files={
            "file": (
                "demo.docx",
                io.BytesIO(b"fake"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    return payload


def test_upload_review_commit_flow(api_client: TestClient, monkeypatch: pytest.MonkeyPatch):
    scenarios = iter([_scenario_initial(), _scenario_second_version()])
    _configure_parser(monkeypatch, scenarios)

    upload_payload = _upload_file(api_client)
    assert len(upload_payload) == 1
    parse_data = upload_payload[0]
    assert parse_data["warnings"]["unknownSubject"] is True
    assert parse_data["warnings"]["missingWeek"] is True
    assert parse_data["warnings"]["duplicateDate"] is False
    assert parse_data["warnings"]["duplicateWeek"] is False
    assert parse_data["diffSummary"]["added"] == 2
    assert parse_data["rows"][0]["enabled"] is True
    assert parse_data["rows"][1]["enabled"] is True

    parse_id = parse_data["parseId"]
    review_data = api_client.get(f"/api/reviews/{parse_id}").json()
    assert review_data["parseId"] == parse_id

    updated_rows = [
        {**parse_data["rows"][0], "enabled": True, "week": 1, "datum": "2024-01-08"},
        {**parse_data["rows"][1], "week": 2, "datum": "2024-01-15"},
    ]
    update_payload = {
        "meta": {"vak": "Wiskunde"},
        "rows": updated_rows,
    }
    updated_review = api_client.patch(f"/api/reviews/{parse_id}", json=update_payload).json()
    assert updated_review["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }

    commit_response = api_client.post(f"/api/reviews/{parse_id}/commit")
    assert commit_response.status_code == 200
    commit_data = commit_response.json()
    guide_id = commit_data["guideId"]
    assert commit_data["version"]["versionId"] == 1
    assert commit_data["version"]["diffSummary"]["added"] == 2
    assert commit_data["version"]["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }

    guides = api_client.get("/api/study-guides").json()
    assert guides[0]["guideId"] == guide_id
    assert guides[0]["versionCount"] == 1
    assert guides[0]["latestVersion"]["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }

    versions = api_client.get(f"/api/study-guides/{guide_id}/versions").json()
    assert len(versions) == 1
    assert versions[0]["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }
    diff_first = api_client.get(f"/api/study-guides/{guide_id}/diff/1").json()
    assert diff_first["diffSummary"]["added"] == 2

    docs = api_client.get("/api/docs").json()
    assert docs[0]["fileId"] == guide_id
    rows_latest = api_client.get(f"/api/docs/{guide_id}/rows").json()
    assert len(rows_latest) == 2

    second_upload = _upload_file(api_client)
    second_parse = second_upload[0]
    assert second_parse["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }
    assert second_parse["diffSummary"]["added"] == 1
    assert second_parse["diffSummary"]["changed"] == 1

    parse_id_second = second_parse["parseId"]
    commit_second = api_client.post(f"/api/reviews/{parse_id_second}/commit").json()
    assert commit_second["guideId"] == guide_id
    assert commit_second["version"]["versionId"] == 2
    assert commit_second["version"]["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }

    versions_after = api_client.get(f"/api/study-guides/{guide_id}/versions").json()
    assert [v["versionId"] for v in versions_after] == [2, 1]
    assert all(
        version["warnings"] == {
            "unknownSubject": False,
            "missingWeek": False,
            "duplicateDate": False,
            "duplicateWeek": False,
        }
        for version in versions_after
    )

    diff_second = api_client.get(f"/api/study-guides/{guide_id}/diff/2").json()
    assert diff_second["diffSummary"] == {
        "added": 1,
        "removed": 0,
        "changed": 1,
        "unchanged": 1,
    }
    changed_row = next(item for item in diff_second["diff"] if item["status"] == "changed")
    assert changed_row["fields"]["onderwerp"]["status"] == "changed"
    added_row = next(item for item in diff_second["diff"] if item["status"] == "added")
    assert added_row["fields"]["week"]["status"] == "added"

    latest_rows = api_client.get(f"/api/docs/{guide_id}/rows").json()
    assert len(latest_rows) == 3
    historical_rows = api_client.get(f"/api/docs/{guide_id}/rows", params={"versionId": 1}).json()
    assert len(historical_rows) == 2

    restart_response = api_client.post("/api/reviews", json={"guideId": guide_id})
    assert restart_response.status_code == 200
    restart_payload = restart_response.json()
    assert restart_payload["meta"]["fileId"] == guide_id
    assert restart_payload["diffSummary"]["unchanged"] == 3
    assert restart_payload["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }

    restart_rows = restart_payload["rows"]
    restart_rows[1] = {
        **restart_rows[1],
        "onderwerp": "Bijgewerkte les",
        "huiswerk": "Samenvatten",
    }
    restart_update = api_client.patch(
        f"/api/reviews/{restart_payload['parseId']}",
        json={"rows": restart_rows},
    )
    assert restart_update.status_code == 200
    assert restart_update.json()["diffSummary"]["changed"] >= 1

    restart_commit = api_client.post(f"/api/reviews/{restart_payload['parseId']}/commit")
    assert restart_commit.status_code == 200
    restart_commit_data = restart_commit.json()
    assert restart_commit_data["guideId"] == guide_id
    assert restart_commit_data["version"]["versionId"] == 3

    diff_third = api_client.get(f"/api/study-guides/{guide_id}/diff/3").json()
    assert diff_third["diffSummary"]["changed"] >= 1

    version_three_file = backend_app._version_file_path(
        guide_id,
        3,
        restart_commit_data["version"]["meta"]["bestand"],
    )
    assert version_three_file.exists()


def test_upload_auto_corrects_misdated_week(api_client: TestClient, monkeypatch: pytest.MonkeyPatch):
    scenarios = iter([_scenario_week_date_mismatch()])
    _configure_parser(monkeypatch, scenarios)

    upload_payload = _upload_file(api_client)
    assert len(upload_payload) == 1
    parse_data = upload_payload[0]
    assert parse_data["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }
    row = parse_data["rows"][0]
    assert row["datum"] == "2026-01-19"
    assert row["datum_eind"] == "2026-01-23"


def test_rows_with_same_week_remain_enabled(
    api_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    scenarios = iter([_scenario_week_duplicate()])
    _configure_parser(monkeypatch, scenarios)

    upload_payload = _upload_file(api_client)
    assert len(upload_payload) == 1
    parse = upload_payload[0]

    enabled_flags = [row["enabled"] for row in parse["rows"]]
    assert enabled_flags == [True, True, True]
    assert parse["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }

    parse_id = parse["parseId"]
    commit_response = api_client.post(f"/api/reviews/{parse_id}/commit")
    assert commit_response.status_code == 200
    commit_data = commit_response.json()
    assert commit_data["version"]["diffSummary"]["added"] == 3
    assert commit_data["version"]["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }

    guides = api_client.get("/api/study-guides").json()
    assert guides[0]["latestVersion"]["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": False,
    }


def test_identical_rows_are_disabled(
    api_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    scenarios = iter([_scenario_identical_duplicate()])
    _configure_parser(monkeypatch, scenarios)

    upload_payload = _upload_file(api_client)
    assert len(upload_payload) == 1
    parse = upload_payload[0]

    enabled_flags = [row["enabled"] for row in parse["rows"]]
    assert enabled_flags == [True, False, True]
    assert parse["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": True,
    }

    parse_id = parse["parseId"]
    commit_response = api_client.post(f"/api/reviews/{parse_id}/commit")
    assert commit_response.status_code == 200
    commit_data = commit_response.json()
    assert commit_data["version"]["diffSummary"]["added"] == 3
    assert commit_data["version"]["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": True,
    }

    guides = api_client.get("/api/study-guides").json()
    assert guides[0]["latestVersion"]["warnings"] == {
        "unknownSubject": False,
        "missingWeek": False,
        "duplicateDate": False,
        "duplicateWeek": True,
    }


def test_normalized_api_uses_shared_store(
    app_test_env, normalized_api_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    scenarios = iter([_scenario_initial()])
    _configure_parser(monkeypatch, scenarios)

    response = normalized_api_client.post(
        "/api/uploads",
        files={
            "file": (
                "normalized.docx",
                io.BytesIO(b"normalized"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list) and payload
    parse_entry = payload[0]
    parse_id = parse_entry["parseId"]

    normalized_payload = {
        "meta": {"source": "normalized.docx"},
        "warnings": [],
        "study_units": [{"id": "unit-1", "name": "Demo", "lessons": []}],
        "sessions": [],
        "weeks": [],
    }
    data_store.write_normalized_model(parse_id, normalized_payload)
    data_store.append_normalized_index_entry({"id": parse_id, "source": "normalized.docx"})

    parse_response = normalized_api_client.get(f"/api/parses/{parse_id}")
    assert parse_response.status_code == 200
    parse_data = parse_response.json()
    assert parse_data["meta"]["source"] == "normalized.docx"

    units_response = normalized_api_client.get("/api/study-units")
    assert units_response.status_code == 200
    assert units_response.json()

    stored_file = data_store.normalized_dir / f"{parse_id}.json"
    assert stored_file.exists()
    assert stored_file.is_relative_to(app_test_env)
    assert data_store.base_path == app_test_env
