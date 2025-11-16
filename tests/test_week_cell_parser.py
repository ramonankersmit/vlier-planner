from backend.parsers.parser_docx import parse_week_cell, parse_week_cell_details


def test_parse_week_cell_handles_multi_part_sequence_with_hyphen():
    assert parse_week_cell("wk 52-1-2") == [52, 1, 2]


def test_parse_week_cell_handles_en_dash_and_longer_sequences():
    text = "52–1–2–3–4"
    assert parse_week_cell(text) == [52, 1, 2, 3, 4]


def test_parse_week_cell_details_returns_span_metadata():
    details = parse_week_cell_details("Week 3/4")
    assert details.weeks == [3, 4]
    assert details.week_span_start == 3
    assert details.week_span_end == 4
    assert details.label == "Week 3/4"


def test_parse_week_cell_details_handles_slash_with_spaces():
    details = parse_week_cell_details("52 / 1")
    assert details.weeks == [52, 1]
    assert details.week_span_start == 52
    assert details.week_span_end == 1
