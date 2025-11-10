import importlib.util
import os
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "fetch_onedrive_folder", Path(__file__).resolve().parents[1] / "tools" / "fetch_onedrive_folder.py"
)
fetch = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(fetch)  # type: ignore[arg-type]


def test_load_env_overrides_existing_value(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("ONEDRIVE_SHARE_URL='https://drive.google.com/new'\n", encoding="utf-8")

    monkeypatch.setattr(fetch, "ROOT", tmp_path)
    monkeypatch.setenv("ONEDRIVE_SHARE_URL", "old-value")

    fetch.load_env()

    assert os.environ["ONEDRIVE_SHARE_URL"] == "https://drive.google.com/new"
