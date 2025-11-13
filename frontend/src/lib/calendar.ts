const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (value: number) => value.toString().padStart(2, "0");

export const makeWeekId = (isoYear: number, week: number): string =>
  `${isoYear}-W${pad2(Math.max(1, Math.min(week, 53)))}`;

const normalizeWeekNumber = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const truncated = Math.trunc(value);
  if (truncated < 1 || truncated > 53) {
    return null;
  }
  return truncated;
};

const WEEK_COUNT = 53;

const weekDistance = (a: number, b: number): number => {
  const direct = Math.abs(a - b);
  const wrap = Math.abs(Math.min(a, b) + WEEK_COUNT - Math.max(a, b));
  return Math.min(direct, wrap);
};

export const expandWeekRange = (
  beginWeek?: number | null,
  endWeek?: number | null,
): number[] => {
  const start = normalizeWeekNumber(beginWeek);
  const end = normalizeWeekNumber(endWeek);

  if (start == null && end == null) {
    return [];
  }

  if (start != null && end == null) {
    return [start];
  }

  if (start == null && end != null) {
    return [end];
  }

  if (start === end) {
    return [start];
  }

  const result: number[] = [];
  if (start! < end!) {
    for (let wk = start!; wk <= end!; wk++) {
      result.push(wk);
    }
    return result;
  }

  for (let wk = start!; wk <= 53; wk++) {
    result.push(wk);
  }
  for (let wk = 1; wk <= end!; wk++) {
    result.push(wk);
  }
  return result;
};

export const isWeekInRange = (
  week: number | null | undefined,
  beginWeek?: number | null,
  endWeek?: number | null,
): boolean => {
  const normalized = normalizeWeekNumber(week);
  if (normalized == null) {
    return false;
  }
  const range = expandWeekRange(beginWeek, endWeek);
  return range.includes(normalized);
};

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

export const canonicalizeIsoWeek = (
  week: number,
  isoYear: number,
): { week: number; isoYear: number } => {
  if (!Number.isFinite(week) || !Number.isFinite(isoYear)) {
    return { week, isoYear };
  }
  const start = getIsoWeekStart(isoYear, week);
  const canonicalWeek = getIsoWeek(start);
  const canonicalYear = getIsoWeekYear(start);
  return { week: canonicalWeek, isoYear: canonicalYear };
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
  return resolveWeekIdentifier(week, options).isoYear;
};

export const resolveWeekIdentifier = (
  week: number,
  options: {
    schooljaar?: string | null;
    candidateDates?: (string | null | undefined)[];
    today?: Date;
  } = {}
): { week: number; isoYear: number } => {
  const normalized = normalizeWeekNumber(week);
  const fallbackWeek = normalized ?? 1;
  const { schooljaar, candidateDates = [], today } = options;

  const parsedCandidates = candidateDates
    .map((value) => parseIsoDate(value ?? undefined))
    .filter((value): value is Date => value instanceof Date);

  if (normalized != null && parsedCandidates.length > 0) {
    const candidateInfos = parsedCandidates.map((date) => ({
      isoWeek: getIsoWeek(date),
      isoYear: getIsoWeekYear(date),
      time: date.getTime(),
    }));

    const exact = candidateInfos.find((info) => info.isoWeek === normalized);
    if (exact) {
      return canonicalizeIsoWeek(normalized, exact.isoYear);
    }

    const best = candidateInfos
      .map((info) => ({
        ...info,
        distance: weekDistance(info.isoWeek, normalized),
      }))
      .sort((a, b) => {
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }
        return a.time - b.time;
      })[0];

    if (best) {
      return canonicalizeIsoWeek(best.isoWeek, best.isoYear);
    }
  }

  const schooljaarStart = parseSchoolyearStart(schooljaar);
  if (typeof schooljaarStart === "number") {
    const isoYear = fallbackWeek >= 30 ? schooljaarStart : schooljaarStart + 1;
    return canonicalizeIsoWeek(fallbackWeek, isoYear);
  }

  const base = today
    ? new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    : TODAY_UTC();
  const baseIsoYear = getIsoWeekYear(base);
  const candidates = [baseIsoYear - 1, baseIsoYear, baseIsoYear + 1];
  let bestYear = baseIsoYear;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const isoYear of candidates) {
    const start = getIsoWeekStart(isoYear, fallbackWeek);
    const dist = Math.abs(start.getTime() - base.getTime());
    if (dist < bestDist) {
      bestDist = dist;
      bestYear = isoYear;
    }
  }
  return canonicalizeIsoWeek(fallbackWeek, bestYear);
};
