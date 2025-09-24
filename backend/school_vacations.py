"""Utilities voor het ophalen en parsen van schoolvakanties van rijksoverheid.nl."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Awaitable, Callable, List, Optional

import httpx
from lxml import html

MONTHS = {
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

SCHOOL_YEAR_RE = re.compile(r"^(?P<start>\d{4})-(?P<end>\d{4})$")

RANGE_PATTERN = re.compile(
    r"(\d{1,2}\s+[a-zäëïöüé]+(?:\s+\d{4})?)\s*(?:t/m|tm|tot en met|\-|–)\s*(\d{1,2}\s+[a-zäëïöüé]+(?:\s+\d{4})?)",
    re.IGNORECASE,
)

DATE_PATTERN = re.compile(r"(\d{1,2})\s+([a-zäëïöüé]+)(?:\s+(\d{4}))?", re.IGNORECASE)


@dataclass
class SchoolVacation:
    """Gestructureerde informatie over één vakantieperiode."""

    id: str
    name: str
    region: str
    start_date: str
    end_date: str
    school_year: str
    source: str
    label: str
    raw_text: str
    notes: Optional[str] = None

    def to_api(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "region": self.region,
            "startDate": self.start_date,
            "endDate": self.end_date,
            "schoolYear": self.school_year,
            "source": self.source,
            "label": self.label,
            "rawText": self.raw_text,
            "notes": self.notes,
        }


def _normalize_school_year(school_year: str) -> tuple[str, int, int]:
    match = SCHOOL_YEAR_RE.match(school_year.strip())
    if not match:
        raise ValueError("Ongeldig schooljaarformaat. Verwacht JJJJ-JJJJ")
    start_year = int(match.group("start"))
    end_year = int(match.group("end"))
    if end_year - start_year != 1:
        raise ValueError("Schooljaar moet twee opeenvolgende jaren bevatten")
    return school_year, start_year, end_year


def _build_source_url(school_year: str) -> str:
    normalized, _, _ = _normalize_school_year(school_year)
    return (
        "https://www.rijksoverheid.nl/onderwerpen/schoolvakanties/"
        "overzicht-schoolvakanties-per-schooljaar/"
        f"overzicht-schoolvakanties-{normalized}"
    )


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "vakantie"


def _clean_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text)
    cleaned = cleaned.replace("\xa0", " ").strip()
    return cleaned


def _parse_single_date(text: str, start_year: int, end_year: int) -> date:
    match = DATE_PATTERN.search(text.strip())
    if not match:
        raise ValueError(f"Kan datum niet parsen uit '{text}'")
    day_str, month_name, year_str = match.groups()
    day = int(re.sub(r"\D", "", day_str))
    month_key = month_name.lower()
    if month_key not in MONTHS:
        raise ValueError(f"Onbekende maandnaam '{month_name}' in '{text}'")
    month = MONTHS[month_key]
    if year_str:
        year = int(year_str)
    else:
        year = start_year if month >= 7 else end_year
    return date(year, month, day)


def _extract_ranges(content: str, start_year: int, end_year: int) -> List[tuple[date, date, str]]:
    cleaned = _clean_text(content)
    ranges: List[tuple[date, date, str]] = []
    for match in RANGE_PATTERN.finditer(cleaned):
        raw = match.group(0)
        start_txt, end_txt = match.groups()
        try:
            start_dt = _parse_single_date(start_txt, start_year, end_year)
            end_dt = _parse_single_date(end_txt, start_year, end_year)
        except ValueError:
            continue
        if end_dt < start_dt:
            # Als de parsing een verkeerd jaar oplevert, forceer de volgorde
            start_dt, end_dt = end_dt, start_dt
        ranges.append((start_dt, end_dt, raw))

    if not ranges:
        single_match = DATE_PATTERN.search(cleaned)
        if single_match:
            try:
                single_date = _parse_single_date(single_match.group(0), start_year, end_year)
                ranges.append((single_date, single_date, single_match.group(0)))
            except ValueError:
                pass

    return ranges


def _parse_cell(
    name: str,
    region: str,
    cell: html.HtmlElement,
    start_year: int,
    end_year: int,
    school_year: str,
    source_url: str,
) -> List[SchoolVacation]:
    raw_text = " ".join(t.strip() for t in cell.itertext())
    cleaned = _clean_text(raw_text)
    if not cleaned or cleaned in {"-", "—", "n.v.t."}:
        return []

    ranges = _extract_ranges(cleaned, start_year, end_year)
    if not ranges:
        return []

    notes_match = re.sub(RANGE_PATTERN, "", cleaned).strip()
    notes = notes_match if notes_match else None
    vacations: List[SchoolVacation] = []
    for start_dt, end_dt, label in ranges:
        vac_id = f"{_slugify(name)}-{_slugify(region)}-{start_dt.isoformat()}-{end_dt.isoformat()}"
        vacations.append(
            SchoolVacation(
                id=vac_id,
                name=name,
                region=region,
                start_date=start_dt.isoformat(),
                end_date=end_dt.isoformat(),
                school_year=school_year,
                source=source_url,
                label=_clean_text(label),
                raw_text=cleaned,
                notes=notes,
            )
        )
    return vacations


def parse_school_vacations(html_content: str, school_year: str, source_url: str) -> List[SchoolVacation]:
    _, start_year, end_year = _normalize_school_year(school_year)
    doc = html.fromstring(html_content)

    tables = doc.xpath(
        "//table[.//th[contains(translate(normalize-space(.), 'VAKANTIE', 'vakantie'), 'vakantie')]]"
    )
    if not tables:
        raise ValueError("Kon geen vakantiestabel vinden in de bron")

    table = tables[0]
    header_cells = table.xpath(".//thead//tr[1]/th")
    headers = [_clean_text("".join(cell.itertext())) for cell in header_cells]
    if not headers:
        raise ValueError("De tabel bevat geen kolomkoppen")

    regions = headers[1:] if len(headers) > 1 else []

    vacations: List[SchoolVacation] = []

    for row in table.xpath(".//tbody/tr"):
        cells = row.xpath("./th|./td")
        if len(cells) <= 1:
            continue
        name = _clean_text("".join(cells[0].itertext()))
        if not name:
            continue
        for idx, cell in enumerate(cells[1:], start=1):
            region = regions[idx - 1] if idx - 1 < len(regions) else f"Kolom {idx}"
            region_clean = region.replace("Regio", "").strip().capitalize() or region
            vacations.extend(
                _parse_cell(name, region_clean, cell, start_year, end_year, school_year, source_url)
            )

    return vacations


async def _default_http_get(url: str) -> str:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(url, headers={"User-Agent": "VlierPlanner/1.0"})
        response.raise_for_status()
        return response.text


async def fetch_school_vacations(
    school_year: str,
    *,
    http_get: Optional[Callable[[str], Awaitable[str]]] = None,
) -> dict:
    """Download en parse schoolvakanties voor het opgegeven schooljaar."""

    url = _build_source_url(school_year)

    getter: Callable[[str], Awaitable[str]]
    if http_get is None:
        getter = _default_http_get  # type: ignore[assignment]
    else:
        getter = http_get

    html_content = await getter(url)
    vacations = parse_school_vacations(html_content, school_year, url)

    doc = html.fromstring(html_content)
    title = doc.xpath("string(//h1)") or doc.xpath("string(//title)") or ""
    normalized_title = _clean_text(title)

    return {
        "schoolYear": school_year,
        "source": url,
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "title": normalized_title or None,
        "vacations": [vac.to_api() for vac in vacations],
    }


__all__ = [
    "SchoolVacation",
    "fetch_school_vacations",
    "parse_school_vacations",
]

