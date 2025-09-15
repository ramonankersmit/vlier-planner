import React from "react";
import { FileText, CalendarClock } from "lucide-react";
import { useAppStore, type DocRecord } from "../app/store";
import {
  sampleWeeks,
  sampleByWeek,
  formatRange,
  calcCurrentWeekIdx,
  deriveWeeksFromDocs,
  computeWindowStartForWeek,
} from "../data/sampleWeeks";
import { useDocumentPreview } from "../components/DocumentPreviewProvider";

export default function Matrix() {
  const mijnVakken = useAppStore((s) => s.mijnVakken) ?? [];
  const doneMap = useAppStore((s) => s.doneMap) ?? {};
  const toggleDone = useAppStore((s) => s.toggleDone);
  const docs = useAppStore((s) => s.docs) ?? [];
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

  const allWeeks = React.useMemo(() => deriveWeeksFromDocs(filteredDocs), [filteredDocs]);
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
    const curWeekNr = sampleWeeks[calcCurrentWeekIdx()]?.nr;
    const start = computeWindowStartForWeek(allWeeks, count, curWeekNr);
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
  const showNoDataForFilters = hasAnyDocs && !hasVisibleData;

  return (
    <div>
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
                  <th key={w.nr} className="px-4 py-2 text-left">
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
                    const d = (sampleByWeek[w.nr] || {})[vak] || {};
                    const key = `${w.nr}:${vak}`;
                    const isDone = !!doneMap[key];
                    const hasHw = d?.huiswerk && d.huiswerk !== "—";
                    const docsForVak = docsByVak.get(vak) ?? [];
                    const doc =
                      docsForVak.find(
                        (dd) =>
                          w.nr >= Math.min(dd.beginWeek, dd.eindWeek) &&
                          w.nr <= Math.max(dd.beginWeek, dd.eindWeek)
                      ) ?? docsForVak[0];

                    return (
                      <td key={key} className="px-4 py-2 align-top">
                        <div className="flex items-center gap-2 min-w-[14rem]">
                          {hasHw && (
                            <input
                              aria-label={`Huiswerk ${vak} week ${w.nr}`}
                              type="checkbox"
                              checked={isDone}
                              onChange={() => toggleDone(key)}
                              title="Markeer huiswerk gereed"
                            />
                          )}
                          <span
                            className={`truncate flex-1 ${
                              hasHw && isDone ? "line-through text-gray-400" : ""
                            }`}
                            title={`${d.huiswerk || "—"} | ${d.deadlines || "—"}`}
                          >
                            {d.huiswerk || d.deadlines || "—"}
                          </span>
                          <button
                            title={doc ? `Bron: ${doc.bestand}` : "Toon bron"}
                            aria-label={doc ? `Bron: ${doc.bestand}` : `Geen bron voor ${vak}`}
                            className="text-gray-600 disabled:opacity-40"
                            disabled={!doc}
                            onClick={() =>
                              doc && openPreview({ fileId: doc.fileId, filename: doc.bestand })
                            }
                          >
                            <FileText size={14} />
                          </button>
                        </div>
                      </td>
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
