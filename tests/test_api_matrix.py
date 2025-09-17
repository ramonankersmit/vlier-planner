import sys, pathlib; sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.models import DocMeta, DocRow
from vlier_parser import normalize


@pytest.fixture
def client(tmp_path, monkeypatch):
    meta = DocMeta(
        fileId="matrix",
        bestand="matrix.docx",
        vak="Wiskunde",
        niveau="VWO",
        leerjaar="4",
        periode=1,
        beginWeek=38,
        eindWeek=40,
        schooljaar="2025/2026",
    )
    row = DocRow(week=38, datum="2025-09-18", les="Les", onderwerp="Matrix")

    monkeypatch.setattr(normalize, "_extract_document", lambda _: (meta, [row]))

    sample = tmp_path / "tmp2.docx"
    sample.write_text("dummy")
    normalize.parse_to_normalized(str(sample))

    return TestClient(app)


def test_get_matrix(client):
    res = client.get("/api/matrix", params={"period": 1, "year": 2025})
    assert res.status_code == 200
    assert isinstance(res.json(), dict)
