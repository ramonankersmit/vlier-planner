import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DocMeta as ApiDocMeta, DocRow } from "../lib/api";
import {
  deriveIsoYearForWeek,
  formatIsoDate,
  getIsoWeekEnd,
  getIsoWeekStart,
  makeWeekId,
} from "../lib/calendar";
import { splitHomeworkItems } from "../lib/textUtils";

/**
 * Houd deze DocMeta shape in sync met de backend (app.py).
 * We gebruiken hier geen sample data meer; de app hydrate via de API.
 */
export type DocMeta = ApiDocMeta;

export type DocRecord = DocMeta & { enabled: boolean };

export type WeekInfo = { id: string; nr: number; isoYear: number; start: string; end: string };

export type WeekData = {
  lesstof?: string;
  huiswerk?: string;
  huiswerkItems?: string[];
  deadlines?: string;
  opmerkingen?: string;
  date?: string;
};

export type WeekAggregation = {
  weeks: WeekInfo[];
  byWeek: Record<string, Record<string, WeekData>>;
};

export type CustomHomeworkEntry = {
  id: string;
  text: string;
  createdAt: string;
};

type HomeworkAdjustments = {
  hidden: Record<string, boolean>;
  overrides: Record<string, string>;
};

export type ThemeSettings = {
  background: string;
  surface: string;
  accent: string;
  text: string;
  muted: string;
  border: string;
  accentText: string;
};

const defaultTheme: ThemeSettings = {
  background: "#f8fafc",
  surface: "#ffffff",
  accent: "#111827",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  accentText: "#ffffff",
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
  customHomework: Record<string, Record<string, CustomHomeworkEntry[]>>;
  addCustomHomework: (weekId: string, vak: string, text: string) => void;
  removeCustomHomework: (weekId: string, vak: string, entryId: string) => void;
  updateCustomHomework: (weekId: string, vak: string, entryId: string, text: string) => void;
  homeworkAdjustments: Record<string, Record<string, HomeworkAdjustments>>;
  hideHomeworkItem: (weekId: string, vak: string, itemKey: string) => void;
  restoreHomeworkItem: (weekId: string, vak: string, itemKey: string) => void;
  overrideHomeworkItem: (weekId: string, vak: string, itemKey: string, text: string) => void;
  clearHomeworkOverride: (weekId: string, vak: string, itemKey: string) => void;

  // ==== instellingen ====
  mijnVakken: string[];
  setMijnVakken: (v: string[]) => void;
  huiswerkWeergave: "perOpdracht" | "gecombineerd";
  setHuiswerkWeergave: (mode: "perOpdracht" | "gecombineerd") => void;
  theme: ThemeSettings;
  setThemeColor: (key: keyof ThemeSettings, value: string) => void;
  resetTheme: () => void;
  backgroundImage: string | null;
  setBackgroundImage: (value: string | null) => void;
  resetBackgroundImage: () => void;
  surfaceOpacity: number;
  setSurfaceOpacity: (value: number) => void;
  resetSurfaceOpacity: () => void;
  enableHomeworkEditing: boolean;
  setEnableHomeworkEditing: (value: boolean) => void;
  enableCustomHomework: boolean;
  setEnableCustomHomework: (value: boolean) => void;

  // ==== afvinkstatus gedeeld ====
  doneMap: Record<string, boolean>;
  setDoneState: (key: string, value: boolean) => void;
  toggleDone: (key: string) => void;

  // ==== weekoverzicht (UI state) ====
  weekIdxWO: number;
  setWeekIdxWO: (n: number) => void;
  niveauWO: "HAVO" | "VWO" | "ALLE";
  setNiveauWO: (n: "HAVO" | "VWO" | "ALLE") => void;
  leerjaarWO: string;
  setLeerjaarWO: (j: string) => void;
  // ==== matrix (UI state) ====
  matrixStartIdx: number;
  setMatrixStartIdx: (n: number) => void;
  matrixCount: number;
  setMatrixCount: (n: number) => void;
  matrixNiveau: "HAVO" | "VWO" | "ALLE";
  setMatrixNiveau: (n: "HAVO" | "VWO" | "ALLE") => void;
  matrixLeerjaar: string;
  setMatrixLeerjaar: (j: string) => void;
  lastVisitedRoute: string;
  setLastVisitedRoute: (path: string) => void;
  resetAppState: () => void;
};

