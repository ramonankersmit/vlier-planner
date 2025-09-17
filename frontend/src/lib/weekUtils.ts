import type { WeekInfo } from "../app/store";

const dayMonthFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
});

const dayMonthYearFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const toDate = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

export const formatRange = (w: WeekInfo) => {
  const hasStart = !!w.start;
  const hasEnd = !!w.end;
  if (hasStart && hasEnd) return `${w.start} – ${w.end}`;
  if (hasStart) return w.start;
  if (hasEnd) return w.end;
  return `Week ${w.nr}`;
};

export const formatWeekDateRange = (w: WeekInfo): string | null => {
  const start = toDate(w.start);
  const end = toDate(w.end);
  if (start && end) {
    if (start.getFullYear() === end.getFullYear()) {
      const base = `${dayMonthFormatter.format(start)} – ${dayMonthFormatter.format(end)}`;
      return `${base} ${start.getFullYear()}`;
    }
    return `${dayMonthYearFormatter.format(start)} – ${dayMonthYearFormatter.format(end)}`;
  }
  if (start) return dayMonthYearFormatter.format(start);
  if (end) return dayMonthYearFormatter.format(end);
  return null;
};

export const formatWeekWindowLabel = (weeks: WeekInfo[]): string => {
  if (!weeks.length) return "Geen data";
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const sameWeek = first.id === last.id;
  let weekLabel: string;
  if (sameWeek) {
    weekLabel = `Week ${first.nr}`;
  } else if (first.isoYear === last.isoYear) {
    weekLabel = `Week ${first.nr}–${last.nr}`;
  } else {
    weekLabel = `Week ${first.nr}/${first.isoYear} – ${last.nr}/${last.isoYear}`;
  }
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

export const calcCurrentWeekIdx = (weeks: WeekInfo[], today: Date = new Date()): number => {
  if (!weeks.length) return 0;
  const base = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayMs = base.getTime();
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;

  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    const startMs = w.start ? Date.parse(`${w.start}T00:00:00Z`) : Number.NaN;
    const endMs = w.end ? Date.parse(`${w.end}T23:59:59Z`) : Number.NaN;
    const hasStart = Number.isFinite(startMs);
    const hasEnd = Number.isFinite(endMs);

    if (hasStart && hasEnd && startMs <= todayMs && todayMs <= endMs) {
      return i;
    }

    let dist = Number.POSITIVE_INFINITY;
    if (hasStart && hasEnd) {
      if (todayMs < startMs) {
        dist = startMs - todayMs;
      } else if (todayMs > endMs) {
        dist = todayMs - endMs;
      }
    } else if (hasStart) {
      dist = Math.abs(todayMs - startMs);
    } else if (hasEnd) {
      dist = Math.abs(endMs - todayMs);
    }

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
  targetWeekId?: string
) => {
  if (!weeks.length) return 0;
  const maxStart = Math.max(0, weeks.length - windowSize);
  if (!targetWeekId) return 0;
  const idx = weeks.findIndex((w) => w.id === targetWeekId);
  if (idx === -1) return 0;
  const desired = idx - Math.floor(windowSize / 2);
  return Math.max(0, Math.min(desired, maxStart));
};
