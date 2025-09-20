from __future__ import annotations

import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TS_ASSET_FILE = ROOT / "frontend" / "src" / "assets" / "images.ts"
OUTPUT_DIR = ROOT / "artifacts" / "images"

IMAGE_PATTERN = re.compile(
    r"src:\s*\"data:image/png;base64,([^\"]+)\"\s*,\s*\n\s*filename:\s*\"([^\"]+)\"",
    re.MULTILINE,
)


def main() -> None:
    if not TS_ASSET_FILE.exists():
        raise SystemExit(f"Asset file {TS_ASSET_FILE} does not exist")

    content = TS_ASSET_FILE.read_text(encoding="utf-8")
    matches = IMAGE_PATTERN.findall(content)
    if not matches:
        raise SystemExit("No images found in asset file")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for data, filename in matches:
        output_path = OUTPUT_DIR / filename
        output_path.write_bytes(base64.b64decode(data))

        (output_path.with_suffix(output_path.suffix + ".base64.txt")).write_text(
            data + "\n", encoding="utf-8"
        )

    print(f"Extracted {len(matches)} images to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
