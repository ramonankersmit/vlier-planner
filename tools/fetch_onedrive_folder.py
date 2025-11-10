"""
Downloadt een gedeelde OneDrive-map als ZIP en pakt direct uit naar ./samples/
- OneDrive share URL komt uit ONEDRIVE_SHARE_URL (geladen uit .env)
- Geen externe packages nodig (alleen Python stdlib)
"""
from __future__ import annotations
import os, sys, re, io, zipfile, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "samples"   # alles komt in samples/ (git-ignored)

def load_env():
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)

def http_get(url: str, timeout: int = 120):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.getcode(), dict(resp.info().items()), resp.read()

def guess_direct_zip(url: str):
    c = []
    if "download=1" not in url:
        c.append(url + ("&" if "?" in url else "?") + "download=1")
    c.append(url)
    return c

def find_download_link_in_html(url: str, timeout: int = 120):
    code, headers, html_bytes = http_get(url, timeout)
    html = html_bytes.decode("utf-8", errors="ignore")
    m = re.search(r'https://[^\s"]+?download[^\s"]*', html)
    return m.group(0) if m else None

def fetch_zip_bytes(share_url: str) -> bytes:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    # 1) probeer directe ZIP
    for u in guess_direct_zip(share_url):
        try:
            code, headers, data = http_get(u)
            ctype = headers.get("Content-Type","").lower()
            if code == 200 and ("zip" in ctype or "octet-stream" in ctype):
                print(f"[ok] ZIP gedownload via {u} ({len(data)} bytes)")
                return data
        except Exception:
            pass
    # 2) parse HTML voor download-link
    print("[i] direct ZIP niet gevonden, parse HTML…")
    dl = find_download_link_in_html(share_url)
    if not dl:
        print("[x] Geen directe download-URL gevonden. Zorg dat de share 'Iedereen met de link kan weergeven' is.")
        sys.exit(2)
    code, headers, data = http_get(dl, timeout=180)
    if code != 200:
        print(f"[x] Download mislukt: HTTP {code}")
        sys.exit(3)
    print(f"[ok] ZIP gedownload via gevonden link ({len(data)} bytes)")
    return data

def unzip_bytes_into_samples(zip_bytes: bytes):
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as z:
        z.extractall(DOCS_DIR)
    print(f"[ok] uitgepakt naar: {DOCS_DIR}")

def main():
    load_env()
    share = os.environ.get("ONEDRIVE_SHARE_URL","").strip()
    if not share:
        print("[x] ONEDRIVE_SHARE_URL ontbreekt. Zet je link in .env")
        sys.exit(1)
    print("[i] Haal OneDrive-map op…")
    zip_bytes = fetch_zip_bytes(share)
    print("[i] Pak uit…")
    unzip_bytes_into_samples(zip_bytes)
    print("[✓] Klaar.")

if __name__ == "__main__":
    main()
