from dataclasses import dataclass
import json
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import Any, List, Tuple, Union
from pathlib import Path
import mimetypes
import shutil
import uuid
from html import escape
from urllib.parse import quote

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

from models import DocMeta, DocRow  # jij gebruikt nog models.py; laat dit zo staan
from parsers import (
    extract_meta_from_docx,
    extract_rows_from_docx,
    extract_meta_from_pdf,
    extract_rows_from_pdf,
)

app = FastAPI(title="Vlier Planner API")

logger = logging.getLogger(__name__)

# CORS voor local dev (pas aan indien nodig)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Bestandsopslag (simple disk storage)
STORAGE = Path(__file__).parent / "storage" / "uploads"
STORAGE.mkdir(parents=True, exist_ok=True)
STATE_FILE = Path(__file__).parent / "storage" / "state.json"
STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

INLINE_PREVIEW_MEDIA_TYPES = {"application/pdf"}

@dataclass
class StoredDoc:
    meta: DocMeta
    rows: List[DocRow]


# In-memory index (MVP). Later vervangen door DB.
DOCS: dict[str, StoredDoc] = {}


def _row_to_dict(row: Union[DocRow, dict[str, Any]]) -> dict[str, Any]:
    if isinstance(row, DocRow):
        return row.dict()
    return dict(row)


def _save_state() -> None:
    if not DOCS:
        try:
            STATE_FILE.unlink(missing_ok=True)
        except Exception as exc:  # pragma: no cover - best-effort opruimen
            logger.warning("Kon state-bestand niet verwijderen: %s", exc)
        return

    payload: dict[str, dict[str, Any]] = {}
    for file_id, stored in DOCS.items():
        payload[file_id] = {
            "meta": stored.meta.dict(),
            "rows": [_row_to_dict(row) for row in stored.rows],
        }

    try:
        STATE_FILE.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:  # pragma: no cover - IO afhankelijk
        logger.warning("Kon state-bestand niet schrijven: %s", exc)


def _load_state() -> None:
    if not STATE_FILE.exists():
        return

    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - IO afhankelijk
        logger.warning("Kon state-bestand niet lezen: %s", exc)
        return

    if not isinstance(data, dict):
        logger.warning("State-bestand heeft onverwacht formaat")
        return

    DOCS.clear()
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
        suffix = Path(meta.bestand).suffix.lower()
        file_path = STORAGE / f"{file_id}{suffix}"
        if not file_path.exists():
            fallback = next(STORAGE.glob(f"{file_id}.*"), None)
            if not fallback or not fallback.exists():
                logger.warning("Bestand voor %s ontbreekt; sla entry over", file_id)
                continue
        DOCS[file_id] = StoredDoc(meta=meta, rows=rows)


_load_state()

# -----------------------------
# Endpoints
# -----------------------------


def _resolve_doc_file(file_id: str, meta: DocMeta) -> Tuple[Path, str]:
    suffix = Path(meta.bestand).suffix.lower()
    file_path = STORAGE / f"{file_id}{suffix}"
    if not file_path.exists():
        match = next(STORAGE.glob(f"{file_id}.*"), None)
        if not match or not match.exists():
            raise HTTPException(404, "File missing")
        file_path = match
        suffix = file_path.suffix.lower()
    return file_path, suffix


def _build_file_response(file_id: str, stored: StoredDoc, inline: bool) -> FileResponse:
    file_path, _ = _resolve_doc_file(file_id, stored.meta)
    media_type, _ = mimetypes.guess_type(file_path.name)
    response = FileResponse(
        file_path,
        media_type=media_type or "application/octet-stream",
        filename=None if inline else stored.meta.bestand,
    )

    if inline:
        safe_filename = stored.meta.bestand.replace("\"", "\\\"")
        disposition = f'inline; filename="{safe_filename}"'
        quoted = quote(stored.meta.bestand)
        if quoted:
            disposition = f"{disposition}; filename*=UTF-8''{quoted}"
        response.headers["Content-Disposition"] = disposition

    return response


def _format_cell_value(value: Any) -> str:
    if value is None:
        return "&nbsp;"
    if isinstance(value, str):
        escaped = escape(value).replace("\n", "<br/>")
        return escaped or "&nbsp;"
    if isinstance(value, (int, float)):
        return escape(str(value))
    if isinstance(value, list):
        rendered = "<br/>".join(
            escape(str(item)).replace("\n", "<br/>")
            for item in value
            if item not in (None, "")
        )
        return rendered or "&nbsp;"
    if isinstance(value, dict):
        pieces = []
        for key, val in value.items():
            if val in (None, ""):
                continue
            pieces.append(
                "<div><strong>{}:</strong> {}</div>".format(
                    escape(str(key)), escape(str(val)).replace("\n", "<br/>")
                )
            )
        return "".join(pieces) or "&nbsp;"
    return escape(str(value))


