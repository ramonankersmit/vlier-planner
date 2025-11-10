from __future__ import annotations

import logging
import os
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from vlier_parser.normalize import parse_to_normalized

from . import app as workflow_app
from .services.data_store import data_store

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
    return data_store.load_latest_normalized()


@app.post("/api/uploads")
async def upload(file: UploadFile = File(...)):
  
    data_store.ensure_ready()
    uploads_dir = data_store.uploads_dir
    tmp_path = uploads_dir / file.filename
    with tmp_path.open("wb") as fh:
        while chunk := await file.read(65536):
            fh.write(chunk)
    parse_id, model = parse_to_normalized(str(tmp_path))
    return {
        "parse_id": parse_id,
        "status": "ready",
        "warnings": [w.model_dump() for w in model.warnings],
    }


@app.get("/api/parses/{parse_id}")
def get_parse(parse_id: str):
    try:
        data = data_store.read_normalized_model(parse_id)
    except FileNotFoundError:
        raise HTTPException(404, "Not found")
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


@app.get("/api/system/version")
def api_get_version() -> dict[str, str]:
    return workflow_app.api_get_version()


@app.get("/api/system/update")
def api_check_update() -> dict[str, Any]:
    return workflow_app.api_check_update()


@app.post("/api/system/update")
def api_install_update(
    payload: workflow_app.UpdateRequest = Body(...),
) -> dict[str, Any]:
    return workflow_app.api_install_update(payload)


@app.get("/api/school-vacations", response_model=workflow_app.SchoolVacationResponse)
async def api_get_school_vacations(
    school_year: str = Query(..., alias="schoolYear"),
) -> workflow_app.SchoolVacationResponse:
    return await workflow_app.api_get_school_vacations(school_year=school_year)


@app.get("/api/docs")
def list_docs() -> list[Any]:
    return workflow_app.list_docs()


@app.get("/api/docs/{file_id}/rows")
def get_doc_rows(file_id: str, versionId: int | None = None) -> list[Any]:
    return workflow_app.get_doc_rows(file_id=file_id, versionId=versionId)


@app.delete("/api/docs/{file_id}")
def delete_doc(file_id: str) -> dict[str, Any]:
    return workflow_app.delete_doc(file_id)


@app.delete("/api/docs")
def delete_all_docs() -> dict[str, Any]:
    return workflow_app.delete_all_docs()


@app.get("/api/docs/{file_id}/content")
def get_doc_content(file_id: str, versionId: int | None = None, inline: bool = False):
    return workflow_app.get_doc_content(file_id=file_id, versionId=versionId, inline=inline)


@app.get("/api/docs/{file_id}/preview")
def get_doc_preview(file_id: str, versionId: int | None = None) -> dict[str, Any]:
    return workflow_app.get_doc_preview(file_id=file_id, versionId=versionId)


@app.get("/api/study-guides")
def get_study_guides():
    return workflow_app.get_study_guides()


@app.get("/api/study-guides/{guide_id}/versions")
def get_study_guide_versions(guide_id: str):
    return workflow_app.get_study_guide_versions(guide_id)


@app.get("/api/study-guides/{guide_id}/diff/{version_id}")
def get_study_guide_diff(guide_id: str, version_id: int):
    return workflow_app.get_study_guide_diff(guide_id, version_id)


@app.post("/api/reviews")
def create_review(payload: dict[str, Any] = Body(...)):
    return workflow_app.create_review(payload)


@app.get("/api/reviews/{parse_id}")
def get_review(parse_id: str):
    return workflow_app.get_review(parse_id)


@app.patch("/api/reviews/{parse_id}")
def update_review(parse_id: str, payload: dict[str, Any] = Body(...)):
    return workflow_app.update_review(parse_id, payload)


@app.post("/api/reviews/{parse_id}/commit")
def commit_review(parse_id: str):
    return workflow_app.commit_review(parse_id)


@app.delete("/api/reviews/{parse_id}")
def delete_review(parse_id: str):
    return workflow_app.delete_review(parse_id)


def _normalize_period(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    try:
        text = str(value).strip()
    except Exception:  # pragma: no cover - extremely defensive
        return None
    if not text:
        return None
    if text.lower() == "alle":
        return None
    try:
        return int(text)
    except ValueError:
        return None


@app.get("/api/matrix")
def get_matrix(period: str, year: int):
    data = _load_latest()
    if not data:
        raise HTTPException(404, "No data")
    requested_period = _normalize_period(period)
    su_period_map: dict[str, int | None] = {}
    for su in data.get("study_units", []):
        raw_period = su.get("period")
        period_value = _normalize_period(raw_period)
        su_period_map[su["id"]] = period_value

    if requested_period is None:
        allowed_units = set(su_period_map)
    else:
        allowed_units = {
            su_id for su_id, su_period in su_period_map.items() if su_period == requested_period
        }
    matrix: dict[str, dict[int, int]] = {}
    for s in data.get("sessions", []):
        if s["year"] != year:
            continue
        su = s["study_unit_id"]
        if su not in allowed_units:
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
