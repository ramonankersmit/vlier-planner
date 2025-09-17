import sys, pathlib; sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))
from pathlib import Path

from backend.models import DocMeta, DocRow
from vlier_parser import normalize


def test_parse_to_normalized_warning(tmp_path: Path, monkeypatch):
    sample = tmp_path / "warning.docx"
    sample.write_text("dummy")

    meta = DocMeta(
        fileId="warn1",
        bestand="warning.docx",
        vak="Aardrijkskunde",
        niveau="HAVO",
        leerjaar="3",
        periode=2,
        beginWeek=30,
        eindWeek=35,
        schooljaar="2024/2025",
    )
    rows = [DocRow(week=None, datum=None, les=None, onderwerp=None)]

    monkeypatch.setattr(normalize, "_extract_document", lambda _: (meta, rows))

    _, model = normalize.parse_to_normalized(str(sample))
    assert model.warnings
    assert model.warnings[0].code == "ROW_MISSING_WEEK"
