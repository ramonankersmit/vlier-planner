import { create } from "zustand";
import type { DocMeta as ApiDocMeta, DocRow } from "../lib/api";

/**
 * Houd deze DocMeta shape in sync met de backend (app.py).
 * We gebruiken hier geen sample data meer; de app hydrate via de API.
 */
export type DocMeta = ApiDocMeta;

export type DocRecord = DocMeta & { enabled: boolean };

export type WeekInfo = { nr: number; start: string; end: string };

export type WeekData = {
  lesstof?: string;
  huiswerk?: string;
  deadlines?: string;
  opmerkingen?: string;
  date?: string;
};

export type WeekAggregation = {
  weeks: WeekInfo[];
  byWeek: Record<number, Record<string, WeekData>>;
};

type State = {
  // ==== documenten (globaal) ====
  docs: DocRecord[];
  setDocs: (d: DocMeta[]) => void;
  removeDoc: (fileId: string) => void;
  addDoc: (doc: DocMeta) => void;
  replaceDoc: (fileId: string, next: DocMeta) => void;
  setDocEnabled: (fileId: string, enabled: boolean) => void;
  docRows: Record<string, DocRow[]>;
  setDocRows: (fileId: string, rows: DocRow[]) => void;
  setDocRowsBulk: (entries: Record<string, DocRow[]>) => void;
  weekData: WeekAggregation;

  // ==== instellingen ====
  mijnVakken: string[];
  setMijnVakken: (v: string[]) => void;

  // ==== afvinkstatus gedeeld ====
  doneMap: Record<string, boolean>;
  toggleDone: (key: string) => void;

  // ==== weekoverzicht (UI state) ====
  weekIdxWO: number;
  setWeekIdxWO: (n: number) => void;
  niveauWO: "HAVO" | "VWO" | "ALLE";
  setNiveauWO: (n: "HAVO" | "VWO" | "ALLE") => void;
  leerjaarWO: string;
  setLeerjaarWO: (j: string) => void;
};

const uniqSorted = (arr: string[]) => Array.from(new Set(arr)).sort();

type MijnVakkenOptions = {
  ensure?: string[];
};

const computeMijnVakken = (docs: DocRecord[], prev: string[], options?: MijnVakkenOptions) => {
  const active = docs.filter((d) => d.enabled);
  const activeVakken = uniqSorted(active.map((x) => x.vak));
  const ensured = options?.ensure?.filter((vak) => activeVakken.includes(vak)) ?? [];
  const preserved = prev.filter((v) => activeVakken.includes(v));
  const merged = uniqSorted([...preserved, ...ensured]);
  return merged.length ? merged : activeVakken;
};

type WeekAccumulator = {
  lesstof: string[];
  huiswerk: string[];
  deadlines: string[];
  opmerkingen: string[];
  dates: string[];
};

const normalizeText = (value?: string | null) => {
  if (value == null) return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  const lowered = cleaned.toLowerCase();
  if (cleaned === "—" || cleaned === "-" || lowered === "geen" || lowered === "n.v.t.") {
    return undefined;
  }
  return cleaned;
};

