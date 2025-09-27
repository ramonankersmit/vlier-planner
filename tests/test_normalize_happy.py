import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.services.data_store import data_store
from vlier_parser.normalize import parse_to_normalized


def test_parse_to_normalized_happy(tmp_path: Path):
    data_store.set_base_path(tmp_path)
    try:
        sample = Path("samples/Aardrijkskunde_4V_P1_2025-2026.docx")
        parse_id, model = parse_to_normalized(str(sample))
    finally:
        data_store.reset_base_path()

    assert parse_id
    assert model.study_units
    unit = model.study_units[0]
    assert unit.name == "Aardrijkskunde"
    assert unit.period == 1

    assert len(model.sessions) == 12
    weeks = {session.week for session in model.sessions}
    assert min(weeks) == 35
    assert max(weeks) == 45

    assert len(model.assessments) == 4
    assert all(a.study_unit_id == unit.id for a in model.assessments)

    codes = {warning.code for warning in model.warnings}
    assert "ASSESSMENT_WEIGHT_UNKNOWN" in codes
    assert "WEEK_OUT_OF_RANGE" not in codes
