from collections import defaultdict
from dataclasses import dataclass
from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from typing import Optional, List, Tuple, Iterable, Dict, Set
import re

try:  # pragma: no cover - prefer package-relative imports when available
    from ..models import DocMeta, DocRow
except ImportError:  # pragma: no cover
    from models import DocMeta, DocRow  # type: ignore

# ---------------------------
# Regex patronen & helpers
# ---------------------------

RE_STUDIEWIJZER = re.compile(r"studiewijzer", re.I)
RE_VAK_IN_BRACKETS = re.compile(r"\[\s*([A-Za-zÀ-ÿ\s\-\&]+)\s*\]")
RE_VAK_AFTER_DASH = re.compile(r"studiewijzer\s*[-–]\s*(.+)", re.I)
RE_ANY_BRACKET_VAK = re.compile(r"\[\s*([A-Za-zÀ-ÿ\s\-\&]+?)\s*\]")
RE_PERIODE_MARKER = re.compile(r"periode\s*([1-4])", re.I)

# Datums
RE_DATE_DMY = re.compile(r"\b(\d{1,2})[\-/](\d{1,2})[\-/](\d{2,4})\b")
RE_DATE_TEXTUAL = re.compile(r"\b(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+((?:20)?\d{2})\b", re.I)

# Weekcel parsing
RE_WEEK_LEADING = re.compile(r"^\s*(\d{1,2})(?:\s*[/\-]\s*(\d{1,2}))?")
RE_WEEK_PAIR = re.compile(r"\b(\d{1,2})\s*[/\-]\s*(\d{1,2})\b")
RE_WEEK_SOLO = re.compile(r"\b(?:wk|week)\s*(\d{1,2})\b", re.I)
RE_NUM_PURE = re.compile(r"^\s*(\d{1,2})\s*$")  # hele cel is een getal

# Schooljaar
# Herken zowel 4-cijferige als 2-cijferige jaartallen (bijv. "2025/2026" of "25-26")
RE_SCHOOLYEAR = re.compile(r"((?:20)?\d{2})\s*[/\-]\s*((?:20)?\d{2})")
RE_SCHOOLYEAR_COMPACT = re.compile(r"(?<!\d)(\d{2})(\d{2})(?!\d)")

MONTHS_NL = {
    "januari": 1,
    "jan": 1,
    "februari": 2,
    "feb": 2,
    "maart": 3,
    "mrt": 3,
    "april": 4,
    "apr": 4,
    "mei": 5,
    "juni": 6,
    "jun": 6,
    "juli": 7,
    "jul": 7,
    "augustus": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "oktober": 10,
    "okt": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}


def _normalize_year_fragment(part: str) -> Optional[int]:
    """Normaliseer een (mogelijke) jaartal-string naar een viercijferig jaar."""
    part = (part or "").strip()
    if not part:
        return None
    try:
        value = int(part)
    except ValueError:
        return None

    if len(part) <= 2:
        if value > 50:  # vermijd paginareeksen zoals 60/61
            return None
        value += 2000
    elif value < 1900 or value > 2100:
        return None

    return value


def _format_schooljaar(a: str, b: str) -> Optional[str]:
    """Converteer matches naar formaat YYYY/YYYY met eenvoudige validatie."""
    ai = _normalize_year_fragment(a)
    bi = _normalize_year_fragment(b)
    if ai is None or bi is None:
        return None
    a_digits = re.sub(r"\D", "", a)
    b_digits = re.sub(r"\D", "", b)
    if not a_digits or not b_digits:
        return None
    try:
        a_val = int(a_digits)
        b_val = int(b_digits)
    except ValueError:
        return None
    if len(a_digits) <= 2 and not (20 <= a_val <= 30):
        return None
    if len(b_digits) <= 2 and not (20 <= b_val <= 30):
        return None
    if bi < ai or abs(bi - ai) > 2:
        return None
    return f"{ai}/{bi}"


def _iter_dates_with_year(text: str) -> List[Tuple[int, int]]:
    results: List[Tuple[int, int]] = []
    if not text:
        return results

    for match in RE_DATE_DMY.finditer(text):
        try:
            month = int(match.group(2))
            year_raw = match.group(3)
            year = int(year_raw)
        except (TypeError, ValueError):
            continue
        if not (1 <= month <= 12):
            continue
        if len(year_raw) <= 2:
            year += 2000
        if year < 1900 or year > 2100:
            continue
        results.append((year, month))

    for match in RE_DATE_TEXTUAL.finditer(text):
        month = MONTHS_NL.get(match.group(2).lower())
        if not month:
            continue
        try:
            year_raw = match.group(3)
            year = int(year_raw)
        except (TypeError, ValueError):
            continue
        if len(year_raw) <= 2:
            year += 2000
        if year < 1900 or year > 2100:
            continue
        results.append((year, month))

    return results


