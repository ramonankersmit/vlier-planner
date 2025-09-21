import io
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from backend.models import DocMeta, DocRow
import backend.app as backend_app


@pytest.fixture()
def api_client(tmp_path):
    original_storage_base = backend_app.STORAGE_BASE
    original_storage = backend_app.STORAGE
    original_state_file = backend_app.STATE_FILE
    original_pending = backend_app.PENDING_DIR

    backend_app.STORAGE_BASE = tmp_path
    backend_app.STORAGE = tmp_path / "uploads"
    backend_app.STATE_FILE = tmp_path / "state.json"
    backend_app.PENDING_DIR = tmp_path / "pending"
    backend_app._ensure_state_dir()
    backend_app.GUIDES.clear()
    backend_app.DOCS.clear()
    backend_app.PENDING_PARSES.clear()

    client = TestClient(backend_app.app)

    yield client

    backend_app.GUIDES.clear()
    backend_app.DOCS.clear()
    backend_app.PENDING_PARSES.clear()
    backend_app.STORAGE = original_storage
    backend_app.STATE_FILE = original_state_file
    backend_app.PENDING_DIR = original_pending
    backend_app.STORAGE_BASE = original_storage_base
    backend_app._ensure_state_dir()
    backend_app._load_state()
    backend_app._load_pending()


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
    assert parse_data["diffSummary"]["added"] == 2
    assert parse_data["rows"][0]["enabled"] is True
    assert parse_data["rows"][1]["enabled"] is False

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
    }

    commit_response = api_client.post(f"/api/reviews/{parse_id}/commit")
    assert commit_response.status_code == 200
    commit_data = commit_response.json()
    guide_id = commit_data["guideId"]
    assert commit_data["version"]["versionId"] == 1
    assert commit_data["version"]["diffSummary"]["added"] == 2

    guides = api_client.get("/api/study-guides").json()
    assert guides[0]["guideId"] == guide_id
    assert guides[0]["versionCount"] == 1

    versions = api_client.get(f"/api/study-guides/{guide_id}/versions").json()
    assert len(versions) == 1
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
    }
    assert second_parse["diffSummary"]["added"] == 1
    assert second_parse["diffSummary"]["changed"] == 1

    parse_id_second = second_parse["parseId"]
    commit_second = api_client.post(f"/api/reviews/{parse_id_second}/commit").json()
    assert commit_second["guideId"] == guide_id
    assert commit_second["version"]["versionId"] == 2

    versions_after = api_client.get(f"/api/study-guides/{guide_id}/versions").json()
    assert [v["versionId"] for v in versions_after] == [2, 1]

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
