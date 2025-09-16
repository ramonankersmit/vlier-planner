#!/usr/bin/env python3
"""
Parser demo CLI voor Het Vlier Studiewijzer Planner
"""

import argparse
import json
import logging
from pathlib import Path
import sys

# Project root + backend toevoegen aan sys.path, zodat `from models import DocMeta` werkt
THIS_FILE = Path(__file__).resolve()
REPO_ROOT = THIS_FILE.parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
for p in (REPO_ROOT, BACKEND_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from backend.parsers.parser_docx import (
    extract_meta_from_docx,
    extract_rows_from_docx,
)
from backend.parsers.parser_pdf import (
    extract_meta_from_pdf,
    extract_rows_from_pdf,
)
from models import DocMeta, DocRow  # wordt gevonden via BACKEND_DIR op sys.path


def parse_file(path: Path) -> DocMeta:
    if path.suffix.lower() == ".docx":
        return extract_meta_from_docx(str(path), path.name)
    elif path.suffix.lower() == ".pdf":
        return extract_meta_from_pdf(str(path), path.name)
    else:
        raise ValueError(f"Unsupported file type: {path.suffix}")


def print_result(meta: DocMeta):
    print(f"\n▶ {meta.bestand}")
    print(f"   vak        : {meta.vak}")
    print(f"   niveau     : {meta.niveau}")
    print(f"   leerjaar   : {meta.leerjaar}")
    print(f"   periode    : {meta.periode}")
    print(f"   schooljaar : {meta.schooljaar}")
    print(f"   weken      : {meta.beginWeek}–{meta.eindWeek}")


def main():
    parser = argparse.ArgumentParser(description="Het Vlier Studiewijzer parse demo (PDF/DOCX).")
    parser.add_argument("path", type=str, help="Pad naar bestand of directory")
    parser.add_argument("--json", type=str, default=None, help="Schrijf resultaten naar JSON-bestand")
    parser.add_argument("--rows", "--row", dest="rows", action="store_true", help="Geef ook rijen terug als JSON")
    args = parser.parse_args()

    src = Path(args.path).resolve()
    if not src.exists():
        logging.error("Pad bestaat niet: %s", src)
        return 2

    files = [src] if src.is_file() else [p for p in src.rglob("*") if p.suffix.lower() in {".pdf", ".docx"}]

    results = []
    if args.rows:
        for f in files:
            try:
                if f.suffix.lower() == ".docx":
                    meta = extract_meta_from_docx(str(f), f.name)
                    rows = extract_rows_from_docx(str(f), f.name)
                else:
                    meta = extract_meta_from_pdf(str(f), f.name)
                    rows = extract_rows_from_pdf(str(f), f.name)
                m_dump = meta.model_dump() if hasattr(meta, "model_dump") else dict(meta)
                r_dump = [r.model_dump() if hasattr(r, "model_dump") else dict(r) for r in rows]
                results.append({"meta": m_dump, "rows": r_dump})
            except Exception as e:
                logging.warning("Kon niet parsen: %s (%s)", f, e)
                results.append({"path": str(f), "error": str(e)})
        out_json = json.dumps(results, ensure_ascii=False, indent=2)
        if args.json:
            out_path = Path(args.json).resolve()
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with out_path.open("w", encoding="utf-8") as f:
                f.write(out_json)
            print(f"JSON weggeschreven naar: {out_path}")
        else:
            print(out_json)
        return
    else:
        for f in files:
            try:
                meta = parse_file(f)
                print_result(meta)
                as_dict = getattr(meta, "model_dump", None)
                results.append(as_dict() if callable(as_dict) else getattr(meta, "__dict__", dict(meta)))
            except Exception as e:
                logging.warning("Kon niet parsen: %s (%s)", f, e)
                results.append({"path": str(f), "error": str(e)})

        print("\n— Samenvatting —")
        ok = sum(1 for r in results if "error" not in r)
        print(f"Totaal: {len(files)}  ✓ Geslaagd: {ok}  ✗ Gefaald: {len(files) - ok}")

        if args.json:
            out_path = Path(args.json).resolve()
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with out_path.open("w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            print(f"\nJSON weggeschreven naar: {out_path}")


if __name__ == "__main__":
    main()
