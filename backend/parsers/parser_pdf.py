"""PDF parsing utilities.

Deze module probeert eerst `pdfplumber` te gebruiken voor het uitlezen van
PDF-bestanden. Als dat pakket niet beschikbaar is, valt het terug op
`PyPDF2`. Hierdoor blijven de hulpscripts werken zonder extra
installatiestap, al levert `pdfplumber` doorgaans betere resultaten op.
"""

import re
from typing import Generator, List, Tuple

try:  # pdfplumber levert vaak de beste tekstextractie
    import pdfplumber  # type: ignore
except Exception:  # pragma: no cover - optionele dependency
    pdfplumber = None  # type: ignore

try:  # eenvoudige fallback wanneer pdfplumber ontbreekt
    from PyPDF2 import PdfReader  # type: ignore
except Exception:  # pragma: no cover - PyPDF2 kan ontbreken
    PdfReader = None  # type: ignore

from models import DocMeta, DocRow

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
    # Default weeks are 0 so that we don't fall back to a fixed range
    begin_week, eind_week = 0, 0

    def weeks_from_text(txt: str, page_num: int, total_pages: int):
        # Verwijder paginanummers zoals "9/46" of "9-46" zodat deze niet als
        # weekrange worden geïnterpreteerd.
        page_pat = rf"\b{page_num}\s*[/\-]\s*{total_pages}\b"
        txt = re.sub(page_pat, " ", txt)

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
            if nums and not has_year:
                weeks.extend(nums)
        return weeks

    pages = list(_page_texts(path))
    first_text = pages[0][2] if pages else ""

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

    total_pages = pages[0][1] if pages else 0
    weeks: List[int] = []
    for idx, _, txt in pages:
        weeks += weeks_from_text(txt, idx, total_pages)
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


RE_WEEK_LEADING = re.compile(r"^\s*(\d{1,2})(?:\s*[/\-]\s*(\d{1,2}))?")


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def extract_rows_from_pdf(path: str, filename: str) -> List[DocRow]:
    rows: List[DocRow] = []
    for idx, total_pages, txt in _page_texts(path):
        page_pat = re.compile(rf"^\s*{idx}\s*[/\-]\s*{total_pages}\s*$")
        for line in txt.splitlines():
            if page_pat.match(line):
                continue
            m = RE_WEEK_LEADING.match(line)
            if not m:
                continue
            weeks: List[int] = []
            a = int(m.group(1))
            if 1 <= a <= 53:
                weeks.append(a)
            if m.group(2):
                b = int(m.group(2))
                if 1 <= b <= 53:
                    weeks.append(b)
            rest = _normalize(line[m.end():])
            for w in weeks:
                rows.append(
                    DocRow(
                        week=w,
                        datum=None,
                        les=None,
                        onderwerp=rest or None,
                        leerdoelen=None,
                        huiswerk=None,
                        opdracht=None,
                        inleverdatum=None,
                        toets=None,
                        bronnen=None,
                        notities=None,
                        klas_of_groep=None,
                        locatie=None,
                    )
                )
    return rows


def _page_texts(path: str) -> Generator[Tuple[int, int, str], None, None]:
    """Yields (page_number, total_pages, text) tuples.

    Gebruikt pdfplumber als dat aanwezig is; anders valt het terug op PyPDF2.
    Als beide ontbreken wordt een RuntimeError opgegooid.
    """

    if pdfplumber is not None:  # voorkeursoptie
        with pdfplumber.open(path) as pdf:  # type: ignore[arg-type]
            total_pages = len(pdf.pages)
            for idx, page in enumerate(pdf.pages, start=1):
                yield idx, total_pages, page.extract_text() or ""
        return

    if PdfReader is not None:  # eenvoudige fallback
        reader = PdfReader(path)
        total_pages = len(reader.pages)
        for idx, page in enumerate(reader.pages, start=1):
            # PyPDF2's extract_text kan None retourneren
            txt = page.extract_text() or ""
            yield idx, total_pages, txt
        return

    raise RuntimeError("PDF-ondersteuning ontbreekt (pdfplumber/PyPDF2 niet geïnstalleerd)")
