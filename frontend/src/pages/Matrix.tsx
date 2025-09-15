import React from "react";
import { FileText, CalendarClock } from "lucide-react";
import { useAppStore } from "../app/store";
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
  const allWeeks = React.useMemo(() => deriveWeeksFromDocs(activeDocs), [activeDocs]);

  const hasUploads = activeDocs.length > 0 && allWeeks.length > 0;

  const [startIdx, setStartIdx] = React.useState(0);
  const [count, setCount] = React.useState(3); // 1–6
  const [niveau, setNiveau] = React.useState<"HAVO" | "VWO" | "ALLE">("VWO");
  const [leerjaar, setLeerjaar] = React.useState("4");

  const maxStart = Math.max(0, allWeeks.length - count);
  const clampedStart = Math.min(startIdx, maxStart);
  const weeks = allWeeks.slice(clampedStart, clampedStart + count);

  const prev = () => {
    if (!hasUploads) return;
    setStartIdx((i) => Math.max(0, i - 1));
  };
  const next = () => {
    if (!hasUploads) return;
    setStartIdx((i) => Math.min(maxStart, i + 1));
  };
  const goThisWeek = React.useCallback(() => {
    if (!hasUploads) return;
    const curWeekNr = sampleWeeks[calcCurrentWeekIdx()]?.nr;
    const start = computeWindowStartForWeek(allWeeks, count, curWeekNr);
    setStartIdx(start);
  }, [allWeeks, count, hasUploads]);

  // >>> Eerste load: centreer venster rond huidige week
  React.useEffect(() => {
    if (hasUploads) {
      goThisWeek();
    } else {
      setStartIdx(0);
    }
  }, [count, goThisWeek, hasUploads]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <button
          onClick={goThisWeek}
          className="rounded-md border px-2 py-1 text-sm"
          title="Spring naar huidige week"
          aria-label="Deze week"
          disabled={!hasUploads}
        >
          <CalendarClock size={16} />
        </button>
        <button
          onClick={prev}
          className="rounded-md border px-2 py-1 text-sm"
          title="Vorige"
          disabled={!hasUploads}
        >
          ◀
        </button>
        <span className="text-sm text-gray-800">
          Week {weeks[0]?.nr ?? "—"}
          {weeks.length > 1 ? `–${weeks[weeks.length - 1].nr}` : ""}
        </span>
        <button
          onClick={next}
          className="rounded-md border px-2 py-1 text-sm"
          title="Volgende"
          disabled={!hasUploads}
        >
          ▶
        </button>

        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="Aantal weken tonen"
          title="Aantal weken tonen"
          disabled={!hasUploads}
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
          disabled={!hasUploads}
        >
          <option value="ALLE">Alle niveaus</option>
          <option value="HAVO">HAVO</option>
          <option value="VWO">VWO</option>
        </select>

        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={leerjaar}
          onChange={(e) => setLeerjaar(e.target.value)}
          aria-label="Filter leerjaar"
          title="Filter op leerjaar"
          disabled={!hasUploads}
        >
          {["1", "2", "3", "4", "5", "6"].map((j) => (
            <option key={j} value={j}>
              Leerjaar {j}
            </option>
          ))}
        </select>
      </div>

      {!hasUploads ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          Nog geen uploads. Voeg eerst één of meer studiewijzers toe via <strong>Uploads</strong>.
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
              {mijnVakken.map((vak) => (
                <tr key={vak} className="border-t">
                  <td className="px-4 py-2 font-medium whitespace-nowrap">{vak}</td>
                  {weeks.map((w) => {
                    const d = (sampleByWeek[w.nr] || {})[vak] || {};
                    const key = `${w.nr}:${vak}`;
                    const isDone = !!doneMap[key];
                    const hasHw = d?.huiswerk && d.huiswerk !== "—";
                    const doc = activeDocs.find(
                      (dd) =>
                        dd.vak === vak &&
                        w.nr >= Math.min(dd.beginWeek, dd.eindWeek) &&
                        w.nr <= Math.max(dd.beginWeek, dd.eindWeek)
                    ) || activeDocs.find((dd) => dd.vak === vak);

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
