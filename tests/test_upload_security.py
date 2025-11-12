from __future__ import annotations

import sys, pathlib; sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import backend.main as planner_app


def test_upload_sanitizes_and_streams(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)

    captured: dict[str, object] = {}

    async def fake_upload_doc(file):
        captured["filename"] = file.filename
        captured["content"] = await file.read()
        return [
            {
                "parseId": "parse-id",
                "warnings": [{"warning": "dummy"}],
                "meta": {"bestand": "Studiewijzer"},
                "rows": [],
                "diffSummary": {},
                "diff": [],
                "fileName": "Studiewijzer.docx",
            }
        ]

    monkeypatch.setattr(planner_app.workflow_app, "upload_doc", fake_upload_doc)

    client = TestClient(planner_app.app)

    response = client.post(
        "/api/uploads",
        files={
            "file": (
                "../evil.docx",
                io.BytesIO(b"malicious"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == [
        {
            "parseId": "parse-id",
            "warnings": [{"warning": "dummy"}],
            "meta": {"bestand": "Studiewijzer"},
            "rows": [],
            "diffSummary": {},
            "diff": [],
            "fileName": "Studiewijzer.docx",
        }
    ]

    assert captured["filename"] == "../evil.docx"
    assert captured["content"] == b"malicious"
