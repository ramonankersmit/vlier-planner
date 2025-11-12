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
});
