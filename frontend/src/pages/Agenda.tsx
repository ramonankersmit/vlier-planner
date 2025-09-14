import React from "react";
import { CalendarClock, FileText } from "lucide-react";
import { useAppStore } from "../app/store";
import { sampleWeeks, sampleByWeek, formatHumanDate } from "../data/sampleWeeks";
import { sampleDocsInitial } from "../data/sampleDocs";

type Item = {
  id: string;
  week: number;
  type: "Toets" | "Deadline";
  vak: string;
  title: string;
  date?: string;
  src?: string; // bestandsnaam
};

export default function Agenda() {
  const { mijnVakken } = useAppStore();

  // filters / navigatie
  const [vak, setVak] = React.useState<string>("ALLE");
  const [fromIdx, setFromIdx] = React.useState(0);
  const [dur, setDur] = React.useState(3); // 1..6

  const maxFrom = Math.max(0, sampleWeeks.length - dur);
  const clampedFrom = Math.min(fromIdx, maxFrom);
  const weeks = sampleWeeks.slice(clampedFrom, clampedFrom + dur);

  const goThisWeek = () => setFromIdx(0); // in echte app: index calc op basis van echte 'vandaag'
  const prev = () => setFromIdx((i) => Math.max(0, i - 1));
  const next = () => setFromIdx((i) => Math.min(maxFrom, i + 1));

  // Bouw de items vanuit de sample data, gefilterd op zichtbare vakken en gekozen vak
  const items: Item[] = weeks.flatMap((w) => {
    const perVak = sampleByWeek[w.nr] || {};
    return Object.entries(perVak).flatMap(([vakNaam, d]: any) => {
      if (mijnVakken.length && !mijnVakken.includes(vakNaam)) return [];
      if (vak !== "ALLE" && vakNaam !== vak) return [];
      if (!d?.deadlines || d.deadlines === "—") return [];
      const type: Item["type"] =
        String(d.deadlines).toLowerCase().includes("toets") ? "Toets" : "Deadline";
      const doc = sampleDocsInitial.find((dd) => dd.vak === vakNaam);
      return [
        {
          id: `${vakNaam}-${w.nr}`,
          week: w.nr,
          type,
          vak: vakNaam,
          title: d.deadlines,
          date: d.date,
          src: doc?.bestand,
        } as Item,
      ];
    });
  });

  return (
    <div>
      <div className="text-lg font-semibold mb-3">Agenda &amp; Deadlines</div>

      {/* Filter/navigatiebalk */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={goThisWeek}
          className="rounded-md border px-2 py-1 text-sm"
          title="Deze week"
        >
          <CalendarClock size={16} />
        </button>
        <button onClick={prev} className="rounded-md border px-2 py-1 text-sm">
          ◀
        </button>
        <span className="text-sm text-gray-800">
          Week {weeks[0]?.nr}
          {weeks.length > 1 ? `–${weeks[weeks.length - 1].nr}` : ""}
        </span>
        <button onClick={next} className="rounded-md border px-2 py-1 text-sm">
          ▶
        </button>

        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={dur}
          onChange={(e) => {
            const n = Number(e.target.value);
            setDur(n);
          }}
        >
          {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n > 1 ? "weken" : "week"}
            </option>
          ))}
        </select>

        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={vak}
          onChange={(e) => setVak(e.target.value)}
        >
          <option value="ALLE">Alle vakken</option>
          {mijnVakken.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Tabel */}
      <div className="overflow-auto rounded-2xl border bg-white">
        {items.length === 0 ? (
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
                    <td className="px-4 py-2 align-top">
                      <span className="rounded-full border bg-white px-2 py-0.5">
                        {it.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-top whitespace-nowrap">{it.vak}</td>
                    <td className="px-4 py-2 align-top">{it.title}</td>
                    <td
                      className="px-4 py-2 align-top whitespace-nowrap"
                      title={it.date || ""}
                    >
                      {dateLabel}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <button
                        className="rounded-lg border bg-white p-1"
                        title={it.src ? `Bron: ${it.src}` : "Toon bron"}
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
