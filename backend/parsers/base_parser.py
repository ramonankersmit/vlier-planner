"""Shared parser utilities for DOCX and PDF imports."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
import re
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .config import ParserKeywordConfig, get_keyword_config

try:  # pragma: no cover - relative import fallback for scripts
    from ..models import DocRow
except ImportError:  # pragma: no cover
    from models import DocRow  # type: ignore


RE_DATE_DMY = re.compile(r"\b(\d{1,2})[\-/](\d{1,2})(?:[\-/](\d{2,4}))?\b")
RE_DATE_TEXTUAL = re.compile(r"\b(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+((?:20)?\d{2})\b", re.I)
RE_HOLIDAY_FILLER = re.compile(
    r"(?i)\b(geen|vrij|vrije dag|lesvrij|geen les|geen huiswerk|huiswerk|les|i\.v\.m|ivm)\b"
)

RE_WEEK_LEADING = re.compile(r"^\s*(\d{1,2})(?:\s*[/\-]\s*(\d{1,2}))?")
RE_WEEK_PAIR = re.compile(r"\b(\d{1,2})\s*[/\-]\s*(\d{1,2})\b")
RE_WEEK_SOLO = re.compile(r"\b(?:wk|week)\s*(\d{1,2})\b", re.I)
RE_NUM_PURE = re.compile(r"^\s*(\d{1,2})\s*$")
RE_WEEK_WORD = re.compile(r"(?i)\bweek\b")
RE_NUMERIC_FIELD = re.compile(r"^[0-9\s\-/,:]+$")
RE_TRAILING_DATE_TOKEN = re.compile(
    r"(\b\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}\b|\b\d{1,2}[\-/]\d{1,2}\b|\b\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+(?:20)?\d{2}\b)\s*$",
    re.I,
)
RE_TRAILING_DATE_CONNECTOR = re.compile(
    r"(?i)(?:t/m|t\.m\.|t\.e\.m\.?|tm|tot(?:\s+en\s+met)?|totenmet|van|vanaf)\s*$",
)
RE_NUMERIC_DATE_WITH_YEAR = re.compile(r"^\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}$")
RE_NUMERIC_DATE_SHORT = re.compile(r"^\d{1,2}[\-/]\d{1,2}$")
RE_TEXTUAL_DATE_FULL = re.compile(r"^\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+(?:20)?\d{2}$", re.I)


def _strip_trailing_dates(text: str) -> str:
    """Strip trailing date-looking tokens while keeping exercise ranges intact."""

    trimmed = text
    removed_tokens = 0
    has_strong_token = False
    while trimmed:
        trimmed = trimmed.rstrip(" ,.;:-()")
        if not trimmed:
            break
        connector_match = RE_TRAILING_DATE_CONNECTOR.search(trimmed)
        if connector_match and removed_tokens > 0:
            trimmed = trimmed[: connector_match.start()]
            continue
        token_match = RE_TRAILING_DATE_TOKEN.search(trimmed)
        if not token_match:
            break
        token = token_match.group(1)
        if RE_NUMERIC_DATE_WITH_YEAR.fullmatch(token) or RE_TEXTUAL_DATE_FULL.fullmatch(token):
            trimmed = trimmed[: token_match.start()]
            removed_tokens += 1
            has_strong_token = True
            continue
        if RE_NUMERIC_DATE_SHORT.fullmatch(token):
            prefix = trimmed[: token_match.start()]
            if has_strong_token or removed_tokens > 0 or _ends_with_date_connector(prefix):
                trimmed = trimmed[: token_match.start()]
                removed_tokens += 1
                continue
        break
    return trimmed.rstrip(" ,.;:-()")


def _ends_with_date_connector(text: str) -> bool:
    stripped = text.rstrip(" ,.;:-()")
    if not stripped:
        return False
    return bool(RE_TRAILING_DATE_CONNECTOR.search(stripped))


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


@dataclass
class RawEntry:
    """Interne structuur die zowel DOCX als PDF gebruiken."""

    weeks: List[int] = field(default_factory=list)
    week_span_start: Optional[int] = None
    week_span_end: Optional[int] = None
    week_label: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    lesson: Optional[str] = None
    topic: Optional[str] = None
    objectives: Optional[List[str]] = None
    homework: Optional[str] = None
    assignment: Optional[str] = None
    deadline_text: Optional[str] = None
    due_date: Optional[str] = None
    exam: Optional[Dict[str, Optional[str]]] = None
    resources: Optional[List[Dict[str, str]]] = None
    notes: Optional[str] = None
    class_label: Optional[str] = None
    location: Optional[str] = None
    source_row_id: Optional[str] = None
    enabled: bool = True
    is_holiday: bool = False

    def to_doc_row(self) -> DocRow:
        """Converteer terug naar DocRow voor legacy callers."""

        week_value = None
        if self.weeks:
            week_value = self.weeks[0] if len(self.weeks) == 1 else None
        return DocRow(
            week=week_value,
            weeks=self.weeks or None,
            week_span_start=self.week_span_start,
            week_span_end=self.week_span_end,
            week_label=self.week_label,
            datum=self.start_date,
            datum_eind=self.end_date,
            les=self.lesson,
            onderwerp=self.topic,
            leerdoelen=self.objectives,
            huiswerk=self.homework,
            opdracht=self.assignment,
            inleverdatum=self.due_date,
            toets=self.exam,
            bronnen=self.resources,
            notities=self.notes,
            klas_of_groep=self.class_label,
            locatie=self.location,
            source_row_id=self.source_row_id,
            enabled=self.enabled,
        )


@dataclass
class WeekCellParseResult:
    weeks: List[int]
    week_span_start: Optional[int]
    week_span_end: Optional[int]
    label: Optional[str]


class BaseParser:
    """Bundelt gedeelde parserfunctionaliteit."""

    def __init__(self, keywords: ParserKeywordConfig | None = None) -> None:
        self.keywords = keywords or get_keyword_config()
        self._deadline_pattern = re.compile(
            "|".join(re.escape(term) for term in self.keywords.deadline_terms), re.I
        )
        self._holiday_pattern = re.compile(
            "|".join(re.escape(term) for term in self.keywords.holiday_terms), re.I
        )

    @staticmethod
    def normalize_text(text: Optional[str]) -> str:
        return re.sub(r"\s+", " ", (text or "").strip())

    @staticmethod
    def split_bullets(text: Optional[str]) -> Optional[List[str]]:
        if not text:
            return None
        parts = re.split(r"[\n\r\u2022\-\–\*]+", text)
        items = [BaseParser.normalize_text(p) for p in parts if BaseParser.normalize_text(p)]
        return items or None

    @staticmethod
    def find_header_idx(headers: Sequence[str], keywords: Iterable[str]) -> Optional[int]:
        norm = [BaseParser.normalize_text(h).lower() for h in headers]
        for idx, header in enumerate(norm):
            for keyword in keywords:
                if keyword.lower() in header:
                    return idx
        return None

    def parse_week_cell_details(self, text: Optional[str]) -> WeekCellParseResult:
        raw = self._weeks_from_week_cell(text or "")
        return self._make_week_result(raw, (text or "").strip() or None)

    def parse_week_cell(self, text: str) -> List[int]:
        return self._weeks_from_week_cell(text)

    def parse_date_cell(self, text: Optional[str], schooljaar: Optional[str]) -> Optional[str]:
        dates = self._extract_dates_from_text(text, schooljaar)
        return dates[0] if dates else None

    def parse_date_range_cell(
        self, text: Optional[str], schooljaar: Optional[str]
    ) -> Tuple[Optional[str], Optional[str]]:
        dates = self._extract_dates_from_text(text, schooljaar)
        if not dates:
            return None, None
        if len(dates) == 1:
            return dates[0], None
        return dates[0], dates[-1]

    @staticmethod
    def find_urls(text: Optional[str]) -> Optional[List[Dict[str, str]]]:
        if not text:
            return None
        urls = re.findall(r"https?://\S+", text)
        out: List[Dict[str, str]] = []
        for url in urls:
            title = url.split("/")[-1] or url
            out.append({"type": "link", "title": title, "url": url})
        return out or None

    @staticmethod
    def parse_toets_cell(text: Optional[str]) -> Optional[Dict[str, Optional[str]]]:
        if not text or not BaseParser.normalize_text(text):
            return None
        lower = text.lower()
        compact = re.sub(r"[\s\-]+", "", lower)
        ttype = None
        for kw, label in (
            ("so", "SO"),
            ("pw", "PW"),
            ("se", "SE"),
            ("te1", "TE1"),
            ("te2", "TE2"),
            ("klt", "KLT"),
        ):
            if re.search(rf"\b{re.escape(kw)}\b", lower) or kw in compact:
                ttype = label
                break
        if not ttype:
            for kw in (
                "proefwerk",
                "tentamen",
                "praktische opdracht",
                "presentatie",
                "toetsweek",
                "kijk- en luistertoets",
                "kijk en luistertoets",
                "toets",
            ):
                normalized_kw = kw.replace(" ", "")
                if kw in lower or normalized_kw in compact:
                    ttype = kw
                    break
        weight = None
        match = re.search(r"weging\s*(\d+)", lower)
        if match:
            weight = match.group(1)
        else:
            match = re.search(r"(\d+)\s*(?:x|%)", lower)
            if match:
                weight = match.group(1)
        herk = "onbekend"
        if "herkans" in lower:
            if "nee" in lower or "niet" in lower:
                herk = "nee"
            elif "ja" in lower:
                herk = "ja"
        return {"type": ttype or BaseParser.normalize_text(text), "weging": weight, "herkansing": herk}

    @staticmethod
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

    def to_raw_entry(self, row: DocRow) -> RawEntry:
        weeks: List[int] = []
        if isinstance(row.weeks, list):
            weeks = [w for w in row.weeks if isinstance(w, int)]
        if not weeks and isinstance(row.week, int):
            weeks = [row.week]

        lesson = self._sanitize_row_value(row, row.les)
        topic = self._sanitize_row_value(row, row.onderwerp)
        homework = self._sanitize_row_value(row, row.huiswerk)
        assignment = self._sanitize_row_value(row, row.opdracht)
        notes = self._sanitize_row_value(row, row.notities)

        deadline_text, due_date = self._detect_deadline(
            row,
            assignment=assignment,
            homework=homework,
            notes=notes,
            topic=topic,
            lesson=lesson,
        )
        is_holiday = self._detect_holiday(row)

        return RawEntry(
            weeks=weeks,
            week_span_start=row.week_span_start,
            week_span_end=row.week_span_end,
            week_label=row.week_label,
            start_date=row.datum,
            end_date=row.datum_eind,
            lesson=lesson,
            topic=topic,
            objectives=row.leerdoelen,
            homework=homework,
            assignment=assignment,
            deadline_text=deadline_text,
            due_date=due_date,
            exam=row.toets if isinstance(row.toets, dict) else None,
            resources=row.bronnen if isinstance(row.bronnen, list) else None,
            notes=notes,
            class_label=row.klas_of_groep,
            location=row.locatie,
            source_row_id=row.source_row_id,
            enabled=row.enabled,
            is_holiday=is_holiday,
        )

    def _detect_deadline(
        self,
        row: DocRow,
        *,
        assignment: Optional[str],
        homework: Optional[str],
        notes: Optional[str],
        topic: Optional[str],
        lesson: Optional[str],
    ) -> Tuple[Optional[str], Optional[str]]:
        due_date = row.inleverdatum
        label: Optional[str] = None
        fields = [assignment, homework, notes, topic, lesson]
        for field in fields:
            if not field:
                continue
            if self._deadline_pattern.search(field):
                label = field
                break
        if not label and due_date:
            label = assignment or topic or "Inlevermoment"
        if label:
            return label, due_date
        return None, due_date

    def _sanitize_row_value(self, row: DocRow, value: Optional[str]) -> Optional[str]:
        normalized = self.normalize_text(value)
        if not normalized:
            return None
        normalized = _strip_trailing_dates(normalized)
        normalized = normalized.strip(" .,:;-–—")
        if not normalized:
            return None
        normalized_lower = normalized.lower()
        label = self.normalize_text(row.week_label)
        if label:
            label = _strip_trailing_dates(label)
            label = label.strip(" .,:;-–—")
            variants = [label]
            stripped = self.normalize_text(RE_WEEK_WORD.sub(" ", row.week_label or ""))
            if stripped:
                stripped = _strip_trailing_dates(stripped)
                stripped = stripped.strip(" .,:;-–—")
            if stripped and stripped not in variants:
                variants.append(stripped)
            for candidate in variants:
                if candidate and normalized_lower == candidate.lower():
                    return None
        if RE_NUMERIC_FIELD.fullmatch(normalized):
            return None
        return normalized

    def _detect_holiday(self, row: DocRow) -> bool:
        def _has_real_work(value: Optional[str]) -> bool:
            if not value:
                return False
            normalized = self.normalize_text(value)
            if not normalized:
                return False
            if RE_NUMERIC_FIELD.fullmatch(normalized):
                return False
            if self._holiday_pattern.search(normalized):
                stripped = self._holiday_pattern.sub(" ", normalized)
                stripped = RE_HOLIDAY_FILLER.sub(" ", stripped)
                stripped = stripped.strip(" ,.;:-()")
                if not stripped:
                    return False
            return True

        fields = [
            row.week_label,
            row.onderwerp,
            row.les,
            row.notities,
            row.huiswerk,
            row.opdracht,
        ]
        has_work = any(_has_real_work(value) for value in (row.huiswerk, row.opdracht)) or bool(row.toets)
        for field in fields:
            if field and self._holiday_pattern.search(field):
                return not has_work
        return False

    @staticmethod
    def entries_from_rows(rows: Sequence[DocRow], parser: Optional["BaseParser"] = None) -> List[RawEntry]:
        parser = parser or BaseParser()
        return [parser.to_raw_entry(row) for row in rows]

    @staticmethod
    def rows_from_entries(entries: Sequence[RawEntry]) -> List[DocRow]:
        return [entry.to_doc_row() for entry in entries]

    def _extract_dates_from_text(self, text: Optional[str], schooljaar: Optional[str]) -> List[str]:
        if not text:
            return []
        normalized = self.normalize_text(text)
        if not normalized:
            return []

        matches: List[Tuple[int, str]] = []

        def _resolve_year(month: int, explicit: Optional[str]) -> Optional[int]:
            if explicit:
                try:
                    year = int(explicit)
                except ValueError:
                    return None
                if year < 100:
                    year += 2000
                if year < 1900 or year > 2100:
                    return None
                return year
            if schooljaar:
                try:
                    a_val, b_val = [int(part) for part in schooljaar.split("/")]
                    return a_val if month >= 8 else b_val
                except Exception:
                    pass
            return date.today().year

        for match in RE_DATE_DMY.finditer(normalized):
            day = int(match.group(1))
            month = int(match.group(2))
            if not (1 <= day <= 31 and 1 <= month <= 12):
                continue
            year = _resolve_year(month, match.group(3))
            if year is None:
                continue
            matches.append((match.start(), f"{year:04d}-{month:02d}-{day:02d}"))

        for match in RE_DATE_TEXTUAL.finditer(normalized):
            day = int(match.group(1))
            month = MONTHS_NL.get(match.group(2).lower())
            if not month or not (1 <= day <= 31):
                continue
            year = _resolve_year(month, match.group(3))
            if year is None:
                continue
            matches.append((match.start(), f"{year:04d}-{month:02d}-{day:02d}"))

        matches.sort(key=lambda item: item[0])
        seen: set[str] = set()
        ordered: List[str] = []
        for _, iso in matches:
            if iso in seen:
                continue
            seen.add(iso)
            ordered.append(iso)
        return ordered

    def _weeks_from_week_cell(self, text: str) -> List[int]:
        cleaned = self.normalize_text(text)
        if not cleaned:
            return []

        # Harmoniseer koppeltekens zodat patronen als "52–53" of "52—53"
        # hetzelfde behandeld worden als reguliere streepjes.
        cleaned = (
            cleaned.replace("–", "-")
            .replace("—", "-")
            .replace("−", "-")
            .replace("‑", "-")
        )

        # Verwijder expliciete datumreeksen ("26-08 t/m 30-08" of
        # "26/08/2025 t/m 30/08/2025") voordat we naar weeknummers zoeken. De
        # dag/maandcombinaties vallen namelijk ook binnen het bereik 1-53 en
        # werden voorheen aangezien voor extra weken.
        cleaned = re.sub(
            r"\b\d{1,2}\s*[-/]\s*\d{1,2}(?:\s*[-/]\s*\d{2,4})?\s*(?:t\s*/\s*m|t\s*-\s*m|tm|tot)\s*\d{1,2}\s*[-/]\s*\d{1,2}(?:\s*[-/]\s*\d{2,4})?\b",
            " ",
            cleaned,
            flags=re.I,
        )

        # Verwijder resterende volledige datums (dd-mm-yyyy of dd/mm/yyyy)
        # zodat dag/maandwaarden niet als weeknummers worden opgepikt.
        cleaned = re.sub(
            r"\b\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{2,4}\b",
            " ",
            cleaned,
        )

        # Zet verbindingswoorden zoals "en" of "&" tussen getallen om naar
        # een slash zodat combinaties als "51 en 1" of "1 & 2" dezelfde route
        # volgen als reguliere "1/2"-notatie.
        cleaned = re.sub(
            r"(?<=\d)\s*(?:&|\+|en)\s*(?=\d)",
            "/",
            cleaned,
            flags=re.I,
        )

        weeks: List[int] = []

        lead = RE_WEEK_LEADING.search(cleaned)
        if lead:
            a = int(lead.group(1))
            b = lead.group(2)
            if 1 <= a <= 53:
                weeks.append(a)
            if b:
                b_val = int(b)
                if 1 <= b_val <= 53:
                    weeks.append(b_val)

        for m in RE_WEEK_PAIR.finditer(cleaned):
            a, b = int(m.group(1)), int(m.group(2))
            if 1 <= a <= 53:
                weeks.append(a)
            if 1 <= b <= 53:
                weeks.append(b)

        for m in RE_WEEK_SOLO.finditer(cleaned):
            value = int(m.group(1))
            if 1 <= value <= 53:
                weeks.append(value)

        # Wanneer cellen meerdere getallen via koppeltekens of slashes
        # combineren (bijv. "52-1-2"), lopen we alle getallen opnieuw af in
        # oorspronkelijke volgorde zodat geen weken wegvallen.
        if re.search(r"\d\s*[-/]\s*\d", cleaned):
            for match in re.finditer(r"(?<!\d)(\d{1,2})(?!\d)", cleaned):
                value = int(match.group(1))
                if 1 <= value <= 53:
                    weeks.append(value)

        pure = RE_NUM_PURE.match(cleaned)
        if pure:
            value = int(pure.group(1))
            if 1 <= value <= 53:
                weeks.append(value)

        ordered: List[int] = []
        seen: set[int] = set()
        for w in weeks:
            if w in seen:
                continue
            seen.add(w)
            ordered.append(w)
        return ordered

    @staticmethod
    def _make_week_result(weeks: Iterable[int], label: Optional[str]) -> WeekCellParseResult:
        ordered = list(weeks)
        unique: List[int] = []
        seen: set[int] = set()
        for value in ordered:
            if value in seen:
                continue
            seen.add(value)
            unique.append(value)
        start = unique[0] if unique else None
        end = unique[-1] if unique else None
        return WeekCellParseResult(unique, start, end, label)


def extract_schooljaar_from_text(text: Optional[str]) -> Optional[str]:
    """Herbruikte helper voor docx/pdf parsers."""

    text = text or ""
    def _normalize_year_fragment(part: str) -> Optional[int]:
        part = (part or "").strip()
        if not part:
            return None
        try:
            value = int(part)
        except ValueError:
            return None
        if len(part) <= 2:
            if value > 50:
                return None
            value += 2000
        elif value < 1900 or value > 2100:
            return None
        return value

    def _format_schooljaar(a: str, b: str) -> Optional[str]:
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

    def _iter_dates_with_year(blob: str) -> List[Tuple[int, int]]:
        results: List[Tuple[int, int]] = []
        for match in RE_DATE_DMY.finditer(blob):
            try:
                month = int(match.group(2))
                year_raw = match.group(3)
                year = int(year_raw) if year_raw else 0
            except (TypeError, ValueError):
                continue
            if len(year_raw or "") <= 2:
                year += 2000
            if not (1 <= month <= 12) or year < 1900 or year > 2100:
                continue
            results.append((year if month >= 8 else year - 1, month))
        for match in RE_DATE_TEXTUAL.finditer(blob):
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
            results.append((year if month >= 8 else year - 1, month))
        return results

    def _infer_schooljaar_from_dates(blob: str) -> Optional[str]:
        stats = {}
        for year, month in _iter_dates_with_year(blob):
            end_year = year + 1
            bucket = stats.setdefault((year, end_year), {"count": 0, "has_autumn": False, "has_spring": False})
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

    best: Optional[str] = None
    best_score = -1
    for match in re.finditer(r"((?:20)?\d{2})\s*[/\-]\s*((?:20)?\d{2})", text):
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
        return best
    return _infer_schooljaar_from_dates(text)


__all__ = ["BaseParser", "RawEntry", "WeekCellParseResult", "extract_schooljaar_from_text"]

