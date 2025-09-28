from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List


class DataStore:
    """Central storage manager for normalized data and study guides."""

    def __init__(self) -> None:
        self._default_base = self._determine_default_base()
        self._configure(self._default_base)

    @staticmethod
    def _user_data_base() -> Path:
        if sys.platform == "win32":
            root = Path(os.getenv("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
        elif sys.platform == "darwin":
            root = Path.home() / "Library" / "Application Support"
        else:
            root = Path(os.getenv("XDG_DATA_HOME") or Path.home() / ".local" / "share")
        return root / "VlierPlanner"

    def _determine_default_base(self) -> Path:
        custom_data = os.getenv("VLIER_DATA_DIR")
        if custom_data:
            return Path(custom_data)

        custom_storage = os.getenv("VLIER_STORAGE_DIR")
        if custom_storage:
            return Path(custom_storage)

        if getattr(sys, "frozen", False):
            return self._user_data_base() / "storage"

        return Path(__file__).resolve().parent.parent / "storage"

    def _configure(self, base_path: Path) -> None:
        self._base_path = Path(base_path)
        self._uploads_dir = self._base_path / "uploads"
        self._pending_dir = self._base_path / "pending"
        self._state_file = self._base_path / "state.json"
        self._normalized_dir = self._base_path / "normalized"
        self._normalized_index = self._normalized_dir / "index.json"
        self.ensure_ready()

    def ensure_ready(self) -> None:
        self._base_path.mkdir(parents=True, exist_ok=True)
        self._uploads_dir.mkdir(parents=True, exist_ok=True)
        self._pending_dir.mkdir(parents=True, exist_ok=True)
        self._normalized_dir.mkdir(parents=True, exist_ok=True)

    @property
    def base_path(self) -> Path:
        return self._base_path

    @property
    def uploads_dir(self) -> Path:
        return self._uploads_dir

    @property
    def pending_dir(self) -> Path:
        return self._pending_dir

    @property
    def state_file(self) -> Path:
        return self._state_file

    @property
    def normalized_dir(self) -> Path:
        return self._normalized_dir

    @property
    def normalized_index_file(self) -> Path:
        return self._normalized_index

    def set_base_path(self, base_path: Path) -> None:
        self._configure(Path(base_path))

    def reset_base_path(self) -> None:
        self._configure(self._default_base)

    def load_normalized_index(self) -> List[Dict[str, Any]]:
        if not self._normalized_index.exists():
            return []
        try:
            with self._normalized_index.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return []
        if isinstance(data, list):
            return data
        return []

    def save_normalized_index(self, index: List[Dict[str, Any]]) -> None:
        self.ensure_ready()
        with self._normalized_index.open("w", encoding="utf-8") as handle:
            json.dump(index, handle, indent=2)

    def append_normalized_index_entry(self, entry: Dict[str, Any]) -> None:
        index = self.load_normalized_index()
        index.append(entry)
        self.save_normalized_index(index)

    def write_normalized_model(self, parse_id: str, payload: Dict[str, Any] | str) -> Path:
        self.ensure_ready()
        path = self._normalized_dir / f"{parse_id}.json"
        if isinstance(payload, str):
            path.write_text(payload, encoding="utf-8")
        else:
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    def read_normalized_model(self, parse_id: str) -> Dict[str, Any]:
        path = self._normalized_dir / f"{parse_id}.json"
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def load_latest_normalized(self) -> Dict[str, Any]:
        index = self.load_normalized_index()
        if not index:
            return {}
        last = index[-1]
        parse_id = last.get("id")
        if not parse_id:
            return {}
        try:
            return self.read_normalized_model(str(parse_id))
        except FileNotFoundError:
            return {}


data_store = DataStore()
