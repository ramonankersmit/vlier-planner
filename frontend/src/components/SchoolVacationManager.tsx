import React from "react";
import { Download, RefreshCw, Trash2, Pencil, Check, ToggleLeft, ToggleRight } from "lucide-react";
import {
  useAppStore,
  type SchoolVacation,
} from "../app/store";
import {
  apiFetchSchoolVacations,
  type SchoolVacationDownload,
  type SchoolVacationImport,
} from "../lib/api";
import { parseIsoDate } from "../lib/calendar";

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const parsed = parseIsoDate(value);
  if (parsed) {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(parsed);
  }
  const fallback = new Date(value);
  if (Number.isNaN(fallback.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(fallback);
};

const computeDefaultSchoolYear = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const startYear = month >= 8 ? currentYear : currentYear - 1;
  return `${startYear}-${startYear + 1}`;
};

type DownloadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: SchoolVacationDownload };

type EditState = {
  id: string;
  name: string;
  region: string;
  startDate: string;
  endDate: string;
  notes: string;
};

function mapImportToVacation(entry: SchoolVacationImport, nowIso: string): SchoolVacation {
  return {
    id: entry.id,
    externalId: entry.id,
    name: entry.name,
    region: entry.region,
    startDate: entry.startDate,
    endDate: entry.endDate,
    schoolYear: entry.schoolYear,
    source: entry.source,
    label: entry.label,
    rawText: entry.rawText ?? null,
    notes: entry.notes ?? null,
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export default function SchoolVacationManager() {
  const schoolVacations = useAppStore((s) => s.schoolVacations) ?? [];
  const addSchoolVacations = useAppStore((s) => s.addSchoolVacations);
  const updateSchoolVacation = useAppStore((s) => s.updateSchoolVacation);
  const removeSchoolVacation = useAppStore((s) => s.removeSchoolVacation);
  const setSchoolVacationActive = useAppStore((s) => s.setSchoolVacationActive);

  const [schoolYear, setSchoolYear] = React.useState<string>(computeDefaultSchoolYear());
  const [downloadState, setDownloadState] = React.useState<DownloadState>({ status: "idle" });
  const [isImportOpen, setImportOpen] = React.useState(false);
  const [selection, setSelection] = React.useState<Record<string, boolean>>({});
  const [editing, setEditing] = React.useState<EditState | null>(null);
  const requestIdRef = React.useRef(0);
  const regionCheckboxRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const selectedCount = React.useMemo(
    () => Object.values(selection).filter(Boolean).length,
    [selection]
  );

  const fetchVacations = React.useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSelection({});
    setDownloadState({ status: "loading" });
    try {
      const payload = await apiFetchSchoolVacations(schoolYear);
      if (requestId !== requestIdRef.current) {
        return;
      }
      const defaultSelection: Record<string, boolean> = {};
      payload.vacations.forEach((vac) => {
        defaultSelection[vac.id] = true;
      });
      setSelection(defaultSelection);
      setDownloadState({ status: "ready", payload });
    } catch (err: any) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setDownloadState({ status: "error", message: err?.message || "Download mislukt" });
    }
  }, [schoolYear]);

  const openImportDialog = React.useCallback(() => {
    setImportOpen(true);
    setDownloadState({ status: "loading" });
    setSelection({});
  }, []);

  React.useEffect(() => {
    if (!isImportOpen) {
      return;
    }
    fetchVacations();
  }, [isImportOpen, fetchVacations]);

  const closeImportDialog = React.useCallback(() => {
    requestIdRef.current += 1;
    setImportOpen(false);
    setDownloadState({ status: "idle" });
    setSelection({});
  }, []);

  const toggleSelection = (id: string) => {
    setSelection((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAll = () => {
    if (downloadState.status !== "ready") return;
    const map: Record<string, boolean> = {};
    downloadState.payload.vacations.forEach((vac) => {
      map[vac.id] = true;
    });
    setSelection(map);
  };

  const clearSelection = () => setSelection({});

  const regionGroups = React.useMemo(() => {
    if (downloadState.status !== "ready") {
      return [] as { region: string; ids: string[] }[];
    }
    const map = new Map<string, string[]>();
    downloadState.payload.vacations.forEach((vac) => {
      const key = vac.region?.trim() || "Onbekend";
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(vac.id);
    });
    return Array.from(map.entries())
      .map(([region, ids]) => ({ region, ids }))
      .sort((a, b) => a.region.localeCompare(b.region, "nl", { sensitivity: "base" }));
  }, [downloadState]);

  React.useEffect(() => {
    regionGroups.forEach(({ region, ids }) => {
      const ref = regionCheckboxRefs.current[region];
      if (!ref) return;
      const selectedCount = ids.reduce((count, id) => (selection[id] ? count + 1 : count), 0);
      ref.indeterminate = selectedCount > 0 && selectedCount < ids.length;
    });
  }, [regionGroups, selection]);

  const toggleRegionSelection = React.useCallback((ids: string[]) => {
    setSelection((prev) => {
      const areAllSelected = ids.every((id) => prev[id]);
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = !areAllSelected;
      });
      return next;
    });
  }, []);

  const handleImport = () => {
    if (downloadState.status !== "ready") return;
    const nowIso = new Date().toISOString();
    const entries = downloadState.payload.vacations
      .filter((vac) => selection[vac.id])
      .map((vac) => mapImportToVacation(vac, nowIso));
    if (!entries.length) {
      closeImportDialog();
      return;
    }
    addSchoolVacations(entries);
    closeImportDialog();
  };

  const startEdit = (vacation: SchoolVacation) => {
    setEditing({
      id: vacation.id,
      name: vacation.name,
      region: vacation.region,
      startDate: vacation.startDate,
      endDate: vacation.endDate,
      notes: vacation.notes ?? "",
    });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = () => {
    if (!editing) return;
    updateSchoolVacation(editing.id, {
      name: editing.name.trim() || "Schoolvakantie",
      region: editing.region.trim() || "Onbekend",
      startDate: editing.startDate,
      endDate: editing.endDate,
      notes: editing.notes.trim() ? editing.notes.trim() : null,
    });
    setEditing(null);
  };

  const removeVacation = (vacation: SchoolVacation) => {
    const confirmed = window.confirm(
      `Weet je zeker dat je de vakantie "${vacation.name}" (${vacation.region}) wilt verwijderen?`
    );
    if (!confirmed) return;
    removeSchoolVacation(vacation.id);
  };

  return (
    <section className="rounded-2xl border theme-border theme-surface p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold theme-text">Schoolvakanties</h2>
          <p className="text-sm theme-muted">
            Download vakanties van rijksoverheid.nl, beheer metadata en bepaal welke periodes zichtbaar zijn in de planner.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm theme-muted" htmlFor="schoolyear-input">
            Schooljaar
          </label>
          <input
            id="schoolyear-input"
            type="text"
            value={schoolYear}
            onChange={(event) => setSchoolYear(event.target.value)}
            className="w-28 rounded-md border theme-border theme-surface px-2 py-1 text-sm"
            placeholder="2025-2026"
          />
          <button
            type="button"
            onClick={openImportDialog}
            className="inline-flex items-center gap-1 rounded-md border theme-border theme-surface px-3 py-1 text-sm"
            title="Download schoolvakanties"
          >
            <Download size={16} /> Downloaden
          </button>
        </div>
      </div>

      {schoolVacations.length === 0 ? (
        <div className="rounded-xl border border-dashed theme-border p-4 text-sm theme-muted">
          Nog geen schoolvakanties toegevoegd. Download eerst een overzicht en kies de periodes die je wilt gebruiken.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="theme-soft">
              <tr>
                <th className="px-3 py-2 text-left">Actief</th>
                <th className="px-3 py-2 text-left">Vakantie</th>
                <th className="px-3 py-2 text-left">Periode</th>
                <th className="px-3 py-2 text-left">Bron</th>
                <th className="px-3 py-2 text-left">Acties</th>
              </tr>
            </thead>
            <tbody>
              {schoolVacations.map((vacation) => {
                const period = `${formatDate(vacation.startDate)} – ${formatDate(vacation.endDate)}`;
                return (
                  <tr key={vacation.id} className="border-t theme-border align-top">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSchoolVacationActive(vacation.id, !vacation.active)}
                        className="flex items-center gap-1 text-sm"
                        title={vacation.active ? "Deactiveren" : "Activeren"}
                      >
                        {vacation.active ? (
                          <ToggleRight size={18} className="text-emerald-600" />
                        ) : (
                          <ToggleLeft size={18} className="theme-muted" />
                        )}
                        <span className="sr-only">{vacation.active ? "Actief" : "Inactief"}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{vacation.name}</div>
                      <div className="text-xs theme-muted">{vacation.region}</div>
                      {vacation.notes && (
                        <div className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">{vacation.notes}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div>{period}</div>
                      <div className="text-xs theme-muted">{vacation.schoolYear}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-xs theme-muted break-all">{vacation.source}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(vacation)}
                          className="inline-flex items-center gap-1 rounded-md border theme-border theme-surface px-2 py-1"
                          title="Bewerken"
                        >
                          <Pencil size={14} /> Bewerken
                        </button>
                        <button
                          type="button"
                          onClick={() => removeVacation(vacation)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-600"
                          title="Verwijderen"
                        >
                          <Trash2 size={14} /> Verwijderen
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-3xl rounded-2xl border theme-border theme-surface shadow-lg">
            <div className="flex items-center justify-between border-b theme-border px-4 py-3">
              <h3 className="text-base font-semibold">Schoolvakanties importeren</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchVacations}
                  disabled={downloadState.status === "loading"}
                  className="inline-flex items-center gap-1 rounded-md border theme-border theme-surface px-2 py-1 text-sm disabled:opacity-50"
                  title="Opnieuw ophalen"
                >
                  <RefreshCw size={14} /> Vernieuwen
                </button>
                <button
                  type="button"
                  onClick={closeImportDialog}
                  className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
                >
                  Sluiten
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-4 py-4 text-sm">
              {downloadState.status === "loading" && (
                <div className="py-6 text-center text-sm theme-muted">Bezig met downloaden…</div>
              )}
              {downloadState.status === "error" && (
                <div className="space-y-3">
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {downloadState.message}
                  </div>
                  <button
                    type="button"
                    onClick={fetchVacations}
                    className="inline-flex items-center gap-1 rounded-md border theme-border theme-surface px-3 py-1"
                  >
                    <RefreshCw size={16} /> Opnieuw proberen
                  </button>
                </div>
              )}
              {downloadState.status === "ready" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm theme-muted">
                    <div>
                      Bron: <span className="font-medium">{downloadState.payload.source}</span>
                    </div>
                    <div>Gehaald op {formatDate(downloadState.payload.retrievedAt)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="rounded-md border theme-border theme-surface px-2 py-1"
                    >
                      Alles selecteren
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="rounded-md border theme-border theme-surface px-2 py-1"
                    >
                      Niets selecteren
                    </button>
                    <span className="theme-muted">{selectedCount} geselecteerd</span>
                  </div>
                  {regionGroups.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="theme-muted">Regio's:</span>
                      {regionGroups.map(({ region, ids }) => {
                        const selectedCount = ids.reduce(
                          (count, id) => (selection[id] ? count + 1 : count),
                          0
                        );
                        const allSelected = selectedCount === ids.length && ids.length > 0;
                        return (
                          <label key={region} className="inline-flex items-center gap-1 rounded-md border theme-border px-2 py-1">
                            <input
                              ref={(element) => {
                                if (element) {
                                  regionCheckboxRefs.current[region] = element;
                                } else {
                                  delete regionCheckboxRefs.current[region];
                                }
                              }}
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => toggleRegionSelection(ids)}
                            />
                            <span>
                              {region} ({selectedCount}/{ids.length})
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-md border theme-border">
                    <table className="min-w-full text-sm">
                      <thead className="theme-soft">
                        <tr>
                          <th className="px-3 py-2 text-left">Kies</th>
                          <th className="px-3 py-2 text-left">Vakantie</th>
                          <th className="px-3 py-2 text-left">Regio</th>
                          <th className="px-3 py-2 text-left">Periode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {downloadState.payload.vacations.map((vac) => {
                          const period = `${formatDate(vac.startDate)} – ${formatDate(vac.endDate)}`;
                          return (
                            <tr key={vac.id} className="border-t theme-border">
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={!!selection[vac.id]}
                                  onChange={() => toggleSelection(vac.id)}
                                  aria-label={`Selecteer ${vac.name} (${vac.region})`}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium">{vac.name}</div>
                                {vac.notes && (
                                  <div className="text-xs theme-muted">{vac.notes}</div>
                                )}
                              </td>
                              <td className="px-3 py-2">{vac.region}</td>
                              <td className="px-3 py-2">{period}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t theme-border px-4 py-3 text-sm">
              {downloadState.status === "ready" ? (
                <span className="theme-muted">
                  {downloadState.payload.vacations.length} vakanties gevonden · {selectedCount} geselecteerd
                </span>
              ) : (
                <span className="theme-muted">Schooljaar {schoolYear}</span>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeImportDialog}
                  className="rounded-md border theme-border theme-surface px-3 py-1"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={downloadState.status !== "ready" || selectedCount === 0}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1 text-white disabled:opacity-40"
                >
                  <Check size={16} /> Importeren
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border theme-border theme-surface shadow-lg">
            <div className="flex items-center justify-between border-b theme-border px-4 py-3">
              <h3 className="text-base font-semibold">Vakantie bewerken</h3>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
              >
                Sluiten
              </button>
            </div>
            <div className="px-4 py-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs theme-muted mb-1" htmlFor="edit-name">
                  Naam
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                  className="w-full rounded-md border theme-border theme-surface px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-xs theme-muted mb-1" htmlFor="edit-region">
                  Regio
                </label>
                <input
                  id="edit-region"
                  type="text"
                  value={editing.region}
                  onChange={(event) => setEditing({ ...editing, region: event.target.value })}
                  className="w-full rounded-md border theme-border theme-surface px-2 py-1"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs theme-muted mb-1" htmlFor="edit-start">
                    Startdatum
                  </label>
                  <input
                    id="edit-start"
                    type="date"
                    value={editing.startDate}
                    onChange={(event) => setEditing({ ...editing, startDate: event.target.value })}
                    className="w-full rounded-md border theme-border theme-surface px-2 py-1"
                  />
                </div>
                <div>
                  <label className="block text-xs theme-muted mb-1" htmlFor="edit-end">
                    Einddatum
                  </label>
                  <input
                    id="edit-end"
                    type="date"
                    value={editing.endDate}
                    onChange={(event) => setEditing({ ...editing, endDate: event.target.value })}
                    className="w-full rounded-md border theme-border theme-surface px-2 py-1"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs theme-muted mb-1" htmlFor="edit-notes">
                  Notities (optioneel)
                </label>
                <textarea
                  id="edit-notes"
                  value={editing.notes}
                  onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
                  className="w-full rounded-md border theme-border theme-surface px-2 py-1"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t theme-border px-4 py-3 text-sm">
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md border theme-border theme-surface px-3 py-1"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1 text-white"
              >
                <Check size={16} /> Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
