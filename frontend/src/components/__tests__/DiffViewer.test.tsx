import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DiffRowsList, DiffSummaryBadges } from "../DiffViewer";
import type { DocDiff } from "../../lib/api";

describe("DiffViewer", () => {
  it("toont diff-samenvatting met labels", () => {
    const diffSummary = { added: 2, changed: 1, removed: 0, unchanged: 3 };
    render(<DiffSummaryBadges summary={diffSummary} />);
    expect(screen.getByText(/Nieuw: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Gewijzigd: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Ongewijzigd: 3/i)).toBeInTheDocument();
  });

  it("rendered veldwijzigingen met kleurcodering", () => {
    const diff: DocDiff["diff"] = [
      {
        index: 0,
        status: "changed",
        fields: {
          week: { status: "changed", old: 1, new: 2 },
          datum: { status: "unchanged", old: "2024-01-08", new: "2024-01-08" },
        },
      },
      {
        index: 1,
        status: "added",
        fields: {
          week: { status: "added", old: null, new: 3 },
        },
      },
    ];

    render(<DiffRowsList diff={diff} emptyLabel="Geen verschillen" />);

    const changedBadge = screen.getByText(/Rij 1/i);
    expect(changedBadge.className).toContain("bg-amber-100");

    const addedBadge = screen.getByText(/Rij 2/i);
    expect(addedBadge.className).toContain("bg-emerald-100");

    const [changedWeekLabel, addedWeekLabel] = screen.getAllByText("week");
    expect(changedWeekLabel.parentElement?.className).toContain("bg-amber-100");
    expect(addedWeekLabel.parentElement?.className).toContain("bg-emerald-100");

    expect(screen.getByText(/2024-01-08/)).toBeInTheDocument();
  });

  it("laat melding zien wanneer diff leeg is", () => {
    render(<DiffRowsList diff={[]} emptyLabel="Geen wijzigingen" />);
    expect(screen.getByText("Geen wijzigingen")).toBeInTheDocument();
  });
});
