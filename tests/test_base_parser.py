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


def test_week_label_with_holiday_marks_entry_as_holiday() -> None:
    parser = BaseParser()
    row = DocRow(week=1, week_label="Week 1 Kerstvakantie")
    entry = parser.to_raw_entry(row)
    assert entry.is_holiday is True


def test_assignment_matching_week_label_is_removed() -> None:
    parser = BaseParser()
    row = DocRow(
        week=4,
        week_label="Week 4 22-01-2026 23-01-2026",
        opdracht="4 22-01-2026 23-01-2026",
        huiswerk="4 22-01-2026 23-01-2026",
    )
    entry = parser.to_raw_entry(row)
    assert entry.assignment is None
    assert entry.homework is None


def test_assignment_with_punctuation_and_dates_is_removed() -> None:
    parser = BaseParser()
    row = DocRow(
        week=4,
        week_label="Week 4 22-01-2026 23-01-2026.",
        opdracht="4 22-01-2026 23-01-2026.",
        huiswerk="4 22-01-2026 23-01-2026.",
    )
    entry = parser.to_raw_entry(row)
    assert entry.assignment is None
    assert entry.homework is None


def test_numeric_only_homework_does_not_block_holiday_detection() -> None:
    parser = BaseParser()
    row = DocRow(
        week=1,
        week_label="Week 1 22-12-2025 26-12-2025",
        onderwerp="Kerstvakantie",
        huiswerk="1 22-12-2025 26-12-2025",
    )
    entry = parser.to_raw_entry(row)
    assert entry.is_holiday is True


def test_assignment_with_exercise_range_is_preserved() -> None:
    parser = BaseParser()
    row = DocRow(week=2, opdracht="Opdracht 1-2")
    entry = parser.to_raw_entry(row)
    assert entry.assignment == "Opdracht 1-2"


def test_homework_with_fraction_instruction_is_preserved() -> None:
    parser = BaseParser()
    row = DocRow(week=3, huiswerk="Lees paragraaf 3/4")
    entry = parser.to_raw_entry(row)
    assert entry.homework == "Lees paragraaf 3/4"
