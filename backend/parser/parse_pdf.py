from typing import List, Dict
from PyPDF2 import PdfReader
import re

def extract_items(fobj) -> List[Dict]:
    rdr = PdfReader(fobj)
    text = ""
    for page in rdr.pages:
        text += page.extract_text() or ""

    # Normalize weird PDF spaces
    text = re.sub(r"[\u00A0\u2000-\u200B]", " ", text)
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]

    items: list[dict] = []
    date_pat = re.compile(r"\b(\d{1,2}-\d{1,2}(-\d{2,4})?)\b")
    cur_date = None
    for ln in lines:
        m = date_pat.search(ln)
        if m:
            cur_date = m.group(1)
            # Remove date from line
            rest = ln.replace(m.group(0), "").strip(" -–:")
            if rest:
                items.append({"date": cur_date, "title": rest, "text": rest})
        else:
            if cur_date:
                items.append({"date": cur_date, "title": ln, "text": ln})
    return items
