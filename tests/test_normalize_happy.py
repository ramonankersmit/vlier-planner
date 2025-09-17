import sys, pathlib; sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))
from pathlib import Path

from backend.models import DocMeta, DocRow
from backend.documents import build_doc_rows
from vlier_parser import normalize


def test_parse_to_normalized_happy(tmp_path: Path, monkeypatch):
    sample = tmp_path / "sample.docx"
    sample.write_text("dummy")

    meta = DocMeta(
        fileId="abc123",
        bestand="sample.docx",
        vak="Wiskunde",
        niveau="VWO",
        leerjaar="4",
        periode=1,
        beginWeek=10,
        eindWeek=12,
        schooljaar="2025/2026",
    )
    row = DocRow(
        week=10,
        datum="2025-09-04",
        les="Les 1",
        onderwerp="Differentiëren",
        leerdoelen=["begrip"],
        huiswerk="Paragraaf 3",
        opdracht="Maak opgaven",
        inleverdatum="2025-09-10",
        toets={"type": "SO", "weging": "2", "herkansing": "ja"},
        bronnen=[{"title": "Boek", "url": "https://example.com"}],
        notities="Let op",
        klas_of_groep="4V",
        locatie="B2.14",
    )

    monkeypatch.setattr(normalize, "_extract_document", lambda _: (meta, [row]))

    parse_id, model = normalize.parse_to_normalized(str(sample))
    assert parse_id
    assert len(model.sessions) == 1
    session = model.sessions[0]
    assert session.week == 10
    assert session.topic == "Differentiëren"
    assert not model.warnings

    rows = build_doc_rows(model)
    assert rows[0]["onderwerp"] == "Differentiëren"
    assert rows[0]["huiswerk"] == "Paragraaf 3"
