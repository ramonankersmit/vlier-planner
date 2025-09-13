from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from parser.normalize import normalize_tasks_from_files, Task

app = FastAPI(title="StuPlan API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ParseResponse(BaseModel):
    tasks: List[Task]

@app.post("/parse", response_model=ParseResponse)
async def parse(files: List[UploadFile] = File(...)):
    try:
        data = await normalize_tasks_from_files(files)
        return {"tasks": data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok"}
