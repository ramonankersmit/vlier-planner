import React from "react";
import clsx from "clsx";
import { useNavigate, useParams } from "react-router-dom";
import {
  DiffSummaryBadges,
  diffStatusLabels,
  diffStatusStyles,
} from "../components/DiffViewer";
import {
  apiCommitReview,
  apiDeleteReview,
  apiGetReview,
  apiGetStudyGuideDiff,
  apiUpdateReview,
  type CommitResponse,
  type DocDiff,
  type DiffStatus,
  type DiffRow,
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
  duplicateWeek: "Dubbele week gevonden",
};

const niveauOptions: Array<"HAVO" | "VWO"> = ["HAVO", "VWO"];

type DuplicateKind = "date" | "week";

type DuplicateGroup = {
  kind: DuplicateKind;
  key: string;
  indexes: number[];
};


type AttentionEntry = { key: string; text: string; resolved?: boolean };
type AttentionItem = AttentionEntry & { resolved: boolean };
const cloneRows = (rows: DocRow[]): DocRow[] =>
  rows.map((row) => ({
    ...row,
    enabled: row.enabled ?? true,
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

const formatRowList = (indexes: number[]): string =>
  indexes
    .map((idx) => `rij ${idx + 1}`)
    .join(", ")
    .replace(/,([^,]*)$/, " en$1");

const computeDuplicateGroups = (rows: DocRow[]): DuplicateGroup[] => {
  const groups: DuplicateGroup[] = [];
  const dateMap = new Map<string, number[]>();
  const weekMap = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const dateValue = row?.datum?.trim();
    if (dateValue) {
      const entries = dateMap.get(dateValue) ?? [];
      entries.push(index);
      dateMap.set(dateValue, entries);
    }

    if (typeof row.week === "number" && Number.isFinite(row.week)) {
      const key = row.week.toString();
      const entries = weekMap.get(key) ?? [];
      entries.push(index);
      weekMap.set(key, entries);
    }
  });

  dateMap.forEach((indexes, key) => {
    if (indexes.length > 1) {
      groups.push({ kind: "date", key, indexes });
    }
  });

  weekMap.forEach((indexes, key) => {
    if (indexes.length > 1) {
      groups.push({ kind: "week", key, indexes });
    }
  });

  return groups.sort((a, b) => Math.min(...a.indexes) - Math.min(...b.indexes));
};

const diffRowBackground: Record<DiffStatus, string> = {
  added: "bg-emerald-50",
  changed: "bg-amber-50",
  removed: "bg-rose-50",
  unchanged: "bg-white",
};

const diffFieldHighlight: Record<DiffStatus, string> = {
  added: "border-emerald-300 bg-emerald-50 focus:border-emerald-400 focus:ring-emerald-200",
  changed: "border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-200",
  removed: "border-rose-300 bg-rose-50 focus:border-rose-400 focus:ring-rose-200",
  unchanged: "",
};

type AutoResizeTextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const AutoResizeTextArea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextAreaProps>(
  function AutoResizeTextArea({ className, value, rows = 3, ...props }, forwardedRef) {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }
      },
      [forwardedRef]
    );

    const normalizedValue =
      typeof value === "string" ? value : value == null ? "" : String(value);

    React.useEffect(() => {
      const element = innerRef.current;
      if (!element) {
        return;
      }
      element.style.height = "auto";
      const nextHeight = element.scrollHeight;
      element.style.height = `${nextHeight}px`;
    }, [normalizedValue]);

    return (
      <textarea
        {...props}
        ref={setRefs}
        value={normalizedValue}
        rows={rows}
        className={clsx(
          "w-full min-h-[3.5rem] resize-y overflow-hidden rounded-md border px-2 py-1 text-sm leading-relaxed",
          "whitespace-pre-wrap",
          className
        )}
      />
    );
  }
);

