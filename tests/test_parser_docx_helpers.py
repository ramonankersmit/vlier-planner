from types import SimpleNamespace

from backend.parsers.models import DocRow
from backend.parsers.parser_docx import _apply_vak_specific_row_postprocessing


def _ctx(vak: str) -> SimpleNamespace:
    return SimpleNamespace(vak=vak)


def test_aardrijkskunde_notities_worden_toetstype() -> None:
    row = DocRow(
        week=50,
        toets={"type": None, "weging": "10%", "herkansing": "nee"},
        notities="Tussentoets begrippen Hoofdstuk 3",
    )
    _apply_vak_specific_row_postprocessing(_ctx("Aardrijkskunde"), row)

    assert row.toets["type"] == "Tussentoets begrippen Hoofdstuk 3"
    assert row.notities is None


def test_aardrijkskunde_houdt_reguliere_notities_beet() -> None:
    row = DocRow(
        week=49,
        toets={"type": None, "weging": None},
        notities="Gespreksavond 4HV, 5HV",
    )
    _apply_vak_specific_row_postprocessing(_ctx("Aardrijkskunde"), row)

    assert row.notities == "Gespreksavond 4HV, 5HV"
    assert row.toets["type"] is None


def test_andere_vakken_worden_genegeerd() -> None:
    row = DocRow(
        week=50,
        toets={"type": None, "weging": None},
        notities="Tussentoets woordjes",
    )
    _apply_vak_specific_row_postprocessing(_ctx("Duits"), row)

    assert row.notities == "Tussentoets woordjes"
    assert row.toets["type"] is None
