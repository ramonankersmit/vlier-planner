from backend.parsers.parser_pdf import _cell_text_with_neighbors, _update_pdf_entry


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


def _make_entry() -> dict:
    return {
        "weeks": [47],
        "week_label": "47",
        "datum": None,
        "datum_eind": None,
        "les": None,
        "onderwerp": None,
        "leerdoelen": None,
        "huiswerk": None,
        "opdracht": None,
        "inleverdatum": None,
        "toets_text": None,
        "bronnen_text": None,
        "notities": None,
        "klas": None,
        "locatie": None,
        "source_row_id": "test",
    }


def _make_idx() -> dict:
    return {
        "date": None,
        "les": None,
        "onderwerp": 1,
        "leerdoelen": None,
        "huiswerk": 2,
        "opdracht": None,
        "inlever": None,
        "toets": None,
        "bronnen": None,
        "notities": None,
        "klas": None,
        "locatie": None,
    }


def test_homework_duplicate_of_topic_is_skipped() -> None:
    headers = ["Week", "Onderwerp", "Huiswerk"]
    row = ["47", "Oefenen luistervaardigheid", "Oefenen luistervaardigheid"]
    entry = _make_entry()
    entry["onderwerp"] = "Oefenen luistervaardigheid"

    _update_pdf_entry(entry, row, _make_idx(), headers, None)

    assert entry["huiswerk"] is None


def test_distinct_homework_is_kept() -> None:
    headers = ["Week", "Onderwerp", "Huiswerk"]
    row = ["48", "Luistertoets", "Maak oefening 1-3"]
    entry = _make_entry()
    entry["onderwerp"] = "Luistertoets"

    _update_pdf_entry(entry, row, _make_idx(), headers, None)

    assert entry["huiswerk"] == "Maak oefening 1-3"
