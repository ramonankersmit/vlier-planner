#!/usr/bin/env python
"""Upload all sample documents to the running backend."""
from __future__ import annotations

import mimetypes
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
SAMPLES = Path(__file__).resolve().parent.parent / "samples"

def main() -> None:
    sample_files = sorted(
        [p for p in SAMPLES.iterdir() if p.suffix.lower() in {".docx", ".pdf"}]
    )
    if not sample_files:
        raise SystemExit("No sample files found")

    with httpx.Client(timeout=120.0) as client:
        resp = client.delete(f"{BASE}/api/docs")
        resp.raise_for_status()
        for path in sample_files:
            media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            with path.open("rb") as fh:
                files = {"file": (path.name, fh, media_type)}
                resp = client.post(f"{BASE}/api/uploads", files=files)
                resp.raise_for_status()
                print(f"Uploaded {path.name}: {resp.json()}" )

if __name__ == "__main__":
    main()
