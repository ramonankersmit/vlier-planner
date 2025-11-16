from backend.models import DocRow
from backend.parsers.parser_pdf import (
    _SPECIAL_TOETSWEEK_PATTERN,
    _SPECIAL_VACATION_PATTERN,
    _cell_text_with_neighbors,
    _split_special_row,
)


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


def test_toetsweek_rows_are_split_into_dedicated_entries() -> None:
    base_row = DocRow(
        week=3,
        weeks=[3],
        week_span_start=3,
        week_span_end=3,
        week_label="3",
        datum="2026-01-12",
        onderwerp="Voorbereiden voor toets Toetsweek 2",
        huiswerk="Leeropdrachten Toetsweek 2",
        notities="Toetsweek 2",
        toets={"type": "toets", "weging": None, "herkansing": "onbekend"},
        source_row_id="Natuurkunde studiewijzer 2526 periode 2.pdf:t0:r9",
    )

    result = _split_special_row(base_row, _SPECIAL_TOETSWEEK_PATTERN, "2025/2026", kind="toetsweek")
    assert len(result) == 2

    normal, toetsweek = result
    assert normal.onderwerp == "Voorbereiden voor toets"
    assert toetsweek.onderwerp == "Toetsweek 2"
    assert toetsweek.weeks == [3, 4]
    assert toetsweek.week_label and "3/4" in toetsweek.week_label
    assert toetsweek.datum == "2026-01-14"
    assert toetsweek.datum_eind is None
    assert normal.toets is None
    assert toetsweek.toets == base_row.toets
    assert toetsweek.huiswerk == "Toetsweek 2"
    assert toetsweek.notities == "Toetsweek 2"


def test_kerstvakantie_rows_gain_extra_week_52_entry() -> None:
    base_row = DocRow(
        week=51,
        weeks=[51],
        week_span_start=51,
        week_span_end=51,
        week_label="51",
        datum="2025-12-15",
        onderwerp="Hoofdstuk 4: paragraaf 2 Kerstvakantie",
        huiswerk="Maken: paragraaf 2 Kerstvakantie",
        toets={"type": "Kerstvakantie", "weging": None, "herkansing": "onbekend"},
        source_row_id="Scheikunde 4V P2 2526.pdf:t0:r6",
    )

    result = _split_special_row(base_row, _SPECIAL_VACATION_PATTERN, "2025/2026", kind="vacation")
    assert len(result) == 2

    normal, vakantie = result
    assert normal.week == 51
    assert "Kerstvakantie" not in (normal.onderwerp or "")
    assert vakantie.week == 52
    assert vakantie.weeks == [52, 1]
    assert vakantie.datum == "2025-12-22"
    assert vakantie.datum_eind == "2026-01-02"
    assert vakantie.week_label == "52/1 \n22-12-2025 \n02-01-2026"
    assert normal.toets is None
    assert vakantie.toets == base_row.toets
    assert vakantie.huiswerk == "Kerstvakantie"
    assert vakantie.onderwerp == "Kerstvakantie"
    assert vakantie.notities == "Kerstvakantie"
