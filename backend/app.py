import json
import logging
import os
import sys
from pathlib import Path
import mimetypes
import shutil
import uuid
from datetime import datetime, timezone
from html import escape
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import quote

from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

try:  # pragma: no cover - fallback for legacy execution styles
    from .models import DocMeta, DocRow
except ImportError:  # pragma: no cover
    from models import DocMeta, DocRow  # type: ignore

try:  # pragma: no cover - fallback for legacy execution styles
    from .parsers import (
        extract_meta_from_docx,
        extract_rows_from_docx,
        extract_all_periods_from_docx,
        extract_meta_from_pdf,
        extract_rows_from_pdf,
    )
except ImportError:  # pragma: no cover
    from parsers import (  # type: ignore
        extract_meta_from_docx,
        extract_rows_from_docx,
        extract_all_periods_from_docx,
        extract_meta_from_pdf,
        extract_rows_from_pdf,
    )

try:  # pragma: no cover - fallback for legacy execution styles
    from .study_guides import (
        StudyGuide,
        StudyGuideVersion,
        compute_diff,
        parse_guides,
        serialize_guides,
        stable_guide_id,
        read_pending_parse,
        write_pending_parse,
    )
except ImportError:  # pragma: no cover
    from study_guides import (  # type: ignore
        StudyGuide,
        StudyGuideVersion,
        compute_diff,
        parse_guides,
        serialize_guides,
        stable_guide_id,
        read_pending_parse,
        write_pending_parse,
    )

app = FastAPI(title="Vlier Planner API")

logger = logging.getLogger(__name__)

serve_frontend = os.getenv("SERVE_FRONTEND", "0").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# CORS voor local dev (pas aan indien nodig)
if not serve_frontend:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Bestandsopslag (simple disk storage)


def _user_data_base() -> Path:
    if sys.platform == "win32":
        root = os.getenv("LOCALAPPDATA") or Path.home() / "AppData" / "Local"
    elif sys.platform == "darwin":
        root = Path.home() / "Library" / "Application Support"
    else:
        root = os.getenv("XDG_DATA_HOME") or Path.home() / ".local" / "share"
    return Path(root) / "VlierPlanner"


def _storage_root() -> Path:
    custom = os.getenv("VLIER_STORAGE_DIR")
    if custom:
        return Path(custom)

    if getattr(sys, "frozen", False):
        return _user_data_base() / "storage"

    return Path(__file__).resolve().parent / "storage"


STORAGE_BASE = _storage_root()
STORAGE_BASE.mkdir(parents=True, exist_ok=True)
STORAGE = STORAGE_BASE / "uploads"
STORAGE.mkdir(parents=True, exist_ok=True)
STATE_FILE = STORAGE_BASE / "state.json"
PENDING_DIR = STORAGE_BASE / "pending"
PENDING_DIR.mkdir(parents=True, exist_ok=True)


GUIDES: Dict[str, StudyGuide] = {}
DOCS: Dict[str, StudyGuideVersion] = {}
PENDING_PARSES: Dict[str, Dict[str, Any]] = {}


def _row_to_dict(row: Union[DocRow, dict[str, Any]]) -> dict[str, Any]:
    if isinstance(row, DocRow):
        return row.dict()
    return dict(row)


def _uploaded_at_timestamp(meta: DocMeta) -> float:
    value = getattr(meta, "uploadedAt", None)
    if not value:
        return 0.0
    candidates = [value]
    if isinstance(value, str) and value.endswith("Z"):
        candidates.append(value[:-1] + "+00:00")
    for candidate in candidates:
        try:
            parsed = datetime.fromisoformat(candidate)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).timestamp()
    return 0.0


def _version_dir(guide_id: str, version_id: int) -> Path:
    return STORAGE / guide_id / str(version_id)


def _version_file_path(guide_id: str, version_id: int, file_name: str) -> Path:
    return _version_dir(guide_id, version_id) / file_name


def _refresh_docs_index() -> None:
    DOCS.clear()
    for guide_id, guide in GUIDES.items():
        latest = guide.latest_version()
        if latest:
            DOCS[guide_id] = latest


