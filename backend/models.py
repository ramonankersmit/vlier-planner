from typing import Literal, Optional, List, Dict
from pydantic import BaseModel

# Gebruik een eenduidige naam
NiveauType = Literal["HAVO", "VWO"]

class DocMeta(BaseModel):
    fileId: str
    bestand: str
    vak: str
    niveau: NiveauType
    leerjaar: str            # "1".."6"
    periode: int            # 1..4
    beginWeek: int
    eindWeek: int
    schooljaar: Optional[str] = None  # bv. "2025/2026"

class WeekItem(BaseModel):
    week: int
    vak: str
    lesstof: Optional[str] = None
    huiswerk: Optional[str] = None
    deadlines: Optional[str] = None
    opmerkingen: Optional[str] = None
    date: Optional[str] = None        # ISO "YYYY-MM-DD"


class DocRow(BaseModel):
    week: Optional[int]
    datum: Optional[str]
    les: Optional[str]
    onderwerp: Optional[str]
    leerdoelen: Optional[List[str]]
    huiswerk: Optional[str]
    opdracht: Optional[str]
    inleverdatum: Optional[str]
    toets: Optional[Dict[str, Optional[str]]]
    bronnen: Optional[List[Dict[str, str]]]
    notities: Optional[str]
    klas_of_groep: Optional[str]
    locatie: Optional[str]
