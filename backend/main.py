from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from vlier_parser.normalize import parse_to_normalized

DATA_DIR = Path("data/parsed")
DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Vlier Planner API")
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
