import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Review from "../Review";
import { useAppStore } from "../../app/store";
import type { CommitResponse, DocDiff, DocMeta, DocRow, ReviewDraft } from "../../lib/api";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    apiGetReview: vi.fn(),
    apiUpdateReview: vi.fn(),
    apiCommitReview: vi.fn(),
    apiGetStudyGuideDiff: vi.fn(),
    apiDeleteReview: vi.fn(),
  };
});

const mockedApi = vi.mocked(await import("../../lib/api"));

const makeMeta = (overrides?: Partial<DocMeta>): DocMeta => ({
  fileId: "guide-1",
  guideId: "guide-1",
  versionId: 1,
  bestand: "demo.docx",
  vak: "",
  niveau: "VWO",
  leerjaar: "5",
  periode: 1,
  beginWeek: 1,
  eindWeek: 5,
  schooljaar: "2024/2025",
  uploadedAt: "2024-01-10T08:00:00.000Z",
  ...overrides,
});

const makeRow = (overrides?: Partial<DocRow>): DocRow => ({
  week: null,
  datum: null,
  les: "Les 1",
  onderwerp: "Intro",
  huiswerk: null,
  opdracht: null,
  leerdoelen: null,
  bronnen: null,
  toets: null,
  notities: null,
  klas_of_groep: null,
  locatie: null,
  enabled: true,
  ...overrides,
});

describe("Review wizard", () => {
  beforeEach(() => {
    useAppStore.getState().resetAppState();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blokkeert commit tot onzekerheden zijn opgelost", async () => {
    const review: ReviewDraft = {
      parseId: "parse-1",
      meta: makeMeta({ vak: "" }),
      rows: [makeRow()],
      warnings: { unknownSubject: true, missingWeek: true, duplicateDate: false },
      diffSummary: { added: 1, changed: 0, removed: 0, unchanged: 0 },
      diff: [
        {
          index: 0,
          status: "added",
          fields: {
            week: { status: "added", old: null, new: 1 },
            datum: { status: "added", old: null, new: "2024-01-10" },
          },
        },
      ],
    };

    const store = useAppStore.getState();
    await act(async () => {
      store.setPendingReview(review);
      store.setActiveReview(review.parseId);
    });

    mockedApi.apiGetReview.mockResolvedValue(review);

    const updatedReview: ReviewDraft = {
      ...review,
      meta: makeMeta({ vak: "Wiskunde" }),
      rows: [makeRow({ week: 1, datum: "2024-01-10" })],
      warnings: { unknownSubject: false, missingWeek: false, duplicateDate: false },
      diffSummary: { added: 0, changed: 1, removed: 0, unchanged: 0 },
      diff: [
        {
          index: 0,
          status: "changed",
          fields: {
            week: { status: "changed", old: null, new: 1 },
            datum: { status: "changed", old: null, new: "2024-01-10" },
          },
        },
      ],
    };

    mockedApi.apiUpdateReview.mockResolvedValue(updatedReview);

    const commitResponse: CommitResponse = {
      guideId: "guide-1",
      version: {
        versionId: 2,
        createdAt: "2024-01-11T09:00:00.000Z",
        meta: makeMeta({ vak: "Wiskunde", uploadedAt: "2024-01-11T09:00:00.000Z", versionId: 2 }),
        diffSummary: updatedReview.diffSummary,
      },
    };

    mockedApi.apiCommitReview.mockResolvedValue(commitResponse);

    const commitDiff: DocDiff = { diffSummary: updatedReview.diffSummary, diff: updatedReview.diff };
    mockedApi.apiGetStudyGuideDiff.mockResolvedValue(commitDiff);

    const user = userEvent.setup();

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/review/parse-1"]}>
          <Routes>
            <Route path="/review/:parseId" element={<Review />} />
            <Route path="/review" element={<Review />} />
            <Route path="/uploads" element={<div>Uploads Page</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(mockedApi.apiGetReview).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(/Los deze aandachtspunten op/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Vul het vak in bij de metadata zodat de studiewijzer gekoppeld kan worden\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Weeknummer ontbreekt in rij 1. Vul de weekkolom in of schakel de rij tijdelijk uit./i)
    ).toBeInTheDocument();

    const commitButton = await screen.findByRole("button", { name: /Definitief opslaan/i });
    expect(commitButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Vak/i), "Wiskunde");
    const weekInput = screen.getByLabelText(/Week rij 1/i);
    await user.clear(weekInput);
    await user.type(weekInput, "1");
    await user.type(screen.getByLabelText(/Datum rij 1/i), "2024-01-10");

    await user.click(screen.getByRole("button", { name: /Wijzigingen opslaan/i }));
    await waitFor(() => expect(mockedApi.apiUpdateReview).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(commitButton).toBeEnabled());

    await user.click(commitButton);

    await waitFor(() => expect(mockedApi.apiCommitReview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedApi.apiGetStudyGuideDiff).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(Object.keys(state.pendingReviews)).toHaveLength(0);
      expect(state.docs.some((doc) => doc.fileId === commitResponse.guideId)).toBe(true);
    });

    await waitFor(() => expect(screen.getByText(/Uploads Page/i)).toBeInTheDocument());
  });
});
