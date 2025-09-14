from docx import Document
from typing import Optional, List, Tuple, Iterable
import re
from models import DocMeta  # importeer uit models

# ---------------------------
# Regex patronen & helpers
# ---------------------------

RE_STUDIEWIJZER = re.compile(r"studiewijzer", re.I)
RE_VAK_IN_BRACKETS = re.compile(r"\[\s*([A-Za-zÀ-ÿ\s\-\&]+)\s*\]")
RE_VAK_AFTER_DASH = re.compile(r"studiewijzer\s*[-–]\s*(.+)", re.I)
RE_ANY_BRACKET_VAK = re.compile(r"\[\s*([A-Za-zÀ-ÿ\s\-\&]+?)\s*\]")

# Weekcel parsing
RE_WEEK_LEADING = re.compile(r"^\s*(\d{1,2})(?:\s*[/\-]\s*(\d{1,2}))?")
RE_WEEK_PAIR = re.compile(r"\b(\d{1,2})\s*[/\-]\s*(\d{1,2})\b")
RE_WEEK_SOLO = re.compile(r"\b(?:wk|week)\s*(\d{1,2})\b", re.I)
RE_NUM_PURE = re.compile(r"^\s*(\d{1,2})\s*$")  # hele cel is een getal

# Schooljaar
RE_SCHOOLYEAR = re.compile(r"(20\d{2})\s*[/\-]\s*(20\d{2})")

def _clean(s: str) -> str:
    return (s or "").strip()

def _first_nonempty(paragraphs, start_idx: int) -> Optional[str]:
    for p in paragraphs[start_idx:]:
        t = _clean(p.text)
        if t:
            return t
    return None

# ---------------------------
# VAK parsing
# ---------------------------

def _parse_vak_anywhere(doc: Document) -> Optional[str]:
    limit = min(25, len(doc.paragraphs))
    for i in range(limit):
        txt = _clean(doc.paragraphs[i].text or "")
        m = RE_ANY_BRACKET_VAK.search(txt)
        if m:
            return _clean(m.group(1))
    return None

def _parse_vak_from_filename(filename: str) -> Optional[str]:
    base = filename.rsplit(".", 1)[0]
    part = base.split("_")[0]
    part = re.sub(r"\d+", "", part)  # verwijder cijfers
    part = re.sub(r"(?i)studiewijzer|periode", "", part)  # verwijder generieke woorden
    part = part.replace("-", " ").strip()
    return part or None

def _parse_vak_from_header(doc: Document, filename: str) -> Optional[str]:
    anywhere = _parse_vak_anywhere(doc)
    if anywhere:
        return anywhere

    for i, p in enumerate(doc.paragraphs):
        txt = _clean(p.text)
        if not txt:
            continue
        if RE_STUDIEWIJZER.search(txt):
            m = RE_VAK_AFTER_DASH.search(txt)
            if m:
                return _clean(m.group(1))
            nxt = _first_nonempty(doc.paragraphs, i + 1) or ""
            mb = RE_VAK_IN_BRACKETS.search(nxt)
            if mb:
                return _clean(mb.group(1))
            if i + 2 < len(doc.paragraphs):
                nxt2 = _clean(doc.paragraphs[i + 2].text or "")
                mb2 = RE_VAK_IN_BRACKETS.search(nxt2)
                if mb2:
                    return _clean(mb2.group(1))
    return _parse_vak_from_filename(filename)

# ---------------------------
# Schooljaar parsing
# ---------------------------

def _parse_schooljaar_from_filename(filename: str) -> Optional[str]:
    base = filename.rsplit(".", 1)[0]
    m = RE_SCHOOLYEAR.search(base)
    if m:
        return f"{m.group(1)}/{m.group(2)}"
    return None

def _parse_schooljaar_from_doc(doc: Document) -> Optional[str]:
    texts: List[str] = []
    for p in doc.paragraphs:
        texts.append(_clean(p.text))
    try:
        sec = doc.sections[0]
        texts += [_clean(p.text) for p in sec.header.paragraphs]
        texts += [_clean(p.text) for p in sec.footer.paragraphs]
    except Exception:
        pass
    blob = " | ".join(t for t in texts if t)
    m = RE_SCHOOLYEAR.search(blob)
    if m:
        return f"{m.group(1)}/{m.group(2)}"
    return None

