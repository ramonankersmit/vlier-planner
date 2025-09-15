import sys, pathlib; sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))
from pathlib import Path

from vlier_parser.normalize import parse_to_normalized


def test_parse_to_normalized_happy(tmp_path: Path):
    sample = tmp_path / "sample.docx"
    sample.write_text("dummy")
    parse_id, model = parse_to_normalized(str(sample))
    assert parse_id
    assert len(model.sessions) == 1
    assert model.sessions[0].week == 38
    assert not model.warnings
