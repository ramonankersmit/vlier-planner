from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:  # pragma: no cover - allow execution without package context
    from .models import DocMeta, DocRow
except ImportError:  # pragma: no cover
    from models import DocMeta, DocRow  # type: ignore


def _normalize_value(value: Any) -> Any:
    if isinstance(value, list):
        return [
            _normalize_value(item)
            for item in value
        ]
    if isinstance(value, dict):
        return {
            key: _normalize_value(val)
            for key, val in value.items()
        }
    return value


def compute_field_diff(old: Any, new: Any) -> Tuple[str, Any, Any]:
    old_norm = _normalize_value(old)
    new_norm = _normalize_value(new)
    if old_norm == new_norm:
        return "unchanged", old, new
    if old is None and new is not None:
        return "added", old, new
    if old is not None and new is None:
        return "removed", old, new
    return "changed", old, new


def compute_diff(old_rows: List[DocRow], new_rows: List[DocRow]) -> Tuple[Dict[str, int], List[Dict[str, Any]]]:
    summary = {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}
    diffs: List[Dict[str, Any]] = []

    max_len = max(len(old_rows), len(new_rows))
    for index in range(max_len):
        old_row = old_rows[index] if index < len(old_rows) else None
        new_row = new_rows[index] if index < len(new_rows) else None

        if old_row is None and new_row is None:
            continue

        if old_row is None:
            status = "added"
            summary[status] += 1
            fields = {}
            for key, value in new_row.dict().items():
                field_status, old_value, new_value = compute_field_diff(None, value)
                fields[key] = {
                    "status": field_status,
                    "old": old_value,
                    "new": new_value,
                }
            diffs.append({
                "index": index,
                "status": status,
                "fields": fields,
            })
            continue

        if new_row is None:
            status = "removed"
            summary[status] += 1
            fields = {}
            for key, value in old_row.dict().items():
                field_status, old_value, new_value = compute_field_diff(value, None)
                fields[key] = {
                    "status": field_status,
                    "old": old_value,
                    "new": new_value,
                }
            diffs.append({
                "index": index,
                "status": status,
                "fields": fields,
            })
            continue

        field_diffs: Dict[str, Dict[str, Any]] = {}
        has_change = False
        for key in set(old_row.dict().keys()).union(new_row.dict().keys()):
            old_value = old_row.dict().get(key)
            new_value = new_row.dict().get(key)
            field_status, old_value_raw, new_value_raw = compute_field_diff(old_value, new_value)
            if field_status != "unchanged":
                has_change = True
            field_diffs[key] = {
                "status": field_status,
                "old": old_value_raw,
                "new": new_value_raw,
            }

        status = "changed" if has_change else "unchanged"
        summary[status] += 1
        diffs.append({
            "index": index,
            "status": status,
            "fields": field_diffs,
        })

    return summary, diffs


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_guide_id(meta: DocMeta) -> str:
    components = [
        meta.vak or "",
        meta.niveau or "",
        meta.leerjaar or "",
        str(meta.periode or ""),
        meta.schooljaar or "",
    ]
    key = "|".join(component.strip().lower() for component in components)
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return digest[:16]


@dataclass
class StudyGuideVersion:
    version_id: int
    file_name: str
    created_at: str
    meta: DocMeta
    rows: List[DocRow]
    diff_summary: Dict[str, int] = field(default_factory=dict)
    diff: List[Dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.meta.versionId = self.version_id
        guide_id = self.meta.guideId or self.meta.fileId
        self.meta.guideId = guide_id
        self.meta.fileId = guide_id

    def to_dict(self) -> Dict[str, Any]:
        return {
            "versionId": self.version_id,
            "fileName": self.file_name,
            "createdAt": self.created_at,
            "meta": self.meta.dict(),
            "rows": [row.dict() for row in self.rows],
            "diffSummary": self.diff_summary,
            "diff": self.diff,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], guide_id: Optional[str] = None) -> "StudyGuideVersion":
        meta = DocMeta(**data["meta"])
        if guide_id:
            meta.guideId = guide_id
            meta.fileId = guide_id
        rows = [DocRow(**row) for row in data.get("rows", [])]
        return cls(
            version_id=int(data["versionId"]),
            file_name=data.get("fileName", meta.bestand),
            created_at=data.get("createdAt", _now_iso()),
            meta=meta,
            rows=rows,
            diff_summary=data.get("diffSummary", {}),
            diff=data.get("diff", []),
        )


@dataclass
class StudyGuide:
    guide_id: str
    versions: List[StudyGuideVersion] = field(default_factory=list)

    def latest_version(self) -> Optional[StudyGuideVersion]:
        if not self.versions:
            return None
        return max(self.versions, key=lambda version: version.version_id)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "guideId": self.guide_id,
            "versions": [version.to_dict() for version in sorted(self.versions, key=lambda v: v.version_id)],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StudyGuide":
        versions = [StudyGuideVersion.from_dict(version, guide_id=data["guideId"]) for version in data.get("versions", [])]
        return cls(guide_id=data["guideId"], versions=versions)


def serialize_guides(guides: Iterable[StudyGuide]) -> Dict[str, Any]:
    return {
        "studyGuides": {
            guide.guide_id: guide.to_dict()
            for guide in guides
        }
    }


def parse_guides(data: Dict[str, Any]) -> List[StudyGuide]:
    guides = []
    study_guides = data.get("studyGuides", {}) if isinstance(data, dict) else {}
    if isinstance(study_guides, dict):
        for guide_id, payload in study_guides.items():
            try:
                payload_with_id = {"guideId": guide_id, **payload}
                guides.append(StudyGuide.from_dict(payload_with_id))
            except Exception:
                continue
    return guides


def write_pending_parse(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read_pending_parse(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