def _parse_footer_meta(doc: Document) -> Tuple[str, str, int, Optional[str]]:
    """Heuristiek uit footer: niveau (HAVO/VWO), leerjaar (1-6), periode (1-4), schooljaar (YYYY/YYYY, indien aanwezig)."""
    niveau = "VWO"
    leerjaar = "4"
    periode = 1
    schooljaar = None
    try:
        sec = doc.sections[0]
        footer_texts = [_clean(p.text) for p in sec.footer.paragraphs if _clean(p.text)]
        full = " | ".join(footer_texts)
        low = full.lower()
        if "havo" in low:
            niveau = "HAVO"
        if "vwo" in low:
            niveau = "VWO"
        m = re.search(r"\[\s*([1-6])\s*(havo|vwo)\s*\]", low)
        if m:
            leerjaar = m.group(1)
        else:
            m = re.search(r"\b([1-6])\b", low)
            if m:
                leerjaar = m.group(1)
        m = re.search(r"periode\s*([1-4])", low)
        if m:
            periode = int(m.group(1))
        m = RE_SCHOOLYEAR.search(full)
        if m:
            schooljaar = f"{m.group(1)}/{m.group(2)}"
    except Exception:
        pass
    return niveau, leerjaar, periode, schooljaar

# ---------------------------
# Weekrange parsing — eenvoudige regel
# ---------------------------

WEEK_HEADER_KEYWORDS = ("weeknummer", "week nr", "weeknr", "week", "wk")

def _find_week_column(headers: List[str]) -> Optional[int]:
    """Pak de eerste kolom waarvan de header 'week' of 'wk' bevat (case-insensitive, spaties genegeerd)."""
    norm = [" ".join(_clean(h).lower().split()) for h in headers]
    for i, h in enumerate(norm):
        for kw in WEEK_HEADER_KEYWORDS:
            nkw = " ".join(kw.lower().split())
            if nkw in h:
                return i
    return None

def _weeks_from_week_cell(txt: str) -> List[int]:
    """
    Haal weeknummers uit een 'Week'-cel.
    - Leading nummer/pair: '35...' of '44/45...'
    - 'Week 44', 'wk 44', '44/45', '44-45'
    - Puur getal als hele cel
    """
    text = (txt or "").strip().replace("\n", " ")

    # Verwijder datums zoals 25-08-2025 zodat RE_WEEK_PAIR hieronder
    # niet per ongeluk dagen/maanden als weken herkent.
    text = re.sub(r"\b\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{2,4}\b", " ", text)

    weeks: List[int] = []

    m0 = RE_WEEK_LEADING.match(text)
    if m0:
        a = int(m0.group(1))
        if 1 <= a <= 53:
            weeks.append(a)
        if m0.group(2):
            b = int(m0.group(2))
            if 1 <= b <= 53:
                weeks.append(b)

    for x in RE_WEEK_SOLO.findall(text):
        v = int(x)
        if 1 <= v <= 53:
            weeks.append(v)

    for a, b in RE_WEEK_PAIR.findall(text):
        va, vb = int(a), int(b)
        if 1 <= va <= 53:
            weeks.append(va)
        if 1 <= vb <= 53:
            weeks.append(vb)

    m2 = RE_NUM_PURE.match(text)
    if m2:
        v = int(m2.group(1))
        if 1 <= v <= 53:
            weeks.append(v)

    return weeks

def _table_rows_texts(tbl) -> List[List[str]]:
    """Converteer een docx-table naar matrix van celteksten, robuust genoeg voor merges."""
    rows: List[List[str]] = []
    for row in tbl.rows:
        rows.append([_clean(c.text) for c in row.cells])
    return rows

def _parse_week_range(doc: Document) -> Tuple[int, int]:
    """
    - Neem in *elke* tabel rij 0 als header.
    - Vind de kolom waarvan de header 'week' of 'wk' bevat.
    - Verzamel ALLE weeknummers uit die kolom (over alle tabellen).
    - Neem min/max.
    """
    begin_w, eind_w = 36, 41
    all_weeks: List[int] = []

    try:
        for tbl in doc.tables:
            rows = _table_rows_texts(tbl)
            if len(rows) < 2:
                continue
            headers = rows[0]
            week_col = _find_week_column(headers)
            if week_col is None:
                continue

            for r in rows[1:]:
                if week_col < len(r):
                    ws = _weeks_from_week_cell(r[week_col])
                    if ws:
                        all_weeks.extend(ws)

        if all_weeks:
            begin_w, eind_w = min(all_weeks), max(all_weeks)

    except Exception:
        pass

    return begin_w, eind_w

# ---------------------------
# Hoofdfunctie
# ---------------------------

def extract_meta_from_docx(path: str, filename: str) -> Optional[DocMeta]:
    doc = Document(path)

    # VAK
    vak = _parse_vak_from_header(doc, filename) or "Onbekend"

    # Meta + schooljaar
    niveau, leerjaar, periode, schooljaar_footer = _parse_footer_meta(doc)
    schooljaar = schooljaar_footer or _parse_schooljaar_from_doc(doc) or _parse_schooljaar_from_filename(filename)

    # Weekrange (eenvoudige header-regel)
    begin_week, eind_week = _parse_week_range(doc)

    # fileId
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
        schooljaar=schooljaar,
    )