def _ensure_state_dir() -> None:
    STORAGE.mkdir(parents=True, exist_ok=True)
    PENDING_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_file_location(guide_id: str, version: StudyGuideVersion, legacy_file_id: Optional[str] = None) -> None:
    dest = _version_file_path(guide_id, version.version_id, version.file_name)
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)

    candidates: List[Path] = []
    if legacy_file_id:
        candidates.extend(STORAGE.glob(f"{legacy_file_id}.*"))
    candidates.append(STORAGE / version.file_name)
    for candidate in candidates:
        if candidate.exists() and candidate != dest:
            try:
                shutil.move(str(candidate), str(dest))
                return
            except Exception:
                continue


def _save_state() -> None:
    _ensure_state_dir()
    if not GUIDES:
        try:
            STATE_FILE.unlink(missing_ok=True)
        except Exception as exc:  # pragma: no cover - best-effort opruimen
            logger.warning("Kon state-bestand niet verwijderen: %s", exc)
        return

    payload = serialize_guides(GUIDES.values())
    try:
        STATE_FILE.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:  # pragma: no cover - IO afhankelijk
        logger.warning("Kon state-bestand niet schrijven: %s", exc)


def _load_state() -> None:
    GUIDES.clear()
    if not STATE_FILE.exists():
        _refresh_docs_index()
        return

    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - IO afhankelijk
        logger.warning("Kon state-bestand niet lezen: %s", exc)
        _refresh_docs_index()
        return

    if not isinstance(data, dict):
        logger.warning("State-bestand heeft onverwacht formaat")
        _refresh_docs_index()
        return

    guides = parse_guides(data)
    if guides:
        for guide in guides:
            for version in guide.versions:
                if not getattr(version.meta, "uploadedAt", None):
                    version.meta.uploadedAt = datetime.now(timezone.utc).isoformat()
                if not version.warnings:
                    version.warnings = _compute_warnings(
                        version.meta, version.rows, ignore_disabled_duplicates=True
                    )
                _ensure_file_location(guide.guide_id, version)
            GUIDES[guide.guide_id] = guide
        _refresh_docs_index()
        return

    # legacy formaat
    for file_id, entry in data.items():
        if not isinstance(entry, dict):
            logger.warning("State entry %s heeft onverwacht formaat", file_id)
            continue
        meta_data = entry.get("meta")
        rows_data = entry.get("rows", [])
        try:
            meta = DocMeta(**meta_data)
            rows = [DocRow(**row) for row in rows_data]
        except Exception as exc:
            logger.warning("Kon state entry %s niet herstellen: %s", file_id, exc)
            continue
        if not getattr(meta, "uploadedAt", None):
            meta.uploadedAt = datetime.now(timezone.utc).isoformat()
        guide_id = stable_guide_id(meta)
        meta.guideId = guide_id
        meta.fileId = guide_id
        version = StudyGuideVersion(
            version_id=1,
            file_name=meta.bestand,
            created_at=meta.uploadedAt or datetime.now(timezone.utc).isoformat(),
            meta=meta,
            rows=rows,
            diff_summary={"added": 0, "removed": 0, "changed": 0, "unchanged": len(rows)},
            diff=[],
            warnings=_compute_warnings(meta, rows, ignore_disabled_duplicates=True),
        )
        _ensure_file_location(guide_id, version, legacy_file_id=file_id)
        guide = GUIDES.setdefault(guide_id, StudyGuide(guide_id=guide_id, versions=[]))
        guide.versions.append(version)

    _refresh_docs_index()


def _load_pending() -> None:
    PENDING_PARSES.clear()
    if not PENDING_DIR.exists():
        return
    for pending_file in PENDING_DIR.glob("*.json"):
        data = read_pending_parse(pending_file)
        if not data:
            continue
        parse_id = data.get("parseId") or pending_file.stem
        rows_data = data.get("rows") or []
        try:
            normalized_rows = _ensure_rows([DocRow(**row) for row in rows_data])
        except Exception:
            normalized_rows = []
        data["rows"] = [row.dict() for row in normalized_rows]
        PENDING_PARSES[parse_id] = data


# -----------------------------
# Endpoints
# -----------------------------

