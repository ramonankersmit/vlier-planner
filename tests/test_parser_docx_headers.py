from backend.parsers.parser_docx import _split_header_and_data_rows


def test_split_header_rows_uses_multiple_header_lines() -> None:
    rows = [
        ["Week", "Les", ""],
        ["", "Onderwerp", "Huiswerk"],
        ["1", "Intro", "Maak opdracht"],
    ]

    headers, data_rows, header_count = _split_header_and_data_rows(rows)

    assert header_count == 2
    assert data_rows == [["1", "Intro", "Maak opdracht"]]
    assert headers[1] == "Les Onderwerp"
    assert headers[2] == "Huiswerk"


def test_split_header_rows_falls_back_to_single_header_when_needed() -> None:
    rows = [
        ["Week", "Datum", "Onderwerp"],
        ["2", "26-08", "Start"],
    ]

    headers, data_rows, header_count = _split_header_and_data_rows(rows)

    assert header_count == 1
    assert data_rows == [["2", "26-08", "Start"]]
    assert headers == ["Week", "Datum", "Onderwerp"]
