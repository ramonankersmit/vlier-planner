import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Uploads from "../Uploads";
import { useAppStore } from "../../app/store";
import type { CommitResponse, DocMeta, DocRow, ReviewDraft } from "../../lib/api";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    apiUploadDoc: vi.fn(),
    apiCommitReview: vi.fn(),
    apiDeleteReview: vi.fn(),
    apiCreateReviewFromVersion: vi.fn(),
  };
});

vi.mock("../../components/DocumentPreviewProvider", () => ({
  useDocumentPreview: () => ({ openPreview: vi.fn(), closePreview: vi.fn() }),
}));

const mockedApi = vi.mocked(await import("../../lib/api"));

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
  uploadedAt: "2024-01-10T08:00:00.000Z",
  ...overrides,
});

const makeRow = (overrides?: Partial<DocRow>): DocRow => ({
  week: 1,
  datum: "2024-01-10",
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
  ...overrides,
});

const makeReview = (overrides?: Partial<ReviewDraft>): ReviewDraft => ({
  parseId: "parse-1",
  meta: makeMeta(),
  rows: [makeRow()],
  warnings: {
    unknownSubject: false,
    missingWeek: false,
    duplicateDate: false,
    duplicateWeek: false,
  },
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
  ...overrides,
});

describe("Uploads page flow", () => {
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

  it("commits automatisch wanneer er geen waarschuwingen zijn", async () => {
    const review = makeReview();
    const commitResponse: CommitResponse = {
      guideId: review.meta.fileId,
      version: {
        versionId: 1,
        createdAt: "2024-01-10T08:05:00.000Z",
        meta: makeMeta({ uploadedAt: "2024-01-10T08:05:00.000Z" }),
        diffSummary: review.diffSummary,
      },
    };

    mockedApi.apiUploadDoc.mockResolvedValue([review]);
    mockedApi.apiCommitReview.mockResolvedValue(commitResponse);

    const user = userEvent.setup();

    const { container } = render(
      <MemoryRouter initialEntries={["/uploads"]}>
        <Routes>
          <Route path="/uploads" element={<Uploads />} />
        </Routes>
      </MemoryRouter>
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake"], "demo.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await act(async () => {
      await user.upload(fileInput, file);
    });

    await waitFor(() => expect(mockedApi.apiUploadDoc).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedApi.apiCommitReview).toHaveBeenCalledWith(review.parseId));

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(Object.keys(state.pendingReviews)).toHaveLength(0);
      expect(state.docs.some((doc) => doc.fileId === commitResponse.guideId)).toBe(true);
    });

    expect(screen.getByText(/demo\.docx/)).toBeInTheDocument();
    expect(screen.queryByText(/In gebruik/i)).not.toBeInTheDocument();
  });

  it("commits automatisch bij enkel dubbele waarschuwingen", async () => {
    const review = makeReview({
      parseId: "parse-dup",
      rows: [
        makeRow({ week: 44, datum: "2024-10-28", enabled: true }),
        makeRow({ week: 44, datum: "2024-10-28", enabled: false }),
      ],
      warnings: {
        unknownSubject: false,
        missingWeek: false,
        duplicateDate: false,
        duplicateWeek: true,
      },
    });
    const commitResponse: CommitResponse = {
      guideId: review.meta.fileId,
      version: {
        versionId: 2,
        createdAt: "2024-02-01T09:00:00.000Z",
        meta: makeMeta({ uploadedAt: "2024-02-01T09:00:00.000Z" }),
        diffSummary: review.diffSummary,
      },
    };

    mockedApi.apiUploadDoc.mockResolvedValue([review]);
    mockedApi.apiCommitReview.mockResolvedValue(commitResponse);

    const user = userEvent.setup();

    const { container } = render(
      <MemoryRouter initialEntries={["/uploads"]}>
        <Routes>
          <Route path="/uploads" element={<Uploads />} />
        </Routes>
      </MemoryRouter>
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake"], "duplicate.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await act(async () => {
      await user.upload(fileInput, file);
    });

    await waitFor(() => expect(mockedApi.apiUploadDoc).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedApi.apiCommitReview).toHaveBeenCalledWith(review.parseId));

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(Object.keys(state.pendingReviews)).toHaveLength(0);
      expect(state.docs.some((doc) => doc.fileId === commitResponse.guideId)).toBe(true);
    });
  });

  it("toont pending review met waarschuwingen en start de wizard via de reviewknop", async () => {
    const pendingReview = makeReview({
      parseId: "parse-2",
      meta: makeMeta({ bestand: "nieuw.docx", vak: "" }),
      warnings: {
        unknownSubject: true,
        missingWeek: true,
        duplicateDate: false,
        duplicateWeek: false,
      },
    });

    await act(async () => {
      const store = useAppStore.getState();
      store.setPendingReview(pendingReview);
      store.setActiveReview(null);
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/uploads"]}>
        <Routes>
          <Route path="/uploads" element={<Uploads />} />
          <Route path="/review" element={<div>Review pagina</div>} />
          <Route path="/review/:parseId" element={<div>Review pagina</div>} />
        </Routes>
      </MemoryRouter>
    );

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const row = rows.find((candidate) => within(candidate).queryByText(/nieuw\.docx/));
    expect(row).toBeTruthy();
    const utils = within(row as HTMLElement);
    expect(utils.getByText(/Review vereist/)).toBeInTheDocument();
    expect(utils.getByText(/1 toegevoegd/)).toBeInTheDocument();
    expect(utils.getByText(/Vak onbekend/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Review openen"));

    await waitFor(() => expect(useAppStore.getState().activeReviewId).toBe(pendingReview.parseId));
    await waitFor(() => expect(screen.getByText(/Review pagina/)).toBeInTheDocument());
  });

  it("toont een groen vinkje met waarschuwingstekst bij niet-blokkerende waarschuwingen", async () => {
    const pendingReview = makeReview({
      parseId: "parse-warning",
      warnings: {
        unknownSubject: false,
        missingWeek: false,
        duplicateDate: false,
        duplicateWeek: true,
      },
    });

    await act(async () => {
      const store = useAppStore.getState();
      store.setPendingReview(pendingReview);
      store.setActiveReview(null);
    });

    render(
      <MemoryRouter initialEntries={["/uploads"]}>
        <Routes>
          <Route path="/uploads" element={<Uploads />} />
        </Routes>
      </MemoryRouter>
    );

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const row = rows.find((candidate) => within(candidate).queryByText(/demo\.docx/));
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByTestId("status-icon-success")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText(/Dubbele week/)).toBeInTheDocument();
  });

  it("start nieuwe review voor actieve studiewijzer via de actieknop", async () => {
    const meta = makeMeta();
    const rows = [makeRow()];
    const restartReview = makeReview({
      parseId: "restart-1",
      rows,
      diffSummary: { added: 0, changed: 0, removed: 0, unchanged: 1 },
      diff: [
        {
          index: 0,
          status: "unchanged",
          fields: {},
        },
      ],
    });

    mockedApi.apiCreateReviewFromVersion.mockResolvedValue(restartReview);

    await act(async () => {
      const store = useAppStore.getState();
      store.setDocs([meta]);
      store.setDocRows(meta.fileId, rows);
      store.setStudyGuides([
        {
          guideId: meta.fileId,
          latestVersion: {
            versionId: meta.versionId ?? 1,
            createdAt: meta.uploadedAt ?? "2024-01-10T08:00:00.000Z",
            meta,
            diffSummary: { added: 0, changed: 0, removed: 0, unchanged: 1 },
          },
          versionCount: 1,
        },
      ]);
      store.setActiveReview(null);
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/uploads"]}>
        <Routes>
          <Route path="/uploads" element={<Uploads />} />
          <Route path="/review/:parseId" element={<div>Review pagina</div>} />
        </Routes>
      </MemoryRouter>
    );

    const reviewButton = screen.getByLabelText("Start nieuwe review");
    await user.click(reviewButton);

    await waitFor(() =>
      expect(mockedApi.apiCreateReviewFromVersion).toHaveBeenCalledWith(
        meta.fileId,
        meta.versionId
      )
    );
    await waitFor(() =>
      expect(useAppStore.getState().pendingReviews[restartReview.parseId]).toBeDefined()
    );
    await waitFor(() => expect(screen.getByText(/Review pagina/)).toBeInTheDocument());
  });

  it("heropent bestaande pending review voor hetzelfde document", async () => {
    const meta = makeMeta();
    const pending = makeReview({
      parseId: "pending-1",
      meta,
      rows: [makeRow()],
    });

    await act(async () => {
      const store = useAppStore.getState();
      store.setDocs([meta]);
      store.setPendingReview(pending);
      store.setActiveReview(null);
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/uploads"]}>
        <Routes>
          <Route path="/uploads" element={<Uploads />} />
          <Route path="/review/:parseId" element={<div>Review pagina</div>} />
        </Routes>
      </MemoryRouter>
    );

    const reviewButton = screen.getByLabelText("Start nieuwe review");
    await user.click(reviewButton);

    await waitFor(() =>
      expect(useAppStore.getState().activeReviewId).toBe(pending.parseId)
    );
    expect(mockedApi.apiCreateReviewFromVersion).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Review pagina/)).toBeInTheDocument());
  });
});
