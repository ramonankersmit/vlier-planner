from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from pathlib import Path
import shutil
import uuid

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
