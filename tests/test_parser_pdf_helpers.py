from backend.parsers.parser_pdf import _cell_text_with_neighbors


def test_neighbor_lookup_ignores_columns_with_other_headers() -> None:
    headers = ["Week", "Onderwerp", "Huiswerk", "Opdracht"]
    row = ["48", "Toetsweek", "", "Groen licht formulier"]
    result = _cell_text_with_neighbors(row, 2, headers, headers[2])
    assert not result


def test_neighbor_lookup_uses_blank_header_columns() -> None:
    headers = ["Week", "", "Huiswerk"]
    row = ["48", "Groen licht formulier", ""]
    result = _cell_text_with_neighbors(row, 2, headers, headers[2])
    assert result == "Groen licht formulier"


def test_neighbor_lookup_skips_date_only_values() -> None:
    headers = ["Week", "Huiswerk", ""]
    row = ["46", "", "10-11-2025 14-11-2025"]
    result = _cell_text_with_neighbors(row, 1, headers, headers[1])
    assert not result
