import sys, pathlib; sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))
from pathlib import Path

from vlier_parser.normalize import parse_to_normalized


def test_parse_to_normalized_warning(tmp_path: Path):
    sample = tmp_path / "warning.docx"
    sample.write_text("dummy")
    _, model = parse_to_normalized(str(sample))
    assert model.warnings
    assert model.warnings[0].code == "WEEK_OUT_OF_RANGE"
