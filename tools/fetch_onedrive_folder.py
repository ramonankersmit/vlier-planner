"""
Downloadt een gedeelde map als ZIP en pakt direct uit naar ./samples/.

Ondersteunt zowel publieke OneDrive-links als Google Drive-bestanden. De
share-URL komt uit ``ONEDRIVE_SHARE_URL`` (geladen uit .env). Er zijn geen
externe packages nodig; alles draait op de Python-stdlib.
"""
from __future__ import annotations
import os, sys, re, io, zipfile, pathlib, urllib.request, urllib.parse, http.cookiejar

ROOT = pathlib.Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "samples"   # alles komt in samples/ (git-ignored)
HEADERS = {"User-Agent": "Mozilla/5.0"}


def looks_like_zip(ctype: str, payload: bytes) -> bool:
    ctype = (ctype or "").lower()
    return "zip" in ctype or "octet-stream" in ctype or payload.startswith(b"PK")

def load_env(*, override: bool = True):
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if override or k not in os.environ:
            os.environ[k] = v
        else:
            os.environ.setdefault(k, v)

def http_get(url: str, timeout: int = 120, opener: urllib.request.OpenerDirector | None = None):
    opener = opener or urllib.request.build_opener()
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=timeout) as resp:
        return resp.getcode(), dict(resp.info().items()), resp.read()

def guess_direct_zip(url: str):
    c = []
    if "download=1" not in url:
        c.append(url + ("&" if "?" in url else "?") + "download=1")
    c.append(url)
    return c


def is_google_drive_url(url: str) -> bool:
    return "drive.google.com" in url


def extract_gdrive_file_id(url: str) -> str | None:
    parsed = urllib.parse.urlparse(url)
    if parsed.path:
        m = re.search(r"/file/d/([^/]+)/?", parsed.path)
        if m:
            return m.group(1)
    query = urllib.parse.parse_qs(parsed.query)
    if "id" in query and query["id"]:
        return query["id"][0]
    return None


def fetch_google_drive_zip(file_id: str, timeout: int = 180) -> bytes:
    """Download een Google Drive-bestand en retourneer de bytes."""

    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

    def request(url: str):
        return http_get(url, timeout=timeout, opener=opener)

    base_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    code, headers, data = request(base_url)
    ctype = headers.get("Content-Type", "").lower()
    if code == 200 and looks_like_zip(ctype, data):
        print(f"[ok] ZIP gedownload via Google Drive direct ({len(data)} bytes)")
        return data

    confirm_token = None
    download_url = None
    for cookie in cookie_jar:
        if cookie.name.startswith("download_warning"):
            confirm_token = cookie.value
            break

    if not confirm_token:
        html = data.decode("utf-8", errors="ignore")
        link_match = re.search(r"href=\"([^\"]*uc\?export=download[^\"]*)\"", html)
        if link_match:
            download_url = urllib.parse.urljoin("https://drive.google.com", link_match.group(1))
        else:
            action_match = re.search(r"action=\"([^\"]*uc\?export=download[^\"]*)\"", html)
            if action_match:
                download_url = urllib.parse.urljoin("https://drive.google.com", action_match.group(1))
        if not download_url:
            token_match = re.search(r'name=\"confirm\" value=\"([0-9A-Za-z_\-]+)\"', html)
            if token_match:
                confirm_token = token_match.group(1)
            else:
                token_match = re.search(r"confirm=([0-9A-Za-z_\-]+)", html)
                if not token_match:
                    raise RuntimeError("Geen bevestigingstoken gevonden in Google Drive-response")
                confirm_token = token_match.group(1)

    if confirm_token:
        download_url = f"{base_url}&confirm={confirm_token}"

    if not download_url:
        raise RuntimeError("Kon geen download-URL bepalen voor Google Drive")

    code, headers, data = request(download_url)
    ctype = headers.get("Content-Type", "").lower()
    if code == 200 and looks_like_zip(ctype, data):
        print(f"[ok] ZIP gedownload via Google Drive confirm ({len(data)} bytes)")
        return data

    raise RuntimeError(f"Google Drive-download mislukt: HTTP {code} ({ctype})")

def find_download_link_in_html(url: str, timeout: int = 120):
    code, headers, html_bytes = http_get(url, timeout)
    html = html_bytes.decode("utf-8", errors="ignore")
    m = re.search(r'https://[^\s"]+?download[^\s"]*', html)
    return m.group(0) if m else None

def fetch_zip_bytes(share_url: str) -> bytes:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    if is_google_drive_url(share_url):
        file_id = extract_gdrive_file_id(share_url)
        if not file_id:
            print("[x] Kon geen Google Drive-bestands-ID afleiden uit de URL.")
            sys.exit(2)
        try:
            return fetch_google_drive_zip(file_id)
        except Exception as exc:  # pragma: no cover - runtime feedback
            print(f"[x] Download van Google Drive mislukt: {exc}")
            sys.exit(3)

    # 1) probeer directe ZIP
    for u in guess_direct_zip(share_url):
        try:
            code, headers, data = http_get(u)
            ctype = headers.get("Content-Type","")
            if code == 200 and looks_like_zip(ctype, data):
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
    members: list[zipfile.ZipInfo]
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as z:
            members = [info for info in z.infolist() if not info.is_dir()]
            if not members:
                raise RuntimeError("ZIP-bestand bevat geen bestanden")
            z.extractall(DOCS_DIR)
    except zipfile.BadZipFile as exc:
        raise RuntimeError("Ongeldig ZIP-bestand ontvangen") from exc

    extracted_files = []
    for info in members:
        extracted_path = DOCS_DIR / info.filename
        if extracted_path.is_file():
            extracted_files.append(extracted_path)

    if not extracted_files:
        raise RuntimeError("Geen bestanden aangetroffen na uitpakken")

    print(f"[ok] uitgepakt naar: {DOCS_DIR} ({len(extracted_files)} bestanden)")

def main():
    load_env()
    share = os.environ.get("ONEDRIVE_SHARE_URL","").strip()
    if not share:
        print("[x] ONEDRIVE_SHARE_URL ontbreekt. Zet je link in .env")
        sys.exit(1)
    bron = "Google Drive" if is_google_drive_url(share) else "OneDrive"
    print(f"[i] Haal {bron}-map op via gedeelde link uit ONEDRIVE_SHARE_URL…")
    zip_bytes = fetch_zip_bytes(share)
    print("[i] Pak uit…")
    unzip_bytes_into_samples(zip_bytes)
    print("[✓] Klaar.")

if __name__ == "__main__":
    main()
