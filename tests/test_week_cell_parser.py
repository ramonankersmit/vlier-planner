from backend.parsers.parser_docx import parse_week_cell


def test_parse_week_cell_handles_multi_part_sequence_with_hyphen():
    assert parse_week_cell("wk 52-1-2") == [52, 1, 2]


def test_parse_week_cell_handles_en_dash_and_longer_sequences():
    text = "52–1–2–3–4"
    assert parse_week_cell(text) == [52, 1, 2, 3, 4]
