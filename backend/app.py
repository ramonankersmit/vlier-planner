from dataclasses import dataclass
import json
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import Any, List, Optional, Union
from pathlib import Path
import mimetypes
import shutil
import uuid
from html import escape
from urllib.parse import quote

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

from models import DocMeta, DocRow  # jij gebruikt nog models.py; laat dit zo staan
from parsers import (
    extract_meta_from_docx,
    extract_rows_from_docx,
    extract_meta_from_pdf,
    extract_rows_from_pdf,
)

app = FastAPI(title="Vlier Planner API")

logger = logging.getLogger(__name__)

# CORS voor local dev (pas aan indien nodig)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Bestandsopslag (simple disk storage)
STORAGE = Path(__file__).parent / "storage" / "uploads"
STORAGE.mkdir(parents=True, exist_ok=True)
STATE_FILE = Path(__file__).parent / "storage" / "state.json"
STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

@dataclass
class StoredDoc:
    meta: DocMeta
    rows: List[DocRow]
    summary_html: Optional[str] = None


# In-memory index (MVP). Later vervangen door DB.
DOCS: dict[str, StoredDoc] = {}


def _locate_source_file(file_id: str, meta: DocMeta) -> Optional[Path]:
    """Vind het fysieke bronbestand voor een document (indien aanwezig)."""

    suffix = Path(meta.bestand).suffix.lower()
    if suffix:
        candidate = STORAGE / f"{file_id}{suffix}"
        if candidate.exists():
            return candidate

    for match in STORAGE.glob(f"{file_id}.*"):
        if match.exists():
            return match

    return None


def _row_to_dict(row: Union[DocRow, dict[str, Any]]) -> dict[str, Any]:
    if isinstance(row, DocRow):
        return row.dict()
    return dict(row)


def _format_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return escape(cleaned).replace("\n", "<br/>")


def _format_string_list(values: Optional[List[str]]) -> Optional[str]:
    if not values:
        return None
    items = [escape(item.strip()) for item in values if item and item.strip()]
    if not items:
        return None
    return "<ul style=\"margin:0; padding-left:1.2rem;\">{}</ul>".format(
        "".join(f"<li>{item}</li>" for item in items)
    )


def _format_toets(details: Optional[dict[str, Optional[str]]]) -> Optional[str]:
    if not details:
        return None
    labels = {
        "type": "Type",
        "weging": "Weging",
        "herkansing": "Herkansing",
    }
    items: list[str] = []
    for key, label in labels.items():
        value = details.get(key)
        formatted = _format_text(value) if value is not None else None
        if formatted:
            items.append(
                f"<li><strong>{escape(label)}:</strong> {formatted}</li>"
            )
    if not items:
        return None
    return "<ul style=\"margin:0; padding-left:1.2rem;\">{}</ul>".format(
        "".join(items)
    )


def _format_resources(resources: Optional[List[dict[str, Optional[str]]]]) -> Optional[str]:
    if not resources:
        return None

    items: list[str] = []
    for resource in resources:
        if not isinstance(resource, dict):
            continue
        title = resource.get("title") or resource.get("type") or resource.get("url")
        title_html = escape(title.strip()) if isinstance(title, str) and title.strip() else None
        url = resource.get("url")
        if isinstance(url, str) and url.strip():
            url_html = escape(url.strip())
            if title_html:
                items.append(
                    "<li><a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">{title}</a></li>".format(
                        url=url_html, title=title_html
                    )
                )
            else:
                items.append(
                    "<li><a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">{url}</a></li>".format(
                        url=url_html
                    )
                )
            continue

        if title_html:
            items.append(f"<li>{title_html}</li>")

    if not items:
        return None

    return "<ul style=\"margin:0; padding-left:1.2rem;\">{}</ul>".format(
        "".join(items)
    )


