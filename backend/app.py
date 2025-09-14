from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from pathlib import Path
import shutil
from models import DocMeta
from parsers import extract_meta_from_docx, extract_meta_from_pdf

app = FastAPI(title="Vlier Planner API")

# CORS voor local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE = Path(__file__).parent / "storage" / "uploads"
STORAGE.mkdir(parents=True, exist_ok=True)

# In-memory index (MVP). Later vervangen door DB.
DOCS: dict[str, DocMeta] = {}

@app.get("/api/docs", response_model=List[DocMeta])
def list_docs():
    return list(DOCS.values())

@app.delete("/api/docs/{file_id}")
def delete_doc(file_id: str):
    if file_id not in DOCS:
        raise HTTPException(404, "Not found")
    # verwijder file op schijf (best effort)
    try:
        for p in STORAGE.glob(f"{file_id}.*"):
            p.unlink(missing_ok=True)
    except Exception:
        pass
    del DOCS[file_id]
    return {"ok": True}

@app.post("/api/uploads", response_model=DocMeta)
async def upload_doc(file: UploadFile = File(...)):
    suffix = (file.filename or "").lower()
    dest = STORAGE / file.filename
    with dest.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)

    meta = None
    if suffix.endswith(".docx"):
        meta = extract_meta_from_docx(str(dest), file.filename)
    elif suffix.endswith(".pdf"):
        meta = extract_meta_from_pdf(str(dest), file.filename)
    else:
        raise HTTPException(400, "Unsupported file type")

    if not meta:
        raise HTTPException(422, "Could not extract metadata")

    DOCS[meta.fileId] = meta
    # optioneel: hernoem opslag naar fileId.ext
    dest_renamed = STORAGE / f"{meta.fileId}{Path(file.filename).suffix.lower()}"
    if dest_renamed != dest:
        dest.rename(dest_renamed)

    return meta
