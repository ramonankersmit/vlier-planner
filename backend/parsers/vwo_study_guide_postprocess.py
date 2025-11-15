from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Iterable, List, Optional, Tuple


@dataclass
class StudyEntry:
    subject: str
    week: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    lesson_text: str = ""
    homework_text: str = ""
    assessment_text: str = ""
    remarks_text: str = ""
    is_vacation: bool = False
    is_exam: bool = False
    meta: dict = field(default_factory=dict)


EXAM_KEYWORDS = (
    "so",
    "pw",
    "se",
    "te1",
    "te2",
    "klt",
    "proefwerk",
    "tentamen",
    "praktische opdracht",
    "presentatie",
    "toetsweek",
    "toets",
    "kijk- en luistertoets",
)

_DAY_EVENT_PATTERN = re.compile(
    r"^(ma|di|wo|do|vr|za|zo)\.?\s*\d{1,2}(?:\s*(?:[\-/.]\s*\d{1,2}|[A-Za-zÀ-ÿ]+))?",
    re.I,
)


def _looks_like_only_metadata(text: str) -> bool:
    cleaned = (text or "").strip()
    if not cleaned:
        return True
    stripped = re.sub(r"[0-9\s\-/:.,]", "", cleaned)
    return not stripped


def _is_vacation_text(text: str) -> bool:
    lower = (text or "").lower()
    if not lower:
        return False
    return "vakantie" in lower or "lesvrij" in lower or "vrije dag" in lower


def _is_exam_text(text: str) -> bool:
    lower = (text or "").lower()
    if not lower:
        return False
    compact = re.sub(r"[\s\-]", "", lower)
    for keyword in EXAM_KEYWORDS:
        kw_lower = keyword.lower()
        kw_compact = kw_lower.replace(" ", "").replace("-", "")
        if kw_lower in lower or kw_compact in compact:
            return True
    return False


def _normalize_exam_label(text: str) -> str:
    lower = (text or "").lower()
    if not lower:
        return "Toets"
    for pattern in (
        r"(toetsweek\s*\d*)",
        r"(kijk[\s\-]*en[\s\-]*luistertoets)",
        r"(te\s*[12])",
        r"(klt)",
    ):
        match = re.search(pattern, lower, re.I)
        if match:
            label = match.group(1).strip()
            if label.lower().startswith("te"):
                return label.replace(" ", "").upper()
            if label.lower() == "klt":
                return "KLT"
            return label.title()
    for keyword in EXAM_KEYWORDS:
        kw = keyword.lower()
        if kw in lower:
            return keyword.upper() if len(keyword) <= 3 else keyword.title()
    return "Toets"


def _split_remarks_day_events(text: str) -> Tuple[List[str], List[str]]:
    events: List[str] = []
    remainder: List[str] = []
    raw_text = text or ""
    if not raw_text.strip():
        return events, remainder
    for fragment in re.split(r"[\r\n;]+", raw_text):
        cleaned = fragment.strip()
        if not cleaned:
            continue
        if _DAY_EVENT_PATTERN.match(cleaned):
            events.append(cleaned)
        else:
            remainder.append(cleaned)
    return events, remainder


def postprocess_entries(entries: Iterable[StudyEntry]) -> List[StudyEntry]:
    cleaned: List[StudyEntry] = []
    for entry in entries:
        extra_texts = entry.meta.get("extra_texts") if isinstance(entry.meta, dict) else None
        combined_fields: List[str] = []
        for value in (
            entry.lesson_text,
            entry.homework_text,
            entry.assessment_text,
            entry.remarks_text,
        ):
            if value:
                combined_fields.append(value)
        if isinstance(extra_texts, list):
            combined_fields.extend(str(value) for value in extra_texts if value)
        all_text = " ".join(part for part in combined_fields if part).strip()

        if entry.is_vacation or _is_vacation_text(all_text):
            entry.is_vacation = True
            lower_all = all_text.lower()
            if "kerst" in lower_all:
                entry.lesson_text = "Kerstvakantie"
            elif entry.lesson_text:
                entry.lesson_text = entry.lesson_text
            else:
                entry.lesson_text = "Vakantie"
            entry.homework_text = ""
            entry.assessment_text = ""
            entry.remarks_text = ""
            cleaned.append(entry)
            continue

        if not all_text or _looks_like_only_metadata(all_text):
            continue

        subject_lower = (entry.subject or "").strip().lower()
        if subject_lower.startswith("ckv"):
            if _is_exam_text(all_text):
                entry.is_exam = True
                entry.assessment_text = _normalize_exam_label(all_text)
                entry.homework_text = ""
                entry.remarks_text = ""
            else:
                merged = " ".join(
                    part
                    for part in (entry.homework_text, entry.assessment_text, entry.remarks_text)
                    if part
                ).strip()
                entry.homework_text = merged
                entry.assessment_text = ""
                entry.remarks_text = ""
            cleaned.append(entry)
            continue

        if subject_lower.startswith("duits"):
            day_events, remainder = _split_remarks_day_events(entry.remarks_text)
            if day_events and isinstance(entry.meta, dict):
                exam_events = entry.meta.setdefault("exam_events", [])
                if isinstance(exam_events, list):
                    exam_events.extend(day_events)
                if _is_exam_text(" ".join(day_events)):
                    entry.is_exam = True
            entry.remarks_text = "\n".join(remainder).strip()
            cleaned.append(entry)
            continue

        if _is_exam_text(all_text):
            entry.is_exam = True

        cleaned.append(entry)

    return cleaned
