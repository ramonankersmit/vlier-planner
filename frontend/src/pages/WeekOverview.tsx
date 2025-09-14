import React from "react";
import { Info, FileText, CheckSquare, CalendarClock } from "lucide-react";
import { useAppStore } from "../app/store";
import { sampleWeeks, sampleByWeek, formatRange, calcCurrentWeekIdx } from "../data/sampleWeeks";

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
            <CheckSquare size={16} className="text-amber-600" title="Toets/Deadline aanwezig" />
          )}
          {(d?.lesstof || d?.opmerkingen) && (
            <button onClick={() => setOpen(true)} title="Toon details (lesstof/opmerkingen)" aria-label={`Details ${vak}`}>
              <Info size={16} className="text-gray-600" />
            </button>
          )}
          <button title="Toon brondocument" aria-label={`Bron ${vak}`}>
            <FileText size={16} className="text-gray-600" />
          </button>
        </div>
      </div>

      {hasHw ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            aria-label={`Huiswerk ${vak}`}
            type="checkbox"
            checked={isDone}
            onChange={onToggle}
          />
          <span className={isDone ? "line-through text-gray-400" : ""}>{d.huiswerk}</span>
        </label>
      ) : (
        <div className="text-sm text-gray-500">Geen huiswerk</div>
      )}

      <div className="text-sm text-gray-700" title={d?.date || ""}>
        {d?.deadlines || "Geen toets/deadline"}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {vak} – Week {weekNr}
              </h2>
              <button onClick={() => setOpen(false)} className="text-gray-500" aria-label="Sluiten">✕</button>
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
    docs,
  } = useAppStore();

  const hasUploads = (docs?.length ?? 0) > 0;

  // >>> Spring automatisch naar huidige week bij eerste load
  React.useEffect(() => {
    const idx = calcCurrentWeekIdx();
    if (idx !== weekIdxWO) setWeekIdxWO(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const week = sampleWeeks[weekIdxWO] ?? sampleWeeks[0];
  const goThisWeek = () => setWeekIdxWO(calcCurrentWeekIdx());

  return (
    <div>
      <div className="mb-2 text-sm text-gray-600">
        Week {week.nr} · {formatRange(week)}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <button
          onClick={goThisWeek}
          className="rounded-md border px-2 py-1 text-sm"
          title="Spring naar deze week"
          aria-label="Deze week"
        >
          <CalendarClock size={16} />
        </button>
        <button
          onClick={() => setWeekIdxWO(Math.max(0, weekIdxWO - 1))}
          className="rounded-md border px-2 py-1 text-sm"
          title="Vorige week"
        >
          ◀
        </button>
        <span className="text-sm text-gray-800">Week {week.nr}</span>
        <button
          onClick={() => setWeekIdxWO(Math.min(sampleWeeks.length - 1, weekIdxWO + 1))}
          className="rounded-md border px-2 py-1 text-sm"
          title="Volgende week"
        >
          ▶
        </button>

        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={niveauWO}
          onChange={(e) => setNiveauWO(e.target.value as any)}
          aria-label="Filter niveau"
          title="Filter op niveau"
        >
          <option value="ALLE">Alle niveaus</option>
          <option value="HAVO">HAVO</option>
          <option value="VWO">VWO</option>
        </select>

        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={leerjaarWO}
          onChange={(e) => setLeerjaarWO(e.target.value)}
          aria-label="Filter leerjaar"
          title="Filter op leerjaar"
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
      )}
    </div>
  );
}
