from datetime import date
from typing import Dict, List, Optional, Literal

from pydantic import BaseModel

SessionType = Literal["lecture", "workshop", "exam", "deadline", "other"]


class Meta(BaseModel):
    source: str
    parsed_at: str


class StudyUnit(BaseModel):
    id: str
    name: str
    level: str
    year: int
    period: int


class Week(BaseModel):
    week: int
    year: int
    start: str
    end: str


class Resource(BaseModel):
    label: str
    url: str


class Session(BaseModel):
    id: str
    study_unit_id: str
    week: int
    year: int
    date: date
    type: SessionType
    topic: Optional[str] = None
    location: Optional[str] = None
    label: Optional[str] = None
    objectives: Optional[List[str]] = None
    homework: Optional[str] = None
    assignment: Optional[str] = None
    deadline: Optional[date] = None
    test: Optional[Dict[str, Optional[str]]] = None
    notes: Optional[str] = None
    class_group: Optional[str] = None
    resources: List[Resource] = []


class Assessment(BaseModel):
    id: str
    study_unit_id: str
    week_due: int
    year_due: int
    title: str
    weight: float


class Warning(BaseModel):
    code: str
    message: str
    context: Dict[str, object]


class NormalizedModel(BaseModel):
    meta: Meta
    study_units: List[StudyUnit] = []
    weeks: List[Week] = []
    sessions: List[Session] = []
    assessments: List[Assessment] = []
    warnings: List[Warning] = []
