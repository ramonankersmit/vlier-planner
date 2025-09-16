import React from "react";
import { FileText, CalendarClock } from "lucide-react";
import { useAppStore, type DocRecord, type WeekInfo, type WeekData } from "../app/store";
import {
  formatRange,
  calcCurrentWeekIdx,
  computeWindowStartForWeek,
  formatWeekWindowLabel,
} from "../lib/weekUtils";
import { splitHomeworkItems } from "../lib/textUtils";
import { useDocumentPreview } from "../components/DocumentPreviewProvider";
import { deriveIsoYearForWeek, makeWeekId } from "../lib/calendar";

function MatrixCell({
  vak,
  week,
  data,
  doneMap,
  setDoneState,
  mode,
  doc,
  onOpenDoc,
}: {
  vak: string;
  week: WeekInfo;
  data?: WeekData;
  doneMap: Record<string, boolean>;
  setDoneState: (key: string, value: boolean) => void;
  mode: "perOpdracht" | "gecombineerd";
  doc?: DocRecord;
  onOpenDoc?: () => void;
}) {
  const baseKey = `${week.id}:${vak}`;
  const storedItems =
    Array.isArray(data?.huiswerkItems) && data?.huiswerkItems.length
      ? data.huiswerkItems
      : undefined;
  const homeworkItems = (storedItems ?? splitHomeworkItems(data?.huiswerk)).map((item) => item.trim());
  const filteredHomeworkItems = homeworkItems.filter((item) => item.length > 0);
  const itemKeys = filteredHomeworkItems.map((_, idx) => `${baseKey}:${idx}`);
  const hasItemState = itemKeys.some((itemKey) =>
    Object.prototype.hasOwnProperty.call(doneMap, itemKey)
  );
  const rawDoneStates = itemKeys.map((itemKey) => !!doneMap[itemKey]);
  const baseDone = !!doneMap[baseKey];
  const displayDoneStates = hasItemState
    ? rawDoneStates
    : filteredHomeworkItems.map(() => baseDone);
  const allDone = filteredHomeworkItems.length
    ? hasItemState
      ? rawDoneStates.every(Boolean)
      : baseDone
    : baseDone;
  const shouldAdoptBaseState =
    mode === "perOpdracht" && baseDone && !hasItemState && filteredHomeworkItems.length > 0;

  React.useEffect(() => {
    if (!shouldAdoptBaseState) return;
    filteredHomeworkItems.forEach((_, idx) => {
      setDoneState(`${baseKey}:${idx}`, true);
    });
    setDoneState(baseKey, false);
  }, [shouldAdoptBaseState, filteredHomeworkItems, baseKey, setDoneState]);

  const toggleItem = (idx: number) => {
    const itemKey = itemKeys[idx];
    const current = hasItemState ? rawDoneStates[idx] : baseDone;
    const next = !current;
    setDoneState(baseKey, false);
    setDoneState(itemKey, next);
  };

  const toggleCombined = () => {
    const next = !allDone;
    setDoneState(baseKey, next);
    filteredHomeworkItems.forEach((_, idx) => {
      setDoneState(`${baseKey}:${idx}`, next);
    });
  };

  const aggregatedHomework =
    data?.huiswerk && data.huiswerk.trim().length
      ? data.huiswerk
      : filteredHomeworkItems.join("\n");

  const deadlineLabel = data?.deadlines || "Geen toets/deadline";

  return (
    <td className="px-4 py-2 align-top">
      <div className="flex flex-col gap-2 min-w-[14rem]">
        <div className="flex items-start gap-2">
          <div className="flex-1 text-sm">
            {mode === "perOpdracht" ? (
              filteredHomeworkItems.length ? (
                <ul className="space-y-1">
                  {filteredHomeworkItems.map((item, idx) => {
                    const checked = !!displayDoneStates[idx];
                    return (
                      <li key={`${baseKey}-${idx}`}>
                        <label className="flex items-start gap-2">
                          <input
                            aria-label={`Huiswerk ${vak}: ${item}`}
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(idx)}
                            className="mt-0.5"
                          />
                          <span className={`flex-1 ${checked ? "line-through text-gray-400" : ""}`}>
                            {item}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-gray-500">Geen huiswerk</div>
              )
            ) : aggregatedHomework ? (
              <label className="flex items-start gap-2">
                <input
                  aria-label={`Huiswerk ${vak}`}
                  type="checkbox"
                  checked={allDone}
                  onChange={toggleCombined}
                  className="mt-0.5"
                />
                <span className={`flex-1 whitespace-pre-line ${allDone ? "line-through text-gray-400" : ""}`}>
                  {aggregatedHomework}
                </span>
              </label>
            ) : (
              <div className="text-gray-500">Geen huiswerk</div>
            )}
          </div>
          <button
            title={doc ? `Bron: ${doc.bestand}` : "Geen bron voor dit vak"}
            aria-label={doc ? `Bron: ${doc.bestand}` : `Geen bron voor ${vak}`}
            className="text-gray-600 disabled:opacity-40"
            disabled={!onOpenDoc}
            onClick={onOpenDoc}
          >
            <FileText size={14} />
          </button>
        </div>
        <div className={`text-xs text-gray-600 ${allDone ? "opacity-70" : ""}`}>{deadlineLabel}</div>
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
      <div className="mb-2 text-sm text-gray-600">{windowLabel}</div>
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <button
          onClick={goThisWeek}
          className="rounded-md border px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Spring naar huidige week"
          aria-label="Deze week"
          disabled={disableWeekControls}
        >
          <CalendarClock size={16} />
        </button>
        <button
          onClick={prev}
          className="rounded-md border px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Vorige"
          disabled={disableWeekControls}
        >
          ◀
        </button>
        <span className="text-sm text-gray-800">
          Week {weeks[0]?.nr ?? "—"}
          {weeks.length > 1 ? `–${weeks[weeks.length - 1].nr}` : ""}
        </span>
        <button
          onClick={next}
          className="rounded-md border px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Volgende"
          disabled={disableWeekControls}
        >
          ▶
        </button>

        <select
          className="rounded-md border px-2 py-1 text-sm"
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
          className="rounded-md border px-2 py-1 text-sm"
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
          className="rounded-md border px-2 py-1 text-sm"
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
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          Nog geen uploads. Voeg eerst één of meer studiewijzers toe via <strong>Uploads</strong>.
        </div>
      ) : !hasWeekData ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          Nog geen weekgegevens beschikbaar. Controleer of de documenten studiewijzerdata bevatten.
        </div>
      ) : showNoDataForFilters ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          Geen vakken voor deze filters. Pas de selectie aan of controleer de metadata van de documenten.
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left whitespace-nowrap">Vak</th>
                {weeks.map((w) => (
                  <th key={w.id} className="px-4 py-2 text-left">
                    <div className="font-medium">Week {w.nr}</div>
                    <div className="text-xs text-gray-500">{formatRange(w)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleVakken.map((vak) => (
                <tr key={vak} className="border-t">
                  <td className="px-4 py-2 font-medium whitespace-nowrap">{vak}</td>
                  {weeks.map((w) => {
                    const perWeek = weekData.byWeek?.[w.id] || {};
                    const data = perWeek[vak];
                    const docsForVak = docsByVak.get(vak) ?? [];
                    const doc = findDocForWeek(docsForVak, w);
                    const onOpenDoc = doc
                      ? () => openPreview({ fileId: doc.fileId, filename: doc.bestand })
                      : undefined;

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
