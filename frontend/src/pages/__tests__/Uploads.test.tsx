import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Uploads from "../Uploads";
import { useAppStore } from "../../app/store";
import type {
  CommitResponse,
  DocMeta,
  DocRow,
  ReviewDraft,
  UploadCommittedEntry,
  UploadPendingEntry,
} from "../../lib/api";

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    apiUploadDoc: vi.fn(),
    apiCommitReview: vi.fn(),
    apiDeleteReview: vi.fn(),
    apiCreateReviewFromVersion: vi.fn(),
    apiDeleteDoc: vi.fn(),
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

const makeCommittedEntry = (
  review: ReviewDraft,
  commit: CommitResponse
): UploadCommittedEntry => ({
  status: "committed",
  commit,
  rows: review.rows,
  diffSummary: review.diffSummary,
  diff: review.diff,
});

const makePendingEntry = (review: ReviewDraft): UploadPendingEntry => ({
  status: "pending",
  review,
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
        warnings: {
          unknownSubject: false,
          missingWeek: false,
          duplicateDate: false,
          duplicateWeek: false,
        },
      },
    };

    mockedApi.apiUploadDoc.mockResolvedValue([makeCommittedEntry(review, commitResponse)]);
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
    expect(mockedApi.apiCommitReview).not.toHaveBeenCalled();

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
        warnings: {
          unknownSubject: false,
          missingWeek: false,
          duplicateDate: false,
          duplicateWeek: true,
        },
      },
    };

    mockedApi.apiUploadDoc.mockResolvedValue([makeCommittedEntry(review, commitResponse)]);
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
    expect(mockedApi.apiCommitReview).not.toHaveBeenCalled();

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(Object.keys(state.pendingReviews)).toHaveLength(0);
      expect(state.docs.some((doc) => doc.fileId === commitResponse.guideId)).toBe(true);
    });

    expect(await screen.findByText(/Dubbele week/)).toBeInTheDocument();
  });

  it("plaatst uploads met blokkades in de reviewwachtrij", async () => {
    const review = makeReview({
      parseId: "parse-pending",
      meta: makeMeta({ bestand: "pending.docx", vak: "" }),
      warnings: {
        unknownSubject: true,
        missingWeek: false,
        duplicateDate: false,
        duplicateWeek: false,
      },
    });

    mockedApi.apiUploadDoc.mockResolvedValue([makePendingEntry(review)]);

    const user = userEvent.setup();

    const { container } = render(
      <MemoryRouter initialEntries={["/uploads"]}>
        <Routes>
          <Route path="/uploads" element={<Uploads />} />
        </Routes>
      </MemoryRouter>
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake"], "pending.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await act(async () => {
      await user.upload(fileInput, file);
    });

    await waitFor(() => expect(mockedApi.apiUploadDoc).toHaveBeenCalledTimes(1));
    expect(mockedApi.apiCommitReview).not.toHaveBeenCalled();

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.pendingReviews[review.parseId]).toBeTruthy();
    });

    expect(await screen.findByText(/Review vereist/)).toBeInTheDocument();
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
    expect(utils.queryByText(/1 toegevoegd/)).not.toBeInTheDocument();
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
    const utils = within(row as HTMLElement);
    expect(utils.getByTestId("status-icon-warning")).toBeInTheDocument();
    expect(utils.queryByText(/1 toegevoegd/)).not.toBeInTheDocument();
    expect(utils.getByText(/Dubbele week/)).toBeInTheDocument();
  });

  it("verbergt waarschuwingen na het opslaan van een opgeloste review", async () => {
    const initialReview = makeReview({
      parseId: "parse-resolve",
      warnings: {
        unknownSubject: false,
        missingWeek: false,
        duplicateDate: false,
        duplicateWeek: true,
      },
      rows: [
        makeRow({ week: 44, datum: "2024-10-28", enabled: true }),
        makeRow({ week: 44, datum: "2024-10-28", enabled: true }),
      ],
    });

    await act(async () => {
      const store = useAppStore.getState();
      store.setPendingReview(initialReview);
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
    let utils = within(row as HTMLElement);
    expect(utils.getByTestId("status-icon-warning")).toBeInTheDocument();
    expect(utils.getByText(/Dubbele week/)).toBeInTheDocument();

    const resolvedReview = makeReview({
      parseId: "parse-resolve",
      warnings: {
        unknownSubject: false,
        missingWeek: false,
        duplicateDate: false,
        duplicateWeek: false,
      },
      rows: [
        makeRow({ week: 44, datum: "2024-10-28", enabled: false }),
        makeRow({ week: 44, datum: "2024-11-04", enabled: true }),
      ],
    });

    await act(async () => {
      const store = useAppStore.getState();
      store.setPendingReview(resolvedReview);
    });

    const refreshedTable = screen.getByRole("table");
    const refreshedRows = within(refreshedTable).getAllByRole("row");
    const refreshedRow = refreshedRows.find((candidate) =>
      within(candidate).queryByText(/demo\.docx/)
    );
    expect(refreshedRow).toBeTruthy();
    utils = within(refreshedRow as HTMLElement);
    expect(utils.queryByTestId("status-icon-warning")).not.toBeInTheDocument();
    expect(utils.queryByText(/Dubbele week/)).not.toBeInTheDocument();
  });

  it("laat actieve documenten de pending reviewstatus volgen", async () => {
    const meta = makeMeta({
      fileId: "guide-sync",
      guideId: "guide-sync",
      bestand: "sync.docx",
      uploadedAt: "2024-03-01T09:00:00.000Z",
      versionId: 2,
    });
    const versionWarnings = {
      unknownSubject: false,
      missingWeek: false,
      duplicateDate: false,
      duplicateWeek: true,
    } as const;
    const pendingReview = makeReview({
      parseId: "parse-sync",
      meta: makeMeta({
        fileId: meta.fileId,
        guideId: meta.guideId,
        bestand: meta.bestand,
        uploadedAt: "2024-03-02T09:30:00.000Z",
        versionId: meta.versionId ?? 2,
      }),
      warnings: { ...versionWarnings },
    });

    await act(async () => {
      const store = useAppStore.getState();
      store.setDocs([meta]);
      store.setStudyGuides([
        {
          guideId: meta.fileId,
          latestVersion: {
            versionId: meta.versionId ?? 1,
            createdAt: meta.uploadedAt ?? "2024-03-01T09:00:00.000Z",
            meta,
            diffSummary: pendingReview.diffSummary,
            warnings: { ...versionWarnings },
          },
          versionCount: 2,
        },
      ]);
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
    const activeRow = rows.find((candidate) => {
      const utils = within(candidate);
      return (
        utils.queryByText(/sync\.docx/) &&
        !utils.queryByText(/Review vereist/)
      );
    });
    expect(activeRow).toBeTruthy();
    let utils = within(activeRow as HTMLElement);
    expect(utils.getByTestId("status-icon-warning")).toBeInTheDocument();
    expect(utils.getByText(/Dubbele week/)).toBeInTheDocument();

    const resolvedReview = makeReview({
      parseId: "parse-sync",
      meta: pendingReview.meta,
      warnings: {
        unknownSubject: false,
        missingWeek: false,
        duplicateDate: false,
        duplicateWeek: false,
      },
    });

    await act(async () => {
      useAppStore.getState().setPendingReview(resolvedReview);
    });

    const refreshedTable = screen.getByRole("table");
    const refreshedRows = within(refreshedTable).getAllByRole("row");
    const refreshedActiveRow = refreshedRows.find((candidate) => {
      const scoped = within(candidate);
      return (
        scoped.queryByText(/sync\.docx/) &&
        !scoped.queryByText(/Review vereist/)
      );
    });
    expect(refreshedActiveRow).toBeTruthy();
    utils = within(refreshedActiveRow as HTMLElement);
    expect(utils.queryByTestId("status-icon-warning")).not.toBeInTheDocument();
    expect(utils.queryByText(/Dubbele week/)).not.toBeInTheDocument();
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
            warnings: {
              unknownSubject: false,
              missingWeek: false,
              duplicateDate: false,
              duplicateWeek: false,
            },
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

  it("verwijdert alle bestanden tegelijk na bevestiging", async () => {
    const first = makeMeta({ fileId: "guide-a", bestand: "a.docx" });
    const second = makeMeta({ fileId: "guide-b", bestand: "b.docx" });
    mockedApi.apiDeleteDoc.mockResolvedValue(undefined);

    await act(async () => {
      useAppStore.getState().setDocs([first, second]);
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/uploads"]}>
        <Routes>
          <Route path="/uploads" element={<Uploads />} />
        </Routes>
      </MemoryRouter>
    );

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const button = screen.getByRole("button", { name: /Alle bestanden verwijderen/i });
    await user.click(button);
    confirmSpy.mockRestore();

    await waitFor(() => expect(mockedApi.apiDeleteDoc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(useAppStore.getState().docs).toHaveLength(0));
  });
});
