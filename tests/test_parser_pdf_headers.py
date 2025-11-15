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


def test_pdf_parser_reads_cells_from_neighboring_columns():
    table = [
        ["", "Week", "", "", "Lesstof", "", "", "Huiswerk", "", "", "Toetsen / Deadlines", "", "", "Opmerkingen", ""],
        [
            "48\n24-11-2025\n28-11-2025",
            None,
            None,
            "",
            "Maken Oefening 2",
            "",
            "",
            None,
            "Groen licht formulier laten ondertekenen.",
            "Inleveren opdracht 3 Deadline definitieve film",
            "",
            "",
            "",
            "",
            "",
        ],
    ]

    rows = parser_pdf._extract_rows_from_tables([table], "2025/2026", "ckv.pdf")
    assert rows, "Expected rows to be parsed"
    row = rows[0]
    assert row.week == 48
    assert row.huiswerk == "Groen licht formulier laten ondertekenen."
    assert row.toets is not None
    assert row.toets.get("type") == "Inleveren opdracht 3 Deadline definitieve film"
