"""PDF parsing utilities.

Deze module probeert eerst `pdfplumber` te gebruiken voor het uitlezen van
PDF-bestanden. Als dat pakket niet beschikbaar is, valt het terug op
`PyPDF2`. Hierdoor blijven de hulpscripts werken zonder extra
installatiestap, al levert `pdfplumber` doorgaans betere resultaten op.
"""

import re
from datetime import date
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
from .parser_docx import (
    BRON_HEADERS,
    DATE_HEADER_KEYWORDS,
    LEERDOEL_HEADERS,
    HUISWERK_HEADERS,
    KLAS_HEADERS,
    LES_HEADER_KEYWORDS,
    LOCATIE_HEADERS,
    NOTITIE_HEADERS,
    ONDERWERP_HEADERS,
    OPDRACHT_HEADERS,
    INLEVER_HEADERS,
    TOETS_HEADERS,
    WEEK_HEADER_KEYWORDS,
    extract_schooljaar_from_text,
    find_header_idx,
    find_urls,
    normalize_text,
    parse_date_cell,
    parse_date_range_cell,
    parse_toets_cell,
    parse_week_cell,
    split_bullets,
    vak_from_filename,
)

RE_ANY_BRACKET_VAK = re.compile(r"\[\s*([A-Za-zÀ-ÿ0-9\s\-\&]+?)\s*\]")
RE_AFTER_DASH = re.compile(r"Studiewijzer\s*[-–]\s*(.+)", re.I)

PDF_TABLE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "edge_min_length": 40,
}

VACATION_PATTERN = re.compile(r"(?i)vakantie")
DEADLINE_TOETS_PATTERN = re.compile(r"(?i)\b(inlever(?:en|datum|moment)|deadline)\b")


def _append_text(existing: Optional[str], new_text: str) -> Optional[str]:
    new_norm = normalize_text(new_text)
    if not new_norm:
        return existing
    if existing:
        if new_norm in existing:
            return existing
        return f"{existing} {new_norm}"
    return new_norm


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


def _update_pdf_entry(entry: dict, row: List[str], idx: dict, schooljaar: Optional[str]) -> None:
    date_col = idx.get("date")
    if date_col is not None:
        date_text = _cell_text_with_neighbors(row, date_col)
        if date_text:
            start_candidate, end_candidate = parse_date_range_cell(date_text, schooljaar)
            if start_candidate and not entry.get("datum"):
                entry["datum"] = start_candidate
            if end_candidate and end_candidate != entry.get("datum"):
                entry["datum_eind"] = end_candidate

    les_col = idx.get("les")
    if les_col is not None:
        les_text = _cell_text_with_neighbors(row, les_col)
        if les_text:
            entry["les"] = _append_text(entry.get("les"), les_text)

    ond_col = idx.get("onderwerp")
    if ond_col is not None:
        ond_text = _cell_text_with_neighbors(row, ond_col)
        if ond_text:
            entry["onderwerp"] = _append_text(entry.get("onderwerp"), ond_text)

    leer_col = idx.get("leerdoelen")
    if leer_col is not None:
        leer_text = _cell_text_with_neighbors(row, leer_col)
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
        hw_text = _cell_text_with_neighbors(row, hw_col)
        if hw_text:
            entry["huiswerk"] = _append_text(entry.get("huiswerk"), hw_text)

    opd_col = idx.get("opdracht")
    if opd_col is not None:
        opd_text = _cell_text_with_neighbors(row, opd_col)
        if opd_text:
            entry["opdracht"] = _append_text(entry.get("opdracht"), opd_text)

    inl_col = idx.get("inlever")
    if inl_col is not None:
        inl_text = _cell_text_with_neighbors(row, inl_col)
        if inl_text:
            candidate = parse_date_cell(inl_text, schooljaar)
            if candidate:
                entry["inleverdatum"] = candidate

    toets_col = idx.get("toets")
    if toets_col is not None:
        toets_text = _cell_text_with_neighbors(row, toets_col)
        if toets_text:
            entry["toets_text"] = _append_text(entry.get("toets_text"), toets_text)

    bron_col = idx.get("bronnen")
    if bron_col is not None:
        bron_text = _cell_text_with_neighbors(row, bron_col)
        if bron_text:
            entry["bronnen_text"] = _append_text(entry.get("bronnen_text"), bron_text)

    not_col = idx.get("notities")
    if not_col is not None:
        not_text = _cell_text_with_neighbors(row, not_col)
        if not_text:
            entry["notities"] = _append_text(entry.get("notities"), not_text)

    klas_col = idx.get("klas")
    if klas_col is not None:
        klas_text = _cell_text_with_neighbors(row, klas_col)
        if klas_text:
            entry["klas"] = _append_text(entry.get("klas"), klas_text)

    loc_col = idx.get("locatie")
    if loc_col is not None:
        loc_text = _cell_text_with_neighbors(row, loc_col)
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
        les=entry.get("les"),
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


def _cell_text_with_neighbors(row: List[str], idx: Optional[int]) -> Optional[str]:
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
        text = row[col]
        if text and normalize_text(text):
            return text

    if 0 <= idx < width:
        return row[idx]
    return None


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
        for raw_row in data_rows:
            if not any(cell for cell in raw_row if cell):
                continue

            row = [cell or "" for cell in raw_row]

            weeks: List[int] = []
            week_text = _cell_text_with_neighbors(row, week_col)
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
                date_text = _cell_text_with_neighbors(row, date_col)
                iso = parse_date_cell(date_text, schooljaar) if date_text else None
                if iso:
                    try:
                        wk = date.fromisoformat(iso).isocalendar().week
                        weeks = [wk]
                    except ValueError:
                        weeks = []

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
                    date_text = _cell_text_with_neighbors(row, date_col)
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
                _update_pdf_entry(current, row, idx, schooljaar)
            else:
                if current is None:
                    continue
                if week_text:
                    start_candidate, end_candidate = parse_date_range_cell(week_text, schooljaar)
                    if start_candidate and not current.get("datum"):
                        current["datum"] = start_candidate
                    if end_candidate and end_candidate != current.get("datum"):
                        current["datum_eind"] = end_candidate
                _update_pdf_entry(current, row, idx, schooljaar)

        if current:
            results.extend(_flush_pdf_entry(current, schooljaar))

    return results


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
        return table_rows

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
