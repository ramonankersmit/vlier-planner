from backend.models import DocRow
from backend.parsers.base_parser import BaseParser


def test_week_cell_ignores_date_ranges() -> None:
    parser = BaseParser()
    weeks = parser.parse_week_cell("Week 46 (25-11 t/m 29-11)")
    assert weeks == [46]


def test_week_cell_preserves_multiweek_sequences() -> None:
    parser = BaseParser()
    weeks = parser.parse_week_cell("52-1-2")
    assert weeks == [52, 1, 2]


def test_holiday_detected_when_only_vacation_text() -> None:
    parser = BaseParser()
    row = DocRow(week=1, onderwerp="Kerstvakantie", huiswerk="Kerstvakantie")
    entry = parser.to_raw_entry(row)
    assert entry.is_holiday is True


def test_holiday_detected_with_no_work_even_if_text_in_homework() -> None:
    parser = BaseParser()
    row = DocRow(week=1, huiswerk="Geen les i.v.m. kerstvakantie")
    entry = parser.to_raw_entry(row)
    assert entry.is_holiday is True