def _iter_docx_blocks(document: Document):
    body = document.element.body
    for child in body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def _docx_to_html(path: Path) -> str:
    try:
        doc = Document(str(path))
    except Exception as exc:  # pragma: no cover - afhankelijk van docx lib
        raise HTTPException(500, f"Kon document niet openen: {exc}")

    parts: list[str] = []
    for block in _iter_docx_blocks(doc):
        if isinstance(block, Paragraph):
            text = escape(block.text or "").replace("\n", "<br/>")
            parts.append(f"<p>{text or '&nbsp;'}</p>")
        elif isinstance(block, Table):
            rows_html: list[str] = []
            for row in block.rows:
                cells_html = []
                for cell in row.cells:
                    cell_text = escape(cell.text or "").replace("\n", "<br/>")
                    cells_html.append(f"<td>{cell_text or '&nbsp;'}</td>")
                rows_html.append(f"<tr>{''.join(cells_html)}</tr>")
            parts.append(
                "<table class=\"docx-table\">{}</table>".format("".join(rows_html))
            )
    if not parts:
        return "<p><em>Geen tekstinhoud gevonden in document.</em></p>"
    return "".join(parts)


def _guide_or_404(guide_id: str) -> StudyGuide:
    guide = GUIDES.get(guide_id)
    if not guide:
        raise HTTPException(404, "Not found")
    return guide


def _version_or_404(guide: StudyGuide, version_id: Optional[int]) -> StudyGuideVersion:
    if version_id is None:
        version = guide.latest_version()
    else:
        version = next((item for item in guide.versions if item.version_id == version_id), None)
    if not version:
        raise HTTPException(404, "Not found")
    return version


def _pending_or_404(parse_id: str) -> Dict[str, Any]:
    pending = PENDING_PARSES.get(parse_id)
    if not pending:
        raise HTTPException(404, "Parse niet gevonden")
    return pending


def _pending_json_path(parse_id: str) -> Path:
    return PENDING_DIR / f"{parse_id}.json"


def _pending_file_path(parse_id: str, file_name: str) -> Path:
    folder = PENDING_DIR / parse_id
    folder.mkdir(parents=True, exist_ok=True)
    return folder / file_name


def _save_pending(parse_data: Dict[str, Any]) -> None:
    parse_id = parse_data["parseId"]
    PENDING_PARSES[parse_id] = parse_data
    write_pending_parse(_pending_json_path(parse_id), parse_data)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_pending_payload(
    meta: DocMeta,
    rows: List[DocRow],
    *,
    parse_id: Optional[str] = None,
    file_name: Optional[str] = None,
    stored_file: Optional[str] = None,
    uploaded_at: Optional[str] = None,
) -> Dict[str, Any]:
    safe_rows = _ensure_rows(rows or [])
    _auto_disable_duplicates(safe_rows)

    meta_copy = meta.copy(deep=True)
    _assign_ids(meta_copy)
    if not meta_copy.bestand and file_name:
        meta_copy.bestand = file_name
    meta_copy.uploadedAt = uploaded_at or meta_copy.uploadedAt or _now_iso()
    diff_summary, diff_detail = _diff_for_meta(meta_copy, safe_rows)
    warnings = _compute_warnings(meta_copy, safe_rows)

    parse_key = parse_id or uuid.uuid4().hex[:12]
    payload = {
        "parseId": parse_key,
        "meta": meta_copy.dict(),
        "rows": [row.dict() for row in safe_rows],
        "diffSummary": diff_summary,
        "diff": diff_detail,
        "warnings": warnings,
        "fileName": file_name or meta_copy.bestand,
    }
    if stored_file:
        payload["storedFile"] = stored_file
    return payload


def _remove_pending(parse_id: str) -> None:
    PENDING_PARSES.pop(parse_id, None)
    json_path = _pending_json_path(parse_id)
    try:
        json_path.unlink(missing_ok=True)
    except Exception:
        pass
    folder = PENDING_DIR / parse_id
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)


