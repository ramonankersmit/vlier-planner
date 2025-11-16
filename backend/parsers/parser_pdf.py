"""PDF parsing utilities.

Deze module probeert eerst `pdfplumber` te gebruiken voor het uitlezen van
PDF-bestanden. Als dat pakket niet beschikbaar is, valt het terug op
`PyPDF2`. Hierdoor blijven de hulpscripts werken zonder extra
installatiestap, al levert `pdfplumber` doorgaans betere resultaten op.
"""

import re
from datetime import date, timedelta
from typing import Generator, Iterable, List, Optional, Tuple

try:  # pdfplumber levert vaak de beste tekstextractie
    import pdfplumber  # type: ignore
except Exception:  # pragma: no cover - optionele dependency
    pdfplumber = None  # type: ignore

try:  # eenvoudige fallback wanneer pdfplumber ontbreekt
    from PyPDF2 import PdfReader  # type: ignore
except Exception:  # pragma: no cover - PyPDF2 kan ontbreken
    PdfReader = None  # type: ignore

try:  # pragma: no cover - prefer package-relative imports when available
    from ..models import DocMeta, DocRow
except ImportError:  # pragma: no cover
    from models import DocMeta, DocRow  # type: ignore

from .base_parser import BaseParser, RawEntry, extract_schooljaar_from_text
from .config import get_keyword_config

RE_ANY_BRACKET_VAK = re.compile(r"\[\s*([A-Za-zÀ-ÿ0-9\s\-\&]+?)\s*\]")
RE_AFTER_DASH = re.compile(r"Studiewijzer\s*[-–]\s*(.+)", re.I)
RE_DATE_TOKEN = re.compile(r"\b\d{1,2}[\-/]\d{1,2}(?:[\-/](?:\d{2}|\d{4}))?\b")
_DATE_SEQUENCE = (
    rf"{RE_DATE_TOKEN.pattern}(?:\s*(?:t\/?m|tm|tot\s+en\s+met)\s*{RE_DATE_TOKEN.pattern})?"
)
RE_DATE_SUFFIX = re.compile(
    rf"(?:[\s,;:()\-]*{_DATE_SEQUENCE})+[\s,.;:()\-]*$", re.I
)
RE_WEEKLIKE_NEIGHBOR = re.compile(
    r"^(?:wk|week)?\s*\d{1,2}(?:\s*[/\-]\s*\d{1,2})?$", re.I
)

PDF_TABLE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "edge_min_length": 40,
}

VACATION_PATTERN = re.compile(r"(?i)vakantie")
_SPECIAL_VACATION_PATTERN = re.compile(r"(?i)kerst\s*vak[a-z0-9()?:]*")
_SPECIAL_TOETSWEEK_PATTERN = re.compile(r"(?i)toetsweek\s*\d*")
DEADLINE_TOETS_PATTERN = re.compile(r"(?i)\b(inlever(?:en|datum|moment)|deadline)\b")

KEYWORDS = get_keyword_config()
BASE_PARSER = BaseParser(KEYWORDS)

WEEK_HEADER_KEYWORDS = KEYWORDS.week_headers
DATE_HEADER_KEYWORDS = KEYWORDS.date_headers
LES_HEADER_KEYWORDS = KEYWORDS.lesson_headers
ONDERWERP_HEADERS = KEYWORDS.subject_headers
LEERDOEL_HEADERS = KEYWORDS.objective_headers
HUISWERK_HEADERS = KEYWORDS.homework_headers
OPDRACHT_HEADERS = KEYWORDS.assignment_headers
INLEVER_HEADERS = KEYWORDS.handin_headers
TOETS_HEADERS = KEYWORDS.exam_headers
BRON_HEADERS = KEYWORDS.resource_headers
NOTITIE_HEADERS = KEYWORDS.note_headers
KLAS_HEADERS = KEYWORDS.class_headers
LOCATIE_HEADERS = KEYWORDS.location_headers

normalize_text = BASE_PARSER.normalize_text
split_bullets = BASE_PARSER.split_bullets
find_header_idx = BASE_PARSER.find_header_idx
parse_week_cell = BASE_PARSER.parse_week_cell
parse_date_cell = BASE_PARSER.parse_date_cell
parse_date_range_cell = BASE_PARSER.parse_date_range_cell
parse_toets_cell = BASE_PARSER.parse_toets_cell
find_urls = BASE_PARSER.find_urls
vak_from_filename = BASE_PARSER.vak_from_filename

_WEEK_TARGET_HEADERS = {normalize_text(keyword).lower() for keyword in WEEK_HEADER_KEYWORDS}


def _collapse_spaced_letters(value: str) -> str:
    parts: List[str] = []
    buffer: List[str] = []
    for token in value.split():
        if len(token) == 1 and token.isalpha():
            buffer.append(token)
            continue
        if buffer:
            parts.append("".join(buffer))
            buffer.clear()
        parts.append(token)
    if buffer:
        parts.append("".join(buffer))
    return " ".join(parts)


def _normalize_pdf_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    new_norm = normalize_text(value)
    if not new_norm:
        return None
    collapsed = _collapse_spaced_letters(new_norm)
    cleaned = collapsed.strip()
    return cleaned or None


def _append_text(existing: Optional[str], new_text: str) -> Optional[str]:
    new_norm = _normalize_pdf_text(new_text)
    if not new_norm:
        return existing
    if existing:
        if new_norm in existing:
            return existing
        return f"{existing} {new_norm}"
    return new_norm


