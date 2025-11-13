from pydantic import BaseModel
from typing import Literal, Optional, List, Dict

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
    uploadedAt: Optional[str] = None  # ISO timestamp van uploadmoment

# WeekItem kun je later via een aparte endpoint leveren
class WeekItem(BaseModel):
    week: int
    vak: str
    lesstof: Optional[str] = None
    huiswerk: Optional[str] = None
    deadlines: Optional[str] = None
    opmerkingen: Optional[str] = None
    date: Optional[str] = None  # ISO "YYYY-MM-DD"


class DocRow(BaseModel):
    week: Optional[int] = None
    weeks: Optional[List[int]] = None
    week_span_start: Optional[int] = None
    week_span_end: Optional[int] = None
    week_label: Optional[str] = None
    datum: Optional[str] = None
    datum_eind: Optional[str] = None
    les: Optional[str] = None
    onderwerp: Optional[str] = None
    leerdoelen: Optional[List[str]] = None
    huiswerk: Optional[str] = None
    opdracht: Optional[str] = None
    inleverdatum: Optional[str] = None
    toets: Optional[Dict[str, Optional[str]]] = None
    bronnen: Optional[List[Dict[str, str]]] = None
    notities: Optional[str] = None
    klas_of_groep: Optional[str] = None
    locatie: Optional[str] = None
    source_row_id: Optional[str] = None
    enabled: bool = True
