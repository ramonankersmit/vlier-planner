import { create } from "zustand";
import { sampleDocsInitial, type DocMeta } from "../data/sampleDocs";

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

  // ==== weekoverzicht ====
  weekIdxWO: number;
  setWeekIdxWO: (n: number) => void;
  niveauWO: "HAVO" | "VWO" | "ALLE";
  setNiveauWO: (n: "HAVO" | "VWO" | "ALLE") => void;
  leerjaarWO: string;
  setLeerjaarWO: (j: string) => void;
};

const uniqSorted = (arr: string[]) => Array.from(new Set(arr)).sort();

export const useAppStore = create<State>((set, get) => ({
  // documenten
  docs: sampleDocsInitial,
  setDocs: (d) => {
    set({ docs: d });
    // sync mijnVakken met beschikbare vakken
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

  // instellingen
  mijnVakken: uniqSorted(sampleDocsInitial.map((d) => d.vak)),
  setMijnVakken: (v) => set({ mijnVakken: v }),

  // done-map
  doneMap: {},
  toggleDone: (key) =>
    set((s) => ({ doneMap: { ...s.doneMap, [key]: !s.doneMap[key] } })),

  // weekoverzicht
  weekIdxWO: 0,
  setWeekIdxWO: (n) => set({ weekIdxWO: n }),
  niveauWO: "VWO",
  setNiveauWO: (n) => set({ niveauWO: n }),
  leerjaarWO: "4",
  setLeerjaarWO: (j) => set({ leerjaarWO: j }),
}));

export async function hydrateDocsFromApi() {
  const { setDocs } = useAppStore.getState();
  try {
    const { apiListDocs } = await import("../lib/api");
    const docs = await apiListDocs();
    setDocs(docs as any);
  } catch (e) {
    console.warn("Kon docs niet hydrateren:", e);
  }
}

