from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from datetime import date
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from vlier_parser.normalize import parse_to_normalized

from backend.documents import (
    build_doc_meta,
    build_doc_preview_html,
    build_doc_rows,
    find_index_entry,
    load_index,
    load_normalized_model,
    save_index,
)
from backend.schemas.normalized import NormalizedModel
from backend.paths import parsed_data_dir, uploads_dir

logger = logging.getLogger(__name__)

DATA_DIR = parsed_data_dir()

app = FastAPI(title="Vlier Planner API")
serve_frontend = os.getenv("SERVE_FRONTEND", "0").lower() in {"1", "true", "yes", "on"}

logger.info("SERVE_FRONTEND resolved to %s", serve_frontend)

if not serve_frontend:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )


def _load_latest() -> dict:
    index_path = DATA_DIR / "index.json"
    if not index_path.exists():
        return {}
    with index_path.open("r", encoding="utf-8") as fh:
        index = json.load(fh)
    if not index:
        return {}
    last = index[-1]["id"]
    with (DATA_DIR / f"{last}.json").open("r", encoding="utf-8") as fh:
        return json.load(fh)


@app.post("/api/uploads")
async def upload(file: UploadFile = File(...)):
    original_name = Path(file.filename or "upload").name
    temp_root = uploads_dir() / uuid4().hex
    temp_root.mkdir(parents=True, exist_ok=True)
    temp_path = temp_root / original_name

    try:
        contents = await file.read()
        with temp_path.open("wb") as fh:
            fh.write(contents)
        parse_id, model = parse_to_normalized(str(temp_path))
    finally:
        try:
            if temp_path.exists():
                temp_path.unlink()
            temp_root.rmdir()
        except OSError:
            shutil.rmtree(temp_root, ignore_errors=True)

    doc_meta = build_doc_meta(parse_id, original_name, model)
    warnings = [w.model_dump() for w in model.warnings]
    return {**doc_meta, "warnings": warnings}


@app.get("/api/parses/{parse_id}")
def get_parse(parse_id: str):
    path = DATA_DIR / f"{parse_id}.json"
    if not path.exists():
        raise HTTPException(404, "Not found")
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    return {"meta": data.get("meta"), "warnings": data.get("warnings", [])}


@app.get("/api/study-units")
def get_study_units():
    data = _load_latest()
    if not data:
        raise HTTPException(404, "No data")
    return data.get("study_units", [])


@app.get("/api/agenda")
def get_agenda(week: int, year: int):
    if week < 1 or week > 53:
        raise HTTPException(400, "Invalid week")
    data = _load_latest()
    if not data:
        raise HTTPException(404, "No data")
    sessions = [s for s in data.get("sessions", []) if s["week"] == week and s["year"] == year]
    return sessions


@app.get("/api/weeks")
def get_weeks(from_: date, to: date):
    data = _load_latest()
    if not data:
        raise HTTPException(404, "No data")
    weeks = [
        w
        for w in data.get("weeks", [])
        if from_ <= date.fromisoformat(w["start"]) <= to
    ]
    return weeks


@app.get("/api/matrix")
def get_matrix(period: int, year: int):
    data = _load_latest()
    if not data:
        raise HTTPException(404, "No data")
    matrix: dict[str, dict[int, int]] = {}
    for s in data.get("sessions", []):
        if s["year"] != year:
            continue
        su = s["study_unit_id"]
        wk = s["week"]
        matrix.setdefault(su, {}).setdefault(wk, 0)
        matrix[su][wk] += 1
    return matrix


@app.get("/api/assessments")
def get_assessments(period: int, year: int):
    data = _load_latest()
    if not data:
        raise HTTPException(404, "No data")
    su_map = {su["id"]: su for su in data.get("study_units", [])}
    assessments = [
        a
        for a in data.get("assessments", [])
        if a["year_due"] == year and su_map.get(a["study_unit_id"], {}).get("period") == period
    ]
    return assessments


def _ensure_parse_exists(parse_id: str) -> tuple[dict[str, Any], NormalizedModel]:
    index = load_index()
    entry = find_index_entry(parse_id, index)
    if not entry:
        raise HTTPException(404, "Not found")
    model = load_normalized_model(parse_id)
    if model is None:
        raise HTTPException(404, "Not found")
    return entry, model


@app.get("/api/docs")
def list_docs():
    docs = []
    index = load_index()
    for entry in index:
        parse_id = entry.get("id")
        if not parse_id:
            continue
        model = load_normalized_model(parse_id)
        if model is None:
            logger.warning("Skipping index entry %s: missing normalized payload", parse_id)
            continue
        source_name = entry.get("source_file", parse_id)
        docs.append(build_doc_meta(parse_id, source_name, model))
    return docs


@app.get("/api/docs/{parse_id}/rows")
def get_doc_rows(parse_id: str):
    _, model = _ensure_parse_exists(parse_id)
    return build_doc_rows(model)


@app.get("/api/docs/{parse_id}/preview")
def get_doc_preview(parse_id: str):
    entry, model = _ensure_parse_exists(parse_id)
    meta = build_doc_meta(parse_id, entry.get("source_file", parse_id), model)
    rows = build_doc_rows(model)
    html = build_doc_preview_html(meta, rows, (w.model_dump() for w in model.warnings))
    return {"mediaType": "text/html", "html": html, "filename": meta["bestand"]}


@app.delete("/api/docs/{parse_id}")
def delete_doc(parse_id: str):
    index = load_index()
    entry = find_index_entry(parse_id, index)
    if not entry:
        raise HTTPException(404, "Not found")

    path = DATA_DIR / f"{parse_id}.json"
    if path.exists():
        path.unlink()

    next_index = [item for item in index if item.get("id") != parse_id]
    save_index(next_index)
    return {"status": "deleted"}


@app.delete("/api/docs")
def delete_all_docs():
    index = load_index()
    for entry in index:
        parse_id = entry.get("id")
        if not parse_id:
            continue
        path = DATA_DIR / f"{parse_id}.json"
        if path.exists():
            path.unlink()
    save_index([])
    return {"status": "cleared"}


if serve_frontend:
    if hasattr(sys, "_MEIPASS"):
        frontend_base = Path(sys._MEIPASS) / "backend"
        logger.info("Detected PyInstaller _MEIPASS, using base %s", frontend_base)
    else:
        frontend_base = Path(__file__).resolve().parent
        logger.info("Using source tree base %s for frontend assets", frontend_base)

    FRONTEND_DIST = frontend_base / "static" / "dist"
    index_file = FRONTEND_DIST / "index.html"

    if FRONTEND_DIST.exists() and index_file.exists():
        logger.info("Serving frontend build from %s", FRONTEND_DIST)
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(404, "Not found")
            return FileResponse(index_file)
    else:
        logger.warning(
            "SERVE_FRONTEND is enabled but no build directory was found at %s",
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
