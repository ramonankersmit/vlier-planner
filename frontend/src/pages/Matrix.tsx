import React from "react";
import {
  FileText,
  CalendarClock,
  MessageCircle,
  BookOpen,
  CheckSquare,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useAppStore,
  type DocRecord,
  type WeekInfo,
  type WeekData,
  type CustomHomeworkEntry,
} from "../app/store";
import {
  formatRange,
  calcCurrentWeekIdx,
  computeWindowStartForWeek,
  formatWeekWindowLabel,
} from "../lib/weekUtils";
import { splitHomeworkItems } from "../lib/textUtils";
import { useDocumentPreview } from "../components/DocumentPreviewProvider";
import { deriveIsoYearForWeek, makeWeekId } from "../lib/calendar";
import { hasMeaningfulContent } from "../lib/contentUtils";

function MatrixCell({
  vak,
  week,
  data,
  doneMap,
  setDoneState,
  mode,
  doc,
  onOpenDoc,
  customHomework,
  onAddCustom,
  onRemoveCustom,
}: {
  vak: string;
  week: WeekInfo;
  data?: WeekData;
  doneMap: Record<string, boolean>;
  setDoneState: (key: string, value: boolean) => void;
  mode: "perOpdracht" | "gecombineerd";
  doc?: DocRecord;
  onOpenDoc?: () => void;
  customHomework: CustomHomeworkEntry[];
  onAddCustom: (text: string) => void;
  onRemoveCustom: (entryId: string) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [customText, setCustomText] = React.useState("");
  const baseKey = `${week.id}:${vak}`;
  const storedItems =
    Array.isArray(data?.huiswerkItems) && data?.huiswerkItems.length
      ? data.huiswerkItems
      : undefined;
  const homeworkItems = (storedItems ?? splitHomeworkItems(data?.huiswerk)).map((item) => item.trim());
  const filteredHomeworkItems = homeworkItems.filter((item) => hasMeaningfulContent(item));
  const normalizedCustom = customHomework
    .map((entry) => ({ ...entry, text: entry.text.trim() }))
    .filter((entry) => hasMeaningfulContent(entry.text));
  const autoItems = filteredHomeworkItems.map((text, idx) => ({
    text,
    doneKey: `${baseKey}:${idx}`,
    isCustom: false,
  }));
  const customItems = normalizedCustom.map((entry) => ({
    text: entry.text,
    doneKey: `${baseKey}:custom:${entry.id}`,
    isCustom: true,
    entryId: entry.id,
  }));
  const autoKeys = autoItems.map((item) => item.doneKey);
  const customKeys = customItems.map((item) => item.doneKey);
  const baseDone = !!doneMap[baseKey];
  const hasAutoItemState = autoKeys.some((itemKey) =>
    Object.prototype.hasOwnProperty.call(doneMap, itemKey)
  );
  const autoDoneStates = autoKeys.map((itemKey) => !!doneMap[itemKey]);
  const customDoneStates = customKeys.map((itemKey) => !!doneMap[itemKey]);
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

  const toggleItem = (item: { doneKey: string; isCustom: boolean; checked: boolean }) => {
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
    hasMeaningfulContent(data?.huiswerk)
      ? data?.huiswerk ?? ""
      : autoItems.map((item) => item.text).join("\n");
  const hasAggregatedHomework = hasMeaningfulContent(aggregatedHomework);
  const hasOpmerkingen = hasMeaningfulContent(data?.opmerkingen);
  const hasLesstof = hasMeaningfulContent(data?.lesstof);
  const hasDeadlines = hasMeaningfulContent(data?.deadlines);
  const deadlineLabel = hasDeadlines ? data?.deadlines : "-";
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
    setAdding(true);
  };

  const cancelAdd = () => {
    setCustomText("");
    setAdding(false);
  };

  const submitCustom = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = customText.trim();
    if (!hasMeaningfulContent(trimmed)) {
      return;
    }
    onAddCustom(trimmed);
    setCustomText("");
    setAdding(false);
  };

  return (
    <td className="px-4 py-2 align-top">
      <div className="flex flex-col gap-2 min-w-[14rem]">
        <div className="flex items-start gap-2">
          <div className="flex-1 text-sm">
            {mode === "perOpdracht" ? (
              hasAnyItems ? (
                <ul className="space-y-1">
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
                      {item.isCustom && item.entryId && (
                        <button
                          type="button"
                          className="theme-muted hover:text-rose-600"
                          onClick={() => onRemoveCustom(item.entryId!)}
                          aria-label={`Verwijder eigen huiswerk voor ${vak}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="theme-muted">-</div>
              )
            ) : (
              <div className="flex flex-col gap-2">
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
                                doneKey: item.doneKey,
                                isCustom: true,
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
                        {item.entryId && (
                          <button
                            type="button"
                            className="theme-muted hover:text-rose-600"
                            onClick={() => onRemoveCustom(item.entryId!)}
                            aria-label={`Verwijder eigen huiswerk voor ${vak}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {!hasAnyItems && <div className="theme-muted">-</div>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 self-start">
            {hasOpmerkingen && (
              <span
                role="img"
                aria-label={`Opmerkingen voor ${vak}`}
                title={data?.opmerkingen || ""}
                className="text-sky-600"
              >
                <MessageCircle size={14} aria-hidden="true" />
              </span>
            )}
            {hasLesstof && (
              <span
                role="img"
                aria-label={`Lesstof voor ${vak}`}
                title={data?.lesstof || ""}
                className="text-emerald-600"
              >
                <BookOpen size={14} aria-hidden="true" />
              </span>
            )}
            {hasDeadlines && (
              <span
                role="img"
                aria-label={`Toets of deadline voor ${vak}`}
                title={data?.deadlines || ""}
                className="text-amber-600"
              >
                <CheckSquare size={14} aria-hidden="true" />
              </span>
            )}
            <button
              onClick={adding ? cancelAdd : startAdd}
              title="Eigen huiswerk toevoegen"
              aria-label={`Voeg huiswerk toe voor ${vak}`}
            >
              <Plus size={14} className="theme-muted" />
            </button>
            <button
              title={doc ? `Bron: ${doc.bestand}` : "Geen bron voor dit vak"}
              aria-label={doc ? `Bron: ${doc.bestand}` : `Geen bron voor ${vak}`}
              className="theme-muted disabled:opacity-40"
              disabled={!onOpenDoc}
              onClick={onOpenDoc}
            >
              <FileText size={14} />
            </button>
          </div>
        </div>
        <div className={`text-xs theme-muted ${allDone ? "opacity-80" : ""}`} title={deadlineTitle}>
          {deadlineLabel}
        </div>
        {adding && (
          <form onSubmit={submitCustom} className="flex flex-col gap-2 text-xs">
            <textarea
              className="w-full rounded-md border theme-border px-2 py-1"
              rows={2}
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="Eigen huiswerk"
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
    </td>
  );
}

export default function Matrix() {
  const mijnVakken = useAppStore((s) => s.mijnVakken) ?? [];
  const doneMap = useAppStore((s) => s.doneMap) ?? {};
  const setDoneState = useAppStore((s) => s.setDoneState);
  const huiswerkWeergave = useAppStore((s) => s.huiswerkWeergave);
  const docs = useAppStore((s) => s.docs) ?? [];
  const weekData = useAppStore((s) => s.weekData);
  const customHomework = useAppStore((s) => s.customHomework);
  const addCustomHomework = useAppStore((s) => s.addCustomHomework);
  const removeCustomHomework = useAppStore((s) => s.removeCustomHomework);
  const { openPreview } = useDocumentPreview();

  const activeDocs = React.useMemo(() => docs.filter((d) => d.enabled), [docs]);
  const hasAnyDocs = activeDocs.length > 0;

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

  const [startIdx, setStartIdx] = React.useState(0);
  const [count, setCount] = React.useState(3); // 1–6
  const [niveau, setNiveau] = React.useState<"HAVO" | "VWO" | "ALLE">("ALLE");
  const [leerjaar, setLeerjaar] = React.useState("ALLE");

  React.useEffect(() => {
    if (!hasAnyDocs && niveau !== "ALLE") {
      setNiveau("ALLE");
      return;
    }
    if (hasAnyDocs && niveau !== "ALLE" && !niveauOptions.includes(niveau)) {
      setNiveau("ALLE");
    }
  }, [hasAnyDocs, niveau, niveauOptions]);

  React.useEffect(() => {
    if (!hasAnyDocs && leerjaar !== "ALLE") {
      setLeerjaar("ALLE");
      return;
    }
    if (hasAnyDocs && leerjaar !== "ALLE" && !leerjaarOptions.includes(leerjaar)) {
      setLeerjaar("ALLE");
    }
  }, [hasAnyDocs, leerjaar, leerjaarOptions]);

  const filteredDocs = React.useMemo(
    () =>
      activeDocs.filter(
        (doc) =>
          (niveau === "ALLE" || doc.niveau === niveau) &&
          (leerjaar === "ALLE" || doc.leerjaar === leerjaar)
      ),
    [activeDocs, niveau, leerjaar]
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

  const allowedWeekIdSet = React.useMemo(() => {
    const ids = new Set<string>();
    for (const doc of filteredDocs) {
      const start = Math.min(doc.beginWeek, doc.eindWeek);
      const end = Math.max(doc.beginWeek, doc.eindWeek);
      for (let wk = start; wk <= end; wk++) {
        if (wk < 1 || wk > 53) continue;
        const isoYear = deriveIsoYearForWeek(wk, { schooljaar: doc.schooljaar });
        ids.add(makeWeekId(isoYear, wk));
      }
    }
    return ids;
  }, [filteredDocs]);

  const allWeeks = React.useMemo(() => {
    if (!allowedWeekIdSet.size) return [];
    const allowed = allowedWeekIdSet;
    return (weekData.weeks ?? []).filter((w) => allowed.has(w.id));
  }, [allowedWeekIdSet, weekData.weeks]);

  const hasWeekData = allWeeks.length > 0;
  const disableWeekControls = !hasAnyDocs || !hasWeekData;

  const maxStart = Math.max(0, allWeeks.length - count);
  const clampedStart = Math.min(startIdx, maxStart);
  const weeks = allWeeks.slice(clampedStart, clampedStart + count);

  const prev = () => {
    if (disableWeekControls) return;
    setStartIdx((i) => Math.max(0, i - 1));
  };
  const next = () => {
    if (disableWeekControls) return;
    setStartIdx((i) => Math.min(maxStart, i + 1));
  };
  const goThisWeek = React.useCallback(() => {
    if (disableWeekControls) return;
    const idx = calcCurrentWeekIdx(allWeeks);
    const targetWeekId = allWeeks[idx]?.id;
    const start = computeWindowStartForWeek(allWeeks, count, targetWeekId);
    setStartIdx(start);
  }, [allWeeks, count, disableWeekControls]);

  // >>> Eerste load: centreer venster rond huidige week
  React.useEffect(() => {
    if (disableWeekControls) {
      setStartIdx(0);
    } else {
      goThisWeek();
    }
  }, [disableWeekControls, goThisWeek]);

  const hasVisibleData = weeks.length > 0 && visibleVakken.length > 0;
  const showNoDataForFilters = hasAnyDocs && hasWeekData && !hasVisibleData;
  const windowLabel = formatWeekWindowLabel(weeks);

  const findDocForWeek = React.useCallback(
    (docsForVak: DocRecord[], info: WeekInfo) => {
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
        <h1 className="text-lg font-semibold theme-text">Matrix</h1>
        <div className="mt-1 text-sm theme-muted">{windowLabel}</div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <button
          onClick={goThisWeek}
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Spring naar huidige week"
          aria-label="Deze week"
          disabled={disableWeekControls}
        >
          <CalendarClock size={16} />
        </button>
        <button
          onClick={prev}
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Vorige"
          disabled={disableWeekControls}
        >
          ◀
        </button>
        <span className="text-sm theme-text">
          Week {weeks[0]?.nr ?? "—"}
          {weeks.length > 1 ? `–${weeks[weeks.length - 1].nr}` : ""}
        </span>
        <button
          onClick={next}
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Volgende"
          disabled={disableWeekControls}
        >
          ▶
        </button>

        <select
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="Aantal weken tonen"
          title="Aantal weken tonen"
          disabled={disableWeekControls}
        >
          {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n > 1 ? "weken" : "week"}
            </option>
          ))}
        </select>

        <select
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
          value={niveau}
          onChange={(e) => setNiveau(e.target.value as any)}
          aria-label="Filter niveau"
          title="Filter op niveau"
          disabled={!hasAnyDocs}
        >
          <option value="ALLE">Alle niveaus</option>
          {niveauOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <select
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
          value={leerjaar}
          onChange={(e) => setLeerjaar(e.target.value)}
          aria-label="Filter leerjaar"
          title="Filter op leerjaar"
          disabled={!hasAnyDocs}
        >
          <option value="ALLE">Alle leerjaren</option>
          {leerjaarOptions.map((j) => (
            <option key={j} value={j}>
              Leerjaar {j}
            </option>
          ))}
        </select>
      </div>

      {!hasAnyDocs ? (
        <div className="rounded-2xl border theme-border theme-surface p-6 text-sm theme-muted">
          Nog geen uploads. Voeg eerst één of meer studiewijzers toe via <strong>Uploads</strong>.
        </div>
      ) : !hasWeekData ? (
        <div className="rounded-2xl border theme-border theme-surface p-6 text-sm theme-muted">
          Nog geen weekgegevens beschikbaar. Controleer of de documenten studiewijzerdata bevatten.
        </div>
      ) : showNoDataForFilters ? (
        <div className="rounded-2xl border theme-border theme-surface p-6 text-sm theme-muted">
          Geen vakken voor deze filters. Pas de selectie aan of controleer de metadata van de documenten.
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border theme-border theme-surface">
          <table className="min-w-full text-sm">
            <thead className="theme-soft">
              <tr>
                <th className="px-4 py-2 text-left whitespace-nowrap">Vak</th>
                {weeks.map((w) => (
                  <th key={w.id} className="px-4 py-2 text-left">
                    <div className="font-medium">Week {w.nr}</div>
                    <div className="text-xs theme-muted">{formatRange(w)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleVakken.map((vak) => (
                <tr key={vak} className="border-t theme-border">
                  <td className="px-4 py-2 font-medium whitespace-nowrap">{vak}</td>
                  {weeks.map((w) => {
                    const perWeek = weekData.byWeek?.[w.id] || {};
                    const data = perWeek[vak];
                    const docsForVak = docsByVak.get(vak) ?? [];
                    const doc = findDocForWeek(docsForVak, w);
                    const onOpenDoc = doc
                      ? () => openPreview({ fileId: doc.fileId, filename: doc.bestand })
                      : undefined;
                    const customEntries = customHomework[w.id]?.[vak] ?? [];

                    return (
                      <MatrixCell
                        key={`${w.id}:${vak}`}
                        vak={vak}
                        week={w}
                        data={data}
                        doneMap={doneMap}
                        setDoneState={setDoneState}
                        mode={huiswerkWeergave}
                        doc={doc}
                        onOpenDoc={onOpenDoc}
                        customHomework={customEntries}
                        onAddCustom={(text) => addCustomHomework(w.id, vak, text)}
                        onRemoveCustom={(entryId) => removeCustomHomework(w.id, vak, entryId)}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
