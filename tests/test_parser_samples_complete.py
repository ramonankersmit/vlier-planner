from pathlib import Path

import pytest

from backend.parsers.parser_docx import extract_meta_from_docx, extract_rows_from_docx
from backend.parsers.parser_pdf import extract_meta_from_pdf, extract_rows_from_pdf


SAMPLE_DIR = Path("samples")
SAMPLE_FILES = sorted(
    p
    for p in SAMPLE_DIR.iterdir()
    if p.suffix.lower() in {".docx", ".pdf"}
)


@pytest.mark.parametrize("sample_path", SAMPLE_FILES, ids=lambda p: p.name)
def test_sample_documents_produce_weeks(sample_path: Path) -> None:
    if sample_path.suffix.lower() == ".docx":
        meta = extract_meta_from_docx(str(sample_path), sample_path.name)
        rows = extract_rows_from_docx(str(sample_path), sample_path.name)
    elif sample_path.suffix.lower() == ".pdf":
        meta = extract_meta_from_pdf(str(sample_path), sample_path.name)
        rows = extract_rows_from_pdf(str(sample_path), sample_path.name)
    else:  # pragma: no cover - parametrization restricts to docx/pdf
        pytest.skip("Unsupported sample type")

    assert meta is not None
    assert 0 <= meta.beginWeek <= 53
    assert 0 <= meta.eindWeek <= 53
    assert 1 <= meta.periode <= 4

    assert rows, f"Expected extracted rows for {sample_path.name}"
    weeks = [row.week for row in rows if isinstance(row.week, int)]
    assert weeks, f"Expected at least one numeric week in rows for {sample_path.name}"
    assert all(1 <= wk <= 53 for wk in weeks)