const stableStringify = (value: unknown): string => {
  const normalized = JSON.stringify(
    value,
    (_key, val) => {
      if (!val || typeof val !== "object" || Array.isArray(val)) {
        return val;
      }
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (val as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
  );
  return normalized ?? "undefined";
};

export default function Review() {
  const navigate = useNavigate();
  const { parseId } = useParams<{ parseId?: string }>();
  const pendingReviews = useAppStore((state) => state.pendingReviews);
  const setPendingReview = useAppStore((state) => state.setPendingReview);
  const removePendingReview = useAppStore((state) => state.removePendingReview);
  const setActiveReview = useAppStore((state) => state.setActiveReview);
  const applyCommitResult = useAppStore((state) => state.applyCommitResult);

  React.useEffect(() => {
    setActiveReview(parseId ?? null);
  }, [parseId, setActiveReview]);

  const activeReview = parseId ? pendingReviews[parseId] ?? null : null;

  const [baselineMeta, setBaselineMeta] = React.useState<ReviewDraft["meta"] | null>(
    activeReview ? { ...activeReview.meta } : null
  );
  const [baselineRows, setBaselineRows] = React.useState<DocRow[]>(
    activeReview ? cloneRows(activeReview.rows) : []
  );
  const [localMeta, setLocalMeta] = React.useState(activeReview ? { ...activeReview.meta } : null);
  const [localRows, setLocalRows] = React.useState<DocRow[]>(
    activeReview ? cloneRows(activeReview.rows) : []
  );
  const [isLoading, setLoading] = React.useState(false);
  const [isSaving, setSaving] = React.useState(false);
  const [isCommitting, setCommitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [attentionItems, setAttentionItems] = React.useState<AttentionItem[]>([]);

  React.useEffect(() => {
    setAttentionItems([]);
  }, [parseId]);

  React.useEffect(() => {
    if (!parseId) {
      setLoading(false);
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);
    apiGetReview(parseId)
      .then((data) => {
        if (ignore) return;
        setPendingReview(data);
      })
      .catch((err) => {
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
  }, [parseId, setPendingReview]);

  React.useEffect(() => {
    if (!activeReview) {
      setLocalMeta(null);
      setLocalRows([]);
      setBaselineMeta(null);
      setBaselineRows([]);
      return;
    }
    const metaCopy = { ...activeReview.meta };
    const baseline = cloneRows(activeReview.rows);
    setBaselineMeta(metaCopy);
    setBaselineRows(baseline);
    setLocalMeta({ ...metaCopy });
    setLocalRows(cloneRows(baseline));
  }, [activeReview]);

  const duplicateGroups = React.useMemo(() => computeDuplicateGroups(localRows), [localRows]);

  const duplicateGroupDetails = React.useMemo(
    () =>
      duplicateGroups.map((group) => {
        const enabledIndexes = group.indexes.filter((idx) => localRows[idx]?.enabled !== false);
        const disabledIndexes = group.indexes.filter((idx) => localRows[idx]?.enabled === false);
        return { ...group, enabledIndexes, disabledIndexes };
      }),
    [duplicateGroups, localRows]
  );

  const duplicateGroupsEnabled = React.useMemo(
    () => duplicateGroupDetails.filter((group) => group.enabledIndexes.length > 1),
    [duplicateGroupDetails]
  );

  const duplicateGroupsWithDisabled = React.useMemo(
    () =>
      duplicateGroupDetails.filter(
        (group) => group.enabledIndexes.length <= 1 && group.indexes.length > 1
      ),
    [duplicateGroupDetails]
  );

  const duplicateIndexMap = React.useMemo(() => {
    const map = new Map<
      number,
      Array<{ kind: DuplicateKind; key: string; peers: number[]; enabledPeers: number[] }>
    >();
    duplicateGroupDetails.forEach((group) => {
      group.indexes.forEach((index) => {
        const peers = group.indexes.filter((idx) => idx !== index);
        const enabledPeers = peers.filter((idx) => localRows[idx]?.enabled !== false);
        const current = map.get(index) ?? [];
        current.push({
          kind: group.kind,
          key: group.key,
          peers,
          enabledPeers,
        });
        map.set(index, current);
      });
    });
    return map;
  }, [duplicateGroupDetails, localRows]);

  const diffByIndex = React.useMemo(() => {
    const map = new Map<number, DiffRow>();
    activeReview?.diff.forEach((entry) => {
      if (entry.status !== "removed") {
        map.set(entry.index, entry);
      }
    });
    return map;
  }, [activeReview]);

  const removedDiffs = React.useMemo(
    () => activeReview?.diff.filter((entry) => entry.status === "removed") ?? [],
    [activeReview]
  );

  const missingWeekIndexes = React.useMemo(() => {
    const indexes: number[] = [];
    localRows.forEach((row, index) => {
      if (row.enabled === false) {
        return;
      }
      if (row.week === null || row.week === undefined) {
        indexes.push(index);
      }
    });
    return indexes;
  }, [localRows]);

  const hasEnabledRows = React.useMemo(() => localRows.some((row) => row.enabled !== false), [localRows]);

  const warningBadges = React.useMemo(() => {
    if (!localMeta) {
      return [] as string[];
    }
    const badges: string[] = [];
    if (!localMeta.vak?.trim()) {
      badges.push(warningLabels.unknownSubject);
    }
    if (missingWeekIndexes.length) {
      badges.push(warningLabels.missingWeek);
    }
    const hasDateEnabled = duplicateGroupsEnabled.some((group) => group.kind === "date");
    const hasWeekEnabled = duplicateGroupsEnabled.some((group) => group.kind === "week");
    if (hasDateEnabled) {
      badges.push(warningLabels.duplicateDate);
    }
    if (hasWeekEnabled) {
      badges.push(warningLabels.duplicateWeek);
    }
    if (!hasEnabledRows) {
      badges.push("Geen actieve rijen");
    }
    return badges;
  }, [
    localMeta,
    missingWeekIndexes,
    duplicateGroupsEnabled,
    duplicateGroupsWithDisabled,
    hasEnabledRows,
  ]);

  const attentionEntries = React.useMemo(() => {
    if (!localMeta) {
      return [] as AttentionEntry[];
    }
    const entries: AttentionEntry[] = [];
    if (!localMeta.vak?.trim()) {
      entries.push({
        key: "meta-vak",
        text: "Vul het vak in bij de metadata zodat de studiewijzer gekoppeld kan worden.",
      });
    }
    if (missingWeekIndexes.length) {
      entries.push({
        key: "missing-week",
        text: `Weeknummer ontbreekt in ${formatRowList(missingWeekIndexes)}. Vul de weekkolom in of schakel de rij tijdelijk uit.`,
      });
    }
    duplicateGroupsEnabled.forEach((group) => {
      const label =
        group.kind === "date"
          ? `Dubbele datum ${formatDutchDate(group.key)}`
          : `Dubbele week ${group.key}`;
      const action =
        group.kind === "date"
          ? "Pas een datum aan of schakel een rij uit."
          : "Pas het weeknummer aan of schakel een rij uit.";
      entries.push({
        key: `duplicate-${group.kind}-${group.key}`,
        text: `${label} in ${formatRowList(group.enabledIndexes)}. ${action}`,
      });
    });
    if (!duplicateGroupsEnabled.length) {
      duplicateGroupsWithDisabled.forEach((group) => {
        if (!group.disabledIndexes.length) {
          return;
        }
        const label =
          group.kind === "date"
            ? `Dubbele datum ${formatDutchDate(group.key)} gevonden.`
            : `Dubbele week ${group.key} gevonden.`;
        const suffix =
          group.kind === "date"
            ? "is uitgeschakeld; controleer of de juiste rij actief blijft."
            : "is uitgeschakeld; controleer of de juiste week actief blijft.";
        entries.push({
          key: `duplicate-disabled-${group.kind}-${group.key}`,
          text: `${label} ${formatRowList(group.disabledIndexes)} ${suffix}`,
          resolved: true,
        });
      });
    }
    if (!hasEnabledRows) {
      entries.push({
        key: "no-active-rows",
        text: "Activeer minimaal één rij zodat de studiewijzer inhoud bevat.",
      });
    }
    return entries;
  }, [
    localMeta,
    missingWeekIndexes,
    duplicateGroupsEnabled,
    duplicateGroupsWithDisabled,
    hasEnabledRows,
  ]);

  React.useEffect(() => {
    setAttentionItems((prev) => {
      const currentMap = new Map(attentionEntries.map((entry) => [entry.key, entry.text]));
      const currentResolvedMap = new Map(
        attentionEntries.map((entry) => [entry.key, entry.resolved ?? false])
      );
      const currentKeys = new Set(currentMap.keys());
      const existingKeys = new Set(prev.map((item) => item.key));
      const next: AttentionItem[] = prev.map((item) => {
        const text = currentMap.get(item.key) ?? item.text;
        const resolved = currentKeys.has(item.key)
          ? currentResolvedMap.get(item.key) ?? false
          : true;
        return { key: item.key, text, resolved };
      });
      attentionEntries.forEach((entry) => {
        if (!existingKeys.has(entry.key)) {
          next.push({
            key: entry.key,
            text: entry.text,
            resolved: entry.resolved ?? false,
          });
        }
      });
      return next;
    });
  }, [attentionEntries]);

  const hasUnsavedChanges = React.useMemo(() => {
    if (!baselineMeta || !localMeta) {
      return false;
    }
    if (stableStringify(localMeta) !== stableStringify(baselineMeta)) {
      return true;
    }
    return stableStringify(localRows) !== stableStringify(baselineRows);
  }, [baselineMeta, baselineRows, localMeta, localRows]);

  const hasUnresolvedAttention = React.useMemo(
    () => attentionItems.some((item) => !item.resolved),
    [attentionItems]
  );

  React.useEffect(() => {
    if (hasUnsavedChanges) {
      setSuccess(null);
    }
  }, [hasUnsavedChanges]);

  const hasBlockingWarnings = Boolean(
    !localMeta?.vak?.trim() ||
      missingWeekIndexes.length > 0 ||
      duplicateGroupsEnabled.length > 0 ||
      !hasEnabledRows
  );

  const updateMeta = <K extends keyof ReviewDraft["meta"]>(field: K, value: ReviewDraft["meta"][K]) => {
    setLocalMeta((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateMetaNumber = <K extends keyof ReviewDraft["meta"]>(field: K, value: string) => {
    if (!localMeta) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      updateMeta(field, null as ReviewDraft["meta"][K]);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    updateMeta(field, (Number.isNaN(parsed) ? null : (parsed as ReviewDraft["meta"][K])));
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

  const handleToggleRowEnabled = (index: number) => {
    setLocalRows((prev) => {
      const next = cloneRows(prev);
      const current = next[index];
      next[index] = { ...current, enabled: current?.enabled === false ? true : false };
      return next;
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!parseId || !localMeta) {
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
      const updated = await apiUpdateReview(parseId, payload);
      const metaCopy = { ...updated.meta };
      const rowsCopy = cloneRows(updated.rows);
      setPendingReview(updated);
      setBaselineMeta(metaCopy);
      setBaselineRows(rowsCopy);
      setLocalMeta({ ...metaCopy });
      setLocalRows(cloneRows(rowsCopy));
      setSuccess("Review opgeslagen");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Opslaan mislukt";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCommit = async () => {
    if (!parseId || !activeReview) {
      return;
    }
    setCommitting(true);
    setError(null);
    setSuccess(null);
    try {
      const commit: CommitResponse = await apiCommitReview(parseId);
      let diff: DocDiff | undefined;
      try {
        diff = await apiGetStudyGuideDiff(commit.guideId, commit.version.versionId);
      } catch (err) {
        diff = { diffSummary: activeReview.diffSummary, diff: activeReview.diff };
      }
      applyCommitResult(commit, activeReview.rows, diff);
      removePendingReview(parseId);
      navigate("/uploads");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Commit mislukt";
      setError(message);
    } finally {
      setCommitting(false);
    }
  };

  const handleDelete = async () => {
    if (!parseId) {
      return;
    }
    const confirmed = window.confirm("Weet je zeker dat je deze review wilt verwijderen?");
    if (!confirmed) {
      return;
    }
    setError(null);
    try {
      await apiDeleteReview(parseId);
      removePendingReview(parseId);
      navigate("/uploads");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verwijderen mislukt";
      setError(message);
    }
  };

  const renderWarningBadges = () => {
    if (!warningBadges.length) {
      return (
        <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
          Geen onzekerheden
        </span>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        {warningBadges.map((label) => (
          <span
            key={label}
            className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
          >
            {label}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold theme-text">Reviewwizard</h1>
            <p className="text-sm theme-muted">
              Controleer parserresultaten, corrigeer rijen en bevestig de nieuwe versie per document.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        )}
        {success && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>
        )}

        {!parseId && !isLoading && (
          <div className="rounded-lg border theme-border bg-white p-6 text-sm theme-muted">
            Upload eerst een document of start een review vanuit het uploadsoverzicht.
          </div>
        )}

        {parseId && isLoading && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Review wordt geladen…
          </div>
        )}

        {parseId && !isLoading && !activeReview && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Deze review is niet gevonden. Mogelijk is hij al verwerkt of verwijderd.
          </div>
        )}

        {parseId && activeReview && localMeta && (
          <form onSubmit={handleSave} className="space-y-6">
            <section className="space-y-3 rounded-lg border theme-border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold theme-text">Metadata</h2>
                  <p className="text-xs theme-muted">
                    Vul ontbrekende gegevens aan voordat je de studiewijzer definitief maakt.
                  </p>
                </div>
                <div className="text-xs">{renderWarningBadges()}</div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <div className="font-medium theme-text">{activeReview.meta.bestand}</div>
                  <div className="theme-muted">Geüpload: {formatUploadMoment(activeReview.meta.uploadedAt)}</div>
                </div>
              </div>

              {attentionItems.length ? (
                <div
                  className={clsx(
                    "rounded-md border p-3 text-xs",
                    hasUnresolvedAttention
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  )}
                >
                  <div className="font-semibold text-sm">Aandachtspunten</div>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {attentionItems.map((item) => (
                      <li
                        key={item.key}
                        className={clsx(
                          item.resolved &&
                            "line-through decoration-emerald-600 decoration-2 text-emerald-700"
                        )}
                      >
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                  Alle verplichte velden zijn ingevuld. Sla op en commit wanneer je klaar bent.
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
                      !localMeta.vak ? "border-amber-500 focus:border-amber-500 focus:ring-amber-200" : ""
                    )}
                    placeholder="Bijv. Wiskunde"
                  />
                </label>
                <label className="text-xs font-medium uppercase tracking-wide theme-muted">
                  Niveau
                  <select
                    value={localMeta.niveau}
                    onChange={(event) => updateMeta("niveau", event.target.value as (typeof niveauOptions)[number])}
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
                    value={localMeta.leerjaar ?? ""}
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
                  Vul weeknummers en datums in waar nodig. Zet rijen uit met het vinkje als ze niet meegaan naar de planner.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <DiffSummaryBadges summary={activeReview.diffSummary} />
                <span className="theme-muted">Verschillen ten opzichte van de vorige versie</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                      <th className="px-2 py-1 text-left">Status</th>
                      <th className="px-2 py-1 text-left">Actief</th>
                      <th className="px-2 py-1 text-left">Week</th>
                      <th className="px-2 py-1 text-left">Datum</th>
                      <th className="px-2 py-1 text-left">Les</th>
                      <th className="px-2 py-1 text-left">Onderwerp</th>
                      <th className="px-2 py-1 text-left">Huiswerk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localRows.map((row, index) => {
                      const hasMissingWeek = missingWeekIndexes.includes(index);
                      const duplicateInfos = duplicateIndexMap.get(index) ?? [];
                      const dateDuplicate = duplicateInfos.find((info) => info.kind === "date");
                      const weekDuplicate = duplicateInfos.find((info) => info.kind === "week");
                      const isDisabled = row.enabled === false;
                      const rowDiff = diffByIndex.get(index);
                      const baselineRow = baselineRows[index];
                      const rowStatus = (() => {
                        if (baselineRow && stableStringify(row) !== stableStringify(baselineRow)) {
                          return "changed" as DiffStatus;
                        }
                        return (rowDiff?.status ?? "unchanged") as DiffStatus;
                      })();
                      const resolveFieldStatus = (field: keyof DocRow): DiffStatus => {
                        if (baselineRow) {
                          const baselineRecord =
                            baselineRow as unknown as Record<string, unknown>;
                          const rowRecord = row as unknown as Record<string, unknown>;
                          const baselineValue = baselineRecord[field as string];
                          const currentValue = rowRecord[field as string];
                          if (stableStringify(currentValue) !== stableStringify(baselineValue)) {
                            return "changed";
                          }
                        }
                        const diffField = rowDiff?.fields?.[field as string];
                        const status = diffField?.status ?? rowStatus;
                        return status as DiffStatus;
                      };
                      return (
                        <tr
                          key={index}
                          className={clsx(diffRowBackground[rowStatus], isDisabled && "opacity-70")}
                        >
                          <td className="px-2 py-1 align-top">
                            <span
                              className={clsx(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                                diffStatusStyles[rowStatus]
                              )}
                            >
                              {diffStatusLabels[rowStatus]}
                            </span>
                          </td>
                          <td className="px-2 py-1 align-top">
                            <label className="sr-only" htmlFor={`row-enabled-${index}`}>
                              Rij {index + 1} activeren
                            </label>
                            <input
                              id={`row-enabled-${index}`}
                              type="checkbox"
                              checked={row.enabled !== false}
                              onChange={() => handleToggleRowEnabled(index)}
                              className="h-4 w-4"
                            />
                            {rowDiff?.fields?.enabled?.status === "changed" && (
                              <div className="mt-1 text-[11px] text-amber-700">
                                Rijstatus gewijzigd sinds vorige versie
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1 align-top">
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
                                diffFieldHighlight[resolveFieldStatus("week")],
                                hasMissingWeek
                                  ? "border-amber-500 focus:border-amber-500 focus:ring-amber-200"
                                  : "",
                                weekDuplicate && weekDuplicate.enabledPeers.length > 0
                                  ? "border-amber-500 focus:border-amber-500 focus:ring-amber-200"
                                  : "",
                              )}
                              disabled={isDisabled}
                            />
                            {hasMissingWeek && !isDisabled && (
                              <div className="mt-1 text-[11px] font-medium text-amber-700">
                                Ontbrekend weeknummer
                              </div>
                            )}
                            {weekDuplicate && weekDuplicate.peers.length > 0 && (
                              <div className="mt-1 text-[11px] font-medium text-amber-700">
                                Dubbel met {formatRowList(weekDuplicate.peers)}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1 align-top">
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
                                diffFieldHighlight[resolveFieldStatus("datum")],
                                dateDuplicate && dateDuplicate.enabledPeers.length > 0
                                  ? "border-amber-500 focus:border-amber-500 focus:ring-amber-200"
                                  : ""
                              )}
                              disabled={isDisabled}
                            />
                            {dateDuplicate && dateDuplicate.peers.length > 0 && (
                              <div className="mt-1 text-[11px] font-medium text-amber-700">
                                Dubbel met {formatRowList(dateDuplicate.peers)}
                              </div>
                            )}
                            {isDisabled && (
                              <div className="mt-1 text-[11px] text-slate-600">Rij uitgeschakeld</div>
                            )}
                          </td>
                          <td className="px-2 py-1 align-top">
                            <label className="sr-only" htmlFor={`row-les-${index}`}>
                              Les rij {index + 1}
                            </label>
                            <AutoResizeTextArea
                              id={`row-les-${index}`}
                              value={row.les ?? ""}
                              onChange={(event) => handleRowChange(index, "les", event.target.value)}
                              className={clsx(diffFieldHighlight[resolveFieldStatus("les")])}
                              disabled={isDisabled}
                            />
                          </td>
                          <td className="px-2 py-1 align-top">
                            <label className="sr-only" htmlFor={`row-onderwerp-${index}`}>
                              Onderwerp rij {index + 1}
                            </label>
                            <AutoResizeTextArea
                              id={`row-onderwerp-${index}`}
                              value={row.onderwerp ?? ""}
                              onChange={(event) => handleRowChange(index, "onderwerp", event.target.value)}
                              className={clsx(diffFieldHighlight[resolveFieldStatus("onderwerp")])}
                              disabled={isDisabled}
                            />
                          </td>
                          <td className="px-2 py-1 align-top">
                            <label className="sr-only" htmlFor={`row-huiswerk-${index}`}>
                              Huiswerk rij {index + 1}
                            </label>
                            <AutoResizeTextArea
                              id={`row-huiswerk-${index}`}
                              value={row.huiswerk ?? ""}
                              onChange={(event) => handleRowChange(index, "huiswerk", event.target.value)}
                              className={clsx(diffFieldHighlight[resolveFieldStatus("huiswerk")])}
                              disabled={isDisabled}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {removedDiffs.map((diff) => {
                      const formatOldValue = (fieldKey: string): string => {
                        const field = diff.fields[fieldKey];
                        const value = field?.old;
                        if (value == null || value === "") {
                          return "—";
                        }
                        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                          return formatDutchDate(value);
                        }
                        return String(value);
                      };
                      return (
                        <tr
                          key={`removed-${diff.index}`}
                          className={clsx(diffRowBackground.removed, "text-rose-800")}
                        >
                          <td className="px-2 py-1 align-top">
                            <span
                              className={clsx(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                                diffStatusStyles.removed
                              )}
                            >
                              {diffStatusLabels.removed}
                            </span>
                          </td>
                          <td className="px-2 py-1 align-top">—</td>
                          <td className="px-2 py-1 align-top">
                            <div className="rounded-md border border-rose-200 bg-white/60 px-2 py-1 text-sm">
                              {formatOldValue("week")}
                            </div>
                          </td>
                          <td className="px-2 py-1 align-top">
                            <div className="rounded-md border border-rose-200 bg-white/60 px-2 py-1 text-sm">
                              {formatOldValue("datum")}
                            </div>
                          </td>
                          <td className="px-2 py-1 align-top">
                            <div className="rounded-md border border-rose-200 bg-white/60 px-2 py-1 text-sm">
                              {formatOldValue("les")}
                            </div>
                          </td>
                          <td className="px-2 py-1 align-top">
                            <div className="rounded-md border border-rose-200 bg-white/60 px-2 py-1 text-sm">
                              {formatOldValue("onderwerp")}
                            </div>
                          </td>
                          <td className="px-2 py-1 align-top">
                            <div className="rounded-md border border-rose-200 bg-white/60 px-2 py-1 text-sm">
                              {formatOldValue("huiswerk")}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {localRows.length === 0 && removedDiffs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-2 py-3 text-center text-xs text-slate-500">
                          Geen rijen meer over. Voeg minimaal één rij toe via de parser of upload opnieuw.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {removedDiffs.length > 0 && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  {removedDiffs.length === 1
                    ? "1 rij uit de vorige versie wordt verwijderd na commit."
                    : `${removedDiffs.length} rijen uit de vorige versie worden verwijderd na commit.`}
                </div>
              )}
            </section>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleDelete}
                title="Verwijder deze review"
                className="rounded-md border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
              >
                Review verwijderen
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSaving || isLoading || !hasUnsavedChanges}
                  title="Sla de wijzigingen in deze review op"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Opslaan…" : "Wijzigingen opslaan"}
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={isCommitting || isSaving || isLoading || hasBlockingWarnings}
                  title="Maak deze studiewijzer definitief"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCommitting ? "Review opslaan…" : "Review opslaan"}
                </button>
              </div>
            </div>
            {hasBlockingWarnings && (
              <div className="text-xs text-amber-700">
                Los de gemarkeerde aandachtspunten op en sla de wijzigingen op voordat je kunt committen.
              </div>
            )}
          </form>
        )}

        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => navigate("/uploads")}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Terug naar uploads
          </button>
        </div>
      </div>
    </div>
  );
}