const uniqSorted = (arr: string[]) => Array.from(new Set(arr)).sort();

const formatVakName = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase("nl-NL") + trimmed.slice(1);
};

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
  huiswerkItems: string[];
  deadlines: string[];
  opmerkingen: string[];
  dates: string[];
};

type NormalizeOptions = {
  preserveLineBreaks?: boolean;
};

const normalizeText = (value?: string | null, options?: NormalizeOptions) => {
  if (value == null) return undefined;
  const normalizedLineBreaks = value.replace(/\r\n?/g, "\n");
  let cleaned: string;

  if (options?.preserveLineBreaks) {
    const lines = normalizedLineBreaks
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);
    cleaned = lines.join("\n");
  } else {
    cleaned = normalizedLineBreaks.replace(/\s+/g, " ").trim();
  }

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

  const weekInfoMap = new Map<string, WeekInfo>();
  const byWeek = new Map<string, Record<string, WeekAccumulator>>();
  const ensureWeek = (weekNr: number, isoYear: number) => {
    const weekId = makeWeekId(isoYear, weekNr);
    if (!weekInfoMap.has(weekId)) {
      const startDate = getIsoWeekStart(isoYear, weekNr);
      const endDate = getIsoWeekEnd(isoYear, weekNr);
      weekInfoMap.set(weekId, {
        id: weekId,
        nr: weekNr,
        isoYear,
        start: formatIsoDate(startDate),
        end: formatIsoDate(endDate),
      });
    }
    if (!byWeek.has(weekId)) {
      byWeek.set(weekId, {});
    }
    return { weekId, vakMap: byWeek.get(weekId)! };
  };
  const today = new Date();

  for (const doc of docs) {
    if (!doc.enabled) {
      continue;
    }
    const start = Math.min(doc.beginWeek, doc.eindWeek);
    const end = Math.max(doc.beginWeek, doc.eindWeek);
    for (let wk = start; wk <= end; wk++) {
      if (wk < 1 || wk > 53) continue;
      const isoYear = deriveIsoYearForWeek(wk, { schooljaar: doc.schooljaar, today });
      ensureWeek(wk, isoYear);
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
      const isoYear = deriveIsoYearForWeek(wk, {
        schooljaar: doc.schooljaar,
        candidateDates: [row.datum, row.inleverdatum],
        today,
      });
      const { vakMap } = ensureWeek(wk, isoYear);
      const accum =
        vakMap[doc.vak] ??
        (vakMap[doc.vak] = {
          lesstof: [],
          huiswerk: [],
          huiswerkItems: [],
          deadlines: [],
          opmerkingen: [],
          dates: [],
        });

      const addUnique = (arr: string[], value: string) => {
        if (!arr.includes(value)) {
          arr.push(value);
        }
      };

      const addNormalized = (arr: string[], value?: string | null, options?: NormalizeOptions) => {
        const normalized = normalizeText(value, options);
        if (normalized) {
          addUnique(arr, normalized);
        }
        return normalized;
      };

      let vakantieOutsideHomework = false;

      const normalizedLesstof = addNormalized(accum.lesstof, row.onderwerp || row.les);
      if (normalizedLesstof?.toLocaleLowerCase("nl-NL").includes("vakantie")) {
        vakantieOutsideHomework = true;
      }
      if ((!row.onderwerp && !row.les) && row.leerdoelen?.length) {
        const leerdoelText = addNormalized(accum.lesstof, row.leerdoelen.join("; "));
        if (leerdoelText?.toLocaleLowerCase("nl-NL").includes("vakantie")) {
          vakantieOutsideHomework = true;
        }
      }

      const addHomework = (value?: string | null) => {
        const normalized = addNormalized(accum.huiswerk, value, { preserveLineBreaks: true });
        if (
          normalized &&
          normalized.toLocaleLowerCase("nl-NL").includes("vakantie") &&
          vakantieOutsideHomework
        ) {
          return;
        }
        if (!normalized) return;
        const items = splitHomeworkItems(normalized);
        for (const item of items) {
          addUnique(accum.huiswerkItems, item);
        }
      };

      const toetsType = row.toets?.type;
      if (toetsType) {
        const normalizedType = normalizeText(toetsType);
        const normalizedWeight = normalizeText(row.toets?.weging ?? undefined);
        if (normalizedType) {
          if (normalizedType.toLocaleLowerCase("nl-NL").includes("vakantie")) {
            vakantieOutsideHomework = true;
          }
          const label = normalizedWeight
            ? `${normalizedType} (weging ${normalizedWeight})`
            : normalizedType;
          addUnique(accum.deadlines, label);
        }
      }

      const recordDate = (value?: string | null) => {
        const normalized = normalizeText(value);
        if (!normalized) return;
        addUnique(accum.dates, normalized);
      };

      const normalizedInlever = normalizeText(row.inleverdatum);
      if (normalizedInlever) {
        addUnique(accum.deadlines, `Inleveren ${normalizedInlever}`);
        recordDate(normalizedInlever);
      }

      recordDate(row.datum);
      const opmerkingenText = addNormalized(accum.opmerkingen, row.notities);
      if (opmerkingenText?.toLocaleLowerCase("nl-NL").includes("vakantie")) {
        vakantieOutsideHomework = true;
      }

      addHomework(row.huiswerk);
      addHomework(row.opdracht);
    }
  }

  const resultByWeek: Record<string, Record<string, WeekData>> = {};
  for (const [weekId, vakMap] of byWeek.entries()) {
    const entries: Record<string, WeekData> = {};
    for (const [vak, acc] of Object.entries(vakMap)) {
      const uniqJoin = (values: string[], sep: string) => {
        const unique = Array.from(new Set(values));
        return unique.length ? unique.join(sep) : undefined;
      };
      const sortedDates = Array.from(new Set(acc.dates)).sort();
      entries[vak] = {
        lesstof: uniqJoin(acc.lesstof, "\n"),
        huiswerk: uniqJoin(acc.huiswerk, "\n"),
        huiswerkItems: acc.huiswerkItems.length ? [...acc.huiswerkItems] : undefined,
        deadlines: uniqJoin(acc.deadlines, "; "),
        opmerkingen: uniqJoin(acc.opmerkingen, "\n"),
        date: sortedDates[0],
      };
    }
    resultByWeek[weekId] = entries;
  }

  const weeks = Array.from(weekInfoMap.values()).sort((a, b) => {
    if (a.isoYear !== b.isoYear) return a.isoYear - b.isoYear;
    if (a.nr !== b.nr) return a.nr - b.nr;
    return a.id.localeCompare(b.id);
  });

  return { weeks, byWeek: resultByWeek };
};