def _infer_schooljaar_from_dates(text: str) -> Optional[str]:
    stats = defaultdict(lambda: {"count": 0, "has_autumn": False, "has_spring": False})
    for year, month in _iter_dates_with_year(text):
        start_year = year if month >= 8 else year - 1
        end_year = start_year + 1
        if start_year < 1900 or end_year > 2101:
            continue
        bucket = stats[(start_year, end_year)]
        bucket["count"] += 1
        if month >= 8:
            bucket["has_autumn"] = True
        else:
            bucket["has_spring"] = True

    best_key: Optional[Tuple[int, int]] = None
    best_score = (-1, -1, -1)
    for (start, end), bucket in stats.items():
        span_score = int(bucket["has_autumn"]) + int(bucket["has_spring"])
        count = bucket["count"]
        score = (span_score, count, start)
        if score > best_score:
            best_key = (start, end)
            best_score = score

    if not best_key:
        return None
    return f"{best_key[0]}/{best_key[1]}"


def extract_schooljaar_from_text(text: str) -> Optional[str]:
    """Zoek het meest waarschijnlijke schooljaar in een stuk tekst."""
    best: Optional[str] = None
    best_score = -1
    for match in RE_SCHOOLYEAR.finditer(text):
        candidate = _format_schooljaar(match.group(1), match.group(2))
        if not candidate:
            continue
        score = 0
        if len(match.group(1)) >= 4:
            score += 1
        if len(match.group(2)) >= 4:
            score += 1
        if best is None or score > best_score:
            best = candidate
            best_score = score

    if best:
        if best_score > 0:
            return best
        fallback = _infer_schooljaar_from_dates(text)
        if fallback:
            return fallback
        return best

    for match in RE_SCHOOLYEAR_COMPACT.finditer(text):
        candidate = _format_schooljaar(match.group(1), match.group(2))
        if candidate:
            fallback = _infer_schooljaar_from_dates(text)
            return fallback or candidate

    return _infer_schooljaar_from_dates(text)

def _clean(s: str) -> str:
    return (s or "").strip()


def _detect_primary_periode(doc: Document) -> Optional[int]:
    """Vind de eerste expliciete periodevermelding in de paragraaftekst."""
    for p in doc.paragraphs:
        txt = _clean(p.text)
        if not txt:
            continue
        m = RE_PERIODE_MARKER.search(txt)
        if m:
            try:
                return int(m.group(1))
            except ValueError:
                continue
    return None


def _table_period_from_cells(tbl) -> Optional[int]:
    """Zoek naar een periodevermelding in de eerste rijen/kolommen van een tabel."""
    try:
        # Controleer de eerste paar rijen; veel bestanden zetten de periode
        # in de eerste rij of in een samengevoegde kopcel.
        for row in tbl.rows[:3]:
            for cell in row.cells[:3]:
                txt = _clean(cell.text)
                if not txt:
                    continue
                m = RE_PERIODE_MARKER.search(txt)
                if m:
                    try:
                        return int(m.group(1))
                    except ValueError:
                        continue
    except Exception:
        pass
    return None


def _table_period_markers(doc: Document) -> List[Tuple[Table, Optional[int]]]:
    """Geef een lijst terug met (tabel, periode-marker)."""
    results: List[Tuple[Table, Optional[int]]] = []
    current: Optional[int] = None
    body = doc.element.body
    for child in body.iterchildren():
        if isinstance(child, CT_P):
            paragraph = Paragraph(child, doc)
            txt = _clean(paragraph.text)
            if not txt:
                continue
            m = RE_PERIODE_MARKER.search(txt)
            if m:
                try:
                    current = int(m.group(1))
                except ValueError:
                    current = None
        elif isinstance(child, CT_Tbl):
            table = Table(child, doc)
            marker = current or _table_period_from_cells(table)
            if marker is not None:
                current = marker
            results.append((table, marker))
    return results


