from docx import Document
from typing import Optional, List
import re
from models import DocMeta  # <-- aangepast: importeer uit models i.p.v. schemas

# Herken: "Studiewijzer" met vak in [blokhaken] of na streepje
RE_STUDIEWIJZER = re.compile(r"studiewijzer", re.I)
RE_VAK_IN_BRACKETS = re.compile(r"\[\s*([A-Za-zÀ-ÿ\s\-\&]+)\s*\]")
RE_VAK_AFTER_DASH  = re.compile(r"studiewijzer\s*[-–]\s*(.+)", re.I)

def _clean(s: str) -> str:
  return (s or "").strip()

def _first_nonempty(paragraphs, start_idx: int) -> Optional[str]:
  for p in paragraphs[start_idx:]:
    t = _clean(p.text)
    if t:
      return t
  return None

def _parse_vak_from_header(doc: Document) -> Optional[str]:
  # Zoek paragraaf met "Studiewijzer"
  for i, p in enumerate(doc.paragraphs):
    txt = _clean(p.text)
    if not txt:
      continue
    if RE_STUDIEWIJZER.search(txt):
      # 1) probeer zelfde regel: "Studiewijzer - <vak>"
      m = RE_VAK_AFTER_DASH.search(txt)
      if m:
        return _clean(m.group(1))
      # 2) probeer volgende niet-lege paragraaf met [Vak]
      nxt = _first_nonempty(doc.paragraphs, i + 1) or ""
      mb = RE_VAK_IN_BRACKETS.search(nxt)
      if mb:
        return _clean(mb.group(1))
      # 3) soms staat het zelfs twee regels verder weer "[Vak]"
      if i + 2 < len(doc.paragraphs):
        nxt2 = _clean(doc.paragraphs[i + 2].text or "")
        mb2 = RE_VAK_IN_BRACKETS.search(nxt2)
        if mb2:
          return _clean(mb2.group(1))
  return None

def _parse_footer_meta(doc: Document):
  """Heuristiek uit footer: niveau (HAVO/VWO), leerjaar (1-6), periode (1-4), schooljaar (YYYY/YYYY)."""
  niveau = "VWO"
  leerjaar = "4"
  periode = 1
  schooljaar = None

  try:
    sec = doc.sections[0]
    footer_texts = [ _clean(p.text) for p in sec.footer.paragraphs if _clean(p.text) ]
    full = " | ".join(footer_texts)
    low = full.lower()

    # Niveau
    if "havo" in low:
      niveau = "HAVO"
    if "vwo" in low:
      niveau = "VWO"

    # Leerjaar (zoek [4 VWO] of los cijfer 1..6)
    m = re.search(r"\[\s*([1-6])\s*(havo|vwo)\s*\]", low)
    if m:
      leerjaar = m.group(1)
    else:
      m = re.search(r"\b([1-6])\b", low)
      if m:
        leerjaar = m.group(1)

    # Periode
    m = re.search(r"periode\s*([1-4])", low)
    if m:
      periode = int(m.group(1))

    # Schooljaar
    m = re.search(r"(20\d{2}/20\d{2})", full)
    if m:
      schooljaar = m.group(1)
  except Exception:
    pass

  return niveau, leerjaar, periode, schooljaar

def _numbers_in_text(s: str) -> List[int]:
  return [int(x) for x in re.findall(r"(\d{1,2})", s or "")]

def _parse_week_range(doc: Document):
  """Zoek tabel met kolomkop 'Week' en neem min/max uit die kolom.
     Ondersteunt cellen als '35' of '44/45' of met datumregels eronder."""
  begin_w, eind_w = 36, 41
  try:
    for tbl in doc.tables:
      if not tbl.rows:
        continue
      headers = [ _clean(c.text).lower() for c in tbl.rows[0].cells ]
      if not headers:
        continue
      # vind index van kolom "week"
      try:
        col_idx = next(i for i, h in enumerate(headers) if "week" in h)
      except StopIteration:
        continue

      all_weeks: List[int] = []
      for r in tbl.rows[1:]:
        cell_txt = _clean(r.cells[col_idx].text)
        nums = _numbers_in_text(cell_txt)   # pakt ook "44/45" -> [44,45]
        if nums:
          all_weeks.extend(nums)
      if all_weeks:
        begin_w, eind_w = min(all_weeks), max(all_weeks)
        break
  except Exception:
    pass
  return begin_w, eind_w

def extract_meta_from_docx(path: str, filename: str) -> Optional[DocMeta]:
  doc = Document(path)

  vak = _parse_vak_from_header(doc) or "Onbekend"
  niveau, leerjaar, periode, schooljaar = _parse_footer_meta(doc)
  begin_week, eind_week = _parse_week_range(doc)

  # fileId gebaseerd op bestandsnaam
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
