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
      warnings: { unknownSubject: true, missingWeek: true, duplicateDate: false },
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
});
