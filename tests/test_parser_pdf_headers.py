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


def test_pdf_parser_reads_cells_three_columns_away():
    table = [
        [
            "Week",
            "Lesstof",
            "Huiswerk",
            "",
            "",
            "",
            "Toetsen / Deadlines",
            "",
            "",
            "",
            "Opmerkingen",
        ],
        [
            "48",
            "Project",
            "Maak opdracht 2",
            "",
            "",
            "",
            "",
            "",
            "",
            "Inleveren pitch",
            "",
        ],
    ]

    rows = parser_pdf._extract_rows_from_tables([table], "2025/2026", "ckv.pdf")
    assert rows, "Expected rows to be parsed"
    row = rows[0]
    assert row.week == 48
    assert row.huiswerk == "Maak opdracht 2"
    assert row.toets is not None
    assert row.toets.get("type") == "Inleveren pitch"


def test_pdf_parser_keeps_vacation_rows_without_week_digits():
    table = [
        ["Week", "Extra"],
        ["Kerstvakantie", "52/1"],
    ]

    rows = parser_pdf._extract_rows_from_tables([table], "2025/2026", "ckv.pdf")
    assert rows, "Expected vacation row to be parsed"
    row = rows[0]
    assert row.week == 52
    assert row.week_span_end == 1
    assert row.week_label and row.week_label.startswith("Kerstvakantie")


def test_pdf_parser_infers_due_date_from_deadline_toets_text():
    entry = {
        "weeks": [48],
        "week_label": "48",
        "datum": "2025-11-24",
        "datum_eind": None,
        "huiswerk": None,
        "opdracht": None,
        "inleverdatum": None,
        "toets_text": "Inleveren pitch",
        "bronnen_text": None,
    }

    rows = parser_pdf._flush_pdf_entry(entry, "2025/2026")
    assert rows, "Expected flush to create a row"
    row = rows[0]
    assert row.inleverdatum == "2025-11-24"


def test_pdf_parser_ignores_date_only_neighbor_columns_for_work():
    table = [
        ["Week", "Huiswerk", "", "Opdracht", ""],
        ["46", "", "10-11-2025 14-11-2025", "", "10-11-2025 14-11-2025"],
    ]

    rows = parser_pdf._extract_rows_from_tables([table], "2025/2026", "scheikunde.pdf")
    assert rows, "Expected rows to be parsed"
    row = rows[0]
    assert row.huiswerk is None
    assert row.opdracht is None


def test_pdf_parser_ignores_tm_date_neighbor_columns_for_work():
    table = [
        ["Week", "Huiswerk", "", "Opdracht", ""],
        [
            "46",
            "",
            "10-11-2025 t/m 14-11-2025",
            "",
            "22-11-2025 tot en met 23-11-2025",
        ],
    ]

    rows = parser_pdf._extract_rows_from_tables([table], "2025/2026", "scheikunde.pdf")
    assert rows, "Expected rows to be parsed"
    row = rows[0]
    assert row.huiswerk is None
    assert row.opdracht is None


def test_pdf_parser_strips_tm_date_suffix_from_work_columns():
    table = [
        ["Week", "Huiswerk"],
        ["46", "Maken: paragraaf 1 en 2. 10-11-2025 t/m 14-11-2025"],
    ]

    rows = parser_pdf._extract_rows_from_tables([table], "2025/2026", "scheikunde.pdf")
    assert rows, "Expected rows to be parsed"
    row = rows[0]
    assert row.huiswerk == "Maken: paragraaf 1 en 2"
