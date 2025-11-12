import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import WeekOverview from "../WeekOverview";
import { DocumentPreviewProvider } from "../../components/DocumentPreviewProvider";
import { useAppStore } from "../../app/store";
import type { DocMeta, DocRow } from "../../lib/api";

const makeMeta = (overrides?: Partial<DocMeta>): DocMeta => ({
  fileId: "guide-multi",
  guideId: "guide-multi",
  versionId: 1,
  bestand: "multiweek.docx",
  vak: "Geschiedenis",
  niveau: "VWO",
  leerjaar: "5",
  periode: 1,
  beginWeek: 3,
  eindWeek: 4,
  schooljaar: "2024/2025",
  uploadedAt: "2024-01-10T08:00:00.000Z",
  ...overrides,
});

const makeRow = (overrides?: Partial<DocRow>): DocRow => ({
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
  ...overrides,
});

describe("WeekOverview", () => {
  beforeEach(() => {
    useAppStore.getState().resetAppState();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("toont doorlopend huiswerk zonder extra multiweekmelding", () => {
    const store = useAppStore.getState();
    const meta = makeMeta();
    store.setDocs([meta]);
    store.setDocRows(meta.fileId, [makeRow()]);

    render(
      <DocumentPreviewProvider>
        <WeekOverview />
      </DocumentPreviewProvider>,
    );

    expect(screen.queryByText(/vervolg van 3\/4/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/loopt door tot week/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/leren hoofdstuk 3/i).length).toBeGreaterThan(0);
  });
});
