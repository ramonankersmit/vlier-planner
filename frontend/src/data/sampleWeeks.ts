export type Week = { nr: number; start: string; end: string };

export const sampleWeeks: Week[] = [
  { nr: 36, start: "2025-09-01", end: "2025-09-05" },
  { nr: 37, start: "2025-09-08", end: "2025-09-12" },
  { nr: 38, start: "2025-09-15", end: "2025-09-19" },
  { nr: 39, start: "2025-09-22", end: "2025-09-26" },
  { nr: 40, start: "2025-09-29", end: "2025-10-03" },
  { nr: 41, start: "2025-10-06", end: "2025-10-10" },
];

export const formatRange = (w: Week) => `${w.start} – ${w.end}`;

export const formatHumanDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

/** Bepaal index van ‘huidige’ week op basis van today (in lokale tijd). */
export const calcCurrentWeekIdx = (today: Date = new Date()): number => {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  // vind eerste week waarvan start <= today <= end; anders dichtstbijzijnde
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sampleWeeks.length; i++) {
    const w = sampleWeeks[i];
    const s = new Date(w.start).getTime();
    const e = new Date(w.end).getTime();
    const inRange = t >= s && t <= e;
    if (inRange) return i;
    // afstand tot start en eind — kies dichtstbijzijnde
    const dist = Math.min(Math.abs(t - s), Math.abs(t - e));
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
};

// Sleutel op vaknaam (niet fileId)
export type WeekData = {
  lesstof?: string;
  huiswerk?: string;      // '—' of undefined = geen checkbox
  deadlines?: string;     // '—' of undefined = geen badge
  opmerkingen?: string;
  date?: string;          // ISO datum indien aanwezig
};

export const sampleByWeek: Record<number, Record<string, WeekData>> = {
  36: {
    Aardrijkskunde: { lesstof: "Wereldbeeld 2.1", huiswerk: "Par. 2.1: opg 1–6", deadlines: "—", opmerkingen: "—" },
    Duits:          { lesstof: "Kapitel 3: Lesen & Hören", huiswerk: "Vokabeln S. 44–45", deadlines: "Vokabeltest (vr.)", opmerkingen: "Boek meenemen", date: "2025-09-12" },
    Engels:         { lesstof: "Unit 2: Persuasive writing", huiswerk: "Draft paragraph", deadlines: "Essay outline (do.)", date: "2025-09-11" },
  },
  37: {
    Aardrijkskunde: { lesstof: "Wereldbeeld 2.2", huiswerk: "Par. 2.2: opg 1–4", deadlines: "—" },
    Duits:          { lesstof: "Kapitel 3: Schreiben", huiswerk: "Schreibübung S. 47", deadlines: "—" },
    Frans:          { lesstof: "Grammaire: passé composé", huiswerk: "Ex. 5–8", deadlines: "—" },
  },
  38: {
    Frans:            { lesstof: "La ville – vocabulaire", huiswerk: "Vocab quiz", deadlines: "Luistertoets (vr.)", date: "2025-09-19" },
    Bedrijfseconomie: { lesstof: "Kasstromen", huiswerk: "Opgaven 4.1–4.2", deadlines: "—" },
  },
};
