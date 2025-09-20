# eenvoudige re-export, met absolute imports intern
from .parser_docx import (
    extract_meta_from_docx,
    extract_rows_from_docx,
    extract_all_periods_from_docx,
)

try:  # pragma: no cover
    from .parser_pdf import extract_meta_from_pdf, extract_rows_from_pdf
except Exception:  # pdfplumber kan ontbreken
    extract_meta_from_pdf = extract_rows_from_pdf = None  # type: ignore
