from pathlib import Path

from backend.parsers.parser_docx import extract_meta_from_docx, extract_rows_from_docx


def test_latijnse_taal_en_cultuur_period_1_stops_before_period_2():
    sample = Path("samples/Latijnse Taal en Cultuur_ periode 1_4vwo.docx")
    assert sample.exists(), "Sample document is missing"

    meta = extract_meta_from_docx(str(sample), sample.name)
    assert meta.beginWeek == 35
    assert meta.eindWeek == 45

    weeks = [row.week for row in extract_rows_from_docx(str(sample), sample.name)]
    assert weeks, "Expected at least one extracted row"
    assert max(weeks) == 45
    assert all(35 <= week <= 45 for week in weeks)
