import type { WeekInfo } from "../app/store";

export const formatRange = (w: WeekInfo) => {
  const hasStart = !!w.start;
  const hasEnd = !!w.end;
  if (hasStart && hasEnd) return `${w.start} – ${w.end}`;
  if (hasStart) return w.start;
  if (hasEnd) return w.end;
  return `Week ${w.nr}`;
};

export const formatWeekWindowLabel = (weeks: WeekInfo[]): string => {
  if (!weeks.length) return "Geen data";
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const sameWeek = first.nr === last.nr;
  const weekLabel = sameWeek ? `Week ${first.nr}` : `Week ${first.nr}–${last.nr}`;
  const start = first.start || last.start || "";
  const end = last.end || first.end || "";
  if (start && end) return `${weekLabel} · ${start} – ${end}`;
  if (start) return `${weekLabel} · ${start}`;
  if (end) return `${weekLabel} · ${end}`;
  return weekLabel;
};

export const formatHumanDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

const getIsoWeek = (date: Date): number => {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

export const calcCurrentWeekIdx = (weeks: WeekInfo[], today: Date = new Date()): number => {
  if (!weeks.length) return 0;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayMs = base.getTime();
  const currentWeekNr = getIsoWeek(base);
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;

  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    const startMs = w.start ? Date.parse(w.start) : Number.NaN;
    const endMs = w.end ? Date.parse(w.end) : Number.NaN;
    const hasStart = Number.isFinite(startMs);
    const hasEnd = Number.isFinite(endMs);

    if (hasStart && hasEnd) {
      if (todayMs >= startMs && todayMs <= endMs) {
        return i;
      }
      const dist = Math.min(Math.abs(todayMs - startMs), Math.abs(todayMs - endMs));
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
      continue;
    }

    if (hasStart) {
      const dist = Math.abs(todayMs - startMs);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
      continue;
    }

    if (hasEnd) {
      const dist = Math.abs(todayMs - endMs);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
      continue;
    }

    const dist = Math.abs(w.nr - currentWeekNr);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestIdx;
};

export const computeWindowStartForWeek = (
  weeks: WeekInfo[],
  windowSize: number,
  targetWeekNr?: number
) => {
  if (!weeks.length) return 0;
  const maxStart = Math.max(0, weeks.length - windowSize);
  if (!targetWeekNr) return 0;
  let idx = weeks.findIndex((w) => w.nr === targetWeekNr);
  if (idx === -1) {
    idx = weeks.findIndex((w) => w.nr > targetWeekNr);
    if (idx === -1) idx = weeks.length - 1;
  }
  const desired = idx - Math.floor(windowSize / 2);
  return Math.max(0, Math.min(desired, maxStart));
};
