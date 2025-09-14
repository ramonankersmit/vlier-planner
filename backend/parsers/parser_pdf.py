import pdfplumber
import re
from models import DocMeta  # <-- absolute import

def extract_meta_from_pdf(path: str, filename: str) -> DocMeta:
    vak = "Onbekend"
    niveau = "VWO"
    leerjaar = "4"
    periode = 1
    schooljaar = None
    begin_week, eind_week = 36, 41

    with pdfplumber.open(path) as pdf:
        first_text = (pdf.pages[0].extract_text() or "") if pdf.pages else ""
        m = re.search(r"Studiewijzer\s*[-–]\s*(.+)", first_text, re.I)
        if m:
            vak = m.group(1).strip()

        m = re.search(r"(20\d{2}/20\d{2})", first_text)
        if m:
            schooljaar = m.group(1)

        ft = first_text.lower()
        if "havo" in ft:
            niveau = "HAVO"
        if "vwo" in ft:
            niveau = "VWO"
        m = re.search(r"\b([1-6])\b", ft)
        if m:
            leerjaar = m.group(1)
        m = re.search(r"periode\s*([1-4])", ft)
        if m:
            periode = int(m.group(1))

        weeks = []
        for page in pdf.pages:
            txt = page.extract_text() or ""
            weeks += [int(x) for x in re.findall(r"Week\s+(\d{1,2})", txt)]
        if weeks:
            begin_week, eind_week = min(weeks), max(weeks)

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
