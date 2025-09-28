import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.services.data_store import data_store
from vlier_parser.normalize import parse_to_normalized


def test_parse_to_normalized_warning(tmp_path: Path):
    data_store.set_base_path(tmp_path)
    try:
        sample = Path("samples/Levensbeschouwing 2526 4V periode 1.docx")
        _, model = parse_to_normalized(str(sample))
    finally:
        data_store.reset_base_path()

    assert model.warnings
    codes = {warning.code for warning in model.warnings}
    assert "SESSION_DATE_MISSING" in codes
    assert "ASSESSMENT_WEIGHT_UNKNOWN" not in codes
