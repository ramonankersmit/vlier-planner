import pdfplumber
import re
from models import DocMeta

RE_ANY_BRACKET_VAK = re.compile(r"\[\s*([A-Za-zÀ-ÿ\s\-\&]+?)\s*\]")
RE_AFTER_DASH = re.compile(r"Studiewijzer\s*[-–]\s*(.+)", re.I)
RE_WEEK_PAIR = re.compile(r"\b(\d{1,2})\s*[/\-]\s*(\d{1,2})\b")
RE_WEEK_SOLO = re.compile(r"\b(?:wk|week)\s*(\d{1,2})\b", re.I)


def extract_meta_from_pdf(path: str, filename: str) -> DocMeta:
    vak = "Onbekend"
    niveau = "VWO"
    leerjaar = "4"
    periode = 1
    schooljaar = None
    begin_week, eind_week = 36, 41

    def weeks_from_text(txt: str):
        # Verwijder datums (bijv. 25-08-2025) zodat we geen dag/maand als week
        # interpreteren.
        clean = re.sub(r"\b\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{2,4}\b", " ", txt)

        weeks = []
        for a, b in RE_WEEK_PAIR.findall(clean):
            for x in (a, b):
                v = int(x)
                if 1 <= v <= 53:
                    weeks.append(v)
        for x in RE_WEEK_SOLO.findall(clean):
            v = int(x)
            if 1 <= v <= 53:
                weeks.append(v)
        if not weeks:
            has_year = bool(re.search(r"20\d{2}", clean))
            nums = [int(n) for n in re.findall(r"\b(\d{1,2})\b", clean)]
            nums = [n for n in nums if 1 <= n <= 53]
            if nums:
                hi = [n for n in nums if n >= 30]
                weeks.extend(hi if hi else (nums if not has_year else []))
        return weeks

    with pdfplumber.open(path) as pdf:
        first_text = (pdf.pages[0].extract_text() or "") if pdf.pages else ""

        m = RE_ANY_BRACKET_VAK.search(first_text)
        if m:
            vak = m.group(1).strip()
        else:
            m = RE_AFTER_DASH.search(first_text)
            if m:
                vak = m.group(1).strip()
            else:
                base = filename.rsplit(".", 1)[0]
                part = base.split("_")[0]
                part = re.sub(r"\d+", "", part).replace("-", " ").strip()
                if part:
                    vak = part

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
            weeks += weeks_from_text(txt)
        if weeks:
            hi = [w for w in weeks if w >= 30]
            use = hi if hi else weeks
            begin_week, eind_week = min(use), max(use)

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