const computeWeekAggregation = (
  docs: DocRecord[],
  docRows: Record<string, DocRow[]>
): WeekAggregation => {
  if (!docs.length) {
    return { weeks: [], byWeek: {} };
  }

  const byWeek: Record<number, Record<string, WeekAccumulator>> = {};
  const weekNumbers = new Set<number>();
  const weekDates = new Map<number, Set<string>>();

  for (const doc of docs) {
    if (!doc.enabled) {
      continue;
    }
    const start = Math.min(doc.beginWeek, doc.eindWeek);
    const end = Math.max(doc.beginWeek, doc.eindWeek);
    for (let wk = start; wk <= end; wk++) {
      if (wk < 1 || wk > 53) continue;
      weekNumbers.add(wk);
      if (!weekDates.has(wk)) {
        weekDates.set(wk, new Set());
      }
    }

    const rows = docRows[doc.fileId];
    if (!rows?.length) {
      continue;
    }

    for (const row of rows) {
      const wk = typeof row.week === "number" ? row.week : undefined;
      if (!wk || wk < 1 || wk > 53) {
        continue;
      }
      weekNumbers.add(wk);
      if (!weekDates.has(wk)) {
        weekDates.set(wk, new Set());
      }
      const perVak = (byWeek[wk] ??= {});
      const accum =
        perVak[doc.vak] ??
        (perVak[doc.vak] = { lesstof: [], huiswerk: [], deadlines: [], opmerkingen: [], dates: [] });

      const add = (arr: string[], value?: string | null) => {
        const normalized = normalizeText(value);
        if (normalized) arr.push(normalized);
      };

      add(accum.lesstof, row.onderwerp || row.les);
      if ((!row.onderwerp && !row.les) && row.leerdoelen?.length) {
        add(accum.lesstof, row.leerdoelen.join("; "));
      }
      add(accum.huiswerk, row.huiswerk);
      add(accum.huiswerk, row.opdracht);

      const toetsType = row.toets?.type;
      if (toetsType) {
        const normalizedType = normalizeText(toetsType);
        const normalizedWeight = normalizeText(row.toets?.weging ?? undefined);
        if (normalizedType) {
          const label = normalizedWeight
            ? `${normalizedType} (weging ${normalizedWeight})`
            : normalizedType;
          accum.deadlines.push(label);
        }
      }

      const recordDate = (value?: string | null) => {
        const normalized = normalizeText(value);
        if (!normalized) return;
        accum.dates.push(normalized);
        weekDates.get(wk)?.add(normalized);
      };

      const normalizedInlever = normalizeText(row.inleverdatum);
      if (normalizedInlever) {
        accum.deadlines.push(`Inleveren ${normalizedInlever}`);
        recordDate(normalizedInlever);
      }

      recordDate(row.datum);
      add(accum.opmerkingen, row.notities);
    }
  }

  const resultByWeek: Record<number, Record<string, WeekData>> = {};
  for (const [weekStr, vakMap] of Object.entries(byWeek)) {
    const weekNr = Number(weekStr);
    resultByWeek[weekNr] = {};
    for (const [vak, acc] of Object.entries(vakMap)) {
      const uniqJoin = (values: string[], sep: string) => {
        const unique = Array.from(new Set(values));
        return unique.length ? unique.join(sep) : undefined;
      };
      const sortedDates = Array.from(new Set(acc.dates)).sort();
      resultByWeek[weekNr][vak] = {
        lesstof: uniqJoin(acc.lesstof, "\n"),
        huiswerk: uniqJoin(acc.huiswerk, "; "),
        deadlines: uniqJoin(acc.deadlines, "; "),
        opmerkingen: uniqJoin(acc.opmerkingen, "\n"),
        date: sortedDates[0],
      };
    }
  }

  const weeks = Array.from(weekNumbers)
    .sort((a, b) => a - b)
    .map((nr) => {
      const set = weekDates.get(nr);
      if (!set || set.size === 0) {
        return { nr, start: "", end: "" };
      }
      const sorted = Array.from(set).sort();
      const start = sorted[0];
      const end = sorted[sorted.length - 1] ?? sorted[0];
      return { nr, start, end };
    });

  return { weeks, byWeek: resultByWeek };
};