def _build_summary_html(meta: DocMeta, rows: List[DocRow]) -> Optional[str]:
    if not rows:
        return None

    header_parts = [escape(meta.vak)]
    header_parts.append(f"Periode {meta.periode}")
    header_parts.append(f"Niveau {escape(meta.niveau)}")
    header_parts.append(f"Leerjaar {escape(meta.leerjaar)}")
    if meta.schooljaar:
        header_parts.append(escape(meta.schooljaar))

    article: list[str] = []
    article.append(
        "<article style=\"font-family:system-ui,sans-serif;line-height:1.6;max-width:960px;margin:0 auto;\">"
    )
    article.append(
        "<header style=\"border-bottom:1px solid #e2e8f0;padding-bottom:1rem;margin-bottom:1rem;\">"
    )
    article.append(
        f"<h2 style=\"margin:0 0 .25rem;font-size:1.4rem;color:#0f172a;\">{escape(meta.bestand)}</h2>"
    )
    article.append(
        "<p style=\"margin:0;color:#475569;font-size:.95rem;\">{}</p>".format(
            " • ".join(header_parts)
        )
    )
    article.append("</header>")

    for row in rows:
        data = row.dict()
        week = data.get("week")
        week_label = f"Week {week}" if week is not None else "Week —"
        datum = data.get("datum")
        subheading_bits: list[str] = [week_label]
        if datum:
            datum_html = _format_text(datum)
            if datum_html:
                subheading_bits.append(datum_html)
        lead = data.get("onderwerp") or data.get("les")
        if isinstance(lead, str) and lead.strip():
            subheading_bits.append(escape(lead.strip()))

        article.append(
            "<section style=\"border-top:1px solid #e2e8f0;padding-top:1rem;margin-top:1rem;\">"
        )
        article.append(
            "<h3 style=\"margin:0 0 .5rem;font-size:1.05rem;color:#0f172a;\">{}</h3>".format(
                " • ".join(subheading_bits)
            )
        )
        article.append("<dl style=\"margin:0\">")

        fields = [
            ("Onderwerp", _format_text(data.get("onderwerp"))),
            ("Les", _format_text(data.get("les"))),
            ("Leerdoelen", _format_string_list(data.get("leerdoelen"))),
            ("Huiswerk", _format_text(data.get("huiswerk"))),
            ("Opdracht", _format_text(data.get("opdracht"))),
            ("Inleverdatum", _format_text(data.get("inleverdatum"))),
            ("Toets", _format_toets(data.get("toets"))),
            ("Bronnen", _format_resources(data.get("bronnen"))),
            ("Notities", _format_text(data.get("notities"))),
            ("Locatie", _format_text(data.get("locatie"))),
            ("Klas / groep", _format_text(data.get("klas_of_groep"))),
        ]

        for label, value in fields:
            if not value:
                continue
            article.append(
                f"<dt style=\"font-weight:600;color:#0f172a;margin-top:.5rem;\">{escape(label)}</dt>"
            )
            article.append(
                f"<dd style=\"margin:0 0 .5rem 0;color:#1f2937;\">{value}</dd>"
            )

        article.append("</dl>")
        article.append("</section>")

    article.append("</article>")
    return "".join(article)


def _save_state() -> None:
    if not DOCS:
        try:
            STATE_FILE.unlink(missing_ok=True)
        except Exception as exc:  # pragma: no cover - best-effort opruimen
            logger.warning("Kon state-bestand niet verwijderen: %s", exc)
        return

    payload: dict[str, dict[str, Any]] = {}
    for file_id, stored in DOCS.items():
        payload[file_id] = {
            "meta": stored.meta.dict(),
            "rows": [_row_to_dict(row) for row in stored.rows],
        }
        if stored.summary_html:
            payload[file_id]["summaryHtml"] = stored.summary_html

    try:
        STATE_FILE.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:  # pragma: no cover - IO afhankelijk
        logger.warning("Kon state-bestand niet schrijven: %s", exc)


def _load_state() -> None:
    if not STATE_FILE.exists():
        return

    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - IO afhankelijk
        logger.warning("Kon state-bestand niet lezen: %s", exc)
        return

    if not isinstance(data, dict):
        logger.warning("State-bestand heeft onverwacht formaat")
        return

    DOCS.clear()
    for file_id, entry in data.items():
        if not isinstance(entry, dict):
            logger.warning("State entry %s heeft onverwacht formaat", file_id)
            continue
        meta_data = entry.get("meta")
        rows_data = entry.get("rows", [])
        try:
            meta = DocMeta(**meta_data)
            rows = [DocRow(**row) for row in rows_data]
        except Exception as exc:
            logger.warning("Kon state entry %s niet herstellen: %s", file_id, exc)
            continue
        summary_html = entry.get("summaryHtml")
        file_path = _locate_source_file(file_id, meta)
        if not file_path:
            meta.hasSource = False
            if not summary_html:
                summary_html = _build_summary_html(meta, rows)
            if not summary_html:
                logger.warning(
                    "Bestand voor %s ontbreekt en er is geen samenvatting; sla entry over",
                    file_id,
                )
                continue
        else:
            meta.hasSource = True

        DOCS[file_id] = StoredDoc(meta=meta, rows=rows, summary_html=summary_html)


