from dataclasses import dataclass
import json
import logging
import os
import sys
from pathlib import Path
import mimetypes
import shutil
import uuid
from html import escape
from typing import Any, List, Union
from urllib.parse import quote

from fastapi import FastAPI, UploadFile, File, HTTPException
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
        extract_meta_from_pdf,
        extract_rows_from_pdf,
    )
except ImportError:  # pragma: no cover
    from parsers import (  # type: ignore
        extract_meta_from_docx,
        extract_rows_from_docx,
        extract_meta_from_pdf,
        extract_rows_from_pdf,
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

    meta = stored.meta
    suffix = Path(meta.bestand).suffix.lower()
    file_path = STORAGE / f"{file_id}{suffix}"
    if not file_path.exists():
        # fallback: zoek naar willekeurige match voor het geval de suffix verschilt
        match = next(STORAGE.glob(f"{file_id}.*"), None)
        if not match or not match.exists():
            raise HTTPException(404, "File missing")
        file_path = match
        suffix = file_path.suffix.lower()

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
def get_doc_preview(file_id: str):
    stored = DOCS.get(file_id)
    if not stored:
        raise HTTPException(404, "Not found")

    meta = stored.meta
    suffix = Path(meta.bestand).suffix.lower()
    file_path = STORAGE / f"{file_id}{suffix}"
    if not file_path.exists():
        match = next(STORAGE.glob(f"{file_id}.*"), None)
        if not match or not match.exists():
            raise HTTPException(404, "File missing")
        file_path = match
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
