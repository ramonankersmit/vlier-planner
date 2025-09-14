from docx import Document
from typing import Optional, List, Tuple, Iterable, Dict
import re
from models import DocMeta, DocRow  # importeer uit models

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
# Herken zowel 4-cijferige als 2-cijferige jaartallen (bijv. "2025/2026" of "25-26")
RE_SCHOOLYEAR = re.compile(r"((?:20)?\d{2})\s*[/\-]\s*((?:20)?\d{2})")


def _format_schooljaar(a: str, b: str) -> str:
    """Converteer twee-delige matches naar formaat YYYY/YYYY."""
    ai, bi = int(a), int(b)
    if ai < 100:
        ai += 2000
    if bi < 100:
        bi += 2000
    return f"{ai}/{bi}"

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
        return _format_schooljaar(m.group(1), m.group(2))
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
        return _format_schooljaar(m.group(1), m.group(2))
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
            schooljaar = _format_schooljaar(m.group(1), m.group(2))
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

    # Verwijder dubbelen en sorteer
    return sorted(set(weeks))

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
    begin_w, eind_w = 0, 0
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


# -------------------------------------------------
# Nieuwe API: rij-niveau parsing
# -------------------------------------------------

from datetime import date

# Header keyword sets
DATE_HEADER_KEYWORDS = ("datum", "weekdatum", "date", "start", "begin")
LES_HEADER_KEYWORDS = ("les", "lesnr", "lesnummer")
ONDERWERP_HEADERS = ("onderwerp", "thema", "hoofdstuk", "chapter", "topic", "lesstof")
LEERDOEL_HEADERS = ("leerdoelen", "doelen")
HUISWERK_HEADERS = ("huiswerk", "maken", "leren")
OPDRACHT_HEADERS = ("opdracht",)
INLEVER_HEADERS = ("inleverdatum", "deadline", "inleveren voor")
TOETS_HEADERS = (
    "toets",
    "so",
    "pw",
    "se",
    "proefwerk",
    "tentamen",
    "praktische opdracht",
    "presentatie",
    "deadlines",
)
BRON_HEADERS = ("bron", "bronnen", "links", "link", "boek")
NOTITIE_HEADERS = ("opmerking", "notitie", "remarks")
KLAS_HEADERS = ("klas", "groep")
LOCATIE_HEADERS = ("locatie", "lokaal")

MONTHS_NL = {
    "januari": 1,
    "februari": 2,
    "maart": 3,
    "april": 4,
    "mei": 5,
    "juni": 6,
    "juli": 7,
    "augustus": 8,
    "september": 9,
    "oktober": 10,
    "november": 11,
    "december": 12,
}


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def split_bullets(text: str) -> Optional[List[str]]:
    if not text:
        return None
    parts = re.split(r"[\n\r\u2022\-\–\*]+", text)
    items = [normalize_text(p) for p in parts if normalize_text(p)]
    return items or None


def find_header_idx(headers: List[str], keywords: Iterable[str]) -> Optional[int]:
    norm = [normalize_text(h).lower() for h in headers]
    for i, h in enumerate(norm):
        for kw in keywords:
            if kw.lower() in h:
                return i
    return None


def parse_week_cell(text: str) -> List[int]:
    return _weeks_from_week_cell(text)


def parse_date_cell(text: str, schooljaar: Optional[str]) -> Optional[str]:
    if not text:
        return None
    t = normalize_text(text)
    m = re.search(r"(\d{1,2})[\-/](\d{1,2})[\-/](\d{2,4})", t)
    if m:
        d, mth, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        return f"{y:04d}-{mth:02d}-{d:02d}"
    m = re.search(r"(\d{1,2})[\-/](\d{1,2})", t)
    if m:
        d, mth = int(m.group(1)), int(m.group(2))
        year = None
        if schooljaar:
            try:
                a, b = schooljaar.split("/")
                a, b = int(a), int(b)
                year = a if mth >= 8 else b
            except Exception:
                pass
        if year is None:
            year = date.today().year
        return f"{year:04d}-{mth:02d}-{d:02d}"
    m = re.search(r"(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?", t, re.I)
    if m:
        d = int(m.group(1))
        mn = MONTHS_NL.get(m.group(2).lower())
        if mn:
            y = m.group(3)
            if y:
                year = int(y)
            else:
                year = None
                if schooljaar:
                    try:
                        a, b = [int(x) for x in schooljaar.split("/")]
                        year = a if mn >= 8 else b
                    except Exception:
                        pass
                if year is None:
                    year = date.today().year
            return f"{year:04d}-{mn:02d}-{d:02d}"
    return None


def find_urls(text: str) -> Optional[List[Dict[str, str]]]:
    if not text:
        return None
    urls = re.findall(r"https?://\S+", text)
    out: List[Dict[str, str]] = []
    for url in urls:
        title = url.split("/")[-1] or url
        out.append({"type": "link", "title": title, "url": url})
    return out or None