_load_state()

# -----------------------------
# Endpoints
# -----------------------------

def _iter_docx_blocks(document: Document):
    body = document.element.body
    for child in body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def _docx_to_html(path: Path) -> str:
    try:
        doc = Document(str(path))
    except Exception as exc:  # pragma: no cover - afhankelijk van docx lib
        raise HTTPException(500, f"Kon document niet openen: {exc}")

    parts: list[str] = []
    for block in _iter_docx_blocks(doc):
        if isinstance(block, Paragraph):
            text = escape(block.text or "").replace("\n", "<br/>")
            parts.append(f"<p>{text or '&nbsp;'}</p>")
        elif isinstance(block, Table):
            rows_html: list[str] = []
            for row in block.rows:
                cells_html = []
                for cell in row.cells:
                    cell_text = escape(cell.text or "").replace("\n", "<br/>")
                    cells_html.append(f"<td>{cell_text or '&nbsp;'}</td>")
                rows_html.append(f"<tr>{''.join(cells_html)}</tr>")
            parts.append(
                "<table class=\"docx-table\">{}</table>".format("".join(rows_html))
            )
    if not parts:
        return "<p><em>Geen tekstinhoud gevonden in document.</em></p>"
    return "".join(parts)


@app.get("/api/docs", response_model=List[DocMeta])
def list_docs():
    docs: List[DocMeta] = []
    for file_id, stored in DOCS.items():
        meta = stored.meta
        meta.hasSource = _locate_source_file(file_id, meta) is not None
        docs.append(meta)
    return docs


@app.get("/api/docs/{file_id}/rows", response_model=List[DocRow])
def get_doc_rows(file_id: str):
    stored = DOCS.get(file_id)
    if not stored:
        raise HTTPException(404, "Not found")
    return stored.rows


@app.delete("/api/docs/{file_id}")
def delete_doc(file_id: str):
    if file_id not in DOCS:
        raise HTTPException(404, "Not found")
    # fysiek bestand verwijderen (best effort)
    try:
        for p in STORAGE.glob(f"{file_id}.*"):
            p.unlink(missing_ok=True)
    except Exception:
        pass
    del DOCS[file_id]
    _save_state()
    return {"ok": True}

@app.delete("/api/docs")
def delete_all_docs():
    """Wis alle bekende documenten en fysieke files (opschonen)."""
    DOCS.clear()
    for p in STORAGE.glob("*.*"):
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass
    _save_state()
    return {"ok": True}


@app.get("/api/docs/{file_id}/content")
def get_doc_content(file_id: str, inline: bool = False):
    stored = DOCS.get(file_id)
    if not stored:
        raise HTTPException(404, "Not found")

    meta = stored.meta
    file_path = _locate_source_file(file_id, meta)
    if not file_path:
        meta.hasSource = False
        raise HTTPException(404, "File missing")

    meta.hasSource = True
    suffix = file_path.suffix.lower()

    media_type, _ = mimetypes.guess_type(file_path.name)
    response = FileResponse(
        file_path,
        media_type=media_type or "application/octet-stream",
        filename=None if inline else meta.bestand,
    )

    if inline:
        safe_filename = meta.bestand.replace("\"", "\\\"")
        disposition = f'inline; filename="{safe_filename}"'
        quoted = quote(meta.bestand)
        if quoted:
            disposition = f"{disposition}; filename*=UTF-8''{quoted}"
        response.headers["Content-Disposition"] = disposition

    return response


