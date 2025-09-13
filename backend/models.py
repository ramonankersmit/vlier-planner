from pydantic import BaseModel
from typing import Optional

class Task(BaseModel):
    id: str
    vak: str
    periode: Optional[str] = None
    datum: str  # ISO date YYYY-MM-DD
    iso_week: int
    titel: str
    omschrijving: str
    bron_bestand: str
    is_assessment: bool = False
    duur_minuten: Optional[int] = None
