import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./store";
import type {
  CommitResponse,
  DocDiff,
  DocMeta,
  DocRow,
  ReviewDraft,
  StudyGuide,
  StudyGuideVersion,
} from "../lib/api";

const makeMeta = (overrides?: Partial<DocMeta>): DocMeta => ({
  fileId: "guide-1",
  guideId: "guide-1",
  versionId: 1,
  bestand: "demo.docx",
  vak: "Wiskunde",
  niveau: "VWO",
  leerjaar: "5",
  periode: 1,
  beginWeek: 1,
  eindWeek: 5,
  schooljaar: "2024/2025",
  uploadedAt: "2024-01-10T10:00:00.000Z",
  ...overrides,
});

const makeRows = (): DocRow[] => [
  {
    week: 1,
    datum: "2024-01-08",
    les: "Les 1",
    onderwerp: "Intro",
    huiswerk: "Lezen",
    opdracht: null,
    leerdoelen: null,
    bronnen: null,
    toets: null,
    notities: null,
    klas_of_groep: null,
    locatie: null,
  },
];

const makeDiff = (): DocDiff => ({
  diffSummary: { added: 1, changed: 0, removed: 0, unchanged: 0 },
  diff: [
    {
      index: 0,
      status: "added",
      fields: {
        week: { status: "added", old: null, new: 1 },
        datum: { status: "added", old: null, new: "2024-01-08" },
      },
    },
  ],
});

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.getState().resetAppState();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("slaat pending reviews op en activeert ze", () => {
    const review: ReviewDraft = {
      parseId: "parse-1",
      meta: makeMeta({ vak: "" }),
      rows: makeRows(),
      warnings: {
        unknownSubject: true,
        missingWeek: true,
        duplicateDate: false,
        duplicateWeek: false,
      },
      ...makeDiff(),
    };

    const store = useAppStore.getState();
    store.setPendingReview(review);
    const state = useAppStore.getState();

    expect(state.pendingReviews[review.parseId]).toEqual(review);
    expect(state.activeReviewId).toBe(review.parseId);
  });

  it("werkt docs en versies bij na een commit", () => {
    const rows = makeRows();
    const diff = makeDiff();
    const commit: CommitResponse = {
      guideId: "guide-1",
      version: {
        versionId: 2,
        createdAt: "2024-01-12T09:00:00.000Z",
        meta: makeMeta({ versionId: 2, uploadedAt: "2024-01-12T09:00:00.000Z" }),
        diffSummary: diff.diffSummary,
        warnings: {
          unknownSubject: false,
          missingWeek: false,
          duplicateDate: false,
          duplicateWeek: false,
        },
      },
    };

    const store = useAppStore.getState();
    store.applyCommitResult(commit, rows, diff);
    const state = useAppStore.getState();

    expect(state.docs.some((doc) => doc.fileId === commit.guideId)).toBe(true);
    expect(state.docRows[commit.guideId]).toEqual(rows);
    expect(state.versionRows[commit.guideId]?.[2]).toEqual(rows);
    expect(state.guideDiffs[commit.guideId]?.[2]).toEqual(diff);
    expect(state.selectedGuideId).toBe(commit.guideId);
    expect(state.selectedVersionId).toBe(2);
    expect(state.studyGuides.find((g) => g.guideId === commit.guideId)?.versionCount).toBeGreaterThanOrEqual(1);
  });

  it("past geselecteerde versie aan wanneer de lijst wijzigt", () => {
    const version1: StudyGuideVersion = {
      versionId: 1,
      createdAt: "2024-01-10T08:00:00.000Z",
      meta: makeMeta(),
      diffSummary: { added: 0, changed: 0, removed: 0, unchanged: 1 },
      warnings: {
        unknownSubject: false,
        missingWeek: false,
        duplicateDate: false,
        duplicateWeek: false,
      },
    };
    const guide: StudyGuide = {
      guideId: "guide-1",
      versionCount: 1,
      latestVersion: version1,
    };

    const store = useAppStore.getState();
    store.setStudyGuides([guide]);
    store.selectGuideVersion("guide-1", 2);

    store.setGuideVersions("guide-1", [version1]);
    const state = useAppStore.getState();
    expect(state.selectedVersionId).toBe(1);
  });

  it("bouwt weekreeksen over jaargrenzen correct op", () => {
    const store = useAppStore.getState();
    const crossYearDoc = makeMeta({
      fileId: "guide-cross",
      guideId: "guide-cross",
      beginWeek: 46,
      eindWeek: 5,
      schooljaar: "2025/2026",
    });

    store.setDocs([crossYearDoc]);
    store.setDocRows("guide-cross", [
      {
        week: 46,
        datum: "2025-11-12",
        les: "Intro",
      },
      {
        week: 4,
        datum: "2026-01-22",
        les: "Vervolg",
      },
    ]);

    const weekIds =
      useAppStore
        .getState()
        .weekData.weeks?.map((w) => `${w.isoYear}-W${String(w.nr).padStart(2, "0")}`) ?? [];

    const expected2025 = Array.from({ length: 7 }, (_, idx) =>
      `2025-W${String(46 + idx).padStart(2, "0")}`,
    );
    const expected2026 = Array.from({ length: 5 }, (_, idx) =>
      `2026-W${String(idx + 1).padStart(2, "0")}`,
    );

    expect(weekIds).toEqual([...expected2025, ...expected2026]);
  });

  it("corrigeert foutieve datums aan de hand van het weeknummer", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-date",
      guideId: "guide-date",
      beginWeek: 1,
      eindWeek: 10,
      schooljaar: "2025/2026",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-date", [
      {
        week: 4,
        datum: "2026-01-12",
        datum_eind: "2026-01-16",
        onderwerp: "Toetsweek 2",
      },
    ]);

    const row = useAppStore.getState().docRows["guide-date"]?.[0];
    expect(row?.datum).toBe("2026-01-19");
    expect(row?.datum_eind).toBe("2026-01-23");
  });

  it("splitst import-huiswerk met zachte enters in afzonderlijke taken", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-wisb",
      guideId: "guide-wisb",
      vak: "Wiskunde B",
      beginWeek: 3,
      eindWeek: 3,
      schooljaar: "2025/2026",
    });

    store.setDocs([meta]);

    const lines = [
      "H2 Gemengde Opgaven 1 t/m 9",
      "H3 Gemengde Opgaven 1 t/m 11",
      "Oefentoetsen H2",
      "Oefentoetsen H3",
    ];

    store.setDocRows(meta.fileId, [
      {
        week: 3,
        datum: "2025-09-15",
        les: "Week 3",
        onderwerp: null,
        leerdoelen: null,
        huiswerk: lines.join("\u000b"),
        opdracht: null,
        inleverdatum: null,
        toets: null,
        bronnen: null,
        notities: null,
        klas_of_groep: null,
        locatie: null,
      },
    ]);

    const state = useAppStore.getState();
    const storedDoc = state.docs.find((doc) => doc.fileId === meta.fileId);
    expect(storedDoc).toBeDefined();

    const targetWeek = state.weekData.weeks?.find((week) => week.nr === 3);
    expect(targetWeek).toBeDefined();

    const aggregated = state.weekData.byWeek[targetWeek!.id]?.[storedDoc!.vak];
    expect(aggregated?.huiswerkItems).toEqual(lines);
  });

  it("kopieert notities uit het weeklabel naar alle kolommen wanneer er geen taken zijn", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-label",
      guideId: "guide-label",
      beginWeek: 52,
      eindWeek: 2,
      schooljaar: "2025/2026",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-label", [
      {
        week: 52,
        weeks: [52, 1],
        week_span_start: 52,
        week_span_end: 1,
        week_label: "52/1 Kerstvakantie",
        onderwerp: "Kerstvakantie",
      },
    ]);

    const state = useAppStore.getState();
    const week52 = state.weekData.weeks?.find((info) => info.nr === 52);
    const week01 = state.weekData.weeks?.find((info) => info.nr === 1);

    expect(week52).toBeDefined();
    expect(week01).toBeDefined();

    const data52 = week52 ? state.weekData.byWeek?.[week52.id]?.[meta.vak] : undefined;
    const data01 = week01 ? state.weekData.byWeek?.[week01.id]?.[meta.vak] : undefined;

    expect(data52?.lesstof).toContain("Kerstvakantie");
    expect(data52?.huiswerk).toContain("Kerstvakantie");
    expect(data52?.opmerkingen).toContain("Kerstvakantie");

    expect(data01?.lesstof).toContain("Kerstvakantie");
    expect(data01?.huiswerk).toContain("Kerstvakantie");
    expect(data01?.opmerkingen).toContain("Kerstvakantie");
  });

  it("laat reguliere huiswerktaken intact wanneer het weeklabel een algemene notitie bevat", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-label-notes",
      guideId: "guide-label-notes",
      beginWeek: 52,
      eindWeek: 52,
      schooljaar: "2025/2026",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-label-notes", [
      {
        week: 52,
        week_label: "wk 52 Kerstvakantie",
        onderwerp: "Kerstvakantie",
        huiswerk: "Herhalen grammatica",
      },
    ]);

    const state = useAppStore.getState();
    const week52 = state.weekData.weeks?.find((info) => info.nr === 52);
    expect(week52).toBeDefined();

    const data = week52 ? state.weekData.byWeek?.[week52.id]?.[meta.vak] : undefined;
    expect(data?.huiswerk).toContain("Herhalen grammatica");
    expect(data?.huiswerk).not.toContain("Kerstvakantie");
    expect(data?.opmerkingen).toContain("Kerstvakantie");
  });

  it("kopieert algemene toetsweekregels naar alle kolommen", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-general",
      guideId: "guide-general",
      beginWeek: 4,
      eindWeek: 4,
      schooljaar: "2025/2026",
      vak: "Duits",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-general", [
      {
        week: 4,
        week_label: "wk 4",
        weeks: [4],
        onderwerp: "Toetsweek 2",
      },
    ]);

    const state = useAppStore.getState();
    const week = state.weekData.weeks?.find((info) => info.nr === 4);
    expect(week).toBeDefined();

    const data = week ? state.weekData.byWeek?.[week.id]?.[meta.vak] : undefined;
    expect(data?.lesstof).toContain("Toetsweek 2");
    expect(data?.huiswerk).toContain("Toetsweek 2");
    expect(data?.deadlines).toContain("Toetsweek 2");
    expect(data?.opmerkingen).toContain("Toetsweek 2");
  });

  it("laat toetsen niet als huiswerk zien wanneer er echte taken zijn", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-toets",
      guideId: "guide-toets",
      beginWeek: 48,
      eindWeek: 48,
      schooljaar: "2025/2026",
      vak: "CKV",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-toets", [
      {
        week: 48,
        huiswerk: "Groen licht formulier laten ondertekenen.",
        toets: {
          type: "Toetsweek 2",
        },
      },
    ]);

    const state = useAppStore.getState();
    const week = state.weekData.weeks?.find((info) => info.nr === 48);
    expect(week).toBeDefined();

    const data = week ? state.weekData.byWeek?.[week.id]?.[meta.vak] : undefined;
    expect(data?.huiswerk).toContain("Groen licht formulier laten ondertekenen.");
    expect(data?.huiswerk).not.toContain("Toetsweek 2");
    expect(data?.deadlines).toContain("Toetsweek 2");
  });

  it("verbergt vakantie-notities niet wanneer schoolvakanties aanwezig zijn", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-vac", 
      guideId: "guide-vac",
      beginWeek: 52,
      eindWeek: 2,
      schooljaar: "2025/2026",
      vak: "CKV",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-vac", [
      {
        week: 52,
        weeks: [52, 1],
        week_span_start: 52,
        week_span_end: 1,
        week_label: "wk 52/1",
        onderwerp: "Kerstvakantie",
      },
    ]);

    store.setSchoolVacations([
      {
        id: "vac-kerst",
        name: "Kerstvakantie",
        region: "Regio Zuid",
        startDate: "2025-12-22",
        endDate: "2026-01-03",
        schoolYear: "2025/2026",
        source: "DUO",
        label: "Kerstvakantie",
        active: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ]);

    const state = useAppStore.getState();
    const week52 = state.weekData.weeks?.find((info) => info.nr === 52);
    const week01 = state.weekData.weeks?.find((info) => info.nr === 1);
    expect(week52).toBeDefined();
    expect(week01).toBeDefined();

    const data52 = week52 ? state.weekData.byWeek?.[week52.id]?.[meta.vak] : undefined;
    const data01 = week01 ? state.weekData.byWeek?.[week01.id]?.[meta.vak] : undefined;
    expect(data52?.huiswerk).toContain("Kerstvakantie");
    expect(data52?.deadlines).toContain("Kerstvakantie");
    expect(data01?.huiswerk).toContain("Kerstvakantie");
    expect(data01?.deadlines).toContain("Kerstvakantie");
  });

  it("spiegelt pdf-regels zonder aparte kolommen naar huiswerk en deadlines", () => {
    const store = useAppStore.getState();
    const pdfMeta = makeMeta({
      fileId: "guide-pdf",
      guideId: "guide-pdf",
      bestand: "ckv.pdf",
      beginWeek: 48,
      eindWeek: 4,
      schooljaar: "2024/2025",
      vak: "CKV",
    });

    store.setDocs([pdfMeta]);
    store.setDocRows("guide-pdf", [
      { week: 48, onderwerp: "Groen licht formulier laten ondertekenen." },
      { week: 51, onderwerp: "Inleveren Ruwe versie" },
      {
        week: 52,
        weeks: [52, 1],
        week_span_start: 52,
        week_span_end: 1,
        week_label: "52/1 Kerstvakantie",
        onderwerp: "Kerstvakantie",
      },
      { week: 2, onderwerp: "Inleveren opdracht 3\nDeadline definitieve film" },
    ]);

    const state = useAppStore.getState();
    const findWeekData = (weekNr: number) => {
      const info = state.weekData.weeks?.find((entry) => entry.nr === weekNr);
      return info ? state.weekData.byWeek?.[info.id]?.[pdfMeta.vak] : undefined;
    };

    const week48 = findWeekData(48);
    expect(week48?.lesstof).toContain("Groen licht formulier laten ondertekenen.");
    expect(week48?.huiswerk).toContain("Groen licht formulier laten ondertekenen.");
    expect(week48?.deadlines).toContain("Groen licht formulier laten ondertekenen.");
    expect(week48?.opmerkingen).toContain("Groen licht formulier laten ondertekenen.");

    const week51 = findWeekData(51);
    expect(week51?.huiswerk).toContain("Inleveren Ruwe versie");
    expect(week51?.deadlines).toContain("Inleveren Ruwe versie");

    const week52 = findWeekData(52);
    const week01 = findWeekData(1);
    expect(week52?.huiswerk).toContain("Kerstvakantie");
    expect(week01?.huiswerk).toContain("Kerstvakantie");

    const week02 = findWeekData(2);
    expect(week02?.huiswerk).toContain("Inleveren opdracht 3");
    expect(week02?.huiswerk).toContain("Deadline definitieve film");
    expect(week02?.deadlines).toContain("Inleveren opdracht 3");
    expect(week02?.deadlines).toContain("Deadline definitieve film");
    expect(week02?.huiswerkItems).toEqual(
      expect.arrayContaining(["Inleveren opdracht 3", "Deadline definitieve film"]),
    );
  });

  it("laat pdf-lesstof ongemoeid zodra het document echte huiswerkvelden bevat", () => {
    const store = useAppStore.getState();
    const pdfMeta = makeMeta({
      fileId: "guide-pdf",
      guideId: "guide-pdf",
      bestand: "ckv.pdf",
      beginWeek: 46,
      eindWeek: 48,
      schooljaar: "2024/2025",
      vak: "CKV",
    });

    store.setDocs([pdfMeta]);
    store.setDocRows("guide-pdf", [
      { week: 46, onderwerp: "Filmgeschiedenis" },
      { week: 47, onderwerp: "Nieuwe media" },
      { week: 48, huiswerk: "Groen licht formulier laten ondertekenen." },
    ]);

    const state = useAppStore.getState();
    const findWeekData = (weekNr: number) => {
      const info = state.weekData.weeks?.find((entry) => entry.nr === weekNr);
      return info ? state.weekData.byWeek?.[info.id]?.[pdfMeta.vak] : undefined;
    };

    const week46 = findWeekData(46);
    expect(week46?.lesstof).toContain("Filmgeschiedenis");
    expect(week46?.huiswerk).toBeUndefined();
    expect(week46?.deadlines).toBeUndefined();
    expect(week46?.opmerkingen).toBeUndefined();

    const week47 = findWeekData(47);
    expect(week47?.lesstof).toContain("Nieuwe media");
    expect(week47?.huiswerk).toBeUndefined();
    expect(week47?.deadlines).toBeUndefined();

    const week48 = findWeekData(48);
    expect(week48?.huiswerk).toContain("Groen licht formulier laten ondertekenen.");
  });

  it("laat docx-regels ongemoeid wanneer alleen de lesstof is ingevuld", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({ fileId: "guide-docx", guideId: "guide-docx" });

    store.setDocs([meta]);
    store.setDocRows("guide-docx", [
      {
        week: 3,
        onderwerp: "Alleen instructie",
      },
    ]);

    const state = useAppStore.getState();
    const weekInfo = state.weekData.weeks?.find((info) => info.nr === 3);
    const weekData = weekInfo ? state.weekData.byWeek?.[weekInfo.id]?.[meta.vak] : undefined;
    expect(weekData?.lesstof).toContain("Alleen instructie");
    expect(weekData?.huiswerk).toBeUndefined();
    expect(weekData?.deadlines).toBeUndefined();
  });

  it("voegt weken met verschillende nummering samen op basis van datums", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-alias",
      guideId: "guide-alias",
      beginWeek: 52,
      eindWeek: 2,
      schooljaar: "2023/2024",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-alias", [
      {
        week: 53,
        datum: "2024-01-03",
        onderwerp: "Toetsweek",
        huiswerk: "Leren hoofdstuk 5",
      },
      {
        week: 1,
        datum: "2024-01-04",
        onderwerp: "Herhaling",
        huiswerk: "Maak opdrachten 1-4",
      },
    ]);

    const state = useAppStore.getState();
    const weeks = state.weekData.weeks ?? [];
    expect(weeks.some((info) => info.isoYear === 2023 && info.nr === 53)).toBe(false);

    const weekOne = weeks.find((info) => info.isoYear === 2024 && info.nr === 1);
    expect(weekOne).toBeDefined();

    const weekData = weekOne ? state.weekData.byWeek?.[weekOne.id]?.[meta.vak] : undefined;
    expect(weekData?.huiswerk).toContain("Leren hoofdstuk 5");
    expect(weekData?.huiswerk).toContain("Maak opdrachten 1-4");
  });

  it("normaliseert kalenderweken ook zonder datums in alle rijen", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-gap",
      guideId: "guide-gap",
      beginWeek: 53,
      eindWeek: 2,
      schooljaar: "2023/2024",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-gap", [
      {
        week: 53,
        onderwerp: "Voorbereiding",
      },
      {
        week: 1,
        datum: "2024-01-05",
        onderwerp: "Start nieuwe periode",
      },
    ]);

    const state = useAppStore.getState();
    const weeks = state.weekData.weeks ?? [];

    expect(weeks.some((info) => info.isoYear === 2023 && info.nr === 53)).toBe(false);

    const weekOne = weeks.find((info) => info.isoYear === 2024 && info.nr === 1);
    expect(weekOne).toBeDefined();

    const data = weekOne ? state.weekData.byWeek?.[weekOne.id]?.[meta.vak] : undefined;
    expect(data?.lesstof).toContain("Voorbereiding");
    expect(data?.lesstof).toContain("Start nieuwe periode");
  });

  it("registreert multiweek informatie voor vervolgweken", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-multi",
      guideId: "guide-multi",
      beginWeek: 3,
      eindWeek: 4,
      schooljaar: "2024/2025",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-multi", [
      {
        week: 3,
        weeks: [3, 4],
        week_span_start: 3,
        week_span_end: 4,
        week_label: "3/4",
        datum: "2025-01-15",
        datum_eind: "2025-01-24",
        onderwerp: "Toetsweek",
        huiswerk: "Leren hoofdstuk 3",
        source_row_id: "row-1",
      },
    ]);

    const state = useAppStore.getState();
    const anchorWeek = state.weekData.weeks?.find((info) => info.nr === 3);
    const followWeek = state.weekData.weeks?.find((info) => info.nr === 4);
    expect(anchorWeek).toBeDefined();
    expect(followWeek).toBeDefined();

    const anchorData = state.weekData.byWeek?.[anchorWeek!.id]?.[meta.vak];
    const followData = state.weekData.byWeek?.[followWeek!.id]?.[meta.vak];

    expect(
      anchorData?.multiWeekSpans?.some((span) => span.role === "start" && span.toWeek === 4),
    ).toBe(true);
    expect(
      followData?.multiWeekSpans?.some((span) => span.role === "continue" && span.fromWeek === 3),
    ).toBe(true);
    expect(anchorData?.huiswerk).toContain("Leren hoofdstuk 3");
    expect(followData?.huiswerk).toContain("Leren hoofdstuk 3");
  });

  it("houdt multiweek regels zichtbaar als alleen de startdatum bekend is", () => {
    const store = useAppStore.getState();
    const meta = makeMeta({
      fileId: "guide-multi-start-only",
      guideId: "guide-multi-start-only",
      beginWeek: 3,
      eindWeek: 4,
      schooljaar: "2024/2025",
    });

    store.setDocs([meta]);
    store.setDocRows("guide-multi-start-only", [
      {
        week: 3,
        weeks: [3, 4],
        week_span_start: 3,
        week_span_end: 4,
        week_label: "3/4",
        datum: "2025-01-12",
        onderwerp: "Toetsweek",
        huiswerk: "Herhalen",
        source_row_id: "row-2",
      },
    ]);

    const state = useAppStore.getState();
    const weekThree = state.weekData.weeks?.find((info) => info.nr === 3);
    const weekFour = state.weekData.weeks?.find((info) => info.nr === 4);
    expect(weekThree).toBeDefined();
    expect(weekFour).toBeDefined();

    const weekThreeData = weekThree ? state.weekData.byWeek?.[weekThree.id]?.[meta.vak] : undefined;
    const weekFourData = weekFour ? state.weekData.byWeek?.[weekFour.id]?.[meta.vak] : undefined;

    expect(weekThreeData?.lesstof).toContain("Toetsweek");
    expect(weekFourData?.lesstof).toContain("Toetsweek");
    expect(weekThreeData?.huiswerk).toContain("Herhalen");
    expect(weekFourData?.huiswerk).toContain("Herhalen");
  });
});