const createInitialState = (): Pick<
  State,
  | "docs"
  | "docRows"
  | "weekData"
  | "customHomework"
  | "homeworkAdjustments"
  | "mijnVakken"
  | "huiswerkWeergave"
  | "theme"
  | "backgroundImage"
  | "surfaceOpacity"
  | "enableHomeworkEditing"
  | "enableCustomHomework"
  | "doneMap"
  | "weekIdxWO"
  | "niveauWO"
  | "leerjaarWO"
  | "matrixStartIdx"
  | "matrixCount"
  | "matrixNiveau"
  | "matrixLeerjaar"
  | "lastVisitedRoute"
> => ({
  docs: [],
  docRows: {},
  weekData: { weeks: [], byWeek: {} },
  customHomework: {},
  homeworkAdjustments: {},
  mijnVakken: [],
  huiswerkWeergave: "perOpdracht",
  theme: { ...defaultTheme },
  backgroundImage: null,
  surfaceOpacity: 100,
  enableHomeworkEditing: true,
  enableCustomHomework: true,
  doneMap: {},
  weekIdxWO: 0,
  niveauWO: "ALLE",
  leerjaarWO: "ALLE",
  matrixStartIdx: -1,
  matrixCount: 3,
  matrixNiveau: "ALLE",
  matrixLeerjaar: "ALLE",
  lastVisitedRoute: "/",
});

