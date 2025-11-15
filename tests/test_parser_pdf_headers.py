from backend.parsers import parser_pdf


def test_pdf_parser_combines_multirow_headers_for_columns():
    table = [
        ["Week", "Omschrijving", "Taken", ""],
        ["", "Lesstof", "Huiswerk", "Toetsen/Deadlines"],
        ["48", "Projectupdate", "Maak opdracht 3", "Groen licht formulier laten ondertekenen."],
    ]

    rows = parser_pdf._extract_rows_from_tables([table], "2025/2026", "ckv.pdf")
    assert rows, "Expected rows to be parsed"
    row = rows[0]
    assert row.week == 48
    assert row.huiswerk == "Maak opdracht 3"
    assert row.toets is not None
    assert row.toets.get("type") == "Groen licht formulier laten ondertekenen."
    assert row.toets.get("weging") is None
