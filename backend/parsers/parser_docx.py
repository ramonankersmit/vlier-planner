from docx import Document
from typing import Optional
import re
from models import DocMeta  # <-- absolute import i.p.v. ..models

HEADER_VAK_RE = re.compile(r"Studiewijzer\s*[-–]\s*(?P<vak>.+)", re.I)

def extract_meta_from_docx(path: str, filename: str) -> Optional[DocMeta]:
    doc = Document(path)

    # 1) Header: zoek "Studiewijzer - <vak>"
    vak = None
    for p in doc.paragraphs:
        m = HEADER_VAK_RE.search(p.text or "")
        if m:
            vak = m.group("vak").strip()
            break
    if not vak:
        vak = "Onbekend"

    # 2) Footer: niveau/leerjaar/periode/schooljaar
    niveau = "VWO"
    leerjaar = "4"
    periode = 1
    schooljaar = None

    try:
        sec = doc.sections[0]
        footer_texts = [ (p.text or "").strip() for p in sec.footer.paragraphs ]
        full_footer = " | ".join(footer_texts).lower()

        if "havo" in full_footer:
            niveau = "HAVO"
        if "vwo" in full_footer:
            niveau = "VWO"

        m = re.search(r"\b([1-6])\b", full_footer)
        if m:
            leerjaar = m.group(1)

        m = re.search(r"periode\s*([1-4])", full_footer)
        if m:
            periode = int(m.group(1))

        for p in sec.footer.paragraphs:
            m = re.search(r"(20\d{2}/20\d{2})", p.text or "")
            if m:
                schooljaar = m.group(1)
                break
    except Exception:
        pass

    # 3) Weekbereik via tabel-kolom "Week"
    begin_week, eind_week = 36, 41
    try:
        for tbl in doc.tables:
            headers = [ (c.text or "").strip().lower() for c in tbl.rows[0].cells ]
            col_idx = next((i for i, h in enumerate(headers) if "week" in h), None)
            if col_idx is None:
                continue
            weeks = []
            for r in tbl.rows[1:]:
                cell_txt = (r.cells[col_idx].text or "")
                m = re.search(r"(\d{1,2})", cell_txt)
                if m:
                    weeks.append(int(m.group(1)))
            if weeks:
                begin_week, eind_week = min(weeks), max(weeks)
                break
    except Exception:
        pass

    # FileId heuristiek
    file_id = re.sub(r"[^a-zA-Z0-9]+", "-", filename)[:40]
    return DocMeta(
        fileId=file_id,
        bestand=filename,
        vak=vak,
        niveau=niveau,
        leerjaar=leerjaar,
        periode=periode,
        beginWeek=begin_week,
        eindWeek=eind_week,
        schooljaar=schooljaar
    )
