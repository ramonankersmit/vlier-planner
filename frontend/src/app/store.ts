import { create } from "zustand";
import { sampleDocsInitial } from "../data/sampleDocs";

type State = {
  // instellingen
  mijnVakken: string[];

  // afvinkstatus gedeeld tussen views
  doneMap: Record<string, boolean>;          // key: `${weekNr}:${vak}`

  // weekoverzicht
  weekIdxWO: number;
  niveauWO: "HAVO" | "VWO" | "ALLE";
  leerjaarWO: string;

  // setters/actions
  setMijnVakken: (v: string[]) => void;
  toggleDone: (key: string) => void;

  setWeekIdxWO: (n: number) => void;
  setNiveauWO: (n: "HAVO" | "VWO" | "ALLE") => void;
  setLeerjaarWO: (j: string) => void;
};

const initialVakken = Array.from(new Set(sampleDocsInitial.map(d => d.vak))).sort();

export const useAppStore = create<State>((set) => ({
  mijnVakken: initialVakken,
  doneMap: {},
  weekIdxWO: 0,
  niveauWO: "VWO",
  leerjaarWO: "4",

  setMijnVakken: (v) => set({ mijnVakken: v }),
  toggleDone: (key) => set(s => ({ doneMap: { ...s.doneMap, [key]: !s.doneMap[key] } })),

  setWeekIdxWO: (n) => set({ weekIdxWO: n }),
  setNiveauWO: (n) => set({ niveauWO: n }),
  setLeerjaarWO: (j) => set({ leerjaarWO: j }),
}));