def _render_rows_summary_html(stored: StoredDoc) -> str:
    meta = stored.meta
    parts: list[str] = ["<article class=\"doc-summary\">"]

    title = escape(meta.bestand or meta.fileId)
    parts.append(f"<h2>{title}</h2>")

    meta_pairs: list[Tuple[str, Any]] = [
        ("Vak", meta.vak),
        ("Niveau", meta.niveau),
        ("Leerjaar", meta.leerjaar),
        ("Periode", meta.periode),
        ("Begin week", meta.beginWeek),
        ("Eind week", meta.eindWeek),
    ]
    if meta.schooljaar:
        meta_pairs.append(("Schooljaar", meta.schooljaar))

    parts.append("<dl class=\"doc-summary__meta\">")
    for label, value in meta_pairs:
        parts.append(f"<dt>{escape(str(label))}</dt>")
        parts.append(f"<dd>{_format_cell_value(value)}</dd>")
    parts.append("</dl>")

    row_fields: list[Tuple[str, str]] = [
        ("week", "Week"),
        ("datum", "Datum"),
        ("les", "Les"),
        ("onderwerp", "Onderwerp"),
        ("huiswerk", "Huiswerk"),
        ("opdracht", "Opdracht"),
        ("inleverdatum", "Inleverdatum"),
    ]

    if stored.rows:
        parts.append("<table class=\"docx-table doc-summary__table\">")
        parts.append("<thead><tr>")
        for _, heading in row_fields:
            parts.append(f"<th>{escape(heading)}</th>")
        parts.append("</tr></thead><tbody>")

        for row in stored.rows:
            data = _row_to_dict(row)
            parts.append("<tr>")
            for key, _ in row_fields:
                parts.append(f"<td>{_format_cell_value(data.get(key))}</td>")
            parts.append("</tr>")

        parts.append("</tbody></table>")
    else:
        parts.append("<p><em>Geen gestructureerde lesgegevens beschikbaar.</em></p>")

    parts.append("</article>")
    return "".join(parts)


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


@app.get("/api/docs", response_model=List[DocMeta])
def list_docs():
    return [stored.meta for stored in DOCS.values()]


@app.get("/api/docs/{file_id}/rows", response_model=List[DocRow])
def get_doc_rows(file_id: str):
    stored = DOCS.get(file_id)
    if not stored:
        raise HTTPException(404, "Not found")
    return stored.rows


@app.delete("/api/docs/{file_id}")
def delete_doc(file_id: str):
    if file_id not in DOCS:
        raise HTTPException(404, "Not found")
    # fysiek bestand verwijderen (best effort)
    try:
        for p in STORAGE.glob(f"{file_id}.*"):
            p.unlink(missing_ok=True)
    except Exception:
        pass
    del DOCS[file_id]
    _save_state()
    return {"ok": True}

@app.delete("/api/docs")
def delete_all_docs():
    """Wis alle bekende documenten en fysieke files (opschonen)."""
    DOCS.clear()
    for p in STORAGE.glob("*.*"):
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass
    _save_state()
    return {"ok": True}


@app.get("/api/docs/{file_id}/content")
def get_doc_content(file_id: str, inline: bool = False):
    stored = DOCS.get(file_id)
    if not stored:
        raise HTTPException(404, "Not found")
    return _build_file_response(file_id, stored, inline)


@app.get("/api/docs/{file_id}/source")
def get_doc_source(file_id: str):
    stored = DOCS.get(file_id)
    if not stored:
        raise HTTPException(404, "Not found")
    return _build_file_response(file_id, stored, inline=False)


@app.get("/api/docs/{file_id}/preview")
def get_doc_preview(file_id: str):
    stored = DOCS.get(file_id)
    if not stored:
        raise HTTPException(404, "Not found")

    meta = stored.meta
    file_path, suffix = _resolve_doc_file(file_id, stored.meta)
    media_type, _ = mimetypes.guess_type(file_path.name)

    if suffix == ".docx":
        html = _docx_to_html(file_path)
        return {
            "mediaType": "text/html",
            "html": html,
            "filename": meta.bestand,
        }

    if media_type in INLINE_PREVIEW_MEDIA_TYPES:
        return {
            "mediaType": media_type or "application/octet-stream",
            "url": f"/api/docs/{file_id}/content?inline=1",
            "filename": meta.bestand,
        }

    html = _render_rows_summary_html(stored)
    return {
        "mediaType": "text/html",
        "html": html,
        "filename": meta.bestand,
    }

@app.post("/api/uploads", response_model=DocMeta)
async def upload_doc(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    suffix = file.filename.lower()
    if not (suffix.endswith(".docx") or suffix.endswith(".pdf")):
        raise HTTPException(400, "Unsupported file type (use .docx or .pdf)")

    # Sla eerst op met originele naam (mag dubbel zijn)
    temp_path = STORAGE / file.filename
    with temp_path.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)

    # Parse metadata
    rows: List[DocRow] = []
    if suffix.endswith(".docx"):
        meta = extract_meta_from_docx(str(temp_path), file.filename)
        if meta:
            try:
                rows = extract_rows_from_docx(str(temp_path), file.filename)
            except Exception as exc:  # pragma: no cover - afhankelijk van docx lib
                logger.warning("Kon rijen niet extraheren uit %s: %s", file.filename, exc)
                rows = []
    else:
        meta = extract_meta_from_pdf(str(temp_path), file.filename)
        if meta and extract_rows_from_pdf:
            try:
                rows = extract_rows_from_pdf(str(temp_path), file.filename)
            except Exception as exc:  # pragma: no cover - afhankelijk van pdf lib
                logger.warning("Kon rijen niet extraheren uit %s: %s", file.filename, exc)
                rows = []

    if not meta:
        # opruimen temp
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(422, "Could not extract metadata")

    if rows is None:
        rows = []

    # Forceer uniek fileId (voorkomt naam-collisie)
    meta.fileId = uuid.uuid4().hex[:12]

    # Hernoem fysiek bestand naar <fileId>.<ext>
    final_path = STORAGE / f"{meta.fileId}{Path(file.filename).suffix.lower()}"
    if final_path.exists():
        final_path.unlink()
    temp_path.rename(final_path)

    DOCS[meta.fileId] = StoredDoc(meta=meta, rows=rows)
    _save_state()
    return meta