def _version_payload(version: StudyGuideVersion) -> Dict[str, Any]:
    return {
        "versionId": version.version_id,
        "createdAt": version.created_at,
        "meta": version.meta.dict(),
        "diffSummary": version.diff_summary,
        "warnings": version.warnings,
    }


def _ensure_rows(rows: List[DocRow]) -> List[DocRow]:
    normalized: List[DocRow] = []
    for row in rows:
        data = _row_to_dict(row)
        if data.get("enabled") is None:
            data["enabled"] = True
        normalized.append(DocRow(**data))
    return normalized


def _auto_disable_duplicates(rows: List[DocRow]) -> None:
    active_dates: Dict[str, int] = {}
    active_weeks: Dict[int, int] = {}
    for index, row in enumerate(rows):
        if row.enabled is False:
            continue

        date_key = (row.datum or "").strip()
        if date_key:
            active_index = active_dates.get(date_key)
            if active_index is None or rows[active_index].enabled is False:
                active_dates[date_key] = index
            else:
                rows[index].enabled = False
                continue

        if row.week is None:
            continue

        active_week = active_weeks.get(row.week)
        if active_week is None or rows[active_week].enabled is False:
            active_weeks[row.week] = index
            continue

        rows[index].enabled = False


def _compute_warnings(
    meta: DocMeta,
    rows: List[DocRow],
    *,
    ignore_disabled_duplicates: bool = False,
) -> Dict[str, bool]:
    normalized_rows = _ensure_rows(rows)
    active_rows = [row for row in normalized_rows if row.enabled]
    unknown_subject = not bool(meta.vak)
    missing_week = any(row.week is None for row in active_rows)
    dates = [row.datum for row in active_rows if getattr(row, "datum", None)]
    duplicate_date = len(dates) != len(set(dates))
    week_source = active_rows if ignore_disabled_duplicates else normalized_rows
    weeks = [row.week for row in week_source if isinstance(row.week, int)]
    duplicate_week = len(weeks) != len(set(weeks))
    return {
        "unknownSubject": unknown_subject,
        "missingWeek": missing_week,
        "duplicateDate": duplicate_date,
        "duplicateWeek": duplicate_week,
    }


def _assign_ids(meta: DocMeta) -> str:
    guide_id = stable_guide_id(meta)
    meta.guideId = guide_id
    meta.fileId = guide_id
    return guide_id


@app.get("/api/docs", response_model=List[DocMeta])
def list_docs():
    sorted_docs = sorted(
        DOCS.values(),
        key=lambda stored: _uploaded_at_timestamp(stored.meta),
        reverse=True,
    )
    return [stored.meta for stored in sorted_docs]


@app.get("/api/docs/{file_id}/rows", response_model=List[DocRow])
def get_doc_rows(file_id: str, versionId: Optional[int] = None):
    guide = _guide_or_404(file_id)
    version = _version_or_404(guide, versionId)
    return version.rows


@app.delete("/api/docs/{file_id}")
def delete_doc(file_id: str):
    guide = GUIDES.pop(file_id, None)
    if not guide:
        raise HTTPException(404, "Not found")
    target_folder = STORAGE / file_id
    if target_folder.exists():
        shutil.rmtree(target_folder, ignore_errors=True)
    _refresh_docs_index()
    _save_state()
    return {"ok": True}


@app.delete("/api/docs")
def delete_all_docs():
    """Wis alle bekende documenten en fysieke files (opschonen)."""
    GUIDES.clear()
    _refresh_docs_index()
    if STORAGE.exists():
        shutil.rmtree(STORAGE, ignore_errors=True)
        STORAGE.mkdir(parents=True, exist_ok=True)
    _save_state()
    return {"ok": True}


def _version_file_or_404(guide_id: str, version: StudyGuideVersion) -> Path:
    path = _version_file_path(guide_id, version.version_id, version.file_name)
    if not path.exists():
        _ensure_file_location(guide_id, version)
    if not path.exists():
        raise HTTPException(404, "File missing")
    return path


