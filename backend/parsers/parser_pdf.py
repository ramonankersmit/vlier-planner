"""PDF parsing utilities.

Deze module probeert eerst `pdfplumber` te gebruiken voor het uitlezen van
PDF-bestanden. Als dat pakket niet beschikbaar is, valt het terug op
`PyPDF2`. Hierdoor blijven de hulpscripts werken zonder extra
installatiestap, al levert `pdfplumber` doorgaans betere resultaten op.
"""

import re
from datetime import date
from typing import Generator, List, Optional, Tuple

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
    parse_toets_cell,
    parse_week_cell,
    split_bullets,
    vak_from_filename,
)

RE_ANY_BRACKET_VAK = re.compile(r"\[\s*([A-Za-zÀ-ÿ\s\-\&]+?)\s*\]")
RE_AFTER_DASH = re.compile(r"Studiewijzer\s*[-–]\s*(.+)", re.I)

PDF_TABLE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "edge_min_length": 40,
}


def _append_text(existing: Optional[str], new_text: str) -> Optional[str]:
    new_norm = normalize_text(new_text)
    if not new_norm:
        return existing
    if existing:
        if new_norm in existing:
            return existing
        return f"{existing} {new_norm}"
    return new_norm


def _clean_vak_label(label: str) -> str:
    cleaned = normalize_text(label)
    cleaned = re.sub(r"(?i)^(vwo|havo)\s+", "", cleaned)
    return cleaned.strip()


def _guess_vak(first_text: str, filename: str) -> str:
    m = RE_ANY_BRACKET_VAK.search(first_text)
    if m:
        return _clean_vak_label(m.group(1))
    m = RE_AFTER_DASH.search(first_text)
    if m:
        return _clean_vak_label(m.group(1))

    for line in first_text.splitlines():
        clean = normalize_text(line)
        if not clean:
            continue
        low = clean.lower()
        if any(word in low for word in ("studiewijzer", "planner", "periode")):
            continue
        if re.search(r"\bweek\b", low):
            continue
        if re.fullmatch(r"[a-zà-ÿ\s\-&]+", low):
            return _clean_vak_label(clean)

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
    if date_col is not None and date_col < len(row):
        candidate = parse_date_cell(row[date_col], schooljaar)
        if candidate and not entry.get("datum"):
            entry["datum"] = candidate

    les_col = idx.get("les")
    if les_col is not None and les_col < len(row):
        entry["les"] = _append_text(entry.get("les"), row[les_col])

    ond_col = idx.get("onderwerp")
    if ond_col is not None and ond_col < len(row):
        entry["onderwerp"] = _append_text(entry.get("onderwerp"), row[ond_col])

    leer_col = idx.get("leerdoelen")
    if leer_col is not None and leer_col < len(row):
        bullets = split_bullets(row[leer_col])
        if bullets:
            existing = entry.get("leerdoelen")
            if existing:
                for item in bullets:
                    if item not in existing:
                        existing.append(item)
            else:
                entry["leerdoelen"] = bullets

    hw_col = idx.get("huiswerk")
    if hw_col is not None and hw_col < len(row):
        entry["huiswerk"] = _append_text(entry.get("huiswerk"), row[hw_col])

    opd_col = idx.get("opdracht")
    if opd_col is not None and opd_col < len(row):
        entry["opdracht"] = _append_text(entry.get("opdracht"), row[opd_col])

    inl_col = idx.get("inlever")
    if inl_col is not None and inl_col < len(row):
        candidate = parse_date_cell(row[inl_col], schooljaar)
        if candidate:
            entry["inleverdatum"] = candidate

    toets_col = idx.get("toets")
    if toets_col is not None and toets_col < len(row):
        entry["toets_text"] = _append_text(entry.get("toets_text"), row[toets_col])

    bron_col = idx.get("bronnen")
    if bron_col is not None and bron_col < len(row):
        entry["bronnen_text"] = _append_text(entry.get("bronnen_text"), row[bron_col])

    not_col = idx.get("notities")
    if not_col is not None and not_col < len(row):
        entry["notities"] = _append_text(entry.get("notities"), row[not_col])

    klas_col = idx.get("klas")
    if klas_col is not None and klas_col < len(row):
        entry["klas"] = _append_text(entry.get("klas"), row[klas_col])

    loc_col = idx.get("locatie")
    if loc_col is not None and loc_col < len(row):
        entry["locatie"] = _append_text(entry.get("locatie"), row[loc_col])


