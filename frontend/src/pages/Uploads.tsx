import React from "react";
import { Info, FileText, Trash2, XCircle } from "lucide-react";
import type { DocRecord } from "../app/store";
import { useAppStore, hydrateDocRowsFromApi } from "../app/store";
import type { DocRow } from "../lib/api";
import { apiUploadDoc, apiDeleteDoc } from "../lib/api";
import { parseIsoDate } from "../lib/calendar";
import { useDocumentPreview } from "../components/DocumentPreviewProvider";

type Filters = {
  vak: string;
  niveau: string;
  leerjaar: string;
  periode: string;
};

type WeekSegment = { start: number; end: number };

function isValidWeek(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 53;
}

function expandWeeksFromMeta(doc: DocRecord): number[] {
  const start = isValidWeek(doc.beginWeek) ? doc.beginWeek : undefined;
  const end = isValidWeek(doc.eindWeek) ? doc.eindWeek : undefined;
  if (start === undefined || end === undefined) {
    return [];
  }
  const weeks: number[] = [];
  if (start <= end) {
    for (let wk = start; wk <= end; wk++) {
      weeks.push(wk);
    }
    return weeks;
  }
  for (let wk = start; wk <= 53; wk++) {
    weeks.push(wk);
  }
  for (let wk = 1; wk <= end; wk++) {
    weeks.push(wk);
  }
  return weeks;
}

