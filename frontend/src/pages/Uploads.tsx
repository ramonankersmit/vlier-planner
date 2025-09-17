import React from "react";
import { Info, FileText, Trash2, XCircle } from "lucide-react";
import type { DocRecord } from "../app/store";
import { useAppStore, hydrateDocRowsFromApi } from "../app/store";
import { apiUploadDoc, apiDeleteDoc, apiGetParse, type NormalizedWarning } from "../lib/api";
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
  const { docs, addDoc, removeDoc, setDocEnabled } = useAppStore();
  const docRowsMap = useAppStore((s) => s.docRows) ?? {};
  const { openPreview } = useDocumentPreview();

  // Lokale UI state
  const [filters, setFilters] = React.useState<Filters>({
    vak: "",
    niveau: "",
    leerjaar: "",
    periode: "",
  });
  const [detailDoc, setDetailDoc] = React.useState<DocMeta | null>(null);
  const [detailWarnings, setDetailWarnings] = React.useState<NormalizedWarning[] | null>(null);
  const [detailMetaInfo, setDetailMetaInfo] = React.useState<{ parsed_at?: string } | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [isUploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const meta = useMetadata(docs);
  const detailRows = detailDoc ? docRowsMap[detailDoc.fileId] : undefined;
  const parsedAtIso = detailDoc?.parsedAt ?? detailMetaInfo?.parsed_at ?? null;
  let parsedAtDisplay = "—";
  if (parsedAtIso) {
    const parsedDate = new Date(parsedAtIso);
    parsedAtDisplay = Number.isNaN(parsedDate.getTime())
      ? parsedAtIso
      : parsedDate.toLocaleString("nl-NL");
  }
  const warnings = detailWarnings ?? [];

  React.useEffect(() => {
    if (!detailDoc) {
      setDetailWarnings(null);
      setDetailMetaInfo(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const info = await apiGetParse(detailDoc.fileId);
        if (cancelled) return;
        setDetailWarnings(info.warnings ?? []);
        setDetailMetaInfo(info.meta ?? null);
      } catch (e: any) {
        if (!cancelled) {
          setDetailError(e?.message || "Kon details niet laden");
          setDetailWarnings(null);
          setDetailMetaInfo(null);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [detailDoc]);

  React.useEffect(() => {
    if (!detailDoc) return;
    if (!detailRows) {
      hydrateDocRowsFromApi(detailDoc.fileId);
    }
  }, [detailDoc, detailRows]);

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
    "grid-cols-[90px_minmax(260px,3fr)_minmax(220px,2.2fr)_repeat(5,minmax(0,1fr))_repeat(2,minmax(90px,0.9fr))]";

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
        addDoc(meta);
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
          <div>Begin week</div>
          <div>Eind week</div>
          <div className="col-span-2">Acties</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6 text-sm theme-muted">Geen documenten gevonden.</div>
        ) : (
          filtered.map((d, i) => (
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
              <div>{d.beginWeek}</div>
              <div>{d.eindWeek}</div>
              <div className="flex gap-2 col-span-2">
                <button
                  title={
                    d.hasSource
                      ? `Bron: ${d.bestand}`
                      : `Geen bronbestand beschikbaar voor ${d.bestand}`
                  }
                  className="rounded-lg border theme-border theme-surface p-1 disabled:opacity-40"
                  disabled={!d.hasSource}
                  onClick={() =>
                    d.hasSource && openPreview({ fileId: d.fileId, filename: d.bestand })
                  }
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
          ))
        )}
      </div>

      {/* Detail modal */}
      {detailDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-2xl border theme-border theme-surface shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Metadata — {detailDoc.bestand}</h2>
              <button onClick={() => setDetailDoc(null)} className="theme-muted" aria-label="Sluiten">
                ✕
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="whitespace-pre-wrap">
                Vak: {detailDoc.vak}
                {"\n"}
                Niveau: {detailDoc.niveau}
                {"\n"}
                Leerjaar: {detailDoc.leerjaar}
                {"\n"}
                Periode: {detailDoc.periode}
                {"\n"}
                Bereik: week {detailDoc.beginWeek} – {detailDoc.eindWeek}
                {"\n"}
                Schooljaar: {detailDoc.schooljaar || "—"}
                {"\n"}
                Geparsed op: {parsedAtDisplay}
                {"\n"}
                Bronbestand: {detailDoc.hasSource ? "beschikbaar" : "niet beschikbaar"}
              </div>

              <div>
                <div className="font-medium mb-1">Waarschuwingen</div>
                {detailLoading ? (
                  <div className="theme-muted">Bezig met laden…</div>
                ) : detailError ? (
                  <div className="text-red-600">{detailError}</div>
                ) : warnings.length ? (
                  <ul className="list-disc space-y-1 pl-4">
                    {warnings.map((w, idx) => (
                      <li key={`${w.code}-${idx}`}>
                        <span className="font-medium">{w.code}</span>: {w.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="theme-muted">Geen waarschuwingen.</div>
                )}
              </div>

              <div>
                <div className="font-medium mb-1">Voorbeeldregels</div>
                {detailRows && detailRows.length ? (
                  <div className="max-h-60 overflow-auto rounded border theme-border">
                    <table className="min-w-full text-xs">
                      <thead className="theme-soft">
                        <tr>
                          <th className="px-3 py-1 text-left">Week</th>
                          <th className="px-3 py-1 text-left">Datum</th>
                          <th className="px-3 py-1 text-left">Les</th>
                          <th className="px-3 py-1 text-left">Onderwerp</th>
                          <th className="px-3 py-1 text-left">Locatie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailRows.slice(0, 10).map((row, idx) => (
                          <tr
                            key={`${detailDoc.fileId}-${idx}`}
                            className={idx > 0 ? "border-t theme-border" : ""}
                          >
                            <td className="px-3 py-1">{row.week ?? "—"}</td>
                            <td className="px-3 py-1">{row.datum ?? "—"}</td>
                            <td className="px-3 py-1">{row.les ?? "—"}</td>
                            <td className="px-3 py-1">{row.onderwerp ?? "—"}</td>
                            <td className="px-3 py-1">{row.locatie ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="theme-muted">Geen voorbeeldregels beschikbaar.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
