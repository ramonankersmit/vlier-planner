from typing import Literal, Optional, List, Dict
from pydantic import BaseModel

# Gebruik een eenduidige naam
NiveauType = Literal["HAVO", "VWO"]

class DocMeta(BaseModel):
    fileId: str
    guideId: Optional[str] = None
    versionId: Optional[int] = None
    bestand: str
    vak: str
    niveau: NiveauType
    leerjaar: str            # "1".."6"
    periode: int            # 1..4
    beginWeek: int
    eindWeek: int
    schooljaar: Optional[str] = None  # bv. "2025/2026"
    uploadedAt: Optional[str] = None  # ISO timestamp van uploadmoment

class WeekItem(BaseModel):
    week: int
    vak: str
    lesstof: Optional[str] = None
    huiswerk: Optional[str] = None
    deadlines: Optional[str] = None
    opmerkingen: Optional[str] = None
    date: Optional[str] = None        # ISO "YYYY-MM-DD"


class DocRow(BaseModel):
    week: Optional[int] = None
    datum: Optional[str] = None
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
