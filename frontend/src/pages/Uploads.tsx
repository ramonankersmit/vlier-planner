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

function useMetadata(docs: DocRecord[]) {
  const vakken = Array.from(new Set(docs.map((d) => d.vak))).sort();
  const niveaus = Array.from(new Set(docs.map((d) => d.niveau))).sort() as string[];
  const leerjaren = Array.from(new Set(docs.map((d) => d.leerjaar))).sort();
  const periodes = Array.from(new Set(docs.map((d) => d.periode))).sort((a, b) => a - b);
  const beginWeeks = docs.map((d) => d.beginWeek);
  const eindWeeks = docs.map((d) => d.eindWeek);
  const weekBereik =
    beginWeeks.length && eindWeeks.length
      ? `${Math.min(...beginWeeks)}–${Math.max(...eindWeeks)}`
      : "—";
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
  const [page, setPage] = React.useState(1);
  const pageSize = 10;

  const meta = useMetadata(docs);

  const reset = () =>
    setFilters({
      vak: "",
      niveau: "",
      leerjaar: "",
      periode: "",
    });

  const filtered = React.useMemo(() => {
    const matches = docs.filter((d) => {
      const byVak =
        !filters.vak || d.vak.toLowerCase().includes(filters.vak.trim().toLowerCase());
      const byNiv = !filters.niveau || d.niveau === (filters.niveau as any);
      const byLeer = !filters.leerjaar || d.leerjaar === filters.leerjaar;
      const byPer = !filters.periode || String(d.periode) === filters.periode;
      return byVak && byNiv && byLeer && byPer;
    });
    const getTime = (doc: DocRecord) => {
      if (!doc.uploadedAt) return 0;
      const direct = Date.parse(doc.uploadedAt);
      if (!Number.isNaN(direct)) {
        return direct;
      }
      const normalized = doc.uploadedAt.trim().replace(/Z$/, "+00:00");
      const fallback = Date.parse(normalized);
      return Number.isNaN(fallback) ? 0 : fallback;
    };
    return matches.sort((a, b) => getTime(b) - getTime(a));
  }, [docs, filters]);

  React.useEffect(() => {
    setPage(1);
  }, [filters.vak, filters.niveau, filters.leerjaar, filters.periode]);

  React.useEffect(() => {
    setPage(1);
  }, [docs.length]);

  const totalPages = filtered.length ? Math.ceil(filtered.length / pageSize) : 1;
  const clampedPage = Math.min(page, totalPages);

  React.useEffect(() => {
    if (clampedPage !== page) {
      setPage(clampedPage);
    }
  }, [clampedPage, page]);

  const startIdx = (clampedPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const visibleDocs = filtered.slice(startIdx, endIdx);

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

  const aggregate = React.useMemo(() => {
    if (!detailRows.length) {
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
      if (typeof row.week === "number" && row.week > 0) {
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
    };
  }, [detailRows]);

  const dateFormatter = React.useMemo(() => new Intl.DateTimeFormat("nl-NL"), []);
  const timeFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  const formatDateTime = React.useCallback(
    (value?: string | null): { date: string; time: string } => {
      if (!value) return { date: "—", time: "" };
      const parsed = parseIsoDate(value) ?? new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return { date: value, time: "" };
      }
      return {
        date: dateFormatter.format(parsed),
        time: timeFormatter.format(parsed),
      };
    },
    [dateFormatter, timeFormatter]
  );

  const formatDate = React.useCallback(
    (value?: string | null) => formatDateTime(value).date,
    [formatDateTime]
  );

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
            <span className="text-xs theme-muted ml-2">wk {meta.weekBereik}</span>
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
      <div className="rounded-2xl border theme-border theme-surface overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-sm theme-muted">Geen documenten gevonden.</div>
        ) : (
          <>
            <table className="table-auto min-w-max text-sm">
              <thead className="text-xs font-medium theme-muted border-b theme-border">
                <tr>
                  <th className="px-4 py-3 text-center font-medium">Gebruik</th>
                  <th className="px-4 py-3 text-left font-medium">Bestand</th>
                  <th className="px-4 py-3 text-left font-medium">Datum / Tijd</th>
                  <th className="px-4 py-3 text-left font-medium">Vak</th>
                  <th className="px-4 py-3 text-left font-medium">Niveau</th>
                  <th className="px-4 py-3 text-left font-medium">Jaar</th>
                  <th className="px-4 py-3 text-left font-medium">Per.</th>
                  <th className="px-4 py-3 text-left font-medium">Wk begin</th>
                  <th className="px-4 py-3 text-left font-medium">Wk eind</th>
                  <th className="px-4 py-3 text-left font-medium">Acties</th>
                </tr>
              </thead>
              <tbody>
                {visibleDocs.map((d, i) => {
                  const { date, time } = formatDateTime(d.uploadedAt ?? null);
                  return (
                    <tr key={d.fileId} className={i > 0 ? "border-t theme-border" : ""}>
                      <td className="px-4 py-3 text-center align-middle">
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
                      </td>
                      <td className="px-4 py-3 align-top break-words" title={d.bestand}>
                        {d.bestand}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="leading-tight">
                          <div>{date}</div>
                          {time && <div className="text-xs theme-muted">{time}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">{d.vak}</td>
                      <td className="px-4 py-3 align-top">{d.niveau}</td>
                      <td className="px-4 py-3 align-top">{d.leerjaar}</td>
                      <td className="px-4 py-3 align-top">P{d.periode}</td>
                      <td className="px-4 py-3 align-top">{d.beginWeek}</td>
                      <td className="px-4 py-3 align-top">{d.eindWeek}</td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2 justify-end">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t theme-border px-4 py-3 text-xs theme-muted">
              <div>
                Toont {startIdx + 1}–{endIdx} van {filtered.length} bestanden
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, clampedPage - 1))}
                  disabled={clampedPage === 1}
                  className="rounded-md border theme-border theme-surface px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Vorige
                </button>
                <span>
                  Pagina {clampedPage} van {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, clampedPage + 1))}
                  disabled={clampedPage === totalPages}
                  className="rounded-md border theme-border theme-surface px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Volgende
                </button>
              </div>
            </div>
          </>
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
                  <div className="text-xs theme-muted uppercase tracking-wide">Jaar</div>
                  <div>{detailDoc.leerjaar}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Per.</div>
                  <div>P{detailDoc.periode}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Weekbereik</div>
                  <div>
                    {detailDoc.beginWeek ? detailDoc.beginWeek : "—"} – {detailDoc.eindWeek ? detailDoc.eindWeek : "—"}
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
                        <div>{aggregate.weeks.length ? aggregate.weeks.join(", ") : "—"}</div>
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
