# Validatie import 4 vwo – Periode 2

Gegevens verzameld op basis van de samples uit `samples/2526_Studiewijzers/4 vwo/Periode 2`. Elk document is ingelezen met `vlier_parser.normalize.parse_to_normalized`, waarna de resulterende NormalizedModel-bestanden zijn gecontroleerd.

## Aanpak

1. `python tools/fetch_onedrive_folder.py` om de gedeelde map te downloaden (128 bestanden, inclusief alle 4 vwo-periode 2 documenten).
2. Voor elk bestand uit `Periode 2` `parse_to_normalized` aangeroepen om de elementen te schrijven naar `backend/storage/normalized/`.
3. De resulterende JSON-bestanden ingelezen en samengevat in onderstaande tabel.

| Bestand | Parse ID | Weken | Sessies | Toetsen | Waarschuwingen |
| --- | --- | --- | --- | --- | --- |
| Aardrijkskunde_4V_P2_2025-2026.docx | 2fc0aa5e76344946876770765ead48d3 | 7 | 6 | 1 | ASSESSMENT_WEIGHT_UNKNOWN: Geen geldige weging gevonden voor toets. |
| Duits_4V_ P2_2025-2026.pdf | 31cf40def688411c937bfe1504ec711f | 12 | 11 | 0 | Geen |
| Engels_4V_Per2.pdf | 5b86566585dd4b5baeba6fc70d6c8e82 | 12 | 13 | 5 | ASSESSMENT_WEIGHT_UNKNOWN × 5: Geen geldige weging gevonden voor toets. |
| Geschiedenis periode 2.pdf | 620e9c25c2104280abb49e0159abe17c | 12 | 12 | 4 | ASSESSMENT_WEIGHT_UNKNOWN × 4: Geen geldige weging gevonden voor toets. |
| Maatschappijleer_4vwo_p2.docx | 005630fbdc4a409a940beef3cf7a3be9 | 7 | 6 | 0 | Geen |
| Natuurkunde studiewijzer 2526 periode 2.pdf | d3400787ca9749c2bf51439157aa4063 | 12 | 13 | 1 | ASSESSMENT_WEIGHT_UNKNOWN: Geen geldige weging gevonden voor toets. |
| Scheikunde 4V P2 2526.pdf | 3c7b5ab8db6d4123b34f21edc7d53401 | 11 | 13 | 0 | SESSION_DATE_MISSING × 7: Geen datum gevonden voor week. |
| Studiewijzer 2526 periode 2 CKV VWO 4.pdf | 0f4158dbf0084195883de5ebbd112862 | 12 | 13 | 1 | ASSESSMENT_WEIGHT_UNKNOWN: Geen geldige weging gevonden voor toets. |
| Studiewijzer 4VwisA 2526 periode 2.pdf | 18bb2b644ccd43d38c346789108ddd5a | 12 | 26 | 0 | Geen |
| WiskundeB_4V_Per2.pdf | 6407d53573a94a05a02b48314b4a428d | 11 | 12 | 0 | SESSION_DATE_MISSING × 2: Geen datum gevonden voor week. |

## Observaties

- De parser leverde voor alle tien bestanden een `NormalizedModel` op. Dankzij een aangepaste weekcontrole verschijnen er geen `WEEK_OUT_OF_RANGE`-meldingen meer voor doorlopende periodes rond de jaarwisseling.
- Voor scheikunde en wiskunde B ontbreken bij enkele regels nog steeds expliciete datums; dit levert `SESSION_DATE_MISSING` op maar de regels worden wel opgenomen in de dataset.
- Voor Engels, geschiedenis, CKV, natuurkunde en aardrijkskunde ontbreken wegingen; zij blijven `ASSESSMENT_WEIGHT_UNKNOWN` melden totdat de bronbestanden een waarde bevatten.
- De vaknaamdetectie herkent nu de juiste vakken voor wiskunde A, scheikunde, Engels en Duits ondanks dubbele kolommen of afwijkende koppen.