export const useAppStore = create<State>((set, get) => ({
  // ----------------------------
  // documenten
  // ----------------------------
  docs: [], // start leeg; wordt gehydrate via API
  docRows: {},
  weekData: { weeks: [], byWeek: {} },
  setDocs: (d) => {
    const prevDocs = get().docs;
    const prevEnabled = new Map(prevDocs.map((doc) => [doc.fileId, doc.enabled] as const));
    const nextDocs = d.map((doc) => ({
      ...doc,
      enabled: prevEnabled.get(doc.fileId) ?? true,
    }));
    const prevVakSet = new Set(prevDocs.map((doc) => doc.vak));
    const newlyEnabledVakken = nextDocs
      .filter((doc) => doc.enabled && !prevVakSet.has(doc.vak))
      .map((doc) => doc.vak);
    const mijnVakken = computeMijnVakken(nextDocs, get().mijnVakken, {
      ensure: newlyEnabledVakken,
    });
    const nextDocIds = new Set(nextDocs.map((doc) => doc.fileId));
    const currentRows = get().docRows;
    const filteredRows: Record<string, DocRow[]> = {};
    for (const [fileId, rows] of Object.entries(currentRows)) {
      if (nextDocIds.has(fileId)) {
        filteredRows[fileId] = rows;
      }
    }
    const weekData = computeWeekAggregation(nextDocs, filteredRows);
    set({ docs: nextDocs, mijnVakken, docRows: filteredRows, weekData });
  },
  removeDoc: (fileId) => {
    const next = get()
      .docs
      .filter((x) => x.fileId !== fileId);
    const mijnVakken = computeMijnVakken(next, get().mijnVakken);
    const nextRows = { ...get().docRows };
    delete nextRows[fileId];
    const weekData = computeWeekAggregation(next, nextRows);
    set({ docs: next, mijnVakken, docRows: nextRows, weekData });
  },
  addDoc: (doc) => {
    const prevDocs = get().docs;
    const next = [...prevDocs, { ...doc, enabled: true }];
    const hadVakBefore = prevDocs.some((existing) => existing.vak === doc.vak);
    const mijnVakken = computeMijnVakken(next, get().mijnVakken, {
      ensure: hadVakBefore ? undefined : [doc.vak],
    });
    const nextRows = { ...get().docRows };
    if (!nextRows[doc.fileId]) {
      nextRows[doc.fileId] = [];
    }
    const weekData = computeWeekAggregation(next, nextRows);
    set({ docs: next, mijnVakken, docRows: nextRows, weekData });
  },
  replaceDoc: (fileId, nextDoc) => {
    const next = get().docs.map((x) =>
      x.fileId === fileId ? { ...nextDoc, enabled: x.enabled } : x
    );
    const mijnVakken = computeMijnVakken(next, get().mijnVakken);
    const weekData = computeWeekAggregation(next, get().docRows);
    set({ docs: next, mijnVakken, weekData });
  },
  setDocEnabled: (fileId, enabled) => {
    let ensuredVak: string | undefined;
    const next = get().docs.map((doc) => {
      if (doc.fileId !== fileId) {
        return doc;
      }
      if (enabled && !doc.enabled) {
        ensuredVak = doc.vak;
      }
      return { ...doc, enabled };
    });
    const mijnVakken = computeMijnVakken(next, get().mijnVakken, {
      ensure: ensuredVak ? [ensuredVak] : undefined,
    });
    const weekData = computeWeekAggregation(next, get().docRows);
    set({ docs: next, mijnVakken, weekData });
  },
  setDocRows: (fileId, rows) => {
    const nextRows = { ...get().docRows, [fileId]: rows };
    const weekData = computeWeekAggregation(get().docs, nextRows);
    set({ docRows: nextRows, weekData });
  },
  setDocRowsBulk: (entries) => {
    const nextRows = { ...get().docRows };
    for (const [fileId, rows] of Object.entries(entries)) {
      nextRows[fileId] = rows;
    }
    const weekData = computeWeekAggregation(get().docs, nextRows);
    set({ docRows: nextRows, weekData });
  },

  // ----------------------------
  // instellingen
  // ----------------------------
  mijnVakken: [], // start leeg; wordt gezet bij setDocs()
  setMijnVakken: (v) => set({ mijnVakken: v }),

  // ----------------------------
  // done-map
  // ----------------------------
  doneMap: {},
  toggleDone: (key) =>
    set((s) => ({ doneMap: { ...s.doneMap, [key]: !s.doneMap[key] } })),

  // ----------------------------
  // weekoverzicht (UI state)
  // ----------------------------
  weekIdxWO: 0,
  setWeekIdxWO: (n) => set({ weekIdxWO: n }),
  niveauWO: "ALLE",
  setNiveauWO: (n) => set({ niveauWO: n }),
  leerjaarWO: "ALLE",
  setLeerjaarWO: (j) => set({ leerjaarWO: j }),
}));

/**
 * Helper om bij app-start de docs uit de backend te laden.
 * (Dynamische import voorkomt bundling/circular issues.)
 */
export async function hydrateDocsFromApi() {
  try {
    const { apiListDocs, apiGetDocRows } = await import("../lib/api");
    const docs = await apiListDocs();
    const store = useAppStore.getState();
    store.setDocs(docs as DocMeta[]);
    if (!docs.length) {
      store.setDocRowsBulk({});
      return;
    }
    const rowsEntries = await Promise.all(
      docs.map(async (doc) => {
        try {
          const rows = await apiGetDocRows(doc.fileId);
          return [doc.fileId, rows] as [string, DocRow[]];
        } catch (err) {
          console.warn(`Kon rijen niet hydrateren voor ${doc.fileId}:`, err);
          return [doc.fileId, [] as DocRow[]];
        }
      })
    );
    const rowsMap = Object.fromEntries(rowsEntries) as Record<string, DocRow[]>;
    store.setDocRowsBulk(rowsMap);
  } catch (e) {
    console.warn("Kon docs niet hydrateren:", e);
  }
}

export async function hydrateDocRowsFromApi(fileId: string) {
  try {
    const { apiGetDocRows } = await import("../lib/api");
    const rows = await apiGetDocRows(fileId);
    useAppStore.getState().setDocRows(fileId, rows);
  } catch (e) {
    console.warn(`Kon rijen niet ophalen voor ${fileId}:`, e);
  }
}