export const useAppStore = create<State>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      setDocs: (d) => {
        const prevDocs = get().docs;
        const prevEnabled = new Map(prevDocs.map((doc) => [doc.fileId, doc.enabled] as const));
        const nextDocs = d.map((doc) => {
          const normalizedVak = formatVakName(doc.vak);
          return {
            ...doc,
            vak: normalizedVak,
            enabled: prevEnabled.get(doc.fileId) ?? true,
          };
        });
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
        const normalizedVak = formatVakName(doc.vak);
        const nextDoc = { ...doc, vak: normalizedVak, enabled: true };
        const next = [...prevDocs, nextDoc];
        const hadVakBefore = prevDocs.some((existing) => existing.vak === normalizedVak);
        const mijnVakken = computeMijnVakken(next, get().mijnVakken, {
          ensure: hadVakBefore ? undefined : [normalizedVak],
        });
        const nextRows = { ...get().docRows };
        if (!nextRows[doc.fileId]) {
          nextRows[doc.fileId] = [];
        }
        const weekData = computeWeekAggregation(next, nextRows);
        set({ docs: next, mijnVakken, docRows: nextRows, weekData });
      },
      replaceDoc: (fileId, nextDoc) => {
        const normalizedVak = formatVakName(nextDoc.vak);
        const next = get().docs.map((x) =>
          x.fileId === fileId ? { ...nextDoc, vak: normalizedVak, enabled: x.enabled } : x
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

      addCustomHomework: (weekId, vak, text) => {
        const normalized = normalizeText(text, { preserveLineBreaks: true });
        if (!normalized) {
          return;
        }
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        set((state) => {
          const prevWeekEntries = state.customHomework[weekId] ?? {};
          const prevVakEntries = prevWeekEntries[vak] ?? [];
          const nextVakEntries = [
            ...prevVakEntries,
            { id, text: normalized, createdAt: new Date().toISOString() },
          ];
          const nextWeekEntries = { ...prevWeekEntries, [vak]: nextVakEntries };
          return {
            customHomework: { ...state.customHomework, [weekId]: nextWeekEntries },
          };
        });
      },
      removeCustomHomework: (weekId, vak, entryId) => {
        set((state) => {
          const weekEntries = state.customHomework[weekId];
          if (!weekEntries) {
            return {};
          }
          const vakEntries = weekEntries[vak];
          if (!vakEntries?.length) {
            return {};
          }
          const nextVakEntries = vakEntries.filter((entry) => entry.id !== entryId);
          const nextWeekEntries = { ...weekEntries };
          if (nextVakEntries.length) {
            nextWeekEntries[vak] = nextVakEntries;
          } else {
            delete nextWeekEntries[vak];
          }
          const nextCustomHomework = { ...state.customHomework };
          if (Object.keys(nextWeekEntries).length) {
            nextCustomHomework[weekId] = nextWeekEntries;
          } else {
            delete nextCustomHomework[weekId];
          }
          const customKey = `${weekId}:${vak}:custom:${entryId}`;
          const nextDoneMap = { ...state.doneMap };
          delete nextDoneMap[customKey];
          return { customHomework: nextCustomHomework, doneMap: nextDoneMap };
        });
      },
      updateCustomHomework: (weekId, vak, entryId, text) => {
        const normalized = normalizeText(text, { preserveLineBreaks: true });
        if (!normalized) {
          return;
        }
        set((state) => {
          const weekEntries = state.customHomework[weekId];
          if (!weekEntries) {
            return {};
          }
          const vakEntries = weekEntries[vak];
          if (!vakEntries?.length) {
            return {};
          }
          const idx = vakEntries.findIndex((entry) => entry.id === entryId);
          if (idx === -1) {
            return {};
          }
          const nextVakEntries = [...vakEntries];
          nextVakEntries[idx] = { ...nextVakEntries[idx], text: normalized };
          const nextWeekEntries = { ...weekEntries, [vak]: nextVakEntries };
          return {
            customHomework: { ...state.customHomework, [weekId]: nextWeekEntries },
          };
        });
      },
      hideHomeworkItem: (weekId, vak, itemKey) => {
        set((state) => {
          const nextAdjustments = { ...state.homeworkAdjustments };
          const weekEntries = { ...(nextAdjustments[weekId] ?? {}) };
          const current = weekEntries[vak] ?? { hidden: {}, overrides: {} };
          const hidden = { ...current.hidden, [itemKey]: true };
          const nextCurrent: HomeworkAdjustments = { hidden, overrides: { ...current.overrides } };
          weekEntries[vak] = nextCurrent;
          nextAdjustments[weekId] = weekEntries;
          const nextDoneMap = { ...state.doneMap };
          delete nextDoneMap[itemKey];
          return { homeworkAdjustments: nextAdjustments, doneMap: nextDoneMap };
        });
      },
      restoreHomeworkItem: (weekId, vak, itemKey) => {
        set((state) => {
          const nextAdjustments = { ...state.homeworkAdjustments };
          const weekEntries = { ...(nextAdjustments[weekId] ?? {}) };
          const current = weekEntries[vak];
          if (!current) {
            return {};
          }
          const hidden = { ...current.hidden };
          delete hidden[itemKey];
          const nextCurrent: HomeworkAdjustments = { hidden, overrides: { ...current.overrides } };
          if (!Object.keys(nextCurrent.hidden).length && !Object.keys(nextCurrent.overrides).length) {
            delete weekEntries[vak];
          } else {
            weekEntries[vak] = nextCurrent;
          }
          if (!Object.keys(weekEntries).length) {
            delete nextAdjustments[weekId];
          } else {
            nextAdjustments[weekId] = weekEntries;
          }
          return { homeworkAdjustments: nextAdjustments };
        });
      },
      overrideHomeworkItem: (weekId, vak, itemKey, text) => {
        const normalized = normalizeText(text, { preserveLineBreaks: true });
        if (!normalized) {
          return;
        }
        set((state) => {
          const nextAdjustments = { ...state.homeworkAdjustments };
          const weekEntries = { ...(nextAdjustments[weekId] ?? {}) };
          const current = weekEntries[vak] ?? { hidden: {}, overrides: {} };
          const overrides = { ...current.overrides, [itemKey]: normalized };
          const nextCurrent: HomeworkAdjustments = { hidden: { ...current.hidden }, overrides };
          weekEntries[vak] = nextCurrent;
          nextAdjustments[weekId] = weekEntries;
          return { homeworkAdjustments: nextAdjustments };
        });
      },
      clearHomeworkOverride: (weekId, vak, itemKey) => {
        set((state) => {
          const nextAdjustments = { ...state.homeworkAdjustments };
          const weekEntries = { ...(nextAdjustments[weekId] ?? {}) };
          const current = weekEntries[vak];
          if (!current) {
            return {};
          }
          const overrides = { ...current.overrides };
          delete overrides[itemKey];
          const nextCurrent: HomeworkAdjustments = { hidden: { ...current.hidden }, overrides };
          if (!Object.keys(nextCurrent.hidden).length && !Object.keys(nextCurrent.overrides).length) {
            delete weekEntries[vak];
          } else {
            weekEntries[vak] = nextCurrent;
          }
          if (!Object.keys(weekEntries).length) {
            delete nextAdjustments[weekId];
          } else {
            nextAdjustments[weekId] = weekEntries;
          }
          return { homeworkAdjustments: nextAdjustments };
        });
      },

      // ----------------------------
      // instellingen
      // ----------------------------
      setMijnVakken: (v) => set({ mijnVakken: v }),
      setHuiswerkWeergave: (mode) => set({ huiswerkWeergave: mode }),
      setThemeColor: (key, value) =>
        set((state) => ({ theme: { ...state.theme, [key]: value } })),
      resetTheme: () => set({ theme: { ...defaultTheme } }),
      setBackgroundImage: (value) => set({ backgroundImage: value }),
      resetBackgroundImage: () => set({ backgroundImage: null }),
      setSurfaceOpacity: (value) =>
        set(() => {
          const numeric = Number.isFinite(value) ? Math.round(value) : 100;
          const clamped = Math.min(100, Math.max(0, numeric));
          return { surfaceOpacity: clamped };
        }),
      resetSurfaceOpacity: () => set({ surfaceOpacity: 100 }),
      setEnableHomeworkEditing: (value) =>
        set(() => ({ enableHomeworkEditing: !!value })),
      setEnableCustomHomework: (value) =>
        set(() => ({ enableCustomHomework: !!value })),

      // ----------------------------
      // done-map
      // ----------------------------
      setDoneState: (key, value) =>
        set((s) => {
          const next = { ...s.doneMap };
          if (value) {
            next[key] = true;
          } else {
            delete next[key];
          }
          return { doneMap: next };
        }),
      toggleDone: (key) =>
        set((s) => {
          const next = { ...s.doneMap };
          if (next[key]) {
            delete next[key];
          } else {
            next[key] = true;
          }
          return { doneMap: next };
        }),

      // ----------------------------
      // weekoverzicht (UI state)
      // ----------------------------
      setWeekIdxWO: (n) => set({ weekIdxWO: n }),
      setNiveauWO: (n) => set({ niveauWO: n }),
      setLeerjaarWO: (j) => set({ leerjaarWO: j }),
      setMatrixStartIdx: (value) =>
        set(() => {
          const numeric = Number.isFinite(value) ? Math.floor(value) : -1;
          return { matrixStartIdx: Math.max(-1, numeric) };
        }),
      setMatrixCount: (value) =>
        set(() => {
          const numeric = Number.isFinite(value) ? Math.floor(value) : 3;
          const clamped = Math.min(6, Math.max(1, numeric));
          return { matrixCount: clamped };
        }),
      setMatrixNiveau: (n) =>
        set({ matrixNiveau: n === "HAVO" || n === "VWO" || n === "ALLE" ? n : "ALLE" }),
      setMatrixLeerjaar: (j) => {
        const next = j && j.trim() ? j : "ALLE";
        set({ matrixLeerjaar: next });
      },
      setLastVisitedRoute: (path) =>
        set((state) => {
          const sanitized = path && path.trim() ? path : "/";
          if (state.lastVisitedRoute === sanitized) {
            return {};
          }
          return { lastVisitedRoute: sanitized };
        }),

      resetAppState: () => {
        const initial = createInitialState();
        set(initial);
      },
    }),
    {
      name: "vlier-planner-state",
      version: 2,
      partialize: (state) => ({
        docs: state.docs,
        docRows: state.docRows,
        weekData: state.weekData,
        customHomework: state.customHomework,
        homeworkAdjustments: state.homeworkAdjustments,
        mijnVakken: state.mijnVakken,
        huiswerkWeergave: state.huiswerkWeergave,
        theme: state.theme,
        backgroundImage: state.backgroundImage,
        surfaceOpacity: state.surfaceOpacity,
        enableHomeworkEditing: state.enableHomeworkEditing,
        enableCustomHomework: state.enableCustomHomework,
        doneMap: state.doneMap,
        weekIdxWO: state.weekIdxWO,
        niveauWO: state.niveauWO,
        leerjaarWO: state.leerjaarWO,
        matrixStartIdx: state.matrixStartIdx,
        matrixCount: state.matrixCount,
        matrixNiveau: state.matrixNiveau,
        matrixLeerjaar: state.matrixLeerjaar,
        lastVisitedRoute: state.lastVisitedRoute,
      }),
    }
  )
);

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
