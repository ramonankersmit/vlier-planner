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

type State = {
  // ==== documenten (globaal) ====
  docs: DocMeta[];
  setDocs: (d: DocMeta[]) => void;
  removeDoc: (fileId: string) => void;
  addDoc: (doc: DocMeta) => void;
  replaceDoc: (fileId: string, next: DocMeta) => void;

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

export const useAppStore = create<State>((set, get) => ({
  // ----------------------------
  // documenten
  // ----------------------------
  docs: [], // start leeg; wordt gehydrate via API
  setDocs: (d) => {
    set({ docs: d });
    // sync Mijn Vakken met beschikbare vakken uit docs
    const mk = uniqSorted(d.map((x) => x.vak));
    set({ mijnVakken: mk });
  },
  removeDoc: (fileId) => {
    const next = get().docs.filter((x) => x.fileId !== fileId);
    get().setDocs(next);
  },
  addDoc: (doc) => {
    const next = [...get().docs, doc];
    get().setDocs(next);
  },
  replaceDoc: (fileId, nextDoc) => {
    const next = get().docs.map((x) => (x.fileId === fileId ? nextDoc : x));
    get().setDocs(next);
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
