import sys, pathlib; sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))
from pathlib import Path

from fastapi.testclient import TestClient

from vlier_parser.normalize import parse_to_normalized
from backend.main import app


def setup_module(module):
    tmp = Path("tests/tmp2.docx")
    tmp.write_text("dummy")
    parse_to_normalized(str(tmp))


client = TestClient(app)


def test_get_matrix():
    res = client.get("/api/matrix", params={"period": 1, "year": 2025})
    assert res.status_code == 200
    assert isinstance(res.json(), dict)
