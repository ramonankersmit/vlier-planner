from pydantic import BaseModel
from typing import Literal, Optional

Nivel = Literal["HAVO", "VWO"]

class DocMeta(BaseModel):
    fileId: str
    bestand: str
    vak: str
    niveau: Nivel
    leerjaar: str
    periode: int
    beginWeek: int
    eindWeek: int
    schooljaar: Optional[str] = None  # bv. "2025/2026"
    hasSource: bool = True

# WeekItem kun je later via een aparte endpoint leveren
class WeekItem(BaseModel):
    week: int
    vak: str
    lesstof: Optional[str] = None
    huiswerk: Optional[str] = None
    deadlines: Optional[str] = None
    opmerkingen: Optional[str] = None
    date: Optional[str] = None  # ISO "YYYY-MM-DD"
