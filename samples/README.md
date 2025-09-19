# Voorbeeld studiewijzers

De repository bevat geen binaire versies van de voorbeeldbestanden omdat het PR-systeem geen binaries accepteert. De map bevat daarom Base64-versies:

- `voorbeeld-studiewijzer.pdf.base64`
- `voorbeeld-studiewijzer.docx.base64`

Je kunt de echte bestanden genereren met het hulpprogramma `tools/decode_samples.mjs`:

```bash
node tools/decode_samples.mjs
```

Hiermee verschijnen `voorbeeld-studiewijzer.pdf` en `voorbeeld-studiewijzer.docx` in dezelfde map (ze blijven genegeerd door git). Gebruik deze bestanden om in de applicatie te uploaden of nieuwe screenshots te maken.
