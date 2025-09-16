import React from "react";
import { Info, FileText, CheckSquare, CalendarClock } from "lucide-react";
import { useAppStore, type DocRecord } from "../app/store";
import { formatRange, calcCurrentWeekIdx } from "../lib/weekUtils";
import { useDocumentPreview } from "../components/DocumentPreviewProvider";

function Card({
  vak,
  weekNr,
  d,
  isDone,
  onToggle,
  onOpenDoc,
  docName,
}: {
  vak: string;
  weekNr: number;
  d: any;
  isDone: boolean;
  onToggle: () => void;
  onOpenDoc?: () => void;
  docName?: string;
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
          <button
            title={docName ? `Bron: ${docName}` : "Geen bron beschikbaar"}
            aria-label={docName ? `Bron: ${docName}` : `Geen bron beschikbaar voor ${vak}`}
            onClick={onOpenDoc}
            disabled={!onOpenDoc}
            className="disabled:opacity-40"
          >
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
    weekData,
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
  const dataForActiveWeek = weekNumber ? byWeek[weekNumber] || {} : {};
  const goThisWeek = React.useCallback(() => {
    if (!weeks.length) return;
    setWeekIdxWO(calcCurrentWeekIdx(weeks));
  }, [weeks, setWeekIdxWO]);

  return (
    <div>
      <div className="mb-2 text-sm text-gray-600">
        Week {week?.nr ?? "—"} · {week ? formatRange(week) : "Geen data"}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <button
          onClick={goThisWeek}
          className="rounded-md border px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Spring naar deze week"
          aria-label="Deze week"
          disabled={disableWeekControls}
        >
          <CalendarClock size={16} />
        </button>
        <button
          onClick={() => setWeekIdxWO(Math.max(0, weekIdxWO - 1))}
          className="rounded-md border px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Vorige week"
          disabled={disableWeekControls}
        >
          ◀
        </button>
        <span className="text-sm text-gray-800">Week {week?.nr ?? "—"}</span>
        <button
          onClick={() => setWeekIdxWO(Math.min(Math.max(weeks.length - 1, 0), weekIdxWO + 1))}
          className="rounded-md border px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title="Volgende week"
          disabled={disableWeekControls}
        >
          ▶
        </button>

        <select
          className="rounded-md border px-2 py-1 text-sm"
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
          className="rounded-md border px-2 py-1 text-sm"
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
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          Nog geen uploads. Voeg eerst één of meer studiewijzers toe via <strong>Uploads</strong>.
        </div>
      ) : !hasWeekData ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          Nog geen weekgegevens beschikbaar. Controleer of de documenten studiewijzerdata bevatten.
        </div>
      ) : !hasDocsForFilters ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          Geen vakken voor deze filters. Pas de selectie aan of controleer de metadata van de documenten.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleVakken.map((vak) => {
            const d = dataForActiveWeek[vak];
            const key = `${weekNumber}:${vak}`;
            const isDone = !!doneMap[key];
            const docsForVak = docsByVak.get(vak) ?? [];
            const doc =
              docsForVak.find(
                (dd) =>
                  weekNumber >= Math.min(dd.beginWeek, dd.eindWeek) &&
                  weekNumber <= Math.max(dd.beginWeek, dd.eindWeek)
              ) ?? docsForVak[0];
            return (
              <Card
                key={vak}
                vak={vak}
                weekNr={weekNumber}
                d={d}
                isDone={isDone}
                onToggle={() => toggleDone(key)}
                onOpenDoc={
                  doc ? () => openPreview({ fileId: doc.fileId, filename: doc.bestand }) : undefined
                }
                docName={doc?.bestand}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