@app.get("/api/docs/{file_id}/preview")
def get_doc_preview(file_id: str):
    stored = DOCS.get(file_id)
    if not stored:
        raise HTTPException(404, "Not found")

    meta = stored.meta
    file_path = _locate_source_file(file_id, meta)
    summary_html = stored.summary_html
    updated_state = False

    if not file_path:
        meta.hasSource = False
        if summary_html is None:
            summary_html = _build_summary_html(meta, stored.rows)
            if summary_html:
                stored.summary_html = summary_html
                updated_state = True
        if summary_html:
            if updated_state:
                _save_state()
            return {
                "mediaType": "text/html",
                "summaryHtml": summary_html,
                "filename": meta.bestand,
                "isEmbeddable": False,
            }
        raise HTTPException(404, "File missing")

    meta.hasSource = True
    suffix = file_path.suffix.lower()
    media_type, _ = mimetypes.guess_type(file_path.name)

    if suffix == ".docx":
        if summary_html is None:
            try:
                summary_html = _docx_to_html(file_path)
            except HTTPException:
                summary_html = _build_summary_html(meta, stored.rows)
            if summary_html:
                stored.summary_html = summary_html
                updated_state = True

        html_content = summary_html or "<p><em>Geen voorvertoning beschikbaar.</em></p>"
        if updated_state:
            _save_state()
        return {
            "mediaType": "text/html",
            "html": html_content,
            "filename": meta.bestand,
            "isEmbeddable": False,
        }

    if summary_html is None:
        summary_html = _build_summary_html(meta, stored.rows)
        if summary_html:
            stored.summary_html = summary_html
            updated_state = True

    if updated_state:
        _save_state()

    response: dict[str, Any] = {
        "mediaType": media_type or "application/octet-stream",
        "url": f"/api/docs/{file_id}/content?inline=1",
        "filename": meta.bestand,
        "isEmbeddable": True,
    }
    if summary_html:
        response["summaryHtml"] = summary_html
    return response

@app.post("/api/uploads", response_model=DocMeta)
async def upload_doc(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    suffix = file.filename.lower()
    if not (suffix.endswith(".docx") or suffix.endswith(".pdf")):
        raise HTTPException(400, "Unsupported file type (use .docx or .pdf)")

    # Sla eerst op met originele naam (mag dubbel zijn)
    temp_path = STORAGE / file.filename
    with temp_path.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)

    # Parse metadata
    rows: List[DocRow] = []
    if suffix.endswith(".docx"):
        meta = extract_meta_from_docx(str(temp_path), file.filename)
        if meta:
            try:
                rows = extract_rows_from_docx(str(temp_path), file.filename)
            except Exception as exc:  # pragma: no cover - afhankelijk van docx lib
                logger.warning("Kon rijen niet extraheren uit %s: %s", file.filename, exc)
                rows = []
    else:
        meta = extract_meta_from_pdf(str(temp_path), file.filename)
        if meta and extract_rows_from_pdf:
            try:
                rows = extract_rows_from_pdf(str(temp_path), file.filename)
            except Exception as exc:  # pragma: no cover - afhankelijk van pdf lib
                logger.warning("Kon rijen niet extraheren uit %s: %s", file.filename, exc)
                rows = []

    if not meta:
        # opruimen temp
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(422, "Could not extract metadata")

    if rows is None:
        rows = []

    # Forceer uniek fileId (voorkomt naam-collisie)
    meta.fileId = uuid.uuid4().hex[:12]

    # Hernoem fysiek bestand naar <fileId>.<ext>
    final_path = STORAGE / f"{meta.fileId}{Path(file.filename).suffix.lower()}"
    if final_path.exists():
        final_path.unlink()
    temp_path.rename(final_path)

    meta.hasSource = True
    summary_html: Optional[str] = None
    try:
        if final_path.suffix.lower() == ".docx":
            summary_html = _docx_to_html(final_path)
        else:
            summary_html = _build_summary_html(meta, rows)
    except HTTPException as exc:  # pragma: no cover - defensief
        logger.warning(
            "Kon voorvertoning niet genereren voor %s: %s",
            file.filename,
            getattr(exc, "detail", exc),
        )
        if summary_html is None:
            summary_html = _build_summary_html(meta, rows)

    DOCS[meta.fileId] = StoredDoc(meta=meta, rows=rows, summary_html=summary_html)
    _save_state()
    return meta