def _table_matches_period(marker: Optional[int], periode: Optional[int]) -> bool:
    if marker is None or periode is None:
        return True
    return marker == periode

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

def vak_from_filename(filename: str) -> Optional[str]:
    base = filename.rsplit(".", 1)[0]
    base = base.replace("_", " ").replace("-", " ")
    base = re.sub(r"(?i)studiewijzer|planner|periode", " ", base)
    base = re.sub(r"(?i)\bp\s*\d+\b", " ", base)
    base = re.sub(r"\d+", " ", base)
    base = re.sub(r"(?i)\b(havo|vwo)\b", " ", base)
    tokens = [t for t in base.split() if len(t) > 1]
    cleaned = " ".join(tokens).strip()
    return cleaned or None

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
    return vak_from_filename(filename)

# ---------------------------
# Schooljaar parsing
# ---------------------------

def _parse_schooljaar_from_filename(filename: str) -> Optional[str]:
    base = filename.rsplit(".", 1)[0]
    return extract_schooljaar_from_text(base)

def _parse_schooljaar_from_doc(doc: Document) -> Optional[str]:
    texts: List[str] = []
    for p in doc.paragraphs:
        texts.append(_clean(p.text))
    try:
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    texts.append(_clean(cell.text))
    except Exception:
        pass
    try:
        sec = doc.sections[0]
        texts += [_clean(p.text) for p in sec.header.paragraphs]
        texts += [_clean(p.text) for p in sec.footer.paragraphs]
    except Exception:
        pass
    blob = " | ".join(t for t in texts if t)
    return extract_schooljaar_from_text(blob)

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
        candidate = extract_schooljaar_from_text(full)
        if candidate:
            schooljaar = candidate
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
    # Harmoniseer verschillende koppeltekens zodat we 52-1-2 patronen eenduidig kunnen herkennen.
    text = text.replace("–", "-").replace("—", "-").replace("−", "-")

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

    # Fallback: als er meerdere nummers via koppeltekens/slashes aan elkaar staan, kunnen
    # overlappende paren ontbreken (bijv. '52-1-2'). In dat geval lopen we nogmaals alle
    # losse getallen af in oorspronkelijke volgorde zodat ook de tussenliggende weken
    # worden meegenomen.
    if re.search(r"\d\s*[-/]\s*\d", text):
        for match in re.finditer(r"(?<!\d)(\d{1,2})(?!\d)", text):
            v = int(match.group(1))
            if 1 <= v <= 53:
                weeks.append(v)

    m2 = RE_NUM_PURE.match(text)
    if m2:
        v = int(m2.group(1))
        if 1 <= v <= 53:
            weeks.append(v)

    # Verwijder dubbelen maar behoud invoegvolgorde
    ordered: List[int] = []
    seen: set[int] = set()
    for w in weeks:
        if w in seen:
            continue
        seen.add(w)
        ordered.append(w)

    return ordered


def _is_new_period(
    prev_week: Optional[int], current_week: int, *, allow_wrap: bool = False
) -> bool:
    """Detecteer overgang naar een nieuwe periode op basis van weeknummers."""
    if prev_week is None:
        return False
    if not (1 <= current_week <= 53):
        return False
    # Zodra de reeks na week 40+ terugvalt naar het begin van het jaar,
    # interpreteren we dat als een nieuwe periode.
    if allow_wrap:
        return False
    return prev_week >= 40 and current_week <= 10

def _table_rows_texts(tbl) -> List[List[str]]:
    """Converteer een docx-table naar matrix van celteksten, robuust genoeg voor merges."""
    rows: List[List[str]] = []
    for row in tbl.rows:
        rows.append([_clean(c.text) for c in row.cells])
    return rows

