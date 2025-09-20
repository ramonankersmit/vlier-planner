import React from "react";
import {
  Info,
  FileText,
  CheckSquare,
  CalendarClock,
  MessageCircle,
  BookOpen,
  Plus,
  Trash2,
  Pencil,
  Undo2,
} from "lucide-react";
import {
  useAppStore,
  type DocRecord,
  type WeekInfo,
  type WeekData,
  type CustomHomeworkEntry,
} from "../app/store";
import { formatRange, calcCurrentWeekIdx } from "../lib/weekUtils";
import { splitHomeworkItems } from "../lib/textUtils";
import { useDocumentPreview } from "../components/DocumentPreviewProvider";
import { deriveIsoYearForWeek } from "../lib/calendar";
import { hasMeaningfulContent } from "../lib/contentUtils";

type HomeworkItem = {
  text: string;
  originalText: string;
  doneKey: string;
  isCustom: boolean;
  entryId?: string;
};

type CardEditingState =
  | { type: "auto"; doneKey: string; originalText: string }
  | { type: "custom"; doneKey: string; entryId: string; originalText: string };

function Card({
  vak,
  weekId,
  weekNr,
  data,
  doneMap,
  setDoneState,
  mode,
  onOpenDoc,
  docName,
  customHomework,
  onAddCustom,
  onRemoveCustom,
}: {
  vak: string;
  weekId: string;
  weekNr: number;
  data?: WeekData;
  doneMap: Record<string, boolean>;
  setDoneState: (key: string, value: boolean) => void;
  mode: "perOpdracht" | "gecombineerd";
  onOpenDoc?: () => void;
  docName?: string;
  customHomework: CustomHomeworkEntry[];
  onAddCustom: (text: string) => void;
  onRemoveCustom: (entryId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [customText, setCustomText] = React.useState("");
  const [editing, setEditing] = React.useState<CardEditingState | null>(null);
  const [editText, setEditText] = React.useState("");
  const baseKey = `${weekId}:${vak}`;
  const homeworkAdjustments = useAppStore((s) => s.homeworkAdjustments) ?? {};
  const hideHomeworkItem = useAppStore((s) => s.hideHomeworkItem);
  const restoreHomeworkItem = useAppStore((s) => s.restoreHomeworkItem);
  const overrideHomeworkItem = useAppStore((s) => s.overrideHomeworkItem);
  const clearHomeworkOverride = useAppStore((s) => s.clearHomeworkOverride);
  const updateCustomHomework = useAppStore((s) => s.updateCustomHomework);
  const enableHomeworkEditing = useAppStore((s) => s.enableHomeworkEditing);
  const enableCustomHomework = useAppStore((s) => s.enableCustomHomework);
  const storedItems =
    Array.isArray(data?.huiswerkItems) && data?.huiswerkItems.length
      ? data.huiswerkItems
      : undefined;
  const homeworkItems = (storedItems ?? splitHomeworkItems(data?.huiswerk)).map((item) => item.trim());
  const filteredHomeworkItems = homeworkItems.filter((item) => hasMeaningfulContent(item));
  const adjustmentsForVak = homeworkAdjustments[weekId]?.[vak];
  const hiddenMap = adjustmentsForVak?.hidden ?? {};
  const overrideMap = adjustmentsForVak?.overrides ?? {};
  const hasAdjustments = Object.keys(hiddenMap).length > 0 || Object.keys(overrideMap).length > 0;
  const normalizedCustom = customHomework
    .map((entry) => ({ ...entry, text: entry.text.trim() }))
    .filter((entry) => hasMeaningfulContent(entry.text));
  const baseAutoItems: HomeworkItem[] = filteredHomeworkItems.map((text, idx) => ({
    text,
    originalText: text,
    doneKey: `${baseKey}:${idx}`,
    isCustom: false,
  }));
  const autoItems: HomeworkItem[] = baseAutoItems
    .filter((item) => !hiddenMap[item.doneKey])
    .map((item) => {
      const override = overrideMap[item.doneKey];
      return override ? { ...item, text: override } : item;
    });
  const hiddenAutoItems: HomeworkItem[] = baseAutoItems
    .filter((item) => hiddenMap[item.doneKey])
    .map((item) => {
      const override = overrideMap[item.doneKey];
      return override ? { ...item, text: override } : item;
    });
  const customItems: HomeworkItem[] = normalizedCustom.map((entry) => ({
    text: entry.text,
    originalText: entry.text,
    doneKey: `${baseKey}:custom:${entry.id}`,
    isCustom: true,
    entryId: entry.id,
  }));
  const autoKeys = autoItems.map((item) => item.doneKey);
  const customKeys = customItems.map((item) => item.doneKey);
  const hasAutoItemState = autoKeys.some((itemKey) =>
    Object.prototype.hasOwnProperty.call(doneMap, itemKey)
  );
  const autoDoneStates = autoKeys.map((itemKey) => !!doneMap[itemKey]);
  const customDoneStates = customKeys.map((itemKey) => !!doneMap[itemKey]);
  const baseDone = !!doneMap[baseKey];
  const displayAutoDoneStates = hasAutoItemState
    ? autoDoneStates
    : autoItems.map(() => baseDone);
  const displayCustomDoneStates = customDoneStates;
  const allDone = autoItems.length
    ? hasAutoItemState
      ? autoDoneStates.every(Boolean)
      : baseDone
    : baseDone;
  const shouldAdoptBaseState =
    mode === "perOpdracht" && baseDone && !hasAutoItemState && autoItems.length > 0;

  React.useEffect(() => {
    if (!shouldAdoptBaseState) return;
    autoItems.forEach((item) => {
      setDoneState(item.doneKey, true);
    });
    setDoneState(baseKey, false);
  }, [shouldAdoptBaseState, autoItems, baseKey, setDoneState]);

  const toggleItem = (item: HomeworkItem & { checked: boolean }) => {
    const next = !item.checked;
    if (!item.isCustom) {
      setDoneState(baseKey, false);
    }
    setDoneState(item.doneKey, next);
  };

  const toggleCombined = () => {
    if (!autoItems.length) {
      return;
    }
    const next = !allDone;
    setDoneState(baseKey, next);
    autoItems.forEach((item) => {
      setDoneState(item.doneKey, next);
    });
  };

  const aggregatedHomework =
    hasMeaningfulContent(data?.huiswerk) && !hasAdjustments
      ? data?.huiswerk ?? ""
      : autoItems.map((item) => item.text).join("\n");
  const hasAggregatedHomework = hasMeaningfulContent(aggregatedHomework);
  const hasOpmerkingen = hasMeaningfulContent(data?.opmerkingen);
  const hasLesstof = hasMeaningfulContent(data?.lesstof);
  const hasDeadlines = hasMeaningfulContent(data?.deadlines);
  const deadlineLabel = hasDeadlines ? data?.deadlines ?? "" : "";
  const deadlineTitle = hasDeadlines ? data?.date || data?.deadlines || "" : "";
  const combinedItems = [
    ...autoItems.map((item, idx) => ({
      ...item,
      checked: displayAutoDoneStates[idx],
    })),
    ...customItems.map((item, idx) => ({
      ...item,
      checked: displayCustomDoneStates[idx],
    })),
  ];
  const hasAnyItems = combinedItems.length > 0;
  const hasCustomItems = customItems.length > 0;

  const startAdd = () => {
    if (!enableCustomHomework) {
      return;
    }
    setEditing(null);
    setEditText("");
    setAdding(true);
  };

  const cancelAdd = () => {
    setCustomText("");
    setAdding(false);
  };

  const submitCustom = (event: React.FormEvent) => {
    event.preventDefault();
    if (!enableCustomHomework) {
      return;
    }
    const trimmed = customText.trim();
    if (!hasMeaningfulContent(trimmed)) {
      return;
    }
    onAddCustom(trimmed);
    setCustomText("");
    setAdding(false);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditText("");
  };

  const startEditItem = (item: HomeworkItem) => {
    if (!enableHomeworkEditing) {
      return;
    }
    if (item.isCustom && !item.entryId) {
      return;
    }
    setAdding(false);
    if (item.isCustom && item.entryId) {
      setEditing({ type: "custom", doneKey: item.doneKey, entryId: item.entryId, originalText: item.originalText });
    } else {
      setEditing({ type: "auto", doneKey: item.doneKey, originalText: item.originalText });
    }
    setEditText(item.text);
  };

  const submitEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!enableHomeworkEditing || !editing) return;
    const trimmed = editText.trim();
    if (!hasMeaningfulContent(trimmed)) {
      return;
    }
    if (editing.type === "custom") {
      updateCustomHomework(weekId, vak, editing.entryId, trimmed);
    } else {
      if (trimmed === editing.originalText) {
        clearHomeworkOverride(weekId, vak, editing.doneKey);
      } else {
        overrideHomeworkItem(weekId, vak, editing.doneKey, trimmed);
      }
    }
    cancelEdit();
  };

  const handleRemoveItem = (item: HomeworkItem) => {
    if (!enableHomeworkEditing) {
      return;
    }
    if (item.isCustom && item.entryId) {
      onRemoveCustom(item.entryId);
    } else {
      hideHomeworkItem(weekId, vak, item.doneKey);
    }
    if (editing?.doneKey === item.doneKey) {
      cancelEdit();
    }
  };

  const handleRestore = (itemKey: string) => {
    restoreHomeworkItem(weekId, vak, itemKey);
    if (editing?.doneKey === itemKey) {
      cancelEdit();
    }
  };

  React.useEffect(() => {
    if (!enableCustomHomework) {
      setAdding(false);
      setCustomText("");
    }
  }, [enableCustomHomework]);

  React.useEffect(() => {
    if (!enableHomeworkEditing) {
      setEditing(null);
      setEditText("");
    }
  }, [enableHomeworkEditing]);

  return (
    <div className="rounded-2xl border theme-border theme-surface shadow-sm p-4 flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{vak}</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {hasOpmerkingen && (
              <span
                role="img"
                aria-label={`Opmerkingen voor ${vak}`}
                title={data?.opmerkingen || ""}
                className="text-sky-600"
              >
                <MessageCircle size={16} aria-hidden="true" />
              </span>
            )}
            {hasLesstof && (
              <span
                role="img"
                aria-label={`Lesstof voor ${vak}`}
                title={data?.lesstof || ""}
                className="text-emerald-600"
              >
                <BookOpen size={16} aria-hidden="true" />
              </span>
            )}
            {hasDeadlines && (
              <span
                role="img"
                aria-label={`Toets of deadline voor ${vak}`}
                title={data?.deadlines || ""}
                className="text-amber-600"
              >
                <CheckSquare size={16} aria-hidden="true" />
              </span>
            )}
          </div>
          {(hasLesstof || hasOpmerkingen) && (
            <button
              onClick={() => setOpen(true)}
              title="Toon details (lesstof/opmerkingen)"
              aria-label={`Details ${vak}`}
            >
              <Info size={16} className="theme-muted" />
            </button>
          )}
          <button
            title={docName ? `Bron: ${docName}` : "Geen bron beschikbaar"}
            aria-label={docName ? `Bron: ${docName}` : `Geen bron beschikbaar voor ${vak}`}
            onClick={onOpenDoc}
            disabled={!onOpenDoc}
            className="disabled:opacity-40"
          >
            <FileText size={16} className="theme-muted" />
          </button>
        </div>
      </div>

      <div className="theme-divider" aria-hidden="true" />

      <div className="flex flex-1 flex-col gap-3">
        {mode === "perOpdracht" ? (
          hasAnyItems ? (
            <ul className="space-y-1 text-sm">
              {combinedItems.map((item) => (
                <li key={item.doneKey} className="flex items-start gap-2">
                  <label className="flex items-start gap-2 flex-1">
                    <input
                      aria-label={`Huiswerk ${vak}: ${item.text}`}
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleItem(item)}
                      className="mt-0.5"
                    />
                    <span className={`flex-1 ${item.checked ? "line-through theme-muted opacity-80" : ""}`}>
                      {item.text}
                    </span>
                  </label>
                  {enableHomeworkEditing && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="theme-muted hover:text-slate-700"
                        onClick={() => startEditItem(item)}
                        aria-label={`Bewerk huiswerk voor ${vak}`}
                        title="Bewerk huiswerk"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="theme-muted hover:text-rose-600"
                        onClick={() => handleRemoveItem(item)}
                        aria-label={`Verwijder huiswerk voor ${vak}`}
                        title="Verwijder huiswerk"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm theme-muted">-</div>
          )
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            {autoItems.length > 0 && hasAggregatedHomework && (
              <label className="flex items-start gap-2">
                <input
                  aria-label={`Huiswerk ${vak}`}
                  type="checkbox"
                  checked={allDone}
                  onChange={toggleCombined}
                  className="mt-0.5"
                />
                <span
                  className={`flex-1 whitespace-pre-line ${
                    allDone ? "line-through theme-muted opacity-80" : ""
                  }`}
                >
                  {aggregatedHomework}
                </span>
              </label>
            )}
            {hasCustomItems && (
              <ul className="space-y-1">
                {customItems.map((item, idx) => (
                  <li key={item.doneKey} className="flex items-start gap-2">
                    <label className="flex items-start gap-2 flex-1">
                      <input
                        aria-label={`Huiswerk ${vak}: ${item.text}`}
                        type="checkbox"
                        checked={displayCustomDoneStates[idx]}
                        onChange={() =>
                          toggleItem({
                            ...item,
                            checked: displayCustomDoneStates[idx],
                          })
                        }
                        className="mt-0.5"
                      />
                      <span
                        className={`flex-1 ${
                          displayCustomDoneStates[idx]
                            ? "line-through theme-muted opacity-80"
                            : ""
                        }`}
                      >
                        {item.text}
                      </span>
                    </label>
                    {enableHomeworkEditing && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="theme-muted hover:text-slate-700"
                          onClick={() => startEditItem(item)}
                          aria-label={`Bewerk huiswerk voor ${vak}`}
                          title="Bewerk huiswerk"
                        >
                          <Pencil size={14} />
                        </button>
                        {item.entryId && (
                          <button
                            type="button"
                            className="theme-muted hover:text-rose-600"
                            onClick={() => handleRemoveItem(item)}
                            aria-label={`Verwijder huiswerk voor ${vak}`}
                            title="Verwijder huiswerk"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!hasAnyItems && <div className="theme-muted">-</div>}
          </div>
        )}
  
        {hasDeadlines && (
          <div className={`text-sm theme-muted ${allDone ? "opacity-80" : ""}`} title={deadlineTitle}>
            {deadlineLabel}
          </div>
        )}
  
        {hiddenAutoItems.length > 0 && (
          <div className="rounded-md border border-dashed theme-border px-2 py-1 text-xs theme-muted">
            <div className="font-semibold uppercase tracking-wide text-[0.65rem]">Verborgen huiswerk</div>
            <ul className="mt-1 space-y-1">
              {hiddenAutoItems.map((item) => (
                <li key={`hidden-${item.doneKey}`} className="flex items-center gap-2">
                  <span className="flex-1 line-through">{item.text}</span>
                  <button
                    type="button"
                    className="theme-muted hover:text-slate-700"
                    onClick={() => handleRestore(item.doneKey)}
                    aria-label={`Herstel huiswerk voor ${vak}`}
                    title="Herstel huiswerk"
                  >
                    <Undo2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
  
        {editing && enableHomeworkEditing && (
          <form onSubmit={submitEdit} className="flex flex-col gap-2 text-sm">
            <textarea
              className="w-full rounded-md border theme-border px-2 py-1"
              rows={2}
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              placeholder="Huiswerk aanpassen"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-md border theme-border theme-surface px-2 py-1"
                onClick={cancelEdit}
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="rounded-md bg-slate-900 text-white px-3 py-1 disabled:opacity-40"
                disabled={!hasMeaningfulContent(editText)}
              >
                Opslaan
              </button>
            </div>
          </form>
        )}
  
        {adding && enableCustomHomework && (
          <form onSubmit={submitCustom} className="flex flex-col gap-2 text-sm">
            <textarea
              className="w-full rounded-md border theme-border px-2 py-1"
              rows={2}
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="Eigen taak"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-md border theme-border theme-surface px-2 py-1"
                onClick={cancelAdd}
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="rounded-md bg-slate-900 text-white px-3 py-1 disabled:opacity-40"
                disabled={!hasMeaningfulContent(customText)}
              >
                Opslaan
              </button>
            </div>
          </form>
        )}
  
      </div>
      {!adding && !editing && enableCustomHomework && (
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          onClick={startAdd}
          title="Eigen taak toevoegen"
          aria-label={`Voeg taak toe voor ${vak}`}
        >
          <Plus size={16} className="h-4 w-4" />
          <span>Eigen taak toevoegen</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-2xl border theme-border theme-surface shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {vak} – Week {weekNr}
              </h2>
              <button onClick={() => setOpen(false)} className="theme-muted" aria-label="Sluiten">
                ✕
              </button>
            </div>
            <div className="text-sm space-y-2">
              <p className="whitespace-pre-wrap">
                <span className="font-medium">Lesstof:</span> {data?.lesstof || "—"}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="font-medium">Opmerkingen:</span> {data?.opmerkingen || "—"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WeekOverview() {
  const {
    mijnVakken,
    doneMap,
    setDoneState,
    huiswerkWeergave,
    weekIdxWO,
    setWeekIdxWO,
    niveauWO,
    setNiveauWO,
    leerjaarWO,
    setLeerjaarWO,
    weekData,
    customHomework,
    addCustomHomework,
    removeCustomHomework,
  } = useAppStore();
  const docs = useAppStore((s) => s.docs) ?? [];
  const { openPreview } = useDocumentPreview();

  const activeDocs = React.useMemo(() => docs.filter((d) => d.enabled), [docs]);
  const hasActiveDocs = activeDocs.length > 0;
  const weeks = weekData.weeks ?? [];
  const byWeek = weekData.byWeek ?? {};
  const hasWeekData = weeks.length > 0;

  const niveauOptions = React.useMemo(
    () => Array.from(new Set(activeDocs.map((d) => d.niveau))).sort(),
    [activeDocs]
  );
  const leerjaarOptions = React.useMemo(
    () =>
      Array.from(new Set(activeDocs.map((d) => d.leerjaar))).sort(
        (a, b) => Number(a) - Number(b)
      ),
    [activeDocs]
  );

  React.useEffect(() => {
    if (!hasActiveDocs && niveauWO !== "ALLE") {
      setNiveauWO("ALLE");
      return;
    }
    if (hasActiveDocs && niveauWO !== "ALLE" && !niveauOptions.includes(niveauWO)) {
      setNiveauWO("ALLE");
    }
  }, [hasActiveDocs, niveauOptions, niveauWO, setNiveauWO]);

  React.useEffect(() => {
    if (!hasActiveDocs && leerjaarWO !== "ALLE") {
      setLeerjaarWO("ALLE");
      return;
    }
    if (hasActiveDocs && leerjaarWO !== "ALLE" && !leerjaarOptions.includes(leerjaarWO)) {
      setLeerjaarWO("ALLE");
    }
  }, [hasActiveDocs, leerjaarOptions, leerjaarWO, setLeerjaarWO]);

  const filteredDocs = React.useMemo(
    () =>
      activeDocs.filter(
        (doc) =>
          (niveauWO === "ALLE" || doc.niveau === niveauWO) &&
          (leerjaarWO === "ALLE" || doc.leerjaar === leerjaarWO)
      ),
    [activeDocs, niveauWO, leerjaarWO]
  );

  const docsByVak = React.useMemo(() => {
    const map = new Map<string, DocRecord[]>();
    for (const doc of filteredDocs) {
      const list = map.get(doc.vak);
      if (list) {
        list.push(doc);
      } else {
        map.set(doc.vak, [doc]);
      }
    }
    return map;
  }, [filteredDocs]);

  const visibleVakken = React.useMemo(
    () => mijnVakken.filter((vak) => docsByVak.has(vak)),
    [mijnVakken, docsByVak]
  );

  const hasDocsForFilters = visibleVakken.length > 0;
  const disableWeekControls = !hasActiveDocs || !hasWeekData;

  const initialWeekRef = React.useRef(false);
  React.useEffect(() => {
    if (!weeks.length) {
      initialWeekRef.current = false;
      if (weekIdxWO !== 0) setWeekIdxWO(0);
      return;
    }
    if (weekIdxWO >= weeks.length) {
      setWeekIdxWO(weeks.length - 1);
      return;
    }
    if (!initialWeekRef.current) {
      initialWeekRef.current = true;
      setWeekIdxWO(calcCurrentWeekIdx(weeks));
    }
  }, [weeks, weekIdxWO, setWeekIdxWO]);

  const week = weeks.length ? weeks[Math.min(weekIdxWO, weeks.length - 1)] : undefined;
  const weekNumber = week?.nr ?? 0;
  const weekKey = week?.id ?? `wk-${weekNumber}`;
  const dataForActiveWeek = week ? byWeek[week.id] || {} : {};
  const goThisWeek = React.useCallback(() => {
    if (!weeks.length) return;
    setWeekIdxWO(calcCurrentWeekIdx(weeks));
  }, [weeks, setWeekIdxWO]);

  const findDocForWeek = React.useCallback(
    (docsForVak: DocRecord[], info?: WeekInfo) => {
      if (!info || docsForVak.length === 0) return docsForVak[0];
      const matched = docsForVak.find((doc) => {
        const minWeek = Math.min(doc.beginWeek, doc.eindWeek);
        const maxWeek = Math.max(doc.beginWeek, doc.eindWeek);
        if (info.nr < minWeek || info.nr > maxWeek) return false;
        const isoYear = deriveIsoYearForWeek(info.nr, { schooljaar: doc.schooljaar });
        return isoYear === info.isoYear;
      });
      return matched ?? docsForVak[0];
    },
    []
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold theme-text">Weekoverzicht</h1>
        <div className="mt-1 text-sm theme-muted">
          Week {week?.nr ?? "—"} · {week ? formatRange(week) : "Geen data"}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <button
          onClick={goThisWeek}
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Spring naar deze week"
          aria-label="Deze week"
          disabled={disableWeekControls}
        >
          <CalendarClock size={16} />
        </button>
        <button
          onClick={() => setWeekIdxWO(Math.max(0, weekIdxWO - 1))}
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Vorige week"
          disabled={disableWeekControls}
        >
          ◀
        </button>
        <span className="text-sm theme-text">Week {week?.nr ?? "—"}</span>
        <button
          onClick={() => setWeekIdxWO(Math.min(Math.max(weeks.length - 1, 0), weekIdxWO + 1))}
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Volgende week"
          disabled={disableWeekControls}
        >
          ▶
        </button>

        <select
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
          value={niveauWO}
          onChange={(e) => setNiveauWO(e.target.value as any)}
          aria-label="Filter niveau"
          title="Filter op niveau"
          disabled={!hasActiveDocs}
        >
          <option value="ALLE">Alle niveaus</option>
          {niveauOptions.map((niveau) => (
            <option key={niveau} value={niveau}>
              {niveau}
            </option>
          ))}
        </select>

        <select
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
          value={leerjaarWO}
          onChange={(e) => setLeerjaarWO(e.target.value)}
          aria-label="Filter leerjaar"
          title="Filter op leerjaar"
          disabled={!hasActiveDocs}
        >
          <option value="ALLE">Alle leerjaren</option>
          {leerjaarOptions.map((j) => (
            <option key={j} value={j}>
              Leerjaar {j}
            </option>
          ))}
        </select>
      </div>

      {!hasActiveDocs ? (
        <div className="rounded-2xl border theme-border theme-surface p-6 text-sm theme-muted">
          Nog geen uploads. Voeg eerst één of meer studiewijzers toe via <strong>Uploads</strong>.
        </div>
      ) : !hasWeekData ? (
        <div className="rounded-2xl border theme-border theme-surface p-6 text-sm theme-muted">
          Nog geen weekgegevens beschikbaar. Controleer of de documenten studiewijzerdata bevatten.
        </div>
      ) : !hasDocsForFilters ? (
        <div className="rounded-2xl border theme-border theme-surface p-6 text-sm theme-muted">
          Geen vakken voor deze filters. Pas de selectie aan of controleer de metadata van de documenten.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleVakken.map((vak) => {
            const data = dataForActiveWeek[vak];
            const docsForVak = docsByVak.get(vak) ?? [];
            const doc = findDocForWeek(docsForVak, week);
            const onOpenDoc = doc
              ? () => openPreview({ fileId: doc.fileId, filename: doc.bestand })
              : undefined;
            const customEntries = customHomework[weekKey]?.[vak] ?? [];
            return (
              <Card
                key={vak}
                vak={vak}
                weekId={weekKey}
                weekNr={weekNumber}
                data={data}
                doneMap={doneMap}
                setDoneState={setDoneState}
                mode={huiswerkWeergave}
                onOpenDoc={onOpenDoc}
                docName={doc?.bestand}
                customHomework={customEntries}
                onAddCustom={(text) => addCustomHomework(weekKey, vak, text)}
                onRemoveCustom={(entryId) => removeCustomHomework(weekKey, vak, entryId)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
