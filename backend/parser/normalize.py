import io, re, hashlib
from datetime import datetime
from typing import List
from PyPDF2 import PdfReader
from docx import Document
from pydantic import BaseModel
from . import parse_docx, parse_pdf

class Task(BaseModel):
    id: str
    vak: str
    periode: str | None
    datum: str
    iso_week: int
    titel: str
    omschrijving: str
    bron_bestand: str
    is_assessment: bool = False
    duur_minuten: int | None = None

ASSESSMENT_KEYS = ["toets", "pw", "so", "inlever", "deadline", "presentatie"]

def _make_id(vak: str, datum: str, title: str, src: str) -> str:
    h = hashlib.sha1(f"{vak}|{datum}|{title}|{src}".encode()).hexdigest()[:10]
    return f"T_{h}"

async def normalize_tasks_from_files(files) -> List[Task]:
    tasks: list[Task] = []
    for up in files:
        content = await up.read()
        name = up.filename or "bestand"
        lower = name.lower()
        if lower.endswith(".docx"):
            raw = parse_docx.extract_items(io.BytesIO(content))
        elif lower.endswith(".pdf"):
            raw = parse_pdf.extract_items(io.BytesIO(content))
        elif lower.endswith(".zip"):
            # Optional: parse ZIP later
            continue
        else:
            continue

        # Guess 'vak' and 'periode' from filename
        vak = _guess_vak_from_name(name)
        periode = _guess_periode_from_name(name)

        for r in raw:
            datum = _coerce_date(r.get("date"))
            if not datum:
                continue
            iso_week = datetime.fromisoformat(datum).isocalendar().week
            titel = r.get("title") or r.get("text") or ""
            omschrijving = r.get("text") or ""
            is_assessment = any(k in (titel + " " + omschrijving).lower() for k in ASSESSMENT_KEYS)
            tid = _make_id(vak, datum, titel, name)
            tasks.append(Task(
                id=tid, vak=vak, periode=periode, datum=datum, iso_week=iso_week,
                titel=titel.strip()[:120], omschrijving=omschrijving.strip(), bron_bestand=name,
                is_assessment=is_assessment
            ))
    # Deduplicate by (vak, datum, titel)
    seen = set()
    uniq = []
    for t in tasks:
        key = (t.vak, t.datum, t.titel)
        if key in seen: 
            continue
        seen.add(key); uniq.append(t)
    return uniq

def _guess_vak_from_name(name: str) -> str:
    base = name.lower()
    # naive mapping
    mapping = {
        "wiskunde b": "Wiskunde B",
        "wiskunde a": "Wiskunde A",
        "scheikunde": "Scheikunde",
        "natuurkunde": "Natuurkunde",
        "filosof": "Filosofie",
        "engels": "Engels",
        "bedrijfsecon": "Bedrijfseconomie",
        "ckv": "CKV",
        "aardrijkskunde": "Aardrijkskunde",
        "nederlands": "Nederlands",
        "geschiedenis": "Geschiedenis",
    }
    for k,v in mapping.items():
        if k in base:
            return v
    # Fallback: first token capitalized
    return name.split("_")[0].split("-")[0].title()

def _guess_periode_from_name(name: str) -> str | None:
    m = re.search(r"(periode\s*\d+)", name.lower())
    return m.group(1).title() if m else None

def _coerce_date(s: str | None) -> str | None:
    if not s: return None
    s = s.strip()
    # Try dd-mm-yyyy
    for fmt in ["%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%y"]:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d")
        except: pass
    # Try dd-mm without year -> infer current year
    m = re.match(r"^(\d{1,2})-(\d{1,2})$", s)
    if m:
        year = datetime.now().year
        try:
            dt = datetime(year, int(m.group(2)), int(m.group(1)))
            return dt.strftime("%Y-%m-%d")
        except: return None
    return None