@app.get("/api/docs/{file_id}/content")
def get_doc_content(file_id: str, versionId: Optional[int] = None, inline: bool = False):
    guide = _guide_or_404(file_id)
    version = _version_or_404(guide, versionId)
    meta = version.meta
    file_path = _version_file_or_404(file_id, version)

    media_type, _ = mimetypes.guess_type(file_path.name)
    response = FileResponse(
        file_path,
        media_type=media_type or "application/octet-stream",
        filename=None if inline else meta.bestand,
    )

    if inline:
        safe_filename = meta.bestand.replace("\"", "\\\"")
        disposition = f'inline; filename="{safe_filename}"'
        quoted = quote(meta.bestand)
        if quoted:
            disposition = f"{disposition}; filename*=UTF-8''{quoted}"
        response.headers["Content-Disposition"] = disposition

    return response


@app.get("/api/docs/{file_id}/preview")
def get_doc_preview(file_id: str, versionId: Optional[int] = None):
    guide = _guide_or_404(file_id)
    version = _version_or_404(guide, versionId)
    meta = version.meta
    file_path = _version_file_or_404(file_id, version)
    suffix = file_path.suffix.lower()

    media_type, _ = mimetypes.guess_type(file_path.name)
    if suffix == ".docx":
        html_preview = _docx_to_html(file_path)
        return {
            "mediaType": "text/html; charset=utf-8",
            "html": html_preview,
            "filename": meta.bestand,
        }

    return {
        "mediaType": media_type or "application/octet-stream",
        "url": f"/api/docs/{file_id}/content?inline=1",
        "filename": meta.bestand,
    }


def _parse_upload(temp_path: Path, file_name: str, suffix: str) -> List[Tuple[DocMeta, List[DocRow]]]:
    parsed_docs: List[Tuple[DocMeta, List[DocRow]]] = []
    if suffix.endswith(".docx"):
        try:
            parsed_docs = extract_all_periods_from_docx(str(temp_path), file_name)
        except Exception as exc:  # pragma: no cover - afhankelijk van docx lib
            logger.warning(
                "Kon perioden niet extraheren uit %s: %s", file_name, exc
            )
            parsed_docs = []
        if not parsed_docs:
            meta = extract_meta_from_docx(str(temp_path), file_name)
            if meta:
                try:
                    rows = extract_rows_from_docx(str(temp_path), file_name)
                except Exception as exc:  # pragma: no cover - afhankelijk van docx lib
                    logger.warning(
                        "Kon rijen niet extraheren uit %s: %s", file_name, exc
                    )
                    rows = []
                parsed_docs = [(meta, rows)]
    else:
        meta = extract_meta_from_pdf(str(temp_path), file_name)
        if meta and extract_rows_from_pdf:
            try:
                rows = extract_rows_from_pdf(str(temp_path), file_name)
            except Exception as exc:  # pragma: no cover - afhankelijk van pdf lib
                logger.warning("Kon rijen niet extraheren uit %s: %s", file_name, exc)
                rows = []
            parsed_docs = [(meta, rows)]
        elif meta:
            parsed_docs = [(meta, [])]
    return parsed_docs


def _diff_for_meta(meta: DocMeta, rows: List[DocRow]) -> Tuple[Dict[str, int], List[Dict[str, Any]]]:
    normalized_rows = _ensure_rows(rows)
    guide_id = meta.guideId or _assign_ids(meta)
    if not meta.fileId:
        meta.fileId = guide_id
    guide = GUIDES.get(guide_id)
    if not guide or not guide.versions:
        return compute_diff([], normalized_rows)
    latest = guide.latest_version()
    latest_rows = _ensure_rows(latest.rows)
    return compute_diff(latest_rows, normalized_rows)