def _parse_week_range(
    doc: Document, periode: Optional[int], table_markers: List[Tuple[Table, Optional[int]]]
) -> Tuple[int, int]:
    """
    - Neem in *elke* tabel rij 0 als header.
    - Vind de kolom waarvan de header 'week' of 'wk' bevat.
    - Verzamel ALLE weeknummers uit die kolom (over alle tabellen).
    - Neem min/max.
    """
    begin_w, eind_w = 0, 0
    ordered_weeks: List[int] = []
    unique_weeks: List[int] = []
    seen: set[int] = set()

    prev_week: Optional[int] = None
    stop = False

    try:
        for tbl, marker in table_markers:
            if not _table_matches_period(marker, periode):
                continue
            if stop:
                break
            rows = _table_rows_texts(tbl)
            if len(rows) < 2:
                continue
            headers = rows[0]
            week_col = _find_week_column(headers)
            if week_col is None:
                continue

            allow_wrap = marker is not None
            for r in rows[1:]:
                if stop:
                    break
                if week_col < len(r):
                    ws = _weeks_from_week_cell(r[week_col])
                    if not ws:
                        continue
                    for w in ws:
                        if not (1 <= w <= 53):
                            continue
                        if _is_new_period(prev_week, w, allow_wrap=allow_wrap):
                            stop = True
                            break
                        ordered_weeks.append(w)
                        if w not in seen:
                            unique_weeks.append(w)
                            seen.add(w)
                        prev_week = w

        if ordered_weeks:
            begin_w, eind_w = ordered_weeks[0], ordered_weeks[-1]
        elif unique_weeks:
            begin_w, eind_w = unique_weeks[0], unique_weeks[-1]

    except Exception:
        pass

    return begin_w, eind_w

# ---------------------------
# Hoofdfunctie
# ---------------------------

@dataclass
class _DocParseContext:
    doc: Document
    filename: str
    table_markers: List[Tuple[Table, Optional[int]]]
    niveau: Optional[str]
    leerjaar: Optional[str]
    periode_footer: Optional[int]
    schooljaar_footer: Optional[str]
    periode_text: Optional[int]
    schooljaar: Optional[str]
    vak: str


def _build_doc_context(path: str, filename: str) -> _DocParseContext:
    doc = Document(path)
    table_markers = _table_period_markers(doc)
    niveau, leerjaar, periode_footer, schooljaar_footer = _parse_footer_meta(doc)
    periode_text = _detect_primary_periode(doc)
    schooljaar = (
        schooljaar_footer
        or _parse_schooljaar_from_doc(doc)
        or _parse_schooljaar_from_filename(filename)
    )
    vak = _parse_vak_from_header(doc, filename) or "Onbekend"
    return _DocParseContext(
        doc=doc,
        filename=filename,
        table_markers=table_markers,
        niveau=niveau,
        leerjaar=leerjaar,
        periode_footer=periode_footer,
        schooljaar_footer=schooljaar_footer,
        periode_text=periode_text,
        schooljaar=schooljaar,
        vak=vak,
    )


def _extract_meta_from_context(
    ctx: _DocParseContext, target_periode: Optional[int] = None
) -> Optional[DocMeta]:
    periode = target_periode or ctx.periode_text or ctx.periode_footer
    begin_week, eind_week = _parse_week_range(ctx.doc, periode, ctx.table_markers)
    file_id = re.sub(r"[^a-zA-Z0-9]+", "-", ctx.filename)[:40]

    return DocMeta(
        fileId=file_id,
        bestand=ctx.filename,
        vak=ctx.vak,
        niveau=ctx.niveau,
        leerjaar=ctx.leerjaar,
        periode=periode or ctx.periode_footer,
        beginWeek=begin_week,
        eindWeek=eind_week,
        schooljaar=ctx.schooljaar,
    )


def extract_meta_from_docx(
    path: str, filename: str, target_periode: Optional[int] = None
) -> Optional[DocMeta]:
    ctx = _build_doc_context(path, filename)
    return _extract_meta_from_context(ctx, target_periode)


# -------------------------------------------------
# Nieuwe API: rij-niveau parsing
# -------------------------------------------------

from datetime import date

# Header keyword sets
DATE_HEADER_KEYWORDS = ("datum", "weekdatum", "date", "start", "begin")
LES_HEADER_KEYWORDS = ("les", "lesnr", "lesnummer")
ONDERWERP_HEADERS = (
    "onderwerp",
    "thema",
    "hoofdstuk",
    "chapter",
    "topic",
    "lesstof",
    "in les",
    "grammatica",
)
LEERDOEL_HEADERS = ("leerdoelen", "doelen")
HUISWERK_HEADERS = ("huiswerk", "maken", "leren", "planning teksten")
OPDRACHT_HEADERS = ("opdracht", "k-tekst")
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
        if not (1 <= mth <= 12 and 1 <= d <= 31):
            return None
        if y < 100:
            y += 2000
        return f"{y:04d}-{mth:02d}-{d:02d}"
    m = re.search(r"(\d{1,2})[\-/](\d{1,2})", t)
    if m:
        d, mth = int(m.group(1)), int(m.group(2))
        if not (1 <= mth <= 12 and 1 <= d <= 31):
            return None
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
            if not (1 <= d <= 31):
                return None
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


