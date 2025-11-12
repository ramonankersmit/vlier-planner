from __future__ import annotations

import sys, pathlib; sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

import io
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import backend.main as planner_app


class _DummyWarning:
    def model_dump(self) -> dict[str, str]:
        return {"warning": "dummy"}


def test_upload_sanitizes_and_streams(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)

    captured: dict[str, str] = {}

    def fake_parse_to_normalized(path: str):
        captured["path"] = path
        return "parse-id", SimpleNamespace(warnings=[_DummyWarning()])

    monkeypatch.setattr(planner_app, "parse_to_normalized", fake_parse_to_normalized)

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
    assert payload == {"parse_id": "parse-id", "status": "ready", "warnings": [{"warning": "dummy"}]}

    assert "path" in captured

    saved_path = Path(captured["path"])
    assert saved_path.parent == Path("uploads")
    assert saved_path.name == "evil.docx"

    resolved_path = saved_path.resolve()
    assert resolved_path.parent == tmp_path / "uploads"
    assert resolved_path.read_bytes() == b"malicious"
