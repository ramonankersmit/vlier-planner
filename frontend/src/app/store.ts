import { create } from "zustand";

/**
 * Houd deze DocMeta shape in sync met de backend (app.py).
 * We gebruiken hier geen sample data meer; de app hydrate via de API.
 */
export type DocMeta = {
  fileId: string;
  bestand: string;
  vak: string;
  niveau: "HAVO" | "VWO";
  leerjaar: string;      // "1".."6"
  periode: number;       // 1..4
  beginWeek: number;
  eindWeek: number;
  schooljaar?: string | null;
};

export type DocRecord = DocMeta & { enabled: boolean };

type State = {
  // ==== documenten (globaal) ====
  docs: DocRecord[];
  setDocs: (d: DocMeta[]) => void;
  removeDoc: (fileId: string) => void;
  addDoc: (doc: DocMeta) => void;
  replaceDoc: (fileId: string, next: DocMeta) => void;
  setDocEnabled: (fileId: string, enabled: boolean) => void;

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

const computeMijnVakken = (docs: DocRecord[], prev: string[]) => {
  const active = docs.filter((d) => d.enabled);
  const activeVakken = uniqSorted(active.map((x) => x.vak));
  const nextSelection = prev.filter((v) => activeVakken.includes(v));
  return nextSelection.length ? nextSelection : activeVakken;
};

export const useAppStore = create<State>((set, get) => ({
  // ----------------------------
  // documenten
  // ----------------------------
  docs: [], // start leeg; wordt gehydrate via API
  setDocs: (d) => {
    const prevEnabled = new Map(get().docs.map((doc) => [doc.fileId, doc.enabled] as const));
    const nextDocs = d.map((doc) => ({
      ...doc,
      enabled: prevEnabled.get(doc.fileId) ?? true,
    }));
    const mijnVakken = computeMijnVakken(nextDocs, get().mijnVakken);
    set({ docs: nextDocs, mijnVakken });
  },
  removeDoc: (fileId) => {
    const next = get()
      .docs
      .filter((x) => x.fileId !== fileId);
    const mijnVakken = computeMijnVakken(next, get().mijnVakken);
    set({ docs: next, mijnVakken });
  },
  addDoc: (doc) => {
    const next = [...get().docs, { ...doc, enabled: true }];
    const mijnVakken = computeMijnVakken(next, get().mijnVakken);
    set({ docs: next, mijnVakken });
  },
  replaceDoc: (fileId, nextDoc) => {
    const next = get().docs.map((x) =>
      x.fileId === fileId ? { ...nextDoc, enabled: x.enabled } : x
    );
    const mijnVakken = computeMijnVakken(next, get().mijnVakken);
    set({ docs: next, mijnVakken });
  },
  setDocEnabled: (fileId, enabled) => {
    const next = get().docs.map((x) =>
      x.fileId === fileId ? { ...x, enabled } : x
    );
    const mijnVakken = computeMijnVakken(next, get().mijnVakken);
    set({ docs: next, mijnVakken });
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
  niveauWO: "VWO",
  setNiveauWO: (n) => set({ niveauWO: n }),
  leerjaarWO: "4",
  setLeerjaarWO: (j) => set({ leerjaarWO: j }),
}));

/**
 * Helper om bij app-start de docs uit de backend te laden.
 * (Dynamische import voorkomt bundling/circular issues.)
 */
export async function hydrateDocsFromApi() {
  try {
    const { apiListDocs } = await import("../lib/api");
    const docs = await apiListDocs();
    useAppStore.getState().setDocs(docs as DocMeta[]);
  } catch (e) {
    console.warn("Kon docs niet hydrateren:", e);
  }
}
