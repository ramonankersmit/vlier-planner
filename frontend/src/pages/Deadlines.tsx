import React from "react";
import { CalendarClock, FileText } from "lucide-react";
import { useAppStore } from "../app/store";
import {
  sampleWeeks,
  sampleByWeek,
  formatHumanDate,
  calcCurrentWeekIdx,
  deriveWeeksFromDocs,
  computeWindowStartForWeek,
} from "../data/sampleWeeks";
import { useDocumentPreview } from "../components/DocumentPreviewProvider";

type Item = {
  id: string;
  week: number;
  type: "Toets" | "Deadline";
  vak: string;
  title: string;
  date?: string;
  src?: string;
  fileId?: string;
};

export default function Deadlines() {
  const mijnVakken = useAppStore((s) => s.mijnVakken) ?? [];
  const docs = useAppStore((s) => s.docs) ?? [];
  const { openPreview } = useDocumentPreview();

  const [vak, setVak] = React.useState<string>("ALLE");
  const [fromIdx, setFromIdx] = React.useState(0);
  const [dur, setDur] = React.useState(3);

  const activeDocs = React.useMemo(() => docs.filter((d) => d.enabled), [docs]);
  const hasActiveDocs = activeDocs.length > 0;
  const allWeeks = React.useMemo(() => deriveWeeksFromDocs(activeDocs), [activeDocs]);
  const hasWeekData = allWeeks.length > 0;
  const disableWeekControls = !hasActiveDocs || !hasWeekData;
  const hasUploads = hasActiveDocs && hasWeekData;

  const maxFrom = Math.max(0, allWeeks.length - dur);
  const clampedFrom = Math.min(fromIdx, maxFrom);
  const weeks = allWeeks.slice(clampedFrom, clampedFrom + dur);

  const prev = () => {
    if (disableWeekControls) return;
    setFromIdx((i) => Math.max(0, i - 1));
  };
  const next = () => {
    if (disableWeekControls) return;
    setFromIdx((i) => Math.min(maxFrom, i + 1));
  };
  const goThisWeek = React.useCallback(() => {
    if (disableWeekControls) return;
    const currentWeekNr = sampleWeeks[calcCurrentWeekIdx()]?.nr;
    const start = computeWindowStartForWeek(allWeeks, dur, currentWeekNr);
    setFromIdx(start);
  }, [allWeeks, dur, disableWeekControls]);

  // >>> Eerste load: centreer venster rond huidige week
  React.useEffect(() => {
    if (disableWeekControls) {
      setFromIdx(0);
    } else {
      goThisWeek();
    }
  }, [disableWeekControls, goThisWeek]);

  const items: Item[] = !hasUploads
    ? []
    : weeks.flatMap((w) => {
        const perVak = sampleByWeek[w.nr] || {};
        return Object.entries(perVak).flatMap(([vakNaam, d]: any) => {
          if (mijnVakken.length && !mijnVakken.includes(vakNaam)) return [];
          if (vak !== "ALLE" && vakNaam !== vak) return [];
          if (!d?.deadlines || d.deadlines === "—") return [];
          const type: Item["type"] =
            String(d.deadlines).toLowerCase().includes("toets") ? "Toets" : "Deadline";
          const doc = activeDocs.find(
            (dd) =>
              dd.vak === vakNaam &&
              w.nr >= Math.min(dd.beginWeek, dd.eindWeek) &&
              w.nr <= Math.max(dd.beginWeek, dd.eindWeek)
          ) || activeDocs.find((dd) => dd.vak === vakNaam);
          return [
            {
              id: `${vakNaam}-${w.nr}`,
              week: w.nr,
              type,
              vak: vakNaam,
              title: d.deadlines,
              date: d.date,
              src: doc?.bestand,
              fileId: doc?.fileId,
            } as Item,
          ];
        });
      });

  return (
    <div>
      <div className="text-lg font-semibold mb-3">Deadlines</div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
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
          value={dur}
          onChange={(e) => setDur(Number(e.target.value))}
          aria-label="Aantal weken tonen"
          title="Aantal weken tonen"
          disabled={disableWeekControls}
        >
          {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n} {n > 1 ? "weken" : "week"}</option>
          ))}
        </select>

        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={vak}
          onChange={(e) => setVak(e.target.value)}
          aria-label="Filter vak"
          title="Filter op vak"
          disabled={!hasUploads}
        >
          <option value="ALLE">Alle vakken</option>
          {mijnVakken.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      <div className="overflow-auto rounded-2xl border bg-white">
        {!hasUploads ? (
          <div className="p-6 text-sm text-gray-600">
            Nog geen uploads. Voeg eerst één of meer studiewijzers toe via <strong>Uploads</strong>.
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm text-gray-600">Geen deadlines in deze periode.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Week</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Vak</th>
                <th className="px-4 py-2 text-left">Omschrijving</th>
                <th className="px-4 py-2 text-left">Datum</th>
                <th className="px-4 py-2 text-left">Bron</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const dateLabel = it.date ? formatHumanDate(it.date) : "—";
                return (
                  <tr key={it.id} className={idx > 0 ? "border-t" : ""}>
                    <td className="px-4 py-2 align-top">wk {it.week}</td>
                    <td className="px-4 py-2 align-top"><span className="rounded-full border bg-white px-2 py-0.5">{it.type}</span></td>
                    <td className="px-4 py-2 align-top whitespace-nowrap">{it.vak}</td>
                    <td className="px-4 py-2 align-top">{it.title}</td>
                    <td className="px-4 py-2 align-top whitespace-nowrap" title={it.date || ""}>{dateLabel}</td>
                    <td className="px-4 py-2 align-top">
                      <button
                        className="rounded-lg border bg-white p-1 disabled:opacity-40"
                        title={it.src ? `Bron: ${it.src}` : "Geen bron beschikbaar"}
                        aria-label={it.src ? `Bron: ${it.src}` : `Bron niet beschikbaar voor ${it.vak}`}
                        disabled={!it.fileId}
                        onClick={() =>
                          it.fileId &&
                          openPreview({ fileId: it.fileId, filename: it.src || `${it.vak}.pdf` })
                        }
                      >
                        <FileText size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
