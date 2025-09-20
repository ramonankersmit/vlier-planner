from pathlib import Path

import pytest

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


def test_latijnse_taal_en_cultuur_period_2_wraps_across_new_year():
    sample = Path("samples/Latijnse Taal en Cultuur_ periode 1_4vwo.docx")
    assert sample.exists(), "Sample document is missing"

    rows = extract_rows_from_docx(str(sample), sample.name, target_periode=2)
    weeks = [row.week for row in rows]
    assert weeks, "Expected period 2 rows to be extracted"
    assert set(range(46, 53)).issubset(weeks)
    assert set(range(1, 5)).issubset(weeks)

    meta = extract_meta_from_docx(str(sample), sample.name, target_periode=2)
    assert meta.beginWeek == 46
    assert meta.eindWeek == 4


@pytest.mark.parametrize(
    "filename",
    [
        "Natuurkunde_4vwo_P1.docx",
        "Maatschappijleer_4vwo_p1.docx",
        "Geschiedenis 4V P1 studiewijzer.docx",
        "Levensbeschouwing 2526 4V periode 1.docx",
        "Nederlands 4V planner periode 1 2526.docx",
    ],
)
def test_schooljaar_is_detected_for_samples(filename: str) -> None:
    sample = Path("samples") / filename
    assert sample.exists(), "Sample document is missing"

    meta = extract_meta_from_docx(str(sample), sample.name)
    assert meta.schooljaar == "2025/2026"
