import React from "react";
import clsx from "clsx";
import type { DiffField, DiffRow, DiffStatus, DiffSummary } from "../lib/api";

export const diffStatusStyles: Record<DiffStatus, string> = {
  added: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  removed: "bg-rose-100 text-rose-800 border border-rose-200",
  changed: "bg-amber-100 text-amber-800 border border-amber-200",
  unchanged: "bg-slate-100 text-slate-600 border border-slate-200",
};

export const diffStatusLabels: Record<DiffStatus, string> = {
  added: "Nieuw",
  removed: "Verwijderd",
  changed: "Gewijzigd",
  unchanged: "Ongewijzigd",
};

export const diffSummaryOrder: DiffStatus[] = [
  "added",
  "changed",
  "removed",
  "unchanged",
];

const formatDiffValue = (value: unknown): string => {
  if (value == null || value === "") {
    return "—";
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatDiffValue(item)).join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
};

const renderFieldContent = (diff: {
  status: DiffStatus;
  old: unknown;
  new: unknown;
}): React.ReactNode => {
  const oldValue = formatDiffValue(diff.old);
  const newValue = formatDiffValue(diff.new);
  if (diff.status === "added") {
    return <span>{newValue}</span>;
  }
  if (diff.status === "removed") {
    return <span className="line-through opacity-70">{oldValue}</span>;
  }
  if (diff.status === "changed") {
    return (
      <div className="space-y-1">
        <div className="line-through opacity-70">{oldValue}</div>
        <div>{newValue}</div>
      </div>
    );
  }
  return <span>{newValue}</span>;
};

export type DiffSummaryBadgesProps = {
  summary: DiffSummary;
  className?: string;
};

export function DiffSummaryBadges({ summary, className }: DiffSummaryBadgesProps) {
  return (
    <div className={clsx("flex flex-wrap gap-1", className)}>
      {diffSummaryOrder.map((status) => (
        <span
          key={status}
          className={clsx("rounded-full px-2 py-0.5 text-xs", diffStatusStyles[status])}
        >
          {diffStatusLabels[status]}: {summary[status] ?? 0}
        </span>
      ))}
    </div>
  );
}

export type DiffRowsListProps = {
  diff: DiffRow[];
  emptyLabel?: string;
};

export function DiffRowsList({ diff, emptyLabel }: DiffRowsListProps) {
  if (!diff.length) {
    return (
      <div className="text-xs theme-muted">
        {emptyLabel ?? "Geen verschillen met de vorige versie."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {diff.map((row) => (
        <div key={row.index} className="space-y-2 rounded-lg border theme-border p-3">
          <div
            className={clsx(
              "inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
              diffStatusStyles[row.status]
            )}
          >
            Rij {row.index + 1} · {diffStatusLabels[row.status]}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(row.fields).map(([field, fieldDiff]: [string, DiffField]) => (
              <div
                key={field}
                className={clsx(
                  "rounded-md border px-2 py-1 text-xs",
                  diffStatusStyles[fieldDiff.status]
                )}
              >
                <div className="font-semibold uppercase tracking-wide">{field}</div>
                <div className="mt-1">{renderFieldContent(fieldDiff)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export type DocDiffViewerProps = {
  diff: DiffRow[];
  summary: DiffSummary;
  loading?: boolean;
  emptyLabel?: string;
};

export function DocDiffViewer({ diff, summary, loading, emptyLabel }: DocDiffViewerProps) {
  if (loading) {
    return <div className="text-xs theme-muted">Diff wordt geladen…</div>;
  }
  return (
    <div className="space-y-3">
      <DiffSummaryBadges summary={summary} />
      <DiffRowsList diff={diff} emptyLabel={emptyLabel} />
    </div>
  );
}