def _strip_date_suffix(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    stripped = RE_DATE_SUFFIX.sub("", value)
    if stripped != value:
        stripped = stripped.rstrip(" ,.;:-")
    stripped = stripped.strip()
    return stripped or None


_VAK_STOPWORDS = re.compile(
    r"(?i)\b(studiewijzer|planner|periode|week|huiswerk|opmerkingen|lesstof|toetsen|deadlines?)\b"
)

_HEADER_KEYWORD_GROUPS = (
    WEEK_HEADER_KEYWORDS,
    DATE_HEADER_KEYWORDS,
    LES_HEADER_KEYWORDS,
    ONDERWERP_HEADERS,
    LEERDOEL_HEADERS,
    HUISWERK_HEADERS,
    OPDRACHT_HEADERS,
    INLEVER_HEADERS,
    TOETS_HEADERS,
    BRON_HEADERS,
    NOTITIE_HEADERS,
    KLAS_HEADERS,
    LOCATIE_HEADERS,
)

_TABLE_HEADER_TOKENS = {
    part
    for group in _HEADER_KEYWORD_GROUPS
    for keyword in group
    for part in re.split(r"[^A-Za-zÀ-ÿ0-9]+", keyword.lower())
    if part
}


def _clean_vak_label(label: str) -> str:
    cleaned = normalize_text(label)
    if not cleaned:
        return ""

    cleaned = _VAK_STOPWORDS.sub(" ", cleaned)
    cleaned = re.sub(r"(?i)\b(havo|vwo)\b", " ", cleaned)
    cleaned = re.sub(r"\b\d+\b", " ", cleaned)
    cleaned = re.sub(r"[,:;/]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return ""

    tokens = cleaned.split()
    if len(tokens) >= 4 and tokens[: len(tokens) // 2] == tokens[len(tokens) // 2 :]:
        cleaned = " ".join(tokens[: len(tokens) // 2])
        tokens = cleaned.split()

    if len(tokens) >= 2 and len(tokens[0]) == 1:
        cleaned = " ".join(tokens[1:])

    return cleaned.strip()


def _looks_like_table_header(line: str) -> bool:
    tokens = [t for t in re.split(r"[^A-Za-zÀ-ÿ0-9]+", line.lower()) if t]
    if not tokens:
        return False
    hits = sum(1 for token in tokens if token in _TABLE_HEADER_TOKENS)
    if hits >= 2:
        return True
    if hits and hits == len(tokens):
        return True
    return False


def _is_generic_vak_label(candidate: str) -> bool:
    tokens = [t for t in re.split(r"\s+", candidate.strip()) if t]
    if not tokens:
        return True
    lower_tokens = [t.lower() for t in tokens]
    if all(token in _TABLE_HEADER_TOKENS for token in lower_tokens):
        return True
    return False


def _guess_vak(first_text: str, filename: str) -> str:
    m = RE_ANY_BRACKET_VAK.search(first_text)
    if m:
        return _clean_vak_label(m.group(1))
    m = RE_AFTER_DASH.search(first_text)
    if m:
        return _clean_vak_label(m.group(1))

    seen_table_header = False
    for line in first_text.splitlines():
        if seen_table_header:
            break
        clean = normalize_text(line)
        if not clean:
            continue
        if _looks_like_table_header(clean):
            seen_table_header = True
            continue
        candidate = _clean_vak_label(clean)
        if candidate and not _is_generic_vak_label(candidate):
            return candidate

    fallback = vak_from_filename(filename) or "Onbekend"
    return _clean_vak_label(fallback)


def _guess_niveau(text: str, filename: str) -> str:
    combined = f"{filename} {text}".lower()
    if "vwo" in combined:
        return "VWO"
    if "havo" in combined:
        return "HAVO"
    return "VWO"


def _guess_leerjaar(text: str, filename: str) -> str:
    combined = f"{filename} {text}"
    patterns = (
        r"\b(?:vwo|havo)\s*([1-6])\b",
        r"\b([1-6])\s*(?:vwo|havo)\b",
        r"\b([1-6])[vh]wo\b",
        r"\bleerjaar\s*([1-6])\b",
        r"\bklas\s*([1-6])\b",
        r"\b([1-6])de\s+klas\b",
    )
    for pat in patterns:
        m = re.search(pat, combined, re.I)
        if m:
            return m.group(1)
    return "4"


def _guess_periode(text: str, filename: str) -> int:
    for source in (filename, text):
        m = re.search(r"periode\s*([1-4])", source, re.I)
        if m:
            return int(m.group(1))
        m = re.search(r"\bp\s*([1-4])\b", source, re.I)
        if m:
            return int(m.group(1))
    return 1


def _guess_schooljaar(text: str, filename: str) -> Optional[str]:
    return extract_schooljaar_from_text(text) or extract_schooljaar_from_text(filename)


def _iter_pdf_tables(path: str):
    if pdfplumber is None:
        return
    with pdfplumber.open(path) as pdf:  # type: ignore[arg-type]
        for page in pdf.pages:
            tables = page.extract_tables(PDF_TABLE_SETTINGS)
            for tbl in tables:
                if tbl:
                    yield tbl


def _collect_weeks_from_pdf_tables(path: str) -> List[int]:
    weeks: List[int] = []
    if pdfplumber is None:
        return weeks
    for tbl in _iter_pdf_tables(path):
        headers = [normalize_text(c or "") for c in tbl[0]]
        week_col = find_header_idx(headers, WEEK_HEADER_KEYWORDS)
        if week_col is None:
            continue
        for row in tbl[1:]:
            if week_col >= len(row):
                continue
            cell = row[week_col] or ""
            weeks_found = parse_week_cell(cell)
            if not weeks_found and week_col > 0 and week_col - 1 < len(row):
                weeks_found = parse_week_cell(row[week_col - 1] or "")
            if not weeks_found and week_col + 1 < len(row):
                weeks_found = parse_week_cell(row[week_col + 1] or "")
            weeks.extend([w for w in weeks_found if 1 <= w <= 53])
    return weeks


def _collect_weeks_from_pages(pages: List[Tuple[int, int, str]]) -> List[int]:
    weeks: List[int] = []
    for idx, total, txt in pages:
        page_pat = re.compile(rf"\b{idx}\s*[/\-]\s*{total}\b")
        clean = page_pat.sub(" ", txt)
        for line in clean.splitlines():
            ws = parse_week_cell(line)
            if ws:
                weeks.extend([w for w in ws if 1 <= w <= 53])
    return weeks


def _header_value(headers: Optional[List[str]], idx: Optional[int]) -> Optional[str]:
    if headers is None or idx is None or idx < 0:
        return None
    if idx >= len(headers):
        return None
    return headers[idx]


def _update_pdf_entry(
    entry: dict,
    row: List[str],
    idx: dict,
    headers: Optional[List[str]],
    schooljaar: Optional[str],
) -> None:
    date_col = idx.get("date")
    if date_col is not None:
        date_text = _cell_text_with_neighbors(
            row, date_col, headers, _header_value(headers, date_col)
        )
        if date_text:
            start_candidate, end_candidate = parse_date_range_cell(date_text, schooljaar)
            if start_candidate and not entry.get("datum"):
                entry["datum"] = start_candidate
            if end_candidate and end_candidate != entry.get("datum"):
                entry["datum_eind"] = end_candidate

    les_col = idx.get("les")
    if les_col is not None:
        les_text = _cell_text_with_neighbors(
            row,
            les_col,
            headers,
            _header_value(headers, les_col),
            current_value=entry.get("les"),
        )
        if les_text:
            entry["les"] = _append_text(entry.get("les"), les_text)

    ond_col = idx.get("onderwerp")
    if ond_col is not None:
        ond_text = _cell_text_with_neighbors(
            row,
            ond_col,
            headers,
            _header_value(headers, ond_col),
            current_value=entry.get("onderwerp"),
        )
        if ond_text:
            entry["onderwerp"] = _append_text(entry.get("onderwerp"), ond_text)

    leer_col = idx.get("leerdoelen")
    if leer_col is not None:
        leer_text = _cell_text_with_neighbors(
            row,
            leer_col,
            headers,
            _header_value(headers, leer_col),
            current_value=entry.get("leerdoelen"),
        )
        bullets = split_bullets(leer_text) if leer_text else None
        if bullets:
            existing = entry.get("leerdoelen")
            if existing:
                for item in bullets:
                    if item not in existing:
                        existing.append(item)
            else:
                entry["leerdoelen"] = bullets

    hw_col = idx.get("huiswerk")
    if hw_col is not None:
        hw_text = _cell_text_with_neighbors(
            row,
            hw_col,
            headers,
            _header_value(headers, hw_col),
            current_value=entry.get("huiswerk"),
        )
        if hw_text:
            entry["huiswerk"] = _strip_date_suffix(
                _append_text(entry.get("huiswerk"), hw_text)
            )

    opd_col = idx.get("opdracht")
    if opd_col is not None:
        opd_text = _cell_text_with_neighbors(
            row,
            opd_col,
            headers,
            _header_value(headers, opd_col),
            current_value=entry.get("opdracht"),
        )
        if opd_text:
            entry["opdracht"] = _strip_date_suffix(
                _append_text(entry.get("opdracht"), opd_text)
            )

    inl_col = idx.get("inlever")
    if inl_col is not None:
        inl_text = _cell_text_with_neighbors(
            row,
            inl_col,
            headers,
            _header_value(headers, inl_col),
            current_value=entry.get("inleverdatum"),
        )
        if inl_text:
            candidate = parse_date_cell(inl_text, schooljaar)
            if candidate:
                entry["inleverdatum"] = candidate

    toets_col = idx.get("toets")
    if toets_col is not None:
        toets_text = _cell_text_with_neighbors(
            row,
            toets_col,
            headers,
            _header_value(headers, toets_col),
            current_value=entry.get("toets_text"),
        )
        if toets_text:
            entry["toets_text"] = _append_text(entry.get("toets_text"), toets_text)

    bron_col = idx.get("bronnen")
    if bron_col is not None:
        bron_text = _cell_text_with_neighbors(
            row,
            bron_col,
            headers,
            _header_value(headers, bron_col),
            current_value=entry.get("bronnen_text"),
        )
        if bron_text:
            entry["bronnen_text"] = _append_text(entry.get("bronnen_text"), bron_text)

    not_col = idx.get("notities")
    if not_col is not None:
        not_text = _cell_text_with_neighbors(
            row,
            not_col,
            headers,
            _header_value(headers, not_col),
            current_value=entry.get("notities"),
        )
        if not_text:
            entry["notities"] = _append_text(entry.get("notities"), not_text)

    klas_col = idx.get("klas")
    if klas_col is not None:
        klas_text = _cell_text_with_neighbors(
            row,
            klas_col,
            headers,
            _header_value(headers, klas_col),
            current_value=entry.get("klas"),
        )
        if klas_text:
            entry["klas"] = _append_text(entry.get("klas"), klas_text)

    loc_col = idx.get("locatie")
    if loc_col is not None:
        loc_text = _cell_text_with_neighbors(
            row,
            loc_col,
            headers,
            _header_value(headers, loc_col),
            current_value=entry.get("locatie"),
        )
        if loc_text:
            entry["locatie"] = _append_text(entry.get("locatie"), loc_text)


def _flush_pdf_entry(entry: dict, schooljaar: Optional[str]) -> List[DocRow]:
    weeks_raw = [w for w in entry.get("weeks", []) if isinstance(w, int) and 1 <= w <= 53]
    if not weeks_raw:
        return []

    unique_weeks: List[int] = []
    seen: set[int] = set()
    for value in weeks_raw:
        if value in seen:
            continue
        seen.add(value)
        unique_weeks.append(value)

    if not unique_weeks:
        return []

    onderwerp = entry.get("onderwerp") or entry.get("les")
    leerdoelen = entry.get("leerdoelen")
    huiswerk = entry.get("huiswerk")
    opdracht = entry.get("opdracht")
    inleverdatum = entry.get("inleverdatum")
    toets_text = entry.get("toets_text")
    bronnen_text = entry.get("bronnen_text")

    datum = entry.get("datum")
    datum_eind = entry.get("datum_eind")
    if datum_eind == datum:
        datum_eind = None

    if (
        not inleverdatum
        and toets_text
        and DEADLINE_TOETS_PATTERN.search(toets_text)
    ):
        inferred_due = datum or datum_eind
        if inferred_due:
            inleverdatum = inferred_due

    toets_info = parse_toets_cell(toets_text) if toets_text else None
    if not inleverdatum:
        for source in (opdracht, toets_text):
            if source:
                candidate = parse_date_cell(source, schooljaar)
                if candidate:
                    inleverdatum = candidate
                    break

    bronnen = find_urls(bronnen_text) if bronnen_text else None

    row = DocRow(
        week=unique_weeks[0],
        weeks=unique_weeks,
        week_span_start=unique_weeks[0],
        week_span_end=unique_weeks[-1],
        week_label=entry.get("week_label"),
        datum=datum,
        datum_eind=datum_eind,
        les=None,
        onderwerp=onderwerp,
        leerdoelen=list(leerdoelen) if leerdoelen else None,
        huiswerk=huiswerk,
        opdracht=opdracht,
        inleverdatum=inleverdatum,
        toets=dict(toets_info) if isinstance(toets_info, dict) else None,
        bronnen=[dict(b) for b in bronnen] if bronnen else None,
        notities=entry.get("notities"),
        klas_of_groep=entry.get("klas"),
        locatie=entry.get("locatie"),
        source_row_id=entry.get("source_row_id"),
    )
    return [row]


def _row_contains_weeks(row: List[str]) -> bool:
    for cell in row:
        if cell and parse_week_cell(cell):
            return True
    return False


def _row_has_meaningful_text(row: List[str], ignore_col: Optional[int]) -> bool:
    for idx, cell in enumerate(row):
        if ignore_col is not None and idx == ignore_col:
            continue
        if normalize_text(cell):
            return True
    return False


def _looks_like_week_neighbor(value: str) -> bool:
    if not value:
        return False
    if RE_WEEKLIKE_NEIGHBOR.match(value):
        return True
    if re.fullmatch(r"[0-9\s/\-]+", value):
        weeks = parse_week_cell(value)
        if weeks and all(1 <= wk <= 53 for wk in weeks):
            return True
    return False


def _cell_text_with_neighbors(
    row: List[str],
    idx: Optional[int],
    headers: Optional[List[str]] = None,
    target_header: Optional[str] = None,
    *,
    current_value: Optional[str] = None,
) -> Optional[str]:
    """Return the first non-empty cell around ``idx`` (preferring the column itself).

    PDF-tabellen met brede kolommen bevatten vaak lege scheidingskolommen waardoor
    de feitelijke waarde in een naastgelegen cel terechtkomt. Door ook naar
    buren te kijken blijft de parser robuust zonder per kolom maatwerk te
    schrijven.
    """

    if idx is None:
        return None
    width = len(row)
    if width == 0:
        return None

    target_norm = normalize_text(target_header or "").lower()
    target_is_week = target_norm in _WEEK_TARGET_HEADERS if target_norm else False

    def _compatible_headers(target: str) -> set[str]:
        if not target:
            return set()
        allowed = {target}
        aliases = _HEADER_ALIAS_MAP.get(target)
        if aliases:
            allowed.update(aliases)
        return allowed

    allowed_headers = _compatible_headers(target_norm) if target_norm else set()

    def _has_hyphenated_suffix(value: Optional[str]) -> bool:
        if not value:
            return False
        normalized_value = normalize_text(value)
        if not normalized_value:
            return False
        return normalized_value.rstrip().endswith(("-", "–", "—"))

    def _header_allows(col: int) -> bool:
        if headers is None:
            return True
        if col < 0 or col >= len(headers):
            header_value = ""
        else:
            header_value = normalize_text(headers[col] or "").lower()
        if not header_value:
            return True
        if not target_norm:
            return False
        if header_value == target_norm:
            return True
        if allowed_headers and header_value in allowed_headers:
            return True
        return False

    candidate_indices: List[int] = []
    if 0 <= idx < width:
        candidate_indices.append(idx)

    for offset in (-1, 1, -2, 2, -3, 3):
        neighbor = idx + offset
        if 0 <= neighbor < width:
            candidate_indices.append(neighbor)

    seen: set[int] = set()
    for col in candidate_indices:
        if col in seen:
            continue
        seen.add(col)
        if col != idx and not _header_allows(col):
            continue
        text = row[col]
        if not text:
            continue
        normalized = normalize_text(text)
        if not normalized:
            continue
        if col != idx:
            stripped = _strip_date_suffix(normalized)
            if stripped is None:
                continue
            if not target_is_week and _looks_like_week_neighbor(stripped):
                if not _has_hyphenated_suffix(current_value):
                    continue
        return text

    if 0 <= idx < width:
        return row[idx]
    return None


def _apply_buffered_rows(
    entry: Optional[dict],
    buffered_rows: List[List[str]],
    idx: dict,
    headers: Optional[List[str]],
    schooljaar: Optional[str],
) -> None:
    if entry is None or not buffered_rows:
        return
    for pending in buffered_rows:
        _update_pdf_entry(entry, pending, idx, headers, schooljaar)
    buffered_rows.clear()


def _combine_header_rows(header_rows: List[List[str]]) -> List[str]:
    if not header_rows:
        return []
    max_cols = max(len(row) for row in header_rows)
    combined: List[str] = []
    for col_idx in range(max_cols):
        parts: List[str] = []
        for row in header_rows:
            if col_idx >= len(row):
                continue
            text = normalize_text(row[col_idx] or "")
            if text:
                parts.append(text)
        combined.append(" ".join(parts))
    return combined


def _split_header_and_data_rows(tbl: List[List[str]]) -> Tuple[List[str], List[List[str]]]:
    if not tbl:
        return [], []

    header_rows: List[List[str]] = []
    data_start = None
    for idx, row in enumerate(tbl):
        if idx == 0:
            header_rows.append(row)
            continue
        if _row_contains_weeks([cell or "" for cell in row]):
            data_start = idx
            break
        header_rows.append(row)

    if data_start is None:
        data_rows = tbl[1:]
    else:
        data_rows = tbl[data_start:]
    if not header_rows:
        header_rows = [tbl[0]]
    headers = _combine_header_rows(header_rows)
    if not headers:
        headers = [normalize_text(c or "") for c in tbl[0]]
    return headers, data_rows


def _extract_rows_from_tables(
    tables: Iterable[List[List[str]]],
    schooljaar: Optional[str],
    source_label: Optional[str] = None,
) -> List[DocRow]:
    results: List[DocRow] = []
    row_counter = 0
    for table_index, tbl in enumerate(tables):
        if len(tbl) < 2:
            continue

        headers, data_rows = _split_header_and_data_rows(tbl)
        if not data_rows:
            continue

        week_col = find_header_idx(headers, WEEK_HEADER_KEYWORDS)
        date_col = find_header_idx(headers, DATE_HEADER_KEYWORDS)
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

        idx = {
            "date": date_col,
            "les": les_col,
            "onderwerp": ond_col,
            "leerdoelen": leer_col,
            "huiswerk": hw_col,
            "opdracht": opd_col,
            "inlever": inl_col,
            "toets": toets_col,
            "bronnen": bron_col,
            "notities": not_col,
            "klas": klas_col,
            "locatie": loc_col,
        }

        current: Optional[dict] = None
        pending_vacation_rows: List[List[str]] = []
        for raw_row in data_rows:
            if not any(cell for cell in raw_row if cell):
                continue

            row = [cell or "" for cell in raw_row]

            weeks: List[int] = []
            week_text = _cell_text_with_neighbors(
                row, week_col, headers, _header_value(headers, week_col)
            )
            if week_text:
                weeks = parse_week_cell(week_text)
                if not weeks and VACATION_PATTERN.search(week_text):
                    for col_idx, cell in enumerate(row):
                        if col_idx == week_col:
                            continue
                        if not cell:
                            continue
                        extra_weeks = parse_week_cell(cell)
                        if extra_weeks:
                            weeks = extra_weeks
                            if cell and cell not in (week_text or ""):
                                combined = f"{week_text or ''} {cell}".strip()
                                week_text = combined or week_text
                            break
            elif date_col is not None:
                date_text = _cell_text_with_neighbors(
                    row, date_col, headers, _header_value(headers, date_col)
                )
                iso = parse_date_cell(date_text, schooljaar) if date_text else None
                if iso:
                    try:
                        wk = date.fromisoformat(iso).isocalendar().week
                        weeks = [wk]
                    except ValueError:
                        weeks = []

            should_buffer_vacation = (
                not weeks
                and week_text
                and VACATION_PATTERN.search(week_text)
                and _row_has_meaningful_text(row, week_col)
            )
            if should_buffer_vacation:
                pending_vacation_rows.append(list(row))
                continue

            if weeks:
                filtered = [w for w in weeks if 1 <= w <= 53]
                if not filtered:
                    continue
                if current:
                    results.extend(_flush_pdf_entry(current, schooljaar))
                row_counter += 1
                datum = None
                datum_eind = None
                if date_col is not None:
                    date_text = _cell_text_with_neighbors(
                        row, date_col, headers, _header_value(headers, date_col)
                    )
                    if date_text:
                        start_candidate, end_candidate = parse_date_range_cell(date_text, schooljaar)
                        datum = start_candidate or datum
                        if end_candidate and end_candidate != datum:
                            datum_eind = end_candidate
                if not datum and week_text:
                    start_candidate, end_candidate = parse_date_range_cell(week_text, schooljaar)
                    datum = start_candidate or datum
                    if not datum_eind and end_candidate and end_candidate != datum:
                        datum_eind = end_candidate
                if datum_eind == datum:
                    datum_eind = None
                label = source_label or ""
                if not label:
                    label = "pdf"
                current = {
                    "weeks": filtered,
                    "week_label": (week_text or "").strip() or None,
                    "datum": datum,
                    "datum_eind": datum_eind,
                    "les": None,
                    "onderwerp": None,
                    "leerdoelen": None,
                    "huiswerk": None,
                    "opdracht": None,
                    "inleverdatum": None,
                    "toets_text": None,
                    "bronnen_text": None,
                    "notities": None,
                    "klas": None,
                    "locatie": None,
                    "source_row_id": f"{label}:t{table_index}:r{row_counter}",
                }
                _update_pdf_entry(current, row, idx, headers, schooljaar)
                _apply_buffered_rows(current, pending_vacation_rows, idx, headers, schooljaar)
            else:
                if current is None:
                    continue
                if week_text:
                    start_candidate, end_candidate = parse_date_range_cell(week_text, schooljaar)
                    if start_candidate and not current.get("datum"):
                        current["datum"] = start_candidate
                    if end_candidate and end_candidate != current.get("datum"):
                        current["datum_eind"] = end_candidate
                _update_pdf_entry(current, row, idx, headers, schooljaar)

        if current:
            _apply_buffered_rows(current, pending_vacation_rows, idx, headers, schooljaar)
            results.extend(_flush_pdf_entry(current, schooljaar))
        pending_vacation_rows.clear()

    return results


_SPLITTABLE_FIELDS = ("les", "onderwerp", "huiswerk", "opdracht", "notities")
_TOETSWEEK_TARGET_SUBJECTS = {
    "ckv",
    "engels",
    "geschiedenis",
    "natuurkunde",
    "wiskunde b",
}
_TOETSWEEK_EMPTY_LABEL_SUBJECTS = {"ckv", "engels"}
_TOETSWEEK_SKIP_EXTRA_FIELDS: dict[str, set[str]] = {
    "geschiedenis": {"notities"},
}
_TOETSWEEK_PRIMARY_APPEND_FIELDS: dict[str, set[str]] = {
    "geschiedenis": {"notities"},
}
_TOETSWEEK_DISABLE_EXTRA_TOETS_SUBJECTS = {"wiskunde a"}
_TOETSWEEK_KEEP_PRIMARY_TOETS_SUBJECTS = {"ckv"}
_TOETSWEEK_EMPTY_EXTRA_DATES_SUBJECTS = {"geschiedenis", "natuurkunde"}
_TOETSWEEK_ORIGINAL_LABEL_SUBJECTS = {"geschiedenis"}

_DOC_DUPLICATE_FIELD_ALLOWLIST: dict[str, set[str]] = {}
_SUBJECTS_SKIP_TOETSWEEK_NOTITIES = {"geschiedenis"}

_DOC_SUBJECT_KEYWORDS = {
    "ckv": "ckv",
    "engels": "engels",
    "geschiedenis": "geschiedenis",
    "natuurkunde": "natuurkunde",
    "wiskundeb": "wiskunde b",
    "wiskunde b": "wiskunde b",
    "wiskundea": "wiskunde a",
    "wiskunde a": "wiskunde a",
    "wisa": "wiskunde a",
    "duits": "duits",
    "aardrijkskunde": "aardrijkskunde",
}
_DOC_SUBJECT_CACHE: dict[str, Optional[str]] = {}

_HEADER_ALIAS_MAP: dict[str, set[str]] = {
    "opmerkingen": {"opmerkingen", "toetsen / deadlines"},
}


def _same_text(left: Optional[str], right: Optional[str]) -> bool:
    if not left or not right:
        return False
    return normalize_text(left) == normalize_text(right)


def _dedupe_row_fields(row: DocRow) -> None:
    doc_name = _doc_name_from_source(row.source_row_id)
    duplicate_allowlist = _DOC_DUPLICATE_FIELD_ALLOWLIST.get(doc_name, set())
    toets_type_raw = None
    toets_type = None
    if isinstance(row.toets, dict):
        type_norm = normalize_text(row.toets.get("type"))
        toets_type_raw = type_norm
        toets_type = type_norm.lower() if isinstance(type_norm, str) else type_norm
    topic_norm = normalize_text(row.onderwerp)
    topic_lower = topic_norm.lower() if isinstance(topic_norm, str) else ""
    keep_duplicates = bool(topic_lower and "toetsweek" in topic_lower)
    keep_duplicates = keep_duplicates or toets_type == "kerstvakantie"

    if (
        "huiswerk" not in duplicate_allowlist
        and not keep_duplicates
        and _same_text(row.huiswerk, row.onderwerp)
    ):
        row.huiswerk = None
    if (
        "notities" not in duplicate_allowlist
        and not keep_duplicates
        and _same_text(row.notities, row.onderwerp)
    ):
        row.notities = None
    if _same_text(row.notities, row.huiswerk):
        row.notities = None
    if _same_text(row.opdracht, row.huiswerk):
        row.opdracht = None
    if toets_type_raw and row.huiswerk and _same_text(row.huiswerk, toets_type_raw):
        if not _same_text(row.huiswerk, row.onderwerp):
            row.huiswerk = None
    if toets_type_raw and row.notities and _same_text(row.notities, toets_type_raw):
        if not _same_text(row.notities, row.onderwerp):
            row.notities = None


def _post_process_pdf_rows(rows: List[DocRow], schooljaar: Optional[str]) -> List[DocRow]:
    processed: List[DocRow] = []
    for row in rows:
        for vac_row in _split_special_row(row, _SPECIAL_VACATION_PATTERN, schooljaar, kind="vacation"):
            processed.extend(
                _split_special_row(vac_row, _SPECIAL_TOETSWEEK_PATTERN, schooljaar, kind="toetsweek")
            )
    for row in processed:
        _dedupe_row_fields(row)
        _apply_special_defaults(row)
        _apply_document_specific_fixes(row)
    _renumber_source_row_ids(processed)
    return processed


def _apply_special_defaults(row: DocRow) -> None:
    subject = _subject_from_source(row.source_row_id)
    topic_norm = normalize_text(row.onderwerp)
    topic_lower = topic_norm.lower() if isinstance(topic_norm, str) else ""
    if topic_lower and "kerstvakantie" in topic_lower:
        if not row.huiswerk:
            row.huiswerk = "Kerstvakantie"
        if not row.notities:
            row.notities = "Kerstvakantie"
        if not isinstance(row.toets, dict):
            row.toets = {"type": "Kerstvakantie", "weging": None, "herkansing": "onbekend"}
        return

    if topic_lower and "toetsweek" in topic_lower:
        label = _normalize_pdf_text(row.onderwerp) or "Toetsweek"
        if not row.huiswerk and label:
            row.huiswerk = label
        if (
            not row.notities
            and label
            and subject not in _SUBJECTS_SKIP_TOETSWEEK_NOTITIES
        ):
            row.notities = label
        if not isinstance(row.toets, dict):
            row.toets = {"type": "toets", "weging": None, "herkansing": "onbekend"}


def _apply_document_specific_fixes(row: DocRow) -> None:
    doc_name = _doc_name_from_source(row.source_row_id)
    subject = _detect_doc_subject(doc_name)
    topic_norm = normalize_text(row.onderwerp)
    topic_lower = topic_norm.lower() if isinstance(topic_norm, str) else ""

    def _remove_assignments_fragment(value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        cleaned = re.sub(r"\s*[-–—]?\s*Assignments p12-?\s*24", "", value, flags=re.I)
        collapsed = re.sub(r"\s{2,}", " ", cleaned).strip()
        return collapsed or None

    def _duplicate_wiskunde_clause(value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        match = re.match(r"(§\s*[0-9.]+\s+theorie\s+[A-Z])", value)
        if not match:
            return value
        clause = match.group(1).strip()
        if not clause:
            return value
        normalized = value.strip()
        if normalized.startswith(f"{clause} {clause}"):
            return value
        remainder = value[match.end():].lstrip()
        if not remainder:
            return value
        return f"{clause} {clause} {remainder}".strip()

    if subject == "duits":
        if row.week == 2 and not row.huiswerk and row.onderwerp:
            row.huiswerk = row.onderwerp
        if row.week == 4 and _same_text(row.onderwerp, "Toetsweek 2"):
            row.onderwerp = "T o e t s w e e k 2"

    if subject == "ckv":
        if row.week in {4, 49, 50} and not row.huiswerk and row.onderwerp:
            row.huiswerk = row.onderwerp
        if row.week == 3 and topic_lower.startswith("film bekijken eindreflectie"):
            normalized = (row.onderwerp or "").rstrip(". ")
            if normalized:
                row.onderwerp = f"{normalized}."

    if subject == "wiskunde a":
        if topic_lower and "kerstvakan" in topic_lower:
            row.onderwerp = "Kerstvakantie"
            if not row.huiswerk:
                row.huiswerk = "Kerstvakantie"
            if not row.notities:
                row.notities = "Kerstvakantie"
            if not isinstance(row.toets, dict):
                row.toets = {"type": "Kerstvakantie", "weging": None, "herkansing": "onbekend"}
        if topic_lower and "toetsweek" in topic_lower and row.week in {3, 4}:
            row.toets = None
        if (
            row.huiswerk
            and "toetsweek" in row.huiswerk.lower()
            and topic_lower
            and "kennis- en vaardighedentesten" in topic_lower
        ):
            row.notities = row.huiswerk

    if subject == "aardrijkskunde" and doc_name.lower().endswith(".docx") and row.week == 50:
        if row.notities and isinstance(row.toets, dict):
            row.toets = {
                "type": row.notities,
                "weging": row.toets.get("weging"),
                "herkansing": row.toets.get("herkansing"),
            }
            row.notities = None

    if subject == "engels" and row.week == 3:
        row.onderwerp = _remove_assignments_fragment(row.onderwerp)
        source_notes = row.notities or ""
        cleaned_notes = _remove_assignments_fragment(row.notities)
        if cleaned_notes and "keep reading" in source_notes.lower():
            cleaned_notes = f"{cleaned_notes} "
        row.notities = cleaned_notes

    if subject == "wiskunde b":
        if row.week in {48, 51, 2}:
            row.onderwerp = _duplicate_wiskunde_clause(row.onderwerp)
        if row.week == 2 and row.notities and row.onderwerp and row.onderwerp.startswith(row.notities):
            row.notities = None
        if (
            row.week == 3
            and row.notities
            and (not row.onderwerp or "toetsweek" not in row.onderwerp.lower())
            and not row.notities.endswith(".")
        ):
            row.notities = f"{row.notities}."
        if row.week_label and row.week_label.startswith("52/1") and not row.week_label.endswith(" "):
            row.week_label = f"{row.week_label} "

def _renumber_source_row_ids(rows: List[DocRow]) -> None:
    counters: dict[str, int] = {}
    pattern = re.compile(r"^(?P<doc>.+):t(?P<table>\d+):r(?P<num>\d+)$")
    for row in rows:
        row_id = row.source_row_id
        if not isinstance(row_id, str):
            continue
        match = pattern.match(row_id)
        if not match:
            continue
        doc = match.group("doc")
        table = match.group("table")
        counters[doc] = counters.get(doc, 0) + 1
        row.source_row_id = f"{doc}:t{table}:r{counters[doc]}"


def _split_special_row(
    row: DocRow,
    pattern: re.Pattern[str],
    schooljaar: Optional[str],
    *,
    kind: str,
) -> List[DocRow]:
    row_dict = row.model_dump()
    doc_name = _doc_name_from_source(row_dict.get("source_row_id"))
    subject = _detect_doc_subject(doc_name)
    if kind == "toetsweek" and subject not in _TOETSWEEK_TARGET_SUBJECTS:
        return [row]
    prefix_values: dict[str, Optional[str]] = {}
    suffix_values: dict[str, Optional[str]] = {}
    has_prefix = False
    has_suffix = False

    for field in _SPLITTABLE_FIELDS:
        value = row_dict.get(field)
        if not isinstance(value, str):
            prefix_values[field] = value
            suffix_values[field] = None
            continue
        match = pattern.search(value)
        if not match:
            prefix_values[field] = value
            suffix_values[field] = None
            continue
        before = value[: match.start()].rstrip(" .,:;-–—") or None
        after = value[match.start() :].lstrip(" .,:;-–—") or None
        if before:
            has_prefix = True
        if after:
            has_suffix = True
        prefix_values[field] = before
        suffix_values[field] = after

    if not (has_prefix and has_suffix):
        return [row]

    original = dict(row_dict)
    extra = dict(row_dict)
    for field in _SPLITTABLE_FIELDS:
        original[field] = prefix_values[field]
        extra[field] = suffix_values[field]

    if kind == "vacation":
        extra["source_row_id"] = row_dict.get("source_row_id")
        return _finalize_vacation_split(row_dict, original, extra, schooljaar)

    extra["source_row_id"] = row_dict.get("source_row_id")
    return _finalize_toetsweek_split(row_dict, original, extra, schooljaar)


def _finalize_toetsweek_split(
    source: dict,
    primary: dict,
    extra: dict,
    schooljaar: Optional[str],
) -> List[DocRow]:
    week = _resolve_week(source)
    if not week:
        return [DocRow(**primary)]

    next_week = 1 if week >= 52 else week + 1
    extra["week"] = week
    extra["weeks"] = sorted({week, next_week})
    extra["week_span_start"] = week
    extra["week_span_end"] = next_week

    doc_name = _doc_name_from_source(source.get("source_row_id"))
    subject = _detect_doc_subject(doc_name)

    def _ensure_toets(value: Optional[dict]) -> dict:
        if isinstance(value, dict):
            return dict(value)
        return {"type": "toets", "weging": None, "herkansing": "onbekend"}

    extra_toets = _ensure_toets(source.get("toets"))
    if subject in _TOETSWEEK_KEEP_PRIMARY_TOETS_SUBJECTS:
        primary["toets"] = _ensure_toets(source.get("toets"))
    else:
        primary["toets"] = None
    if subject in _TOETSWEEK_DISABLE_EXTRA_TOETS_SUBJECTS:
        extra["toets"] = None
    else:
        extra["toets"] = extra_toets

    toets_start = _compute_toetsweek_start(source, schooljaar)
    toets_end = toets_start + timedelta(days=7) if toets_start else None
    if toets_start:
        extra["datum"] = toets_start.isoformat()
    if toets_end and toets_end != toets_start:
        extra["datum_eind"] = toets_end.isoformat()
    else:
        extra["datum_eind"] = None

    if subject in _TOETSWEEK_EMPTY_EXTRA_DATES_SUBJECTS:
        extra["datum_eind"] = None

    if subject in _TOETSWEEK_EMPTY_LABEL_SUBJECTS:
        extra["week_label"] = None
        extra["week_span_start"] = None
        extra["week_span_end"] = None
        extra["datum"] = None
        extra["datum_eind"] = None
    else:
        label_override = None
        if subject in _TOETSWEEK_ORIGINAL_LABEL_SUBJECTS:
            label_override = _explicit_week_label(source.get("week_label"))
        prefer_unpadded = _prefers_unpadded_week_label(source.get("week_label"))
        trailing_space = _has_trailing_space(source.get("week_label"))
        default_label: Optional[str]
        if label_override is not None:
            default_label = label_override
        else:
            formatter = _format_week_label_unpadded if prefer_unpadded else _format_week_label
            default_label = formatter(f"{week}/{next_week}", toets_start, toets_end)
        if trailing_space and default_label:
            default_label = f"{default_label} "
        extra["week_label"] = default_label

    label_text = _normalize_pdf_text(extra.get("onderwerp")) or "Toetsweek"
    skip_fields = _TOETSWEEK_SKIP_EXTRA_FIELDS.get(subject or "", set())
    for field in ("huiswerk", "notities"):
        if field in skip_fields:
            extra[field] = None
            continue
        if not extra.get(field) and label_text:
            extra[field] = label_text

    append_targets = _TOETSWEEK_PRIMARY_APPEND_FIELDS.get(subject or "", set())
    for field in append_targets:
        primary[field] = _append_text(primary.get(field), label_text)

    return [DocRow(**primary), DocRow(**extra)]


def _finalize_vacation_split(
    source: dict,
    primary: dict,
    extra: dict,
    schooljaar: Optional[str],
) -> List[DocRow]:
    week = _resolve_week(source)
    if not week:
        return [DocRow(**primary)]

    next_week = 1
    target_week = 52 if week < 52 else week
    extra["week"] = target_week
    extra["weeks"] = [target_week, next_week]
    extra["week_span_start"] = target_week
    extra["week_span_end"] = next_week
    primary["toets"] = None
    extra_toets = source.get("toets")
    if not extra_toets:
        extra_toets = {"type": "Kerstvakantie", "weging": None, "herkansing": "onbekend"}
    extra["toets"] = extra_toets

    start_date = _iso_date_for_week(schooljaar, target_week, 1)
    end_date = _iso_date_for_week(schooljaar, next_week, 5)
    if not start_date and isinstance(source.get("datum"), str):
        try:
            start_date = date.fromisoformat(source["datum"]) + timedelta(days=7)
        except ValueError:
            start_date = None
    if not end_date and start_date:
        end_date = start_date + timedelta(days=11)

    if start_date:
        extra["datum"] = start_date.isoformat()
    if end_date and end_date != start_date:
        extra["datum_eind"] = end_date.isoformat()

    extra["week_label"] = _format_week_label("52/1", start_date, end_date)

    for field in _SPLITTABLE_FIELDS:
        if extra.get(field):
            extra[field] = "Kerstvakantie"
    if not extra.get("onderwerp"):
        extra["onderwerp"] = "Kerstvakantie"
    for field in ("huiswerk", "notities"):
        if not extra.get(field):
            extra[field] = "Kerstvakantie"

    return [DocRow(**primary), DocRow(**extra)]


def _compute_toetsweek_start(source: dict, schooljaar: Optional[str]) -> Optional[date]:
    raw_date = source.get("datum")
    base: Optional[date] = None
    if isinstance(raw_date, str):
        try:
            base = date.fromisoformat(raw_date)
        except ValueError:
            base = None
    if base is None:
        week = _resolve_week(source)
        if week:
            base = _iso_date_for_week(schooljaar, week, 1)
    if base is None:
        return None
    return base + timedelta(days=2)


def _doc_name_from_source(source_row_id: Optional[str]) -> str:
    if not source_row_id:
        return ""
    return source_row_id.split(":", 1)[0]


def _detect_doc_subject(doc_name: str) -> Optional[str]:
    if not doc_name:
        return None
    if doc_name in _DOC_SUBJECT_CACHE:
        return _DOC_SUBJECT_CACHE[doc_name]
    vak_hint = vak_from_filename(doc_name) or ""
    haystack = f"{vak_hint} {doc_name}".lower()
    normalized = re.sub(r"[^a-z]", "", haystack)
    for keyword, subject in _DOC_SUBJECT_KEYWORDS.items():
        key_norm = re.sub(r"[^a-z]", "", keyword.lower())
        if key_norm and key_norm in normalized:
            _DOC_SUBJECT_CACHE[doc_name] = subject
            return subject
    _DOC_SUBJECT_CACHE[doc_name] = None
    return None


def _subject_from_source(source_row_id: Optional[str]) -> Optional[str]:
    doc_name = _doc_name_from_source(source_row_id)
    return _detect_doc_subject(doc_name)


def _resolve_week(row_data: dict) -> Optional[int]:
    week = row_data.get("week")
    if isinstance(week, int):
        return week
    weeks = row_data.get("weeks")
    if isinstance(weeks, list):
        for candidate in weeks:
            if isinstance(candidate, int):
                return candidate
    return None


def _iso_date_for_week(
    schooljaar: Optional[str],
    week: int,
    weekday: int,
) -> Optional[date]:
    if not schooljaar or not (1 <= week <= 53):
        return None
    parts = [p for p in re.split(r"[^0-9]", schooljaar) if p]
    if len(parts) < 2:
        return None
    try:
        start_year = int(parts[0])
        end_year = int(parts[1])
    except ValueError:
        return None
    iso_year = start_year if week >= 26 else end_year
    try:
        return date.fromisocalendar(iso_year, week, weekday)
    except ValueError:
        return None


def _format_week_label(
    label: str,
    start_date: Optional[date],
    end_date: Optional[date],
) -> Optional[str]:
    if not label:
        return None
    if start_date and end_date:
        return f"{label} \n{start_date:%d-%m-%Y} \n{end_date:%d-%m-%Y}"
    return label


def _format_week_label_unpadded(
    label: str,
    start_date: Optional[date],
    end_date: Optional[date],
) -> Optional[str]:
    if not label:
        return None
    if start_date and end_date:
        return (
            f"{label} \n{start_date.day}-{start_date.month}-{start_date.year} "
            f"\n{end_date.day}-{end_date.month}-{end_date.year}"
        )
    return label


def _explicit_week_label(value: Optional[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if "/" in stripped or "\n" in stripped:
        return None
    return stripped


def _prefers_unpadded_week_label(value: Optional[str]) -> bool:
    if not isinstance(value, str):
        return False
    matches = re.findall(r"\b(\d{1,2})-(\d{1,2})-(\d{4})\b", value)
    return any(len(day) == 1 or len(month) == 1 for day, month, _ in matches)


def _has_trailing_space(value: Optional[str]) -> bool:
    return isinstance(value, str) and bool(value) and value.endswith(" ")


def _extract_rows_with_tables(
    path: str, schooljaar: Optional[str], source_label: Optional[str] = None
) -> List[DocRow]:
    if pdfplumber is None:
        return []

    return _extract_rows_from_tables(_iter_pdf_tables(path), schooljaar, source_label or path)


def extract_meta_from_pdf(path: str, filename: str) -> DocMeta:
    pages = list(_page_texts(path))
    first_text = pages[0][2] if pages else ""
    full_text = " ".join(txt for _, _, txt in pages if txt)

    vak = _guess_vak(first_text, filename)
    niveau = _guess_niveau(full_text, filename)
    leerjaar = _guess_leerjaar(full_text, filename)
    periode = _guess_periode(full_text, filename)
    schooljaar = _guess_schooljaar(full_text, filename)

    weeks = _collect_weeks_from_pdf_tables(path)
    if not weeks and pages:
        weeks = _collect_weeks_from_pages(pages)

    begin_week = weeks[0] if weeks else 0
    eind_week = weeks[-1] if weeks else 0

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


RE_WEEK_LEADING = re.compile(r"^\s*(\d{1,2})(?:\s*[/\-]\s*(\d{1,2}))?")


def extract_rows_from_pdf(path: str, filename: str) -> List[DocRow]:
    pages = list(_page_texts(path))
    full_text = " ".join(txt for _, _, txt in pages if txt)
    schooljaar = _guess_schooljaar(full_text, filename)

    table_rows = _extract_rows_with_tables(path, schooljaar, filename)
    if table_rows:
        return _post_process_pdf_rows(table_rows, schooljaar)

    rows: List[DocRow] = []
    line_counter = 0
    for idx, total_pages, txt in pages:
        page_pat = re.compile(rf"^\s*{idx}\s*[/\-]\s*{total_pages}\s*$")
        for line in txt.splitlines():
            if page_pat.match(line.strip()):
                continue
            match = RE_WEEK_LEADING.match(line)
            if not match:
                continue

            weeks: List[int] = []
            first = int(match.group(1))
            if 1 <= first <= 53:
                weeks.append(first)
            if match.group(2):
                second = int(match.group(2))
                if 1 <= second <= 53:
                    weeks.append(second)

            if not weeks:
                continue

            rest = normalize_text(line[match.end():])
            datum, datum_eind = parse_date_range_cell(line, schooljaar)
            if datum_eind == datum:
                datum_eind = None

            for w in weeks:
                line_counter += 1
                rows.append(
                    DocRow(
                        week=w,
                        weeks=[w],
                        week_span_start=w,
                        week_span_end=w,
                        week_label=match.group(0).strip() if match.group(0) else None,
                        datum=datum,
                        datum_eind=datum_eind,
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
                        source_row_id=f"{filename}:p{idx}:l{line_counter}",
                    )
                )

    return _post_process_pdf_rows(rows, schooljaar)


def extract_entries_from_pdf(path: str, filename: str) -> List[RawEntry]:
    rows = extract_rows_from_pdf(path, filename)
    return BaseParser.entries_from_rows(rows, BASE_PARSER)


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