def parse_toets_cell(text: str) -> Optional[Dict[str, Optional[str]]]:
    if not text or not normalize_text(text):
        return None
    t = text.lower()
    ttype = None
    for kw in ("so", "pw", "se"):
        if re.search(rf"\b{kw}\b", t):
            ttype = kw.upper()
            break
    if not ttype:
        for kw in ("proefwerk", "tentamen", "praktische opdracht", "presentatie", "toets"):
            if kw in t:
                ttype = kw
                break
    weight = None
    m = re.search(r"weging\s*(\d+)", t)
    if m:
        weight = m.group(1)
    else:
        m = re.search(r"(\d+)\s*(?:x|%)", t)
        if m:
            weight = m.group(1)
    herk = "onbekend"
    if "herkans" in t:
        if "nee" in t or "niet" in t:
            herk = "nee"
        elif "ja" in t:
            herk = "ja"
    return {"type": ttype or normalize_text(text), "weging": weight, "herkansing": herk}


def extract_rows_from_docx(path: str, filename: str) -> List[DocRow]:
    doc = Document(path)
    schooljaar = _parse_schooljaar_from_doc(doc) or _parse_schooljaar_from_filename(filename)
    results: List[DocRow] = []

    for tbl in doc.tables:
        rows = _table_rows_texts(tbl)
        if len(rows) < 2:
            continue
        headers = rows[0]
        week_col = _find_week_column(headers)
        date_col = None if week_col is not None else find_header_idx(headers, DATE_HEADER_KEYWORDS)
        les_col = find_header_idx(headers, LES_HEADER_KEYWORDS)
        ond_col = find_header_idx(headers, ONDERWERP_HEADERS)
        leer_col = find_header_idx(headers, LEERDOEL_HEADERS)
        hw_col = find_header_idx(headers, HUISWERK_HEADERS)
        opd_col = find_header_idx(headers, OPDRACHT_HEADERS)
        inl_col = find_header_idx(headers, INLEVER_HEADERS)
        toets_col = find_header_idx(headers, TOETS_HEADERS)
        bron_col = find_header_idx(headers, BRON_HEADERS)
        not_col = find_header_idx(headers, NOTITIE_HEADERS)
        klas_col = find_header_idx(headers, KLAS_HEADERS)
        loc_col = find_header_idx(headers, LOCATIE_HEADERS)

        for r in rows[1:]:
            weeks: List[int] = []
            if week_col is not None and week_col < len(r):
                weeks = parse_week_cell(r[week_col])
            elif date_col is not None and date_col < len(r):
                iso = parse_date_cell(r[date_col], schooljaar)
                if iso:
                    try:
                        wk = date.fromisoformat(iso).isocalendar().week
                        if 1 <= wk <= 53:
                            weeks = [wk]
                    except Exception:
                        pass
            if not weeks:
                continue

            datum = None
            if date_col is not None and date_col < len(r):
                datum = parse_date_cell(r[date_col], schooljaar)

            base: Dict[str, Optional[str]] = {}
            base_list: Dict[str, Optional[List[str]]] = {}
            base_dict: Dict[str, Optional[Dict[str, Optional[str]]]] = {}

            if les_col is not None and les_col < len(r):
                base["les"] = normalize_text(r[les_col]) or None
            if ond_col is not None and ond_col < len(r):
                base["onderwerp"] = normalize_text(r[ond_col]) or None
            if leer_col is not None and leer_col < len(r):
                base_list["leerdoelen"] = split_bullets(r[leer_col])
            if hw_col is not None and hw_col < len(r):
                base["huiswerk"] = normalize_text(r[hw_col]) or None
            if opd_col is not None and opd_col < len(r):
                base["opdracht"] = normalize_text(r[opd_col]) or None
            if inl_col is not None and inl_col < len(r):
                base["inleverdatum"] = parse_date_cell(r[inl_col], schooljaar)
            if toets_col is not None and toets_col < len(r):
                base_dict["toets"] = parse_toets_cell(r[toets_col])
            if bron_col is not None and bron_col < len(r):
                base_list["bronnen"] = find_urls(r[bron_col])
            if not_col is not None and not_col < len(r):
                base["notities"] = normalize_text(r[not_col]) or None
            if klas_col is not None and klas_col < len(r):
                base["klas_of_groep"] = normalize_text(r[klas_col]) or None
            if loc_col is not None and loc_col < len(r):
                base["locatie"] = normalize_text(r[loc_col]) or None

            for w in weeks:
                if not (1 <= w <= 53):
                    continue
                dr = DocRow(
                    week=w,
                    datum=datum,
                    les=base.get("les"),
                    onderwerp=base.get("onderwerp"),
                    leerdoelen=base_list.get("leerdoelen"),
                    huiswerk=base.get("huiswerk"),
                    opdracht=base.get("opdracht"),
                    inleverdatum=base.get("inleverdatum"),
                    toets=base_dict.get("toets"),
                    bronnen=base_list.get("bronnen"),
                    notities=base.get("notities"),
                    klas_of_groep=base.get("klas_of_groep"),
                    locatie=base.get("locatie"),
                )
                results.append(dr)

    return results
