import React from "react";
import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import { DiffRowsList, DiffSummaryBadges } from "../components/DiffViewer";
import {
  apiCommitReview,
  apiDeleteReview,
  apiGetReview,
  apiGetStudyGuideDiff,
  apiUpdateReview,
  type CommitResponse,
  type DocDiff,
  type DocRow,
  type ReviewDraft,
  type ReviewUpdatePayload,
} from "../lib/api";
import { parseIsoDate } from "../lib/calendar";
import { useAppStore } from "../app/store";

const warningLabels: Record<keyof ReviewDraft["warnings"], string> = {
  unknownSubject: "Vul het vak in",
  missingWeek: "Weeknummer ontbreekt",
  duplicateDate: "Dubbele datum gevonden",
};

const niveauOptions: Array<"HAVO" | "VWO"> = ["HAVO", "VWO"];

const cloneRows = (rows: DocRow[]): DocRow[] =>
  rows.map((row) => ({
    ...row,
    bronnen: row.bronnen ? row.bronnen.map((br) => ({ ...br })) : null,
    toets: row.toets ? { ...row.toets } : null,
    leerdoelen: row.leerdoelen ? [...row.leerdoelen] : null,
  }));

const formatUploadMoment = (value?: string | null): string => {
  if (!value) {
    return "Onbekend moment";
  }
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return value;
  }
  return parsed.toLocaleString("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatDutchDate = (value: string): string => {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return value;
  }
  return parsed.toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export default function Review() {
  const navigate = useNavigate();
  const pendingReviews = useAppStore((state) => state.pendingReviews);
  const activeReviewId = useAppStore((state) => state.activeReviewId);
  const setPendingReview = useAppStore((state) => state.setPendingReview);
  const removePendingReview = useAppStore((state) => state.removePendingReview);
  const setActiveReview = useAppStore((state) => state.setActiveReview);
  const applyCommitResult = useAppStore((state) => state.applyCommitResult);

  const reviewList = React.useMemo(() => {
    const entries = Object.values(pendingReviews);
    return entries.sort((a, b) => {
      const tsA = Date.parse(a.meta.uploadedAt ?? "");
      const tsB = Date.parse(b.meta.uploadedAt ?? "");
      return (Number.isNaN(tsB) ? 0 : tsB) - (Number.isNaN(tsA) ? 0 : tsA);
    });
  }, [pendingReviews]);

  React.useEffect(() => {
    const ids = Object.keys(pendingReviews);
    if (!ids.length) {
      navigate("/uploads", { replace: true });
      return;
    }
    if (!activeReviewId || !pendingReviews[activeReviewId]) {
      setActiveReview(ids[0]);
    }
  }, [pendingReviews, activeReviewId, navigate, setActiveReview]);

  const activeReview: ReviewDraft | null = activeReviewId
    ? pendingReviews[activeReviewId] ?? null
    : null;

  const [localMeta, setLocalMeta] = React.useState(activeReview ? { ...activeReview.meta } : null);
  const [localRows, setLocalRows] = React.useState<DocRow[]>(activeReview ? cloneRows(activeReview.rows) : []);
  const [isLoading, setLoading] = React.useState(false);
  const [isSaving, setSaving] = React.useState(false);
  const [isCommitting, setCommitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const duplicateGroups = React.useMemo(() => {
    const groups = new Map<string, number[]>();
    localRows.forEach((row, index) => {
      const value = row.datum?.trim();
      if (!value) {
        return;
      }
      const entries = groups.get(value) ?? [];
      entries.push(index);
      groups.set(value, entries);
    });
    return Array.from(groups.entries())
      .filter(([, indexes]) => indexes.length > 1)
      .map(([date, indexes]) => ({ date, indexes }));
  }, [localRows]);

  const duplicateIndexMap = React.useMemo(() => {
    const map = new Map<number, { date: string; peers: number[] }>();
    duplicateGroups.forEach((group) => {
      group.indexes.forEach((index) => {
        map.set(index, {
          date: group.date,
          peers: group.indexes.filter((idx) => idx !== index),
        });
      });
    });
    return map;
  }, [duplicateGroups]);

  const missingWeekIndexes = React.useMemo(() => {
    const indexes: number[] = [];
    localRows.forEach((row, index) => {
      if (row.week === null || row.week === undefined) {
        indexes.push(index);
      }
    });
    return indexes;
  }, [localRows]);

  const attentionIndexSet = React.useMemo(() => {
    const indices = new Set<number>();
    missingWeekIndexes.forEach((index) => indices.add(index));
    duplicateIndexMap.forEach((_, index) => indices.add(index));
    return indices;
  }, [missingWeekIndexes, duplicateIndexMap]);

  const formatRowList = React.useCallback((indexes: number[]) => {
    if (!indexes.length) {
      return "";
    }
    return indexes
      .map((idx) => `rij ${idx + 1}`)
      .join(", ")
      .replace(/,([^,]*)$/, " en$1");
  }, []);

  const warningDetails = React.useMemo(() => {
    if (!activeReview || !localMeta) {
      return [] as string[];
    }
    const items: string[] = [];
    if (activeReview.warnings.unknownSubject) {
      if (!localMeta.vak) {
        items.push(
          "Vul het vak in bij de metadata zodat de studiewijzer aan het juiste vak wordt gekoppeld."
        );
      } else {
        items.push("Sla de metadata op zodat het ingevulde vak wordt bevestigd.");
      }
    }
    if (activeReview.warnings.missingWeek) {
      if (missingWeekIndexes.length) {
        items.push(
          `Weeknummer ontbreekt in ${formatRowList(missingWeekIndexes)}. Vul de weekkolom in of verwijder de rij.`
        );
      } else {
        items.push("Sla je wijzigingen op zodat de ingevulde weeknummers bewaard worden.");
      }
    }
    if (activeReview.warnings.duplicateDate) {
      if (duplicateGroups.length) {
        duplicateGroups.forEach((group) => {
          const rows = formatRowList(group.indexes);
          items.push(
            `Dubbele datum ${formatDutchDate(group.date)} in ${rows}. Pas één van de datums aan of verwijder een van deze rijen.`
          );
        });
      } else {
        items.push("Dubbele datums opgelost? Klik op 'Wijzigingen opslaan' om de review bij te werken.");
      }
    }
    return items;
  }, [
    activeReview,
    localMeta,
    missingWeekIndexes,
    duplicateGroups,
    formatRowList,
  ]);

  React.useEffect(() => {
    if (!activeReviewId) {
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);
    apiGetReview(activeReviewId)
      .then((data) => {
        if (ignore) return;
        setPendingReview(data);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        const message = err instanceof Error ? err.message : "Kon review niet laden";
        setError(message);
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [activeReviewId, setPendingReview]);

  React.useEffect(() => {
    if (!activeReview) {
      setLocalMeta(null);
      setLocalRows([]);
      return;
    }
    setLocalMeta({ ...activeReview.meta });
    setLocalRows(cloneRows(activeReview.rows));
  }, [activeReview]);

  const updateMeta = <K extends keyof ReviewDraft["meta"]>(field: K, value: ReviewDraft["meta"][K]) => {
    setLocalMeta((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateMetaNumber = <K extends keyof ReviewDraft["meta"]>(field: K, value: string) => {
    if (!localMeta) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    updateMeta(field, parsed as ReviewDraft["meta"][K]);
  };

  const handleRowChange = <K extends keyof DocRow>(index: number, field: K, value: DocRow[K]) => {
    setLocalRows((prev) => {
      const next = cloneRows(prev);
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRowWeekChange = (index: number, value: string) => {
    const parsed = Number.parseInt(value, 10);
    handleRowChange(index, "week", Number.isNaN(parsed) ? null : parsed);
  };

  const handleRowDateChange = (index: number, value: string) => {
    handleRowChange(index, "datum", value ? value : null);
  };

  const handleRemoveRow = (index: number) => {
    const confirmed = window.confirm(
      `Weet je zeker dat je rij ${index + 1} wilt verwijderen? De rij wordt niet meegenomen bij het committen.`
    );
    if (!confirmed) {
      return;
    }
    setLocalRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const hasBlockingWarnings = Boolean(
    activeReview?.warnings?.unknownSubject ||
      activeReview?.warnings?.missingWeek ||
      activeReview?.warnings?.duplicateDate
  );

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeReview || !localMeta) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const payload: ReviewUpdatePayload = {
      meta: localMeta,
      rows: localRows,
    };
    try {
      const updated = await apiUpdateReview(activeReview.parseId, payload);
      setPendingReview(updated);
      setSuccess("Review bijgewerkt");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Opslaan mislukt";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCommit = async () => {
    if (!activeReview) {
      return;
    }
    setCommitting(true);
    setError(null);
    setSuccess(null);
    try {
      const commit: CommitResponse = await apiCommitReview(activeReview.parseId);
      let diff: DocDiff | undefined;
      try {
        diff = await apiGetStudyGuideDiff(commit.guideId, commit.version.versionId);
      } catch (err) {
        diff = { diffSummary: activeReview.diffSummary, diff: activeReview.diff };
      }
      applyCommitResult(commit, activeReview.rows, diff);
      const remaining = Object.keys(pendingReviews).filter((id) => id !== activeReview.parseId);
      removePendingReview(activeReview.parseId);
      if (!remaining.length) {
        navigate("/uploads");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Commit mislukt";
      setError(message);
    } finally {
      setCommitting(false);
    }
  };

  const handleDelete = async () => {
    if (!activeReview) {
      return;
    }
    const confirmed = window.confirm("Weet je zeker dat je deze review wilt verwijderen?");
    if (!confirmed) {
      return;
    }
    setError(null);
    try {
      await apiDeleteReview(activeReview.parseId);
      removePendingReview(activeReview.parseId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verwijderen mislukt";
      setError(message);
    }
  };

  const renderWarnings = (warnings: ReviewDraft["warnings"]) => {
    const active = Object.entries(warnings).filter(([, value]) => value) as Array<
      [keyof ReviewDraft["warnings"], boolean]
    >;
    if (!active.length) {
      return <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Geen onzekerheden</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {active.map(([key]) => (
          <span
            key={key}
            className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
          >
            {warningLabels[key]}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold theme-text">Reviewwizard</h1>
            <p className="text-sm theme-muted">
              Controleer de parserresultaten, vul ontbrekende gegevens aan en bevestig de nieuwe versie.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/uploads")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Terug naar uploads
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
            {success}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-lg border theme-border bg-white p-3 shadow-sm">
              <div className="text-sm font-semibold theme-text">Openstaande reviews</div>
              <p className="mt-1 text-xs theme-muted">
                Klik op een review om de details te openen. Labels geven aan welke onzekerheden nog aandacht vragen.
              </p>
              <div className="mt-2 space-y-2">
                {reviewList.map((review) => {
                  const isActive = review.parseId === activeReviewId;
                  return (
                    <button
                      key={review.parseId}
                      onClick={() => setActiveReview(review.parseId)}
                      className={clsx(
                        "w-full rounded-md border px-3 py-2 text-left text-sm transition",
                        isActive
                          ? "border-slate-600 bg-slate-100"
                          : "theme-border theme-surface hover:bg-slate-50"
                      )}
                    >
                      <div className="font-medium theme-text">{review.meta.bestand}</div>
                      <div className="text-xs theme-muted">
                        {review.meta.vak ? (
                          <span>
                            {review.meta.vak} • {review.meta.niveau ?? "niveau onbekend"} • leerjaar {review.meta.leerjaar ?? "?"}
                          </span>
                        ) : (
                          <span className="text-amber-700">Vak nog onbekend</span>
                        )}
                      </div>
                      <div className="text-xs theme-muted">
                        {formatUploadMoment(review.meta.uploadedAt)}
                      </div>
                      <div className="mt-2 text-xs">{renderWarnings(review.warnings)}</div>
                      <div className="mt-2">
                        <DiffSummaryBadges summary={review.diffSummary} />
                      </div>
                    </button>
                  );
                })}
                {!reviewList.length && (
                  <div className="text-xs theme-muted">Geen openstaande reviews.</div>
                )}
              </div>
            </div>
            {activeReview && (
              <div className="rounded-lg border theme-border bg-white p-3 shadow-sm">
                <div className="text-sm font-semibold theme-text">Verschillen</div>
                <div className="mt-2 space-y-2">
                  <DiffSummaryBadges summary={activeReview.diffSummary} />
                  <DiffRowsList
                    diff={activeReview.diff}
                    emptyLabel="Geen verschillen met de vorige versie."
                  />
                </div>
              </div>
            )}
          </aside>

          <main className="space-y-6">
            <section className="space-y-3 rounded-lg border theme-border bg-white p-4 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold theme-text">Hoe werkt de review?</h2>
                <p className="text-xs theme-muted">
                  Doorloop de stappen om een upload definitief te maken. Zolang er onzekerheden zijn, blijft de commitknop uitgeschakeld.
                </p>
              </div>
              <ol className="list-decimal space-y-1 pl-4 text-xs theme-muted">
                <li>Selecteer links een openstaande review.</li>
                <li>Controleer en vul de metadata aan.</li>
                <li>Werk de tabelrijen bij. Je kunt rijen aanpassen of verwijderen.</li>
                <li>Sla op en commit wanneer alle labels groen zijn.</li>
              </ol>
            </section>

            {isLoading && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Review wordt geladen…
              </div>
            )}

            {!activeReview && !isLoading && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm theme-muted">
                Selecteer een review om verder te gaan.
              </div>
            )}

            {activeReview && localMeta && (
              <form onSubmit={handleSave} className="space-y-6">
                <section className="space-y-3 rounded-lg border theme-border bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold theme-text">Metadata</h2>
                      <p className="text-xs theme-muted">Vul ontbrekende informatie aan voordat je commit.</p>
                    </div>
                    <div className="text-xs">{renderWarnings(activeReview.warnings)}</div>
                  </div>

                  {warningDetails.length ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <div className="font-semibold text-sm">Los deze onzekerheden op</div>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {warningDetails.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                      Alle verplichte velden zijn ingevuld. Je kunt committen zodra de wijzigingen zijn opgeslagen.
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <label className="text-xs font-medium uppercase tracking-wide theme-muted">
                      Vak
                      <input
                        value={localMeta.vak ?? ""}
                        onChange={(event) => updateMeta("vak", event.target.value)}
                        className={clsx(
                          "mt-1 w-full rounded-md border px-2 py-1 text-sm",
                          activeReview.warnings.unknownSubject && !localMeta.vak
                            ? "border-amber-500 focus:border-amber-500 focus:ring-amber-200"
                            : ""
                        )}
                        placeholder="Bijv. Wiskunde"
                      />
                    </label>
                    <label className="text-xs font-medium uppercase tracking-wide theme-muted">
                      Niveau
                      <select
                        value={localMeta.niveau}
                        onChange={(event) => updateMeta("niveau", event.target.value as typeof niveauOptions[number])}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      >
                        {niveauOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium uppercase tracking-wide theme-muted">
                      Leerjaar
                      <input
                        value={localMeta.leerjaar}
                        onChange={(event) => updateMeta("leerjaar", event.target.value)}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs font-medium uppercase tracking-wide theme-muted">
                      Periode
                      <input
                        type="number"
                        min={1}
                        max={4}
                        value={localMeta.periode ?? ""}
                        onChange={(event) => updateMetaNumber("periode", event.target.value)}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs font-medium uppercase tracking-wide theme-muted">
                      Beginweek
                      <input
                        type="number"
                        min={1}
                        max={53}
                        value={localMeta.beginWeek ?? ""}
                        onChange={(event) => updateMetaNumber("beginWeek", event.target.value)}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs font-medium uppercase tracking-wide theme-muted">
                      Eindweek
                      <input
                        type="number"
                        min={1}
                        max={53}
                        value={localMeta.eindWeek ?? ""}
                        onChange={(event) => updateMetaNumber("eindWeek", event.target.value)}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs font-medium uppercase tracking-wide theme-muted">
                      Schooljaar
                      <input
                        value={localMeta.schooljaar ?? ""}
                        onChange={(event) => updateMeta("schooljaar", event.target.value)}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        placeholder="2024/2025"
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-3 rounded-lg border theme-border bg-white p-4 shadow-sm">
                  <div>
                    <h2 className="text-lg font-semibold theme-text">Rijen corrigeren</h2>
                    <p className="text-xs theme-muted">
                      Vul minimaal de weeknummers en datums in voor rijen waar de parser twijfels heeft. Je kunt ook rijen verwijderen die niet mee hoeven.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                          <th className="px-2 py-1 text-left">Week</th>
                          <th className="px-2 py-1 text-left">Datum</th>
                          <th className="px-2 py-1 text-left">Les</th>
                          <th className="px-2 py-1 text-left">Onderwerp</th>
                          <th className="px-2 py-1 text-left">Huiswerk</th>
                          <th className="px-2 py-1 text-left">Actie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {localRows.map((row, index) => {
                          const hasMissingWeek = missingWeekIndexes.includes(index);
                          const duplicateInfo = duplicateIndexMap.get(index);
                          return (
                            <tr
                              key={index}
                              className={clsx(
                                index % 2 === 0 ? "bg-white" : "bg-slate-50",
                                attentionIndexSet.has(index) && "bg-amber-50"
                              )}
                            >
                              <td className="px-2 py-1">
                                <label className="sr-only" htmlFor={`row-week-${index}`}>
                                  Week rij {index + 1}
                                </label>
                                <input
                                  id={`row-week-${index}`}
                                  type="number"
                                  min={1}
                                  max={53}
                                  value={row.week ?? ""}
                                  onChange={(event) => handleRowWeekChange(index, event.target.value)}
                                  className={clsx(
                                    "w-20 rounded-md border px-2 py-1",
                                    hasMissingWeek
                                      ? "border-amber-500 focus:border-amber-500 focus:ring-amber-200"
                                      : ""
                                  )}
                                />
                                {hasMissingWeek && (
                                  <div className="mt-1 text-[11px] font-medium text-amber-700">
                                    Weeknummer ontbreekt
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1">
                                <label className="sr-only" htmlFor={`row-date-${index}`}>
                                  Datum rij {index + 1}
                                </label>
                                <input
                                  id={`row-date-${index}`}
                                  type="date"
                                  value={row.datum ?? ""}
                                  onChange={(event) => handleRowDateChange(index, event.target.value)}
                                  className={clsx(
                                    "rounded-md border px-2 py-1",
                                    duplicateInfo
                                      ? "border-amber-500 focus:border-amber-500 focus:ring-amber-200"
                                      : ""
                                  )}
                                />
                                {duplicateInfo && (
                                  <div className="mt-1 text-[11px] font-medium text-amber-700">
                                    Dubbele datum met {formatRowList(duplicateInfo.peers)}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1">
                                <label className="sr-only" htmlFor={`row-les-${index}`}>
                                  Les rij {index + 1}
                                </label>
                                <input
                                  id={`row-les-${index}`}
                                  value={row.les ?? ""}
                                  onChange={(event) => handleRowChange(index, "les", event.target.value)}
                                  className="w-full rounded-md border px-2 py-1"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <label className="sr-only" htmlFor={`row-onderwerp-${index}`}>
                                  Onderwerp rij {index + 1}
                                </label>
                                <input
                                  id={`row-onderwerp-${index}`}
                                  value={row.onderwerp ?? ""}
                                  onChange={(event) => handleRowChange(index, "onderwerp", event.target.value)}
                                  className="w-full rounded-md border px-2 py-1"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <label className="sr-only" htmlFor={`row-huiswerk-${index}`}>
                                  Huiswerk rij {index + 1}
                                </label>
                                <input
                                  id={`row-huiswerk-${index}`}
                                  value={row.huiswerk ?? ""}
                                  onChange={(event) => handleRowChange(index, "huiswerk", event.target.value)}
                                  className="w-full rounded-md border px-2 py-1"
                                />
                              </td>
                              <td className="px-2 py-1 align-top">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRow(index)}
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                >
                                  Rij verwijderen
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {localRows.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-2 py-3 text-center text-xs text-slate-500">
                              Geen rijen meer over. Voeg minimaal één rij toe via de parser of upload opnieuw.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="rounded-md border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
                  >
                    Review verwijderen
                  </button>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={isSaving || isLoading}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? "Opslaan…" : "Wijzigingen opslaan"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCommit}
                      disabled={isCommitting || isSaving || isLoading || hasBlockingWarnings}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCommitting ? "Committen…" : "Definitief opslaan"}
                    </button>
                  </div>
                </div>
                {hasBlockingWarnings && (
                  <div className="text-xs text-amber-700">
                    Los alle onzekerheden op en sla de wijzigingen op voordat je definitief kunt opslaan.
                  </div>
                )}
              </form>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
