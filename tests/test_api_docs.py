import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.main import app
from backend.models import DocMeta, DocRow
from vlier_parser import normalize


@pytest.fixture
def patched_parser(monkeypatch):
    meta = DocMeta(
        fileId="fixture",
        bestand="sample.docx",
        vak="Nederlands",
        niveau="HAVO",
        leerjaar="4",
        periode=1,
        beginWeek=12,
        eindWeek=15,
        schooljaar="2025/2026",
    )
    row = DocRow(week=12, datum="2025-03-20", les="Les", onderwerp="Grammatica")

    monkeypatch.setattr(normalize, "_extract_document", lambda _: (meta, [row]))
    return meta, row


@pytest.fixture
def parsed_document(tmp_path, patched_parser):
    sample_file = tmp_path / "sample.docx"
    sample_file.write_text("dummy")
    parse_id, _ = normalize.parse_to_normalized(str(sample_file))
    return parse_id


def test_docs_flow(parsed_document):
    client = TestClient(app)

    res = client.get("/api/docs")
    assert res.status_code == 200
    docs = res.json()
    assert docs
    doc = next((d for d in docs if d["fileId"] == parsed_document), None)
    assert doc is not None

    rows = client.get(f"/api/docs/{parsed_document}/rows")
    assert rows.status_code == 200
    assert isinstance(rows.json(), list)

    preview = client.get(f"/api/docs/{parsed_document}/preview")
    assert preview.status_code == 200
    preview_payload = preview.json()
    assert preview_payload["mediaType"].startswith("text/html")
    assert "html" in preview_payload

    delete_res = client.delete(f"/api/docs/{parsed_document}")
    assert delete_res.status_code == 200
    assert delete_res.json()["status"] == "deleted"

    after = client.get("/api/docs")
    assert parsed_document not in [d["fileId"] for d in after.json()]