def _extract_rows_from_context(
    ctx: _DocParseContext, target_periode: Optional[int] = None
) -> List[DocRow]:
    periode = target_periode or ctx.periode_text or ctx.periode_footer
    schooljaar = ctx.schooljaar
    results: List[DocRow] = []

    prev_week: Optional[int] = None
    stop = False

    for tbl, marker in ctx.table_markers:
        if not _table_matches_period(marker, periode):
            continue
        if stop:
            break
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

        allow_wrap = marker is not None
        for r in rows[1:]:
            if stop:
                break
            weeks: List[int] = []
            week_text = None
            if week_col is not None and week_col < len(r):
                week_text = r[week_col]
                weeks = parse_week_cell(week_text)
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
            if not datum and week_text:
                datum = parse_date_cell(week_text, schooljaar)

            base: Dict[str, Optional[str]] = {}
            base_list: Dict[str, Optional[List[str]]] = {}
            base_dict: Dict[str, Optional[Dict[str, Optional[str]]]] = {}

            opd_text = None
            toets_text = None
            if les_col is not None and les_col < len(r):
                base["les"] = normalize_text(r[les_col]) or None
            if ond_col is not None and ond_col < len(r):
                base["onderwerp"] = normalize_text(r[ond_col]) or None
            if leer_col is not None and leer_col < len(r):
                base_list["leerdoelen"] = split_bullets(r[leer_col])
            if hw_col is not None and hw_col < len(r):
                base["huiswerk"] = normalize_text(r[hw_col]) or None
            if opd_col is not None and opd_col < len(r):
                opd_text = r[opd_col]
                base["opdracht"] = normalize_text(opd_text) or None
            if inl_col is not None and inl_col < len(r):
                base["inleverdatum"] = parse_date_cell(r[inl_col], schooljaar)
            if toets_col is not None and toets_col < len(r):
                toets_text = r[toets_col]
                base_dict["toets"] = parse_toets_cell(toets_text)
            if bron_col is not None and bron_col < len(r):
                base_list["bronnen"] = find_urls(r[bron_col])
            if not_col is not None and not_col < len(r):
                base["notities"] = normalize_text(r[not_col]) or None
            if klas_col is not None and klas_col < len(r):
                base["klas_of_groep"] = normalize_text(r[klas_col]) or None
            if loc_col is not None and loc_col < len(r):
                base["locatie"] = normalize_text(r[loc_col]) or None

            if not base.get("inleverdatum"):
                candidate = None
                if opd_text:
                    candidate = parse_date_cell(opd_text, schooljaar)
                if not candidate and toets_text:
                    candidate = parse_date_cell(toets_text, schooljaar)
                if candidate:
                    base["inleverdatum"] = candidate

            accepted_weeks: List[int] = []
            for w in weeks:
                if not (1 <= w <= 53):
                    continue
                if _is_new_period(prev_week, w, allow_wrap=allow_wrap):
                    stop = True
                    break
                accepted_weeks.append(w)
                prev_week = w

            if stop or not accepted_weeks:
                continue

            for w in accepted_weeks:
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


def extract_rows_from_docx(
    path: str, filename: str, target_periode: Optional[int] = None
) -> List[DocRow]:
    ctx = _build_doc_context(path, filename)
    return _extract_rows_from_context(ctx, target_periode)


def extract_all_periods_from_docx(
    path: str, filename: str
) -> List[Tuple[DocMeta, List[DocRow]]]:
    ctx = _build_doc_context(path, filename)
    periods: List[Optional[int]] = []
    seen: Set[int] = set()

    for _, marker in ctx.table_markers:
        if marker is None:
            continue
        if marker not in seen:
            periods.append(marker)
            seen.add(marker)

    for candidate in (ctx.periode_text, ctx.periode_footer):
        if candidate is None:
            continue
        if candidate not in seen:
            periods.append(candidate)
            seen.add(candidate)

    if not periods:
        periods.append(None)

    parsed: List[Tuple[DocMeta, List[DocRow]]] = []
    for periode in periods:
        meta = _extract_meta_from_context(ctx, periode)
        if not meta:
            continue
        rows = _extract_rows_from_context(ctx, periode)
        parsed.append((meta, rows))

    return parsed
