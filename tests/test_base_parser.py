from backend.parsers.base_parser import BaseParser


def test_week_cell_ignores_date_ranges() -> None:
    parser = BaseParser()
    weeks = parser.parse_week_cell("Week 46 (25-11 t/m 29-11)")
    assert weeks == [46]


def test_week_cell_preserves_multiweek_sequences() -> None:
    parser = BaseParser()
    weeks = parser.parse_week_cell("52-1-2")
    assert weeks == [52, 1, 2]
