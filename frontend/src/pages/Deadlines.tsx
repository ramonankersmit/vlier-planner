import React from "react";
import { CalendarClock, FileText } from "lucide-react";
import { useAppStore, type DocRecord, type WeekInfo } from "../app/store";
import {
  formatHumanDate,
  calcCurrentWeekIdx,
  formatWeekWindowLabel,
  formatWeekDateRange,
} from "../lib/weekUtils";
import { useDocumentPreview } from "../components/DocumentPreviewProvider";
import { deriveIsoYearForWeek } from "../lib/calendar";

type Item = {
  id: string;
  week: number;
  isoYear: number;
  weekRange?: string;
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
  const weekData = useAppStore((s) => s.weekData);
  const { openPreview } = useDocumentPreview();

  const [vak, setVak] = React.useState<string>("ALLE");
  const [fromIdx, setFromIdx] = React.useState(0);
  const [dur, setDur] = React.useState(3);

  const activeDocs = React.useMemo(() => docs.filter((d) => d.enabled), [docs]);
  const docsByVak = React.useMemo(() => {
    const map = new Map<string, DocRecord[]>();
    for (const doc of activeDocs) {
      const list = map.get(doc.vak);
      if (list) {
        list.push(doc);
      } else {
        map.set(doc.vak, [doc]);
      }
    }
    return map;
  }, [activeDocs]);
  const hasActiveDocs = activeDocs.length > 0;
  const allWeeks = weekData.weeks ?? [];
  const hasWeekData = allWeeks.length > 0;
  const disableWeekControls = !hasActiveDocs || !hasWeekData;
  const hasUploads = hasActiveDocs && hasWeekData;

  const maxStartIdx = Math.max(0, allWeeks.length - 1);
  const clampedFrom = Math.min(fromIdx, maxStartIdx);
  const weeks = allWeeks.slice(clampedFrom, clampedFrom + dur);
  const windowLabel = formatWeekWindowLabel(weeks);

  const prev = () => {
    if (disableWeekControls) return;
    setFromIdx((i) => Math.max(0, i - 1));
  };
  const next = () => {
    if (disableWeekControls) return;
    setFromIdx((i) => Math.min(maxStartIdx, i + 1));
  };
  const goThisWeek = React.useCallback(() => {
    if (disableWeekControls) return;
    const idx = calcCurrentWeekIdx(allWeeks);
    setFromIdx(idx);
  }, [allWeeks, disableWeekControls]);

  // >>> Eerste load: centreer venster rond huidige week
  React.useEffect(() => {
    if (disableWeekControls) {
      setFromIdx(0);
    } else {
      goThisWeek();
    }
  }, [disableWeekControls, goThisWeek]);

  const findDocForWeek = React.useCallback(
    (vakNaam: string, info: WeekInfo) => {
      if (!info) return undefined;
      const docsForVak = docsByVak.get(vakNaam);
      if (!docsForVak?.length) return undefined;
      const matched = docsForVak.find((doc) => {
        const minWeek = Math.min(doc.beginWeek, doc.eindWeek);
        const maxWeek = Math.max(doc.beginWeek, doc.eindWeek);
        if (info.nr < minWeek || info.nr > maxWeek) return false;
        const isoYear = deriveIsoYearForWeek(info.nr, { schooljaar: doc.schooljaar });
        return isoYear === info.isoYear;
      });
      return matched ?? docsForVak[0];
    },
    [docsByVak]
  );

  const items: Item[] = !hasUploads
    ? []
    : weeks.flatMap((w) => {
        const perVak = weekData.byWeek?.[w.id] || {};
        return Object.entries(perVak).flatMap(([vakNaam, d]: any) => {
          if (mijnVakken.length && !mijnVakken.includes(vakNaam)) return [];
          if (vak !== "ALLE" && vakNaam !== vak) return [];
          if (!d?.deadlines || d.deadlines === "—") return [];
          const type: Item["type"] =
            String(d.deadlines).toLowerCase().includes("toets") ? "Toets" : "Deadline";
          const doc = findDocForWeek(vakNaam, w);
          const weekRange = formatWeekDateRange(w) ?? undefined;
          return [
            {
              id: `${vakNaam}-${w.id}`,
              week: w.nr,
              isoYear: w.isoYear,
              weekRange,
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
      <div className="text-lg font-semibold mb-3 theme-text">Deadlines</div>

      <div className="mb-2 text-sm theme-muted">{windowLabel}</div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
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
          className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
          value={vak}
          onChange={(e) => setVak(e.target.value)}
          aria-label="Filter vak"
          title="Filter op vak"
          disabled={!hasUploads}
        >
          <option value="ALLE">Alle vakken</option>
          {mijnVakken.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-auto rounded-2xl border theme-border theme-surface">
        {!hasUploads ? (
          <div className="p-6 text-sm theme-muted">
            {hasActiveDocs
              ? "Nog geen weekgegevens beschikbaar. Controleer of de documenten studiewijzerdata bevatten."
              : (
                  <>
                    Nog geen uploads. Voeg eerst één of meer studiewijzers toe via <strong>Uploads</strong>.
                  </>
                )}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm theme-muted">Geen deadlines in deze periode.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="theme-soft">
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
                  <tr key={it.id} className={idx > 0 ? "border-t theme-border" : ""}>
                    <td className="px-4 py-2 align-top">
                      wk {it.week}
                      <span className="text-xs theme-muted"> ({it.isoYear})</span>
                      {it.weekRange && (
                        <div className="text-xs theme-muted">{it.weekRange}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <span className="rounded-full border theme-border theme-surface px-2 py-0.5">{it.type}</span>
                    </td>
                    <td className="px-4 py-2 align-top whitespace-nowrap">{it.vak}</td>
                    <td className="px-4 py-2 align-top">{it.title}</td>
                    <td className="px-4 py-2 align-top whitespace-nowrap" title={it.date || ""}>{dateLabel}</td>
                    <td className="px-4 py-2 align-top">
                      <button
                        className="rounded-lg border theme-border theme-surface p-1 disabled:opacity-40"
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
