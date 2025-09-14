import React from "react";
import { Info, FileText, RefreshCw, Archive, Trash2, XCircle } from "lucide-react";
import type { DocMeta } from "../data/sampleDocs";
import { useAppStore } from "../app/store";
import { apiUploadDoc, apiDeleteDoc } from "../lib/api";

type Filters = {
  vak: string;
  niveau: string;
  leerjaar: string;
  periode: string;
};

function useMetadata(docs: DocMeta[]) {
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
  const { docs, addDoc, removeDoc /* replaceDoc, setDocs */ } = useAppStore();

  // Lokale UI state
  const [filters, setFilters] = React.useState<Filters>({
    vak: "",
    niveau: "",
    leerjaar: "",
    periode: "",
  });
  const [detailDoc, setDetailDoc] = React.useState<DocMeta | null>(null);
  const [isUploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const meta = useMetadata(docs);

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

  async function handleUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const meta = await apiUploadDoc(file);
      // Voeg direct toe aan globale store → Settings/Agenda/Matrix volgen automatisch
      addDoc(meta as any);
    } catch (e: any) {
      setError(e?.message || "Upload mislukt");
    } finally {
      setUploading(false);
      ev.target.value = "";
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiDeleteDoc(id);
      removeDoc(id); // verwijder uit globale store
    } catch (e: any) {
      console.warn(e);
      setError(e?.message || "Verwijderen mislukt");
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">Uploads &amp; Documentbeheer</div>

      {/* Uploadblok */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-1 font-medium">Bestanden uploaden</div>
        <div className="text-sm text-gray-600 mb-2">
          Kies een <strong>PDF</strong> of <strong>DOCX</strong>. Metadata wordt automatisch herkend.
        </div>
        <input type="file" accept=".pdf,.docx" onChange={handleUpload} />
        {isUploading && <div className="mt-2 text-sm text-gray-500">Bezig met uploaden…</div>}
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      </div>

      {/* Metadata-overzicht */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs text-gray-500 mb-1">Beschikbare vakken</div>
          <div className="flex flex-wrap gap-1">
            {meta.vakken.map((v) => (
              <span key={v} className="text-xs rounded-full border bg-white px-2 py-0.5">
                {v}
              </span>
            ))}
            {meta.vakken.length === 0 && <span className="text-xs text-gray-400">—</span>}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs text-gray-500 mb-1">Niveaus</div>
          <div className="flex flex-wrap gap-1">
            {meta.niveaus.map((n) => (
              <span key={n} className="text-xs rounded-full border bg-white px-2 py-0.5">
                {n}
              </span>
            ))}
            {meta.niveaus.length === 0 && <span className="text-xs text-gray-400">—</span>}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs text-gray-500 mb-1">Leerjaren</div>
          <div className="flex flex-wrap gap-1">
            {meta.leerjaren.map((j) => (
              <span key={j} className="text-xs rounded-full border bg-white px-2 py-0.5">
                {j}
              </span>
            ))}
            {meta.leerjaren.length === 0 && <span className="text-xs text-gray-400">—</span>}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs text-gray-500 mb-1">Periodes &amp; Weken</div>
          <div className="flex flex-wrap items-center gap-1">
            {meta.periodes.map((p) => (
              <span key={p} className="text-xs rounded-full border bg-white px-2 py-0.5">
                P{p}
              </span>
            ))}
            <span className="text-xs text-gray-500 ml-2">wk {meta.weekBereik}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center text-sm">
        <input
          placeholder="Zoek vak…"
          value={filters.vak}
          onChange={(e) => setFilters((f) => ({ ...f, vak: e.target.value }))}
          className="rounded-md border px-2 py-1"
        />
        <select
          className="rounded-md border px-2 py-1"
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
          className="rounded-md border px-2 py-1"
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
          className="rounded-md border px-2 py-1"
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
            className="ml-2 inline-flex items-center gap-1 rounded-md border px-2 py-1"
            title="Reset filters"
          >
            <XCircle size={14} /> Reset
          </button>
        )}
      </div>

      {/* Tabel */}
      <div className="rounded-2xl border bg-white">
        <div className="grid grid-cols-9 gap-2 text-xs font-medium text-gray-600 border-b pb-2 px-4 pt-3">
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
          <div className="p-6 text-sm text-gray-600">Geen documenten gevonden.</div>
        ) : (
          filtered.map((d, i) => (
            <div
              key={d.fileId}
              className={`grid grid-cols-9 gap-2 text-sm items-center px-4 py-3 ${
                i > 0 ? "border-t" : ""
              }`}
            >
              <div className="truncate" title={d.bestand}>
                {d.bestand}
              </div>
              <div>{d.vak}</div>
              <div>{d.niveau}</div>
              <div>{d.leerjaar}</div>
              <div>P{d.periode}</div>
              <div>{d.beginWeek}</div>
              <div>{d.eindWeek}</div>
              <div className="flex gap-2 col-span-2">
                <button title={`Bron: ${d.bestand}`} className="rounded-lg border bg-white p-1">
                  <FileText size={16} />
                </button>
                <button onClick={() => setDetailDoc(d)} title="Meta-details" className="rounded-lg border bg-white p-1">
                  <Info size={16} />
                </button>
                <button title="Vervang (nog niet actief)" className="rounded-lg border bg-white p-1">
                  <RefreshCw size={16} />
                </button>
                <button title="Archiveer (nog niet actief)" className="rounded-lg border bg-white p-1">
                  <Archive size={16} />
                </button>
                <button
                  onClick={() => handleDelete(d.fileId)}
                  title="Verwijder"
                  className="rounded-lg border bg-white p-1 text-red-600"
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
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Metadata — {detailDoc.bestand}</h2>
              <button onClick={() => setDetailDoc(null)} className="text-gray-500" aria-label="Sluiten">
                ✕
              </button>
            </div>
            <div className="text-sm whitespace-pre-wrap">
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
              {"\n\n"}
              Let op: deze metadata voedt de filters en views (Weekoverzicht/Matrix/Agenda).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