@app.post("/api/uploads")
async def upload_doc(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    suffix = file.filename.lower()
    if not (suffix.endswith(".docx") or suffix.endswith(".pdf")):
        raise HTTPException(400, "Unsupported file type (use .docx or .pdf)")

    _ensure_state_dir()
    temp_path = STORAGE / f"pending-{uuid.uuid4().hex}{Path(file.filename).suffix}"
    with temp_path.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)

    parsed_docs = _parse_upload(temp_path, file.filename, suffix)
    if not parsed_docs:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(422, "Could not extract metadata")

    uploaded_at = datetime.now(timezone.utc).isoformat()
    responses: List[Dict[str, Any]] = []
    file_bytes = temp_path.read_bytes()

    for meta, rows in parsed_docs:
        meta_copy = meta.copy(deep=True)
        meta_copy.uploadedAt = uploaded_at

        parse_id = uuid.uuid4().hex[:12]
        stored_file = _pending_file_path(parse_id, file.filename)
        stored_file.write_bytes(file_bytes)

        payload = _build_pending_payload(
            meta_copy,
            rows or [],
            parse_id=parse_id,
            file_name=file.filename,
            stored_file=str(stored_file.relative_to(PENDING_DIR)),
            uploaded_at=uploaded_at,
        )
        _save_pending(payload)
        responses.append(payload)

    try:
        temp_path.unlink(missing_ok=True)
    except Exception:
        pass

    return responses


@app.get("/api/study-guides")
def get_study_guides():
    guides = []
    for guide in GUIDES.values():
        latest = guide.latest_version()
        if not latest:
            continue
        guides.append({
            "guideId": guide.guide_id,
            "latestVersion": _version_payload(latest),
            "versionCount": len(guide.versions),
        })
    guides.sort(key=lambda item: _uploaded_at_timestamp(DocMeta(**item["latestVersion"]["meta"])), reverse=True)
    return guides


@app.get("/api/study-guides/{guide_id}/versions")
def get_study_guide_versions(guide_id: str):
    guide = _guide_or_404(guide_id)
    versions = sorted(guide.versions, key=lambda version: version.version_id, reverse=True)
    return [_version_payload(version) for version in versions]


@app.get("/api/study-guides/{guide_id}/diff/{version_id}")
def get_study_guide_diff(guide_id: str, version_id: int):
    guide = _guide_or_404(guide_id)
    version = _version_or_404(guide, version_id)
    return {
        "guideId": guide_id,
        "versionId": version.version_id,
        "diffSummary": version.diff_summary,
        "diff": version.diff,
    }


@app.post("/api/reviews")
def create_review(payload: Dict[str, Any] = Body(...)):
    guide_id = payload.get("guideId")
    if not guide_id:
        raise HTTPException(400, "guideId verplicht")
    version_id = payload.get("versionId")
    guide = _guide_or_404(str(guide_id))
    version = _version_or_404(guide, version_id)

    parse_id = uuid.uuid4().hex[:12]
    stored_rel: Optional[str] = None
    try:
        source_file = _version_file_or_404(guide.guide_id, version)
    except HTTPException:
        source_file = None
    if source_file and source_file.exists():
        pending_copy = _pending_file_path(parse_id, source_file.name)
        shutil.copyfile(source_file, pending_copy)
        stored_rel = str(pending_copy.relative_to(PENDING_DIR))

    meta_copy = version.meta.copy(deep=True)
    payload_data = _build_pending_payload(
        meta_copy,
        version.rows,
        parse_id=parse_id,
        file_name=version.file_name,
        stored_file=stored_rel,
        uploaded_at=_now_iso(),
    )
    _save_pending(payload_data)
    return payload_data


@app.get("/api/reviews/{parse_id}")
def get_review(parse_id: str):
    return _pending_or_404(parse_id)


@app.patch("/api/reviews/{parse_id}")
def update_review(parse_id: str, payload: Dict[str, Any] = Body(...)):
    pending = _pending_or_404(parse_id)
    meta_data = payload.get("meta")
    rows_data = payload.get("rows")

    if meta_data:
        pending["meta"].update(meta_data)
    if rows_data is not None:
        pending["rows"] = rows_data

    meta = DocMeta(**pending["meta"])
    rows = _ensure_rows([DocRow(**row) for row in pending.get("rows", [])])
    diff_summary, diff_detail = _diff_for_meta(meta, rows)
    warnings = _compute_warnings(meta, rows, ignore_disabled_duplicates=True)

    pending["meta"] = meta.dict()
    pending["rows"] = [row.dict() for row in rows]
    pending["diffSummary"] = diff_summary
    pending["diff"] = diff_detail
    pending["warnings"] = warnings

    _save_pending(pending)
    return pending