function groupWeeks(sortedWeeks: number[]): WeekSegment[] {
  if (!sortedWeeks.length) {
    return [];
  }
  const segments: WeekSegment[] = [];
  let start = sortedWeeks[0];
  let prev = sortedWeeks[0];
  for (let i = 1; i < sortedWeeks.length; i++) {
    const current = sortedWeeks[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    segments.push({ start, end: prev });
    start = current;
    prev = current;
  }
  segments.push({ start, end: prev });
  return segments;
}

function formatSegments(segments: WeekSegment[]): string {
  if (!segments.length) {
    return "";
  }
  return segments
    .map((segment) =>
      segment.start === segment.end ? `${segment.start}` : `${segment.start}–${segment.end}`
    )
    .join(" · ");
}

function computeDocWeekInfo(doc: DocRecord, rows?: DocRow[]) {
  const weekSet = new Set<number>();
  rows?.forEach((row) => {
    if (isValidWeek(row.week)) {
      weekSet.add(row.week);
    }
  });

  if (!weekSet.size) {
    expandWeeksFromMeta(doc).forEach((wk) => weekSet.add(wk));
  } else {
    [doc.beginWeek, doc.eindWeek].forEach((wk) => {
      if (isValidWeek(wk)) {
        weekSet.add(wk);
      }
    });
  }

  const sortedWeeks = Array.from(weekSet)
    .filter(isValidWeek)
    .sort((a, b) => a - b);

  const segments = groupWeeks(sortedWeeks);

  let orderedSegments = segments;
  const begin = isValidWeek(doc.beginWeek) ? doc.beginWeek : undefined;
  if (begin !== undefined && segments.length > 1) {
    const hasLowerThanBegin = sortedWeeks.some((wk) => wk < begin);
    if (hasLowerThanBegin) {
      const beginIdx = segments.findIndex((segment) => begin >= segment.start && begin <= segment.end);
      if (beginIdx > 0) {
        orderedSegments = [...segments.slice(beginIdx), ...segments.slice(0, beginIdx)];
      }
    }
  }

  const label = formatSegments(orderedSegments);

  return {
    weeks: sortedWeeks,
    label,
  };
}

function formatWeekSet(weeks: Iterable<number>): string {
  const unique = Array.from(new Set(Array.from(weeks).filter(isValidWeek))).sort((a, b) => a - b);
  return unique.length ? formatSegments(groupWeeks(unique)) : "—";
}

function useMetadata(docs: DocRecord[], docRows: Record<string, DocRow[]>) {
  const vakken = Array.from(new Set(docs.map((d) => d.vak))).sort();
  const niveaus = Array.from(new Set(docs.map((d) => d.niveau))).sort() as string[];
  const leerjaren = Array.from(new Set(docs.map((d) => d.leerjaar))).sort();
  const periodes = Array.from(new Set(docs.map((d) => d.periode))).sort((a, b) => a - b);
  const overallWeeks = new Set<number>();
  docs.forEach((doc) => {
    const info = computeDocWeekInfo(doc, docRows[doc.fileId]);
    info.weeks.forEach((wk) => overallWeeks.add(wk));
  });
  const weekBereik = formatWeekSet(overallWeeks);
  return { vakken, niveaus, leerjaren, periodes, weekBereik };
}

export default function Uploads() {
  // Globale docs + acties uit de store
  const { docs, addDoc, removeDoc, setDocEnabled, docRows } = useAppStore();
  const { openPreview } = useDocumentPreview();

  // Lokale UI state
  const [filters, setFilters] = React.useState<Filters>({
    vak: "",
    niveau: "",
    leerjaar: "",
    periode: "",
  });
  const [detailDoc, setDetailDoc] = React.useState<DocRecord | null>(null);
  const [isUploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const meta = useMetadata(docs, docRows);

  const reset = () =>
    setFilters({
      vak: "",
      niveau: "",
      leerjaar: "",
      periode: "",
    });

  const filtered = docs.filter((d) => {
    const byVak =
      !filters.vak || d.vak.toLowerCase().includes(filters.vak.trim().toLowerCase());
    const byNiv = !filters.niveau || d.niveau === (filters.niveau as any);
    const byLeer = !filters.leerjaar || d.leerjaar === filters.leerjaar;
    const byPer = !filters.periode || String(d.periode) === filters.periode;
    return byVak && byNiv && byLeer && byPer;
  });

  const gridTemplate =
    "grid-cols-[90px_minmax(260px,3fr)_minmax(220px,2.2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)_repeat(2,minmax(90px,0.9fr))]";

  async function handleUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = ev.target.files;
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const meta = await apiUploadDoc(file);
        // Voeg direct toe aan globale store → Settings/Belangrijke events/Matrix overzicht volgen automatisch
        addDoc(meta as any);
        await hydrateDocRowsFromApi(meta.fileId);
      } catch (e: any) {
        errors.push(`${file.name}: ${e?.message || "Upload mislukt"}`);
      }
    }
    if (errors.length) {
      setError(errors.join(" | "));
    }
    setUploading(false);
    ev.target.value = "";
  }

  async function handleDelete(doc: DocRecord) {
    const confirmed = window.confirm(
      `Weet je zeker dat je "${doc.bestand}" wilt verwijderen?`
    );
    if (!confirmed) return;
    try {
      await apiDeleteDoc(doc.fileId);
      removeDoc(doc.fileId); // verwijder uit globale store
    } catch (e: any) {
      console.warn(e);
      setError(e?.message || "Verwijderen mislukt");
    }
  }

  const toggleGebruik = (doc: DocRecord) => {
    setDocEnabled(doc.fileId, !doc.enabled);
  };

  React.useEffect(() => {
    if (!detailDoc) return;
    const hasRows = docRows[detailDoc.fileId]?.length;
    if (!hasRows) {
      hydrateDocRowsFromApi(detailDoc.fileId);
    }
  }, [detailDoc, docRows]);

  const detailRows: DocRow[] = React.useMemo(() => {
    if (!detailDoc) return [];
    return docRows[detailDoc.fileId] ?? [];
  }, [detailDoc, docRows]);

  const detailWeekInfo = React.useMemo(() => {
    if (!detailDoc) {
      return null;
    }
    return computeDocWeekInfo(detailDoc, detailRows);
  }, [detailDoc, detailRows]);

  const detailWeekFallback = React.useMemo(() => {
    if (!detailDoc) {
      return "—";
    }
    const begin = isValidWeek(detailDoc.beginWeek) ? `${detailDoc.beginWeek}` : "—";
    const end = isValidWeek(detailDoc.eindWeek) ? `${detailDoc.eindWeek}` : "—";
    return begin === "—" && end === "—" ? "—" : `wk ${begin}–${end}`;
  }, [detailDoc]);

  const aggregate = React.useMemo(() => {
    if (!detailDoc || !detailRows.length) {
      return null;
    }
    const weekSet = new Set<number>();
    const dateList: string[] = [];
    const deadlines = new Set<string>();
    const opdrachten = new Set<string>();
    const huiswerk = new Set<string>();
    const bronnen = new Map<string, { label: string; url: string }>();
    const toetsen: { key: string; label: string; week?: number | null; datum?: string | null }[] = [];

    detailRows.forEach((row, idx) => {
      if (isValidWeek(row.week)) {
        weekSet.add(row.week);
      }
      if (row.datum) {
        dateList.push(row.datum);
      }
      if (row.inleverdatum) {
        deadlines.add(row.inleverdatum);
      }
      if (row.opdracht) {
        opdrachten.add(row.opdracht);
      }
      if (row.huiswerk) {
        huiswerk.add(row.huiswerk);
      }
      if (row.bronnen) {
        row.bronnen.forEach((br) => {
          if (!br?.url) return;
          if (!bronnen.has(br.url)) {
            const label = br.title && br.title.trim() ? br.title.trim() : br.url;
            bronnen.set(br.url, { label, url: br.url });
          }
        });
      }
      if (row.toets && (row.toets.type || row.toets.weging || row.toets.herkansing)) {
        const parts: string[] = [];
        if (row.toets.type) {
          parts.push(row.toets.type);
        }
        if (row.toets.weging) {
          parts.push(`weging ${row.toets.weging}`);
        }
        if (row.toets.herkansing && row.toets.herkansing !== "onbekend") {
          parts.push(`herkansing ${row.toets.herkansing}`);
        }
        const label = parts.length ? parts.join(" • ") : "Toetsmoment";
        toetsen.push({
          key: `${row.week ?? ""}-${row.datum ?? ""}-${idx}`,
          label,
          week: row.week,
          datum: row.datum,
        });
      }
    });

    dateList.sort();
    const weeks = Array.from(weekSet).sort((a, b) => a - b);
    const fallbackLabel = formatWeekSet(weekSet);
    const normalizedWeekLabel = detailWeekInfo?.label || (fallbackLabel === "—" ? "" : fallbackLabel);

    return {
      rowCount: detailRows.length,
      weeks,
      firstWeek: weeks[0],
      lastWeek: weeks[weeks.length - 1],
      firstDate: dateList[0],
      lastDate: dateList[dateList.length - 1],
      deadlines: Array.from(deadlines).sort(),
      opdrachten: Array.from(opdrachten),
      huiswerk: Array.from(huiswerk),
      bronnen: Array.from(bronnen.values()),
      toetsen,
      weekLabel: normalizedWeekLabel,
    };
  }, [detailDoc, detailRows, detailWeekInfo]);

  const formatDate = React.useCallback((value?: string | null) => {
    if (!value) return "—";
    const parsed = parseIsoDate(value);
    if (!parsed) return value;
    return new Intl.DateTimeFormat("nl-NL").format(parsed);
  }, []);

  const previewRows = detailRows.slice(0, 8);
  const hasMoreRows = detailRows.length > previewRows.length;

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold theme-text">Uploads &amp; Documentbeheer</div>

      {/* Uploadblok */}
      <div className="rounded-2xl border theme-border theme-surface p-4">
        <div className="mb-1 font-medium theme-text">Bestanden uploaden</div>
        <div className="text-sm theme-muted mb-2">
          Kies een <strong>PDF</strong> of <strong>DOCX</strong>. Metadata wordt automatisch herkend.
        </div>
        <input type="file" accept=".pdf,.docx" multiple onChange={handleUpload} />
        {isUploading && <div className="mt-2 text-sm theme-muted">Bezig met uploaden…</div>}
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      </div>

      {/* Metadata-overzicht */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border theme-border theme-surface p-3">
          <div className="text-xs theme-muted mb-1">Beschikbare vakken</div>
          <div className="flex flex-wrap gap-1">
            {meta.vakken.map((v) => (
              <span key={v} className="text-xs rounded-full border theme-border theme-surface px-2 py-0.5">
                {v}
              </span>
            ))}
            {meta.vakken.length === 0 && <span className="text-xs theme-muted opacity-70">—</span>}
          </div>
        </div>
        <div className="rounded-2xl border theme-border theme-surface p-3">
          <div className="text-xs theme-muted mb-1">Niveaus</div>
          <div className="flex flex-wrap gap-1">
            {meta.niveaus.map((n) => (
              <span key={n} className="text-xs rounded-full border theme-border theme-surface px-2 py-0.5">
                {n}
              </span>
            ))}
            {meta.niveaus.length === 0 && <span className="text-xs theme-muted opacity-70">—</span>}
          </div>
        </div>
        <div className="rounded-2xl border theme-border theme-surface p-3">
          <div className="text-xs theme-muted mb-1">Leerjaren</div>
          <div className="flex flex-wrap gap-1">
            {meta.leerjaren.map((j) => (
              <span key={j} className="text-xs rounded-full border theme-border theme-surface px-2 py-0.5">
                {j}
              </span>
            ))}
            {meta.leerjaren.length === 0 && <span className="text-xs theme-muted opacity-70">—</span>}
          </div>
        </div>
        <div className="rounded-2xl border theme-border theme-surface p-3">
          <div className="text-xs theme-muted mb-1">Periodes &amp; Weken</div>
          <div className="flex flex-wrap items-center gap-1">
            {meta.periodes.map((p) => (
              <span key={p} className="text-xs rounded-full border theme-border theme-surface px-2 py-0.5">
                P{p}
              </span>
            ))}
            <span className="text-xs theme-muted ml-2">
              {meta.weekBereik === "—" ? "wk —" : `wk ${meta.weekBereik}`}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center text-sm">
        <input
          placeholder="Zoek vak…"
          value={filters.vak}
          onChange={(e) => setFilters((f) => ({ ...f, vak: e.target.value }))}
          className="rounded-md border theme-border theme-surface px-2 py-1"
        />
        <select
          className="rounded-md border theme-border theme-surface px-2 py-1"
          value={filters.niveau}
          onChange={(e) => setFilters((f) => ({ ...f, niveau: e.target.value }))}
        >
          <option value="">Alle niveaus</option>
          {meta.niveaus.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border theme-border theme-surface px-2 py-1"
          value={filters.leerjaar}
          onChange={(e) => setFilters((f) => ({ ...f, leerjaar: e.target.value }))}
        >
          <option value="">Alle leerjaren</option>
          {meta.leerjaren.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border theme-border theme-surface px-2 py-1"
          value={filters.periode}
          onChange={(e) => setFilters((f) => ({ ...f, periode: e.target.value }))}
        >
          <option value="">Alle periodes</option>
          {meta.periodes.map((p) => (
            <option key={p} value={String(p)}>
              P{p}
            </option>
          ))}
        </select>
        {(filters.vak || filters.niveau || filters.leerjaar || filters.periode) && (
          <button
            onClick={reset}
            className="ml-2 inline-flex items-center gap-1 rounded-md border theme-border theme-surface px-2 py-1"
            title="Reset filters"
          >
            <XCircle size={14} /> Reset
          </button>
        )}
      </div>

      {/* Tabel */}
      <div className="rounded-2xl border theme-border theme-surface">
        <div
          className={`grid ${gridTemplate} gap-2 text-xs font-medium theme-muted border-b theme-border pb-2 px-4 pt-3`}
        >
          <div className="flex justify-center">Gebruik</div>
          <div>Bestand</div>
          <div>Vak</div>
          <div>Niveau</div>
          <div>Leerjaar</div>
          <div>Periode</div>
          <div>Weekbereik</div>
          <div className="col-span-2">Acties</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6 text-sm theme-muted">Geen documenten gevonden.</div>
        ) : (
          filtered.map((d, i) => {
            const info = computeDocWeekInfo(d, docRows[d.fileId]);
            const beginLabel = isValidWeek(d.beginWeek) ? `${d.beginWeek}` : "—";
            const endLabel = isValidWeek(d.eindWeek) ? `${d.eindWeek}` : "—";
            const fallbackWeekLabel =
              beginLabel === "—" && endLabel === "—" ? "—" : `wk ${beginLabel}–${endLabel}`;
            return (
              <div
                key={d.fileId}
                className={`grid ${gridTemplate} gap-2 text-sm items-center px-4 py-3 ${
                  i > 0 ? "border-t theme-border" : ""
                }`}
              >
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={d.enabled}
                    onChange={() => toggleGebruik(d)}
                    aria-label={
                      d.enabled
                        ? `Gebruik uitschakelen voor ${d.bestand}`
                        : `Gebruik inschakelen voor ${d.bestand}`
                    }
                    title={
                      d.enabled
                        ? `Gebruik uitschakelen voor ${d.bestand}`
                        : `Gebruik inschakelen voor ${d.bestand}`
                    }
                  />
                </div>
                <div className="break-words" title={d.bestand}>
                  {d.bestand}
                </div>
                <div>{d.vak}</div>
                <div>{d.niveau}</div>
                <div>{d.leerjaar}</div>
                <div>P{d.periode}</div>
                <div>{info.label ? `wk ${info.label}` : fallbackWeekLabel}</div>
                <div className="flex gap-2 col-span-2">
                  <button
                    title={`Bron: ${d.bestand}`}
                    className="rounded-lg border theme-border theme-surface p-1"
                    onClick={() => openPreview({ fileId: d.fileId, filename: d.bestand })}
                  >
                    <FileText size={16} />
                  </button>
                  <button
                    onClick={() => setDetailDoc(d)}
                    title="Meta-details"
                    className="rounded-lg border theme-border theme-surface p-1"
                  >
                    <Info size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(d)}
                    title="Verwijder"
                    className="rounded-lg border theme-border theme-surface p-1 text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail modal */}
      {detailDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border theme-border theme-surface shadow-lg">
            <div className="flex items-center justify-between border-b theme-border px-6 py-4">
              <h2 className="text-lg font-semibold truncate" title={detailDoc.bestand}>
                Metadata — {detailDoc.bestand}
              </h2>
              <button onClick={() => setDetailDoc(null)} className="rounded-md border theme-border theme-surface px-2 py-1 text-sm" aria-label="Sluiten">
                ✕
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto px-6 py-5 text-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Vak</div>
                  <div className="font-medium theme-text">{detailDoc.vak}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Niveau</div>
                  <div>{detailDoc.niveau}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Leerjaar</div>
                  <div>{detailDoc.leerjaar}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Periode</div>
                  <div>P{detailDoc.periode}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Weekbereik</div>
                  <div>
                    {detailWeekInfo?.label ? `wk ${detailWeekInfo.label}` : detailWeekFallback}
                  </div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Schooljaar</div>
                  <div>{detailDoc.schooljaar || "—"}</div>
                </div>
              </div>

              {aggregate ? (
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="font-medium theme-text">Geëxtraheerde gegevens</div>
                    <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-lg border theme-border theme-soft p-3">
                        <div className="theme-muted mb-1 uppercase tracking-wide">Aantal regels</div>
                        <div className="text-base font-semibold">{aggregate.rowCount}</div>
                      </div>
                      <div className="rounded-lg border theme-border theme-soft p-3">
                        <div className="theme-muted mb-1 uppercase tracking-wide">Unieke weken</div>
                        <div>{aggregate.weekLabel ? `wk ${aggregate.weekLabel}` : "—"}</div>
                      </div>
                      <div className="rounded-lg border theme-border theme-soft p-3">
                        <div className="theme-muted mb-1 uppercase tracking-wide">Datumbereik</div>
                        <div>
                          {aggregate.firstDate ? formatDate(aggregate.firstDate) : "—"} –
                          {" "}
                          {aggregate.lastDate ? formatDate(aggregate.lastDate) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {aggregate.deadlines.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Deadlines &amp; inleverdata</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                        {aggregate.deadlines.map((deadline) => (
                          <li key={deadline}>{formatDate(deadline)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aggregate.toetsen.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Toetsmomenten</div>
                      <ul className="mt-2 space-y-1 text-xs">
                        {aggregate.toetsen.map((item) => (
                          <li key={item.key} className="rounded-lg border theme-border theme-soft px-3 py-2">
                            <div className="font-semibold">
                              {item.week ? `Week ${item.week}` : "Week onbekend"}
                              {item.datum ? ` · ${formatDate(item.datum)}` : ""}
                            </div>
                            <div>{item.label}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aggregate.opdrachten.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Opdrachten</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                        {aggregate.opdrachten.slice(0, 6).map((item) => (
                          <li key={item} className="whitespace-pre-wrap">{item}</li>
                        ))}
                        {aggregate.opdrachten.length > 6 && (
                          <li className="theme-muted">… en {aggregate.opdrachten.length - 6} meer</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {aggregate.huiswerk.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Huiswerk</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                        {aggregate.huiswerk.slice(0, 6).map((item) => (
                          <li key={item} className="whitespace-pre-wrap">{item}</li>
                        ))}
                        {aggregate.huiswerk.length > 6 && (
                          <li className="theme-muted">… en {aggregate.huiswerk.length - 6} meer</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {aggregate.bronnen.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Bronnen &amp; links</div>
                      <ul className="mt-2 space-y-1 text-xs">
                        {aggregate.bronnen.map((br) => (
                          <li key={br.url}>
                            <a
                              href={br.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {br.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <div className="font-medium theme-text">Voorbeeld van geëxtraheerde rijen</div>
                    <div className="mt-2 overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-left theme-muted">
                            <th className="px-3 py-2">Week</th>
                            <th className="px-3 py-2">Datum</th>
                            <th className="px-3 py-2">Onderwerp</th>
                            <th className="px-3 py-2">Huiswerk</th>
                            <th className="px-3 py-2">Opdracht</th>
                            <th className="px-3 py-2">Inleverdatum</th>
                            <th className="px-3 py-2">Toets</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, idx) => (
                            <tr key={`${row.week ?? ""}-${row.datum ?? ""}-${idx}`} className="border-t theme-border align-top">
                              <td className="px-3 py-2 font-semibold">{row.week ?? "—"}</td>
                              <td className="px-3 py-2">{row.datum ? formatDate(row.datum) : "—"}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap">{row.onderwerp || "—"}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap">{row.huiswerk || "—"}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap">{row.opdracht || "—"}</td>
                              <td className="px-3 py-2">{row.inleverdatum ? formatDate(row.inleverdatum) : "—"}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap">
                                {row.toets && (row.toets.type || row.toets.weging || row.toets.herkansing)
                                  ? [row.toets.type, row.toets.weging ? `weging ${row.toets.weging}` : null, row.toets.herkansing && row.toets.herkansing !== "onbekend"
                                      ? `herkansing ${row.toets.herkansing}`
                                      : null]
                                      .filter(Boolean)
                                      .join(" • ")
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                          {previewRows.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-3 py-4 text-center theme-muted">
                                Geen regels beschikbaar.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {hasMoreRows && (
                      <div className="mt-2 text-xs theme-muted">
                        Er zijn in totaal {detailRows.length} rijen beschikbaar. Bekijk het bestand voor de volledige inhoud.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-5 text-sm theme-muted">Geen gedetailleerde gegevens gevonden voor dit document.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
