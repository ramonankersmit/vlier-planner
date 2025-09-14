### Parser demo (los CLI-script)

Gebruik dit hulpscript om DOCX/PDF studiewijzers te parsen buiten de server.

Voor PDF's wordt standaard geprobeerd `pdfplumber` te gebruiken. Als dat niet
geïnstalleerd is, valt het script terug op `PyPDF2`, zodat je ook zonder extra
packages kunt testen. Installeer `pdfplumber` voor nauwkeurigere
tekstextractie uit lastig opgemaakte PDF's.

Voorbeelden (PowerShell):

```powershell
# Enkel metadata
python .\tools\parse_demo.py .\samples\Aardrijkskunde_4V_P1_2025-2026.docx

# Inclusief rijen als JSON
python .\tools\parse_demo.py .\uploads --rows --json .\tools\out\parse_results.json
```

Met de vlag `--rows` (of `--row`) worden ook de tabel-rijen geparsed en als JSON
teruggegeven.

