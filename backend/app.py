from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List
from pathlib import Path
import mimetypes
import shutil
import uuid
from html import escape

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

from models import DocMeta  # jij gebruikt nog models.py; laat dit zo staan
from parsers import extract_meta_from_docx, extract_meta_from_pdf

app = FastAPI(title="Vlier Planner API")

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

# In-memory index (MVP). Later vervangen door DB.
DOCS: dict[str, DocMeta] = {}

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
    return list(DOCS.values())

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
    return {"ok": True}


@app.get("/api/docs/{file_id}/content")
def get_doc_content(file_id: str):
    doc = DOCS.get(file_id)
    if not doc:
        raise HTTPException(404, "Not found")

    suffix = Path(doc.bestand).suffix.lower()
    file_path = STORAGE / f"{file_id}{suffix}"
    if not file_path.exists():
        # fallback: zoek naar willekeurige match voor het geval de suffix verschilt
        match = next(STORAGE.glob(f"{file_id}.*"), None)
        if not match or not match.exists():
            raise HTTPException(404, "File missing")
        file_path = match
        suffix = file_path.suffix.lower()

    media_type, _ = mimetypes.guess_type(file_path.name)
    return FileResponse(
        file_path,
        media_type=media_type or "application/octet-stream",
        filename=doc.bestand,
    )


@app.get("/api/docs/{file_id}/preview")
def get_doc_preview(file_id: str):
    doc = DOCS.get(file_id)
    if not doc:
        raise HTTPException(404, "Not found")

    suffix = Path(doc.bestand).suffix.lower()
    file_path = STORAGE / f"{file_id}{suffix}"
    if not file_path.exists():
        match = next(STORAGE.glob(f"{file_id}.*"), None)
        if not match or not match.exists():
            raise HTTPException(404, "File missing")
        file_path = match
        suffix = file_path.suffix.lower()

    media_type, _ = mimetypes.guess_type(file_path.name)
    if suffix == ".docx":
        html = _docx_to_html(file_path)
        return {
            "mediaType": "text/html",
            "html": html,
            "filename": doc.bestand,
        }

    return {
        "mediaType": media_type or "application/octet-stream",
        "url": f"/api/docs/{file_id}/content",
        "filename": doc.bestand,
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
    if suffix.endswith(".docx"):
        meta = extract_meta_from_docx(str(temp_path), file.filename)
    else:
        meta = extract_meta_from_pdf(str(temp_path), file.filename)

    if not meta:
        # opruimen temp
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(422, "Could not extract metadata")

    # Forceer uniek fileId (voorkomt naam-collisie)
    meta.fileId = uuid.uuid4().hex[:12]

    # Hernoem fysiek bestand naar <fileId>.<ext>
    final_path = STORAGE / f"{meta.fileId}{Path(file.filename).suffix.lower()}"
    if final_path.exists():
        final_path.unlink()
    temp_path.rename(final_path)

    DOCS[meta.fileId] = meta
    return meta
