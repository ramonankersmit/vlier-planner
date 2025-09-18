import sys
from pathlib import Path

from contextlib import contextmanager

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import backend.models as backend_models  # noqa: E402

sys.modules.setdefault("models", backend_models)

import backend.parsers as backend_parsers  # noqa: E402

sys.modules.setdefault("parsers", backend_parsers)

from fastapi.testclient import TestClient

import backend.app as app_module
from backend.models import DocMeta, DocRow


@contextmanager
def _setup_isolated_storage(tmp_path):
    original_storage = app_module.STORAGE
    original_state = app_module.STATE_FILE
    app_module.STORAGE = tmp_path / "uploads"
    app_module.STORAGE.mkdir(parents=True, exist_ok=True)
    app_module.STATE_FILE = tmp_path / "state.json"
    app_module.DOCS.clear()
    try:
        yield
    finally:
        app_module.DOCS.clear()
        app_module.STORAGE = original_storage
        app_module.STATE_FILE = original_state


def test_preview_returns_summary_when_source_missing(tmp_path):
    with _setup_isolated_storage(tmp_path):
        client = TestClient(app_module.app)
        meta = DocMeta(
            fileId="abc123",
            bestand="planner.pdf",
            vak="Wiskunde",
            niveau="VWO",
            leerjaar="5",
            periode=2,
            beginWeek=3,
            eindWeek=6,
        )
        row = DocRow(
            week=3,
            datum="2024-02-01",
            les="Les 1",
            onderwerp="Introductie",
            leerdoelen=["Doel A"],
        )
        app_module.DOCS[meta.fileId] = app_module.StoredDoc(
            meta=meta,
            rows=[row],
            summary_html="<p>Samenvatting</p>",
        )

        docs_response = client.get("/api/docs")
        assert docs_response.status_code == 200
        docs_payload = docs_response.json()
        assert docs_payload[0]["hasSource"] is False

        preview_response = client.get(f"/api/docs/{meta.fileId}/preview")
        assert preview_response.status_code == 200
        payload = preview_response.json()
        assert payload["summaryHtml"].startswith("<p>")
        assert payload["isEmbeddable"] is False
        assert "url" not in payload


def test_preview_generates_summary_from_rows(tmp_path):
    with _setup_isolated_storage(tmp_path):
        client = TestClient(app_module.app)
        meta = DocMeta(
            fileId="def456",
            bestand="legacy.pdf",
            vak="Natuurkunde",
            niveau="HAVO",
            leerjaar="4",
            periode=1,
            beginWeek=1,
            eindWeek=4,
        )
        row = DocRow(
            week=1,
            datum="2024-01-15",
            onderwerp="Krachten",
            huiswerk="Lees hoofdstuk 1",
        )
        app_module.DOCS[meta.fileId] = app_module.StoredDoc(
            meta=meta,
            rows=[row],
            summary_html=None,
        )

        response = client.get(f"/api/docs/{meta.fileId}/preview")
        assert response.status_code == 200
        data = response.json()
        assert "summaryHtml" in data
        assert "Krachten" in data["summaryHtml"]
        assert data["isEmbeddable"] is False
        assert app_module.DOCS[meta.fileId].summary_html is not None


def test_preview_includes_url_when_source_available(tmp_path):
    with _setup_isolated_storage(tmp_path):
        client = TestClient(app_module.app)
        meta = DocMeta(
            fileId="ghi789",
            bestand="planner.pdf",
            vak="Geschiedenis",
            niveau="VWO",
            leerjaar="6",
            periode=3,
            beginWeek=10,
            eindWeek=12,
        )
        row = DocRow(week=10, onderwerp="Hoofdstuk 5")
        pdf_path = app_module.STORAGE / f"{meta.fileId}.pdf"
        pdf_path.write_bytes(b"%PDF-1.4")
        app_module.DOCS[meta.fileId] = app_module.StoredDoc(
            meta=meta,
            rows=[row],
            summary_html="<p>Samenvatting</p>",
        )

        response = client.get(f"/api/docs/{meta.fileId}/preview")
        assert response.status_code == 200
        payload = response.json()
        assert payload["isEmbeddable"] is True
        assert payload["url"].endswith("/content?inline=1")
        assert payload["summaryHtml"].startswith("<p>")
