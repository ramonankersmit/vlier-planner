from __future__ import annotations

import json
import logging
import os
from datetime import date
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from vlier_parser.normalize import DATA_DIR, parse_to_normalized

logger = logging.getLogger(__name__)

app = FastAPI(title="Vlier Planner API")
serve_frontend = os.getenv("SERVE_FRONTEND", "0").lower() in {"1", "true", "yes", "on"}

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
    tmp_dir = Path("uploads")
    tmp_dir.mkdir(exist_ok=True)
    tmp_path = tmp_dir / file.filename
    with tmp_path.open("wb") as fh:
        fh.write(await file.read())
    parse_id, model = parse_to_normalized(str(tmp_path))
    return {
        "parse_id": parse_id,
        "status": "ready",
        "warnings": [w.model_dump() for w in model.warnings],
    }


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
    su_period_map = {su["id"]: su.get("period") for su in data.get("study_units", [])}
    matrix: dict[str, dict[int, int]] = {}
    for s in data.get("sessions", []):
        if s["year"] != year:
            continue
        su = s["study_unit_id"]
        if su_period_map.get(su) != period:
            continue
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