def _flush_pdf_entry(entry: dict, schooljaar: Optional[str]) -> List[DocRow]:
    weeks = [w for w in entry.get("weeks", []) if 1 <= w <= 53]
    if not weeks:
        return []

    onderwerp = entry.get("onderwerp") or entry.get("les")
    leerdoelen = entry.get("leerdoelen")
    huiswerk = entry.get("huiswerk")
    opdracht = entry.get("opdracht")
    inleverdatum = entry.get("inleverdatum")
    toets_text = entry.get("toets_text")
    bronnen_text = entry.get("bronnen_text")

    toets_info = parse_toets_cell(toets_text) if toets_text else None
    if not inleverdatum:
        for source in (opdracht, toets_text):
            if source:
                candidate = parse_date_cell(source, schooljaar)
                if candidate:
                    inleverdatum = candidate
                    break

    bronnen = find_urls(bronnen_text) if bronnen_text else None

    rows: List[DocRow] = []
    for w in weeks:
        rows.append(
            DocRow(
                week=w,
                datum=entry.get("datum"),
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
            )
        )
    return rows


def _extract_rows_with_tables(path: str, schooljaar: Optional[str]) -> List[DocRow]:
    if pdfplumber is None:
        return []

    results: List[DocRow] = []
    for tbl in _iter_pdf_tables(path):
        if len(tbl) < 2:
            continue

        headers = [normalize_text(c or "") for c in tbl[0]]
        week_col = find_header_idx(headers, WEEK_HEADER_KEYWORDS)
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
        for raw_row in tbl[1:]:
            if not any(cell for cell in raw_row if cell):
                continue

            row = [cell or "" for cell in raw_row]

            weeks: List[int] = []
            week_text = None
            if week_col is not None and week_col < len(row):
                week_text = row[week_col]
                weeks = parse_week_cell(week_text)
                if not weeks and week_col > 0 and week_col - 1 < len(row):
                    alt_text = row[week_col - 1]
                    alt_weeks = parse_week_cell(alt_text)
                    if alt_weeks:
                        week_text = alt_text
                        weeks = alt_weeks
                if not weeks and week_col + 1 < len(row):
                    alt_text = row[week_col + 1]
                    alt_weeks = parse_week_cell(alt_text)
                    if alt_weeks:
                        week_text = alt_text
                        weeks = alt_weeks
            elif date_col is not None and date_col < len(row):
                iso = parse_date_cell(row[date_col], schooljaar)
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
                datum = None
                if date_col is not None and date_col < len(row):
                    datum = parse_date_cell(row[date_col], schooljaar)
                if not datum and week_text:
                    datum = parse_date_cell(week_text, schooljaar)
                current = {
                    "weeks": filtered,
                    "datum": datum,
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
                }
                _update_pdf_entry(current, row, idx, schooljaar)
            else:
                if current is None:
                    continue
                if week_text and not current.get("datum"):
                    candidate = parse_date_cell(week_text, schooljaar)
                    if candidate:
                        current["datum"] = candidate
                _update_pdf_entry(current, row, idx, schooljaar)

        if current:
            results.extend(_flush_pdf_entry(current, schooljaar))

    return results


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

    table_rows = _extract_rows_with_tables(path, schooljaar)
    if table_rows:
        return table_rows

    rows: List[DocRow] = []
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
            datum = parse_date_cell(line, schooljaar)

            for w in weeks:
                rows.append(
                    DocRow(
                        week=w,
                        datum=datum,
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
