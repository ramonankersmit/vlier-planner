"""Parser keyword configuration.

Alle sleutelwoorden voor tabellen, deadlines en vakanties staan
gecentraliseerd in dit bestand zodat uitbreiden mogelijk is zonder code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
from typing import Tuple


@dataclass(frozen=True)
class ParserKeywordConfig:
    week_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("weeknummer", "week nr", "weeknr", "week", "wk")
    )
    date_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("datum", "weekdatum", "date", "start", "begin")
    )
    lesson_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("les", "lesnr", "lesnummer")
    )
    subject_headers: Tuple[str, ...] = field(
        default_factory=lambda: (
            "onderwerp",
            "thema",
            "hoofdstuk",
            "chapter",
            "topic",
            "lesstof",
            "in les",
            "grammatica",
        )
    )
    objective_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("leerdoelen", "doelen")
    )
    homework_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("huiswerk", "maken", "leren", "planning teksten")
    )
    assignment_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("opdracht", "k-tekst")
    )
    handin_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("inleverdatum", "deadline", "inleveren voor")
    )
    exam_headers: Tuple[str, ...] = field(
        default_factory=lambda: (
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
    )
    resource_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("bron", "bronnen", "links", "link", "boek")
    )
    note_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("opmerking", "notitie", "remarks")
    )
    class_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("klas", "groep")
    )
    location_headers: Tuple[str, ...] = field(
        default_factory=lambda: ("locatie", "lokaal")
    )
    deadline_terms: Tuple[str, ...] = field(
        default_factory=lambda: (
            "inlever",
            "deadline",
            "inleveren",
            "inlevermoment",
            "inleverdatum",
        )
    )
    holiday_terms: Tuple[str, ...] = field(
        default_factory=lambda: (
            "vakantie",
            "herfstvakantie",
            "kerstvakantie",
            "voorjaarsvakantie",
            "meivakantie",
            "zomervakantie",
        )
    )


def _load_overrides(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - config errors runtime
        raise RuntimeError(f"Ongeldige JSON in parser keyword-config: {path}") from exc
    if not isinstance(data, dict):
        raise RuntimeError("Keyword-config moet een JSON-object zijn")
    return data


def get_keyword_config() -> ParserKeywordConfig:
    """Return a keyword-config, optionally overridden via env."""

    overrides: dict | None = None
    env_value = os.environ.get("VLIER_PARSER_KEYWORDS")
    if env_value:
        override_path = Path(env_value)
        if override_path.is_file():
            overrides = _load_overrides(override_path)

    base = ParserKeywordConfig()
    if not overrides:
        return base

    payload = {}
    for field_name in base.__dataclass_fields__:
        value = overrides.get(field_name) if isinstance(overrides, dict) else None
        if not value:
            payload[field_name] = getattr(base, field_name)
            continue
        if isinstance(value, str):
            payload[field_name] = (value,)
        else:
            payload[field_name] = tuple(str(v) for v in value if str(v).strip())
    return ParserKeywordConfig(**payload)


__all__ = ["ParserKeywordConfig", "get_keyword_config"]

