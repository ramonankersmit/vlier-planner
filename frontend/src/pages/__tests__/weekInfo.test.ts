import type { DocRecord } from "../../app/store";
import type { DocRow } from "../../lib/api";
import { computeDocWeekInfo } from "../Uploads";

const makeDoc = (overrides: Partial<DocRecord> = {}): DocRecord => ({
  fileId: "doc-1",
  guideId: undefined,
  versionId: 1,
  bestand: "demo.pdf",
  vak: "Wiskunde",
  niveau: "VWO",
  leerjaar: "4",
  periode: 2,
  beginWeek: 46,
  eindWeek: 4,
  schooljaar: "2025/2026",
  uploadedAt: "2025-01-10T08:00:00.000Z",
  enabled: true,
  ...overrides,
});

const makeRow = (overrides: DocRow): DocRow => ({
  week: null,
  weeks: null,
  week_span_start: null,
  week_span_end: null,
  week_label: null,
  datum: null,
  datum_eind: null,
  les: null,
  onderwerp: null,
  leerdoelen: null,
  huiswerk: null,
  opdracht: null,
  inleverdatum: null,
  toets: null,
  bronnen: null,
  notities: null,
  klas_of_groep: null,
  locatie: null,
  enabled: true,
  source_row_id: null,
  ...overrides,
});

describe("computeDocWeekInfo", () => {
  it("neemt alle weken uit multiweek-rijen mee, inclusief jaarwissel", () => {
    const doc = makeDoc();
    const rows: DocRow[] = [
      makeRow({ week: 46 }),
      makeRow({ week: 47 }),
      makeRow({ week: 48 }),
      makeRow({ week: 49 }),
      makeRow({ week: 50 }),
      makeRow({ week: 51 }),
      makeRow({
        week: 52,
        weeks: [52, 1, 2, 3, 4],
        week_span_start: 52,
        week_span_end: 4,
        week_label: "wk 52-1",
      }),
    ];

    const info = computeDocWeekInfo(doc, rows);

    expect(info.weeks).toEqual(expect.arrayContaining([1, 2, 3, 4, 46, 52]));
    expect(info.label).toBe("46–52 · 1–4");
  });

  it("vult weken op basis van het weekbereik wanneer alleen een span bekend is", () => {
    const doc = makeDoc({ beginWeek: 10, eindWeek: 12 });
    const rows: DocRow[] = [
      makeRow({
        week_span_start: 10,
        week_span_end: 12,
      }),
    ];

    const info = computeDocWeekInfo(doc, rows);
    expect(info.weeks).toEqual([10, 11, 12]);
  });
});
