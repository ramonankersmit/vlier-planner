#!/usr/bin/env python3
"""Parse alle documenten in samples/ en log waarschuwingen."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import List

from vlier_parser.normalize import parse_to_normalized


def iter_documents(root: Path) -> List[Path]:
    files: List[Path] = []
    for path in sorted(root.rglob("*")):
        if path.suffix.lower() in {".pdf", ".docx"} and path.is_file():
            files.append(path)
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse alle studiewijzer-samples")
    parser.add_argument(
        "--samples-dir",
        default="samples",
        help="Map met DOCX/PDF-bestanden (standaard: samples)",
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop direct bij de eerste fout",
    )
    args = parser.parse_args()

    root = Path(args.samples_dir).expanduser().resolve()
    if not root.exists():
        print(f"[x] samples-map ontbreekt: {root}")
        return 1

    files = iter_documents(root)
    if not files:
        print(f"[i] Geen bestanden gevonden in {root}")
        return 0

    success = 0
    failed = 0
    for path in files:
        rel = path.relative_to(root)
        try:
            _, model = parse_to_normalized(str(path))
            warn_count = len(model.warnings)
            if warn_count:
                print(f"[!] {rel} ({warn_count} waarschuwingen)")
                for warn in model.warnings:
                    print(f"    - {warn.code}: {warn.message}")
            else:
                print(f"[✓] {rel}")
            success += 1
        except Exception as exc:  # pragma: no cover - runtime helper
            print(f"[x] {rel}: {exc}")
            failed += 1
            if args.stop_on_error:
                break

    print(f"\nSamenvatting: {success} geslaagd, {failed} gefaald")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
