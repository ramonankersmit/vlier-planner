import { Info, FileText, CheckSquare, CalendarClock } from "lucide-react";
import { useAppStore } from "../app/store";
import { sampleWeeks, sampleByWeek, formatRange } from "../data/sampleWeeks";

function Card({
  vak,
  weekNr,
  d,
  isDone,
  onToggle,
}: {
  vak: string;
  weekNr: number;
  d: any;
  isDone: boolean;
  onToggle: () => void;
}) {
  const hasHw = d?.huiswerk && d.huiswerk !== "—";
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{vak}</div>
        <div className="flex gap-2">
          {d?.deadlines && d.deadlines !== "—" && (
            <CheckSquare size={16} className="text-amber-600" title="Toets/Deadline" />
          )}
          {(d?.lesstof || d?.opmerkingen) && (
            <button onClick={() => setOpen(true)} title="Extra info">
              <Info size={16} className="text-gray-600" />
            </button>
          )}
          <button title="Toon bron">
            <FileText size={16} className="text-gray-600" />
          </button>
        </div>
      </div>

      {hasHw ? (
        <div className="flex items-center gap-2 text-sm">
          <input
            aria-label={`Huiswerk ${vak}`}
            type="checkbox"
            checked={isDone}
            onChange={onToggle}
          />
          <div className={isDone ? "line-through text-gray-400" : ""}>{d.huiswerk}</div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">Geen huiswerk</div>
      )}

      <div className="text-sm text-gray-700">{d?.deadlines || "Geen toets/deadline"}</div>

      {/* simpele modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {vak} – Week {weekNr}
              </h2>
              <button onClick={() => setOpen(false)} className="text-gray-500">
                ✕
              </button>
            </div>
            <div className="text-sm whitespace-pre-wrap">
              Lesstof: {d?.lesstof || "—"}
              {"\n"}
              Opmerkingen: {d?.opmerkingen || "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React from "react";

export default function WeekOverview() {
  const {
    mijnVakken,
    doneMap,
    toggleDone,
    weekIdxWO,
    setWeekIdxWO,
    niveauWO,
    setNiveauWO,
    leerjaarWO,
    setLeerjaarWO,
  } = useAppStore();

  const week = sampleWeeks[weekIdxWO];

  return (
    <div>
      <div className="mb-2 text-sm text-gray-600">
        Week {week.nr} · {formatRange(week)}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setWeekIdxWO(0)}
          className="rounded-md border px-2 py-1 text-sm"
          title="Deze week"
        >
          <CalendarClock size={16} />
        </button>
        <button
          onClick={() => setWeekIdxWO(Math.max(0, weekIdxWO - 1))}
          className="rounded-md border px-2 py-1 text-sm"
        >
          ◀
        </button>
        <span className="text-sm text-gray-800">Week {week.nr}</span>
        <button
          onClick={() => setWeekIdxWO(Math.min(sampleWeeks.length - 1, weekIdxWO + 1))}
          className="rounded-md border px-2 py-1 text-sm"
        >
          ▶
        </button>

        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={niveauWO}
          onChange={(e) => setNiveauWO(e.target.value as any)}
        >
          <option value="ALLE">Alle niveaus</option>
          <option value="HAVO">HAVO</option>
          <option value="VWO">VWO</option>
        </select>

        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={leerjaarWO}
          onChange={(e) => setLeerjaarWO(e.target.value)}
        >
          {["1", "2", "3", "4", "5", "6"].map((j) => (
            <option key={j} value={j}>
              Leerjaar {j}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mijnVakken.map((vak) => {
          const d = sampleByWeek[week.nr]?.[vak];
          const key = `${week.nr}:${vak}`;
          const isDone = !!doneMap[key];
          return (
            <Card
              key={vak}
              vak={vak}
              weekNr={week.nr}
              d={d}
              isDone={isDone}
              onToggle={() => toggleDone(key)}
            />
          );
        })}
      </div>
    </div>
  );
}