def _next_version_id(guide: Optional[StudyGuide]) -> int:
    if not guide or not guide.versions:
        return 1
    return max(version.version_id for version in guide.versions) + 1


@app.post("/api/reviews/{parse_id}/commit")
def commit_review(parse_id: str):
    pending = _pending_or_404(parse_id)
    meta = DocMeta(**pending["meta"])
    rows = _ensure_rows([DocRow(**row) for row in pending.get("rows", [])])

    guide_id = _assign_ids(meta)
    guide = GUIDES.get(guide_id)
    version_id = _next_version_id(guide)

    now = datetime.now(timezone.utc).isoformat()
    meta.uploadedAt = now
    diff_summary, diff_detail = _diff_for_meta(meta, rows)
    computed_warnings = _compute_warnings(meta, rows, ignore_disabled_duplicates=True)
    pending_warnings = pending.get("warnings")
    if isinstance(pending_warnings, dict):
        warnings = {
            "unknownSubject": bool(pending_warnings.get("unknownSubject", computed_warnings["unknownSubject"])),
            "missingWeek": bool(pending_warnings.get("missingWeek", computed_warnings["missingWeek"])),
            "duplicateDate": bool(pending_warnings.get("duplicateDate", computed_warnings["duplicateDate"])),
            "duplicateWeek": bool(pending_warnings.get("duplicateWeek", computed_warnings["duplicateWeek"])),
        }
    else:
        warnings = computed_warnings

    version = StudyGuideVersion(
        version_id=version_id,
        file_name=pending.get("fileName", meta.bestand),
        created_at=now,
        meta=meta,
        rows=rows,
        diff_summary=diff_summary,
        diff=diff_detail,
        warnings=warnings,
    )

    dest_path = _version_file_path(guide_id, version_id, version.file_name)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    stored_rel = pending.get("storedFile")
    stored_path = PENDING_DIR / stored_rel if stored_rel else None
    if stored_path and stored_path.exists():
        shutil.copyfile(stored_path, dest_path)

    if not guide:
        guide = StudyGuide(guide_id=guide_id, versions=[version])
        GUIDES[guide_id] = guide
    else:
        guide.versions.append(version)

    _refresh_docs_index()
    _save_state()
    _remove_pending(parse_id)

    return {
        "guideId": guide_id,
        "version": _version_payload(version),
    }


@app.delete("/api/reviews/{parse_id}")
def delete_review(parse_id: str):
    _pending_or_404(parse_id)
    _remove_pending(parse_id)
    return {"ok": True}


_load_state()
_load_pending()


if serve_frontend:
    FRONTEND_DIST = Path(__file__).resolve().parent / "static" / "dist"
    index_file = FRONTEND_DIST / "index.html"

    if FRONTEND_DIST.exists() and index_file.exists():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(404, "Not found")
            return FileResponse(index_file)
    else:
        logger.warning(
            "SERVE_FRONTEND is ingeschakeld, maar er is geen build gevonden op %s",
            FRONTEND_DIST,
        )

        missing_frontend_message = HTMLResponse(
            """
            <html>
                <head>
                    <title>Vlier Planner</title>
                    <style>
                        body {font-family: system-ui, sans-serif; margin: 40px; line-height: 1.6;}
                        code {background: #f2f2f2; padding: 2px 4px; border-radius: 4px;}
                    </style>
                </head>
                <body>
                    <h1>Frontend-build ontbreekt</h1>
                    <p>
                        De API draait, maar de frontend-build is niet gevonden. Bouw de frontend en kopieer
                        deze naar <code>backend/static/dist</code> met het hulpscript:
                    </p>
                    <pre><code>python tools/build_frontend.py</code></pre>
                    <p>
                        Nadat de build beschikbaar is, start de applicatie opnieuw.
                    </p>
                </body>
            </html>
            """
        )

        @app.get("/", response_class=HTMLResponse)
        async def frontend_missing_root() -> HTMLResponse:
            return missing_frontend_message

        @app.get("/{full_path:path}", response_class=HTMLResponse)
        async def frontend_missing(full_path: str) -> HTMLResponse:
            if full_path.startswith("api/"):
                raise HTTPException(404, "Not found")
            return missing_frontend_message
