from __future__ import annotations

import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TS_ASSET_FILE = ROOT / "frontend" / "src" / "assets" / "images.ts"
PUBLIC_DIR = ROOT / "frontend" / "public"

IMAGE_PATTERN = re.compile(
    r"src:\s*\"data:image/png;base64,([^\"]+)\"\s*,\s*\n\s*filename:\s*\"([^\"]+)\"",
    re.MULTILINE,
)


def replace_image_data(content: str, filename: str, new_data: str) -> tuple[str, bool]:
    replaced = False

    def _replacer(match: re.Match[str]) -> str:
        nonlocal replaced
        existing_data, match_filename = match.groups()
        if match_filename != filename:
            return match.group(0)
        replaced = existing_data != new_data
        if not replaced:
            return match.group(0)
        return match.group(0).replace(existing_data, new_data)

    return IMAGE_PATTERN.sub(_replacer, content), replaced


def encode_file(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    if not TS_ASSET_FILE.exists():
        raise SystemExit(f"Asset file {TS_ASSET_FILE} does not exist")

    content = TS_ASSET_FILE.read_text(encoding="utf-8")
    updated = False

    logo_path = PUBLIC_DIR / "logo.png"
    if logo_path.exists():
        logo_data = encode_file(logo_path)
        content, changed = replace_image_data(content, "logo.png", logo_data)
        if changed:
            print("Updated inline data for logo.png")
            updated = True
    else:
        print("No logo.png found in frontend/public – skipping inline logo update")

    screenshots_dir = PUBLIC_DIR / "screenshots"
    if screenshots_dir.is_dir():
        for path in sorted(screenshots_dir.glob("*.png")):
            screenshot_data = encode_file(path)
            content, changed = replace_image_data(content, path.name, screenshot_data)
            if changed:
                print(f"Updated inline data for {path.name}")
                updated = True
    else:
        print("No screenshots directory found – skipping screenshot updates")

    if not updated:
        print("Inline asset data already up to date")
        return

    TS_ASSET_FILE.write_text(content, encoding="utf-8")
    print("Wrote updated inline asset data to images.ts")


if __name__ == "__main__":
    main()
