const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (value: number) => value.toString().padStart(2, "0");

export const makeWeekId = (isoYear: number, week: number): string =>
  `${isoYear}-W${pad2(Math.max(1, Math.min(week, 53)))}`;

export const parseSchoolyearStart = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const match = String(value).match(/\d{4}/);
  if (!match) return undefined;
  const yr = Number(match[0]);
  return Number.isFinite(yr) ? yr : undefined;
};

export const getIsoWeek = (date: Date): number => {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

export const getIsoWeekYear = (date: Date): number => {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  return target.getUTCFullYear();
};

export const getIsoWeekStart = (isoYear: number, week: number): Date => {
  const fourthJan = new Date(Date.UTC(isoYear, 0, 4));
  const fourthDay = fourthJan.getUTCDay() || 7;
  const monday = new Date(fourthJan);
  monday.setUTCDate(fourthJan.getUTCDate() - (fourthDay - 1) + (week - 1) * 7);
  return monday;
};

export const getIsoWeekEnd = (isoYear: number, week: number): Date => {
  const start = getIsoWeekStart(isoYear, week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return end;
};

export const formatIsoDate = (date: Date): string => {
  const yr = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  return `${yr}-${month}-${day}`;
};

export const parseIsoDate = (value: string | undefined | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(ISO_DATE_RE);
  if (!match) return null;
  const [, y, m, d] = match;
  const yr = Number(y);
  const month = Number(m) - 1;
  const day = Number(d);
  if (!Number.isFinite(yr) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(Date.UTC(yr, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const TODAY_UTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

export const deriveIsoYearForWeek = (
  week: number,
  options: {
    schooljaar?: string | null;
    candidateDates?: (string | null | undefined)[];
    today?: Date;
  } = {}
): number => {
  const { schooljaar, candidateDates = [], today } = options;
  for (const candidate of candidateDates) {
    const parsed = parseIsoDate(candidate ?? undefined);
    if (!parsed) continue;
    const wk = getIsoWeek(parsed);
    if (week && wk !== week) continue;
    return getIsoWeekYear(parsed);
  }

  const schooljaarStart = parseSchoolyearStart(schooljaar);
  if (typeof schooljaarStart === "number") {
    return week >= 30 ? schooljaarStart : schooljaarStart + 1;
  }

  const base = today ? new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) : TODAY_UTC();
  const baseIsoYear = getIsoWeekYear(base);
  const candidates = [baseIsoYear - 1, baseIsoYear, baseIsoYear + 1];
  let bestYear = baseIsoYear;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const isoYear of candidates) {
    const start = getIsoWeekStart(isoYear, week);
    const dist = Math.abs(start.getTime() - base.getTime());
    if (dist < bestDist) {
      bestDist = dist;
      bestYear = isoYear;
    }
  }
  return bestYear;
};
