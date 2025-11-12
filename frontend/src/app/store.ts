import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CommitResponse,
  DocDiff,
  DocMeta as ApiDocMeta,
  DocRow,
  ReviewDraft,
  StudyGuide,
  StudyGuideVersion,
} from "../lib/api";
import {
  expandWeekRange,
  formatIsoDate,
  getIsoWeek,
  getIsoWeekEnd,
  getIsoWeekStart,
  getIsoWeekYear,
  canonicalizeIsoWeek,
  makeWeekId,
  parseIsoDate,
  resolveWeekIdentifier,
} from "../lib/calendar";
import { splitHomeworkItems } from "../lib/textUtils";

/**
 * Houd deze DocMeta shape in sync met de backend (app.py).
 * We gebruiken hier geen sample data meer; de app hydrate via de API.
 */
export type DocMeta = ApiDocMeta;

export type DocRecord = DocMeta & { enabled: boolean };

export type WeekInfo = { id: string; nr: number; isoYear: number; start: string; end: string };

export type MultiWeekSpanInfo = {
  sourceRowId?: string;
  label?: string;
  fromWeek: number;
  toWeek: number;
  role: "start" | "continue";
  startDate?: string;
  endDate?: string;
};

export type WeekData = {
  lesstof?: string;
  huiswerk?: string;
  huiswerkItems?: string[];
  deadlines?: string;
  opmerkingen?: string;
  date?: string;
  multiWeekSpans?: MultiWeekSpanInfo[];
};

export type VacationWeekInfo = {
  id: string;
  name: string;
  region: string;
  startDate: string;
  endDate: string;
  schoolYear: string;
  label: string;
};

export type SchoolVacation = {
  id: string;
  externalId?: string | null;
  name: string;
  region: string;
  startDate: string;
  endDate: string;
  schoolYear: string;
  source: string;
  label: string;
  rawText?: string | null;
  notes?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WeekAggregation = {
  weeks: WeekInfo[];
  byWeek: Record<string, Record<string, WeekData>>;
  vacationsByWeek: Record<string, VacationWeekInfo[]>;
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

export type ThemePreset = {
  id: string;
  name: string;
  settings: ThemeSettings;
  backgroundImage: string | null;
  surfaceOpacity: number;
  builtIn?: boolean;
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

const darkTheme: ThemeSettings = {
  background: "#0f172a",
  surface: "#1e293b",
  accent: "#38bdf8",
  text: "#e2e8f0",
  muted: "#94a3b8",
  border: "#334155",
  accentText: "#0f172a",
};

const builtinThemePresets: ThemePreset[] = [
  {
    id: "default",
    name: "Standaard",
    settings: defaultTheme,
    backgroundImage: null,
    surfaceOpacity: 100,
    builtIn: true,
  },
  {
    id: "dark",
    name: "Donker",
    settings: darkTheme,
    backgroundImage: null,
    surfaceOpacity: 90,
    builtIn: true,
  },
];

const builtinThemeIds = new Set(builtinThemePresets.map((preset) => preset.id));

const cloneThemeSettings = (theme: ThemeSettings): ThemeSettings => ({ ...theme });

const clampSurfaceOpacity = (value?: number): number => {
  const numeric = Number.isFinite(value) ? Math.round(value as number) : 100;
  return Math.min(100, Math.max(0, numeric));
};

const createThemePresets = (customPresets: ThemePreset[] = []): ThemePreset[] => {
  const custom = customPresets
    .filter((preset) => !builtinThemeIds.has(preset.id))
    .map((preset) => ({
      id: preset.id,
      name: preset.name,
      builtIn: false,
      settings: cloneThemeSettings(preset.settings),
      backgroundImage: preset.backgroundImage ?? null,
      surfaceOpacity: clampSurfaceOpacity(preset.surfaceOpacity),
    }));
  return [
    ...builtinThemePresets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      builtIn: true,
      settings: cloneThemeSettings(preset.settings),
      backgroundImage: preset.backgroundImage ?? null,
      surfaceOpacity: clampSurfaceOpacity(preset.surfaceOpacity),
    })),
    ...custom,
  ];
};

const resolveActiveThemeState = (
  presets: ThemePreset[],
  activeThemeId?: string
): {
  presets: ThemePreset[];
  activeThemeId: string;
  theme: ThemeSettings;
  backgroundImage: string | null;
  surfaceOpacity: number;
} => {
  const fallbackPreset =
    presets.find((preset) => preset.id === activeThemeId) ??
    presets.find((preset) => preset.id === "default") ??
    presets[0] ??
    builtinThemePresets[0];
  return {
    presets,
    activeThemeId: fallbackPreset?.id ?? "default",
    theme: cloneThemeSettings(fallbackPreset?.settings ?? defaultTheme),
    backgroundImage: fallbackPreset?.backgroundImage ?? null,
    surfaceOpacity: fallbackPreset?.surfaceOpacity ?? 100,
  };
};

type State = {
  // ==== documenten (globaal) ====
  docs: DocRecord[];
  docsInitialized: boolean;
  setDocs: (d: DocMeta[]) => void;
  removeDoc: (fileId: string) => void;
  addDoc: (doc: DocMeta) => void;
  replaceDoc: (fileId: string, next: DocMeta) => void;
  setDocEnabled: (fileId: string, enabled: boolean) => void;
  docRows: Record<string, DocRow[]>;
  setDocRows: (fileId: string, rows: DocRow[]) => void;
  setDocRowsBulk: (entries: Record<string, DocRow[]>) => void;
  studyGuides: StudyGuide[];
  guideVersions: Record<string, StudyGuideVersion[]>;
  guideDiffs: Record<string, Record<number, DocDiff>>;
  versionRows: Record<string, Record<number, DocRow[]>>;
  selectedGuideId: string | null;
  selectedVersionId: number | null;
  setStudyGuides: (guides: StudyGuide[]) => void;
  setGuideVersions: (guideId: string, versions: StudyGuideVersion[]) => void;
  setGuideDiff: (guideId: string, versionId: number, diff: DocDiff) => void;
  setVersionRows: (guideId: string, versionId: number, rows: DocRow[]) => void;
  selectGuideVersion: (guideId: string, versionId: number | null) => void;
  clearGuideSelection: () => void;
  pendingReviews: Record<string, ReviewDraft>;
  setPendingReview: (review: ReviewDraft) => void;
  removePendingReview: (parseId: string) => void;
  activeReviewId: string | null;
  setActiveReview: (parseId: string | null) => void;
  applyCommitResult: (commit: CommitResponse, rows: DocRow[], diff?: DocDiff) => void;
  weekData: WeekAggregation;
  schoolVacations: SchoolVacation[];
  setSchoolVacations: (entries: SchoolVacation[]) => void;
  addSchoolVacations: (entries: SchoolVacation[]) => void;
  updateSchoolVacation: (id: string, update: Partial<SchoolVacation>) => void;
  removeSchoolVacation: (id: string) => void;
  clearSchoolVacations: () => void;
  setSchoolVacationActive: (id: string, active: boolean) => void;
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
  themePresets: ThemePreset[];
  activeThemeId: string;
  setActiveTheme: (id: string) => void;
  addCustomTheme: (name: string) => void;
  updateCustomTheme: (
    id: string,
    update: {
      name?: string;
      settings?: ThemeSettings;
      backgroundImage?: string | null;
      surfaceOpacity?: number;
    }
  ) => void;
  removeCustomTheme: (id: string) => void;
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
  enableAutoUpdate: boolean;
  setEnableAutoUpdate: (value: boolean) => void;

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
  weekPeriode: string;
  setWeekPeriode: (p: string) => void;
  // ==== matrix (UI state) ====
  matrixStartIdx: number;
  setMatrixStartIdx: (n: number) => void;
  matrixCount: number;
  setMatrixCount: (n: number) => void;
  matrixNiveau: "HAVO" | "VWO" | "ALLE";
  setMatrixNiveau: (n: "HAVO" | "VWO" | "ALLE") => void;
  matrixLeerjaar: string;
  setMatrixLeerjaar: (j: string) => void;
  matrixPeriode: string;
  setMatrixPeriode: (p: string) => void;
  eventsPeriode: string;
  setEventsPeriode: (p: string) => void;
  lastVisitedRoute: string;
  setLastVisitedRoute: (path: string) => void;
  markDocsInitialized: () => void;
  resetAppState: () => void;
};

const uniqSorted = (arr: string[]) => Array.from(new Set(arr)).sort();

const formatVakName = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase("nl-NL") + trimmed.slice(1);
};

const uploadedAtTimestamp = (value?: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  const normalized = value.trim().replace(/Z$/, "+00:00");
  const fallback = Date.parse(normalized);
  return Number.isNaN(fallback) ? 0 : fallback;
};

const generateId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const sortVacations = (entries: SchoolVacation[]): SchoolVacation[] =>
  [...entries].sort((a, b) => {
    if (a.startDate !== b.startDate) {
      return a.startDate.localeCompare(b.startDate);
    }
    if (a.endDate !== b.endDate) {
      return a.endDate.localeCompare(b.endDate);
    }
    const nameCompare = a.name.localeCompare(b.name, "nl-NL");
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return a.region.localeCompare(b.region, "nl-NL");
  });

const sortDocsByUploadedAt = <T extends { uploadedAt?: string | null }>(docs: T[]): T[] =>
  [...docs].sort(
    (a, b) => uploadedAtTimestamp(b.uploadedAt) - uploadedAtTimestamp(a.uploadedAt)
  );

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
  docRows: Record<string, DocRow[]>,
  vacations: SchoolVacation[]
): WeekAggregation => {
  const activeVacations = vacations.filter((vac) => vac.active !== false);
  if (!docs.length && !activeVacations.length) {
    return { weeks: [], byWeek: {}, vacationsByWeek: {} };
  }

  const weekInfoMap = new Map<string, WeekInfo>();
  const byWeek = new Map<string, Record<string, WeekAccumulator>>();
  const multiWeekByWeek = new Map<string, Record<string, MultiWeekSpanInfo[]>>();
  const ensureWeek = (weekNr: number, isoYear: number) => {
    const { week, isoYear: canonicalYear } = canonicalizeIsoWeek(weekNr, isoYear);
    const weekId = makeWeekId(canonicalYear, week);
    if (!weekInfoMap.has(weekId)) {
      const startDate = getIsoWeekStart(canonicalYear, week);
      const endDate = getIsoWeekEnd(canonicalYear, week);
      weekInfoMap.set(weekId, {
        id: weekId,
        nr: week,
        isoYear: canonicalYear,
        start: formatIsoDate(startDate),
        end: formatIsoDate(endDate),
      });
    }
    if (!byWeek.has(weekId)) {
      byWeek.set(weekId, {});
    }
    return { weekId, vakMap: byWeek.get(weekId)! };
  };
  const registerMultiWeekSpan = (
    weekId: string,
    vak: string,
    info: MultiWeekSpanInfo,
  ) => {
    const entry = multiWeekByWeek.get(weekId) ?? {};
    const list = entry[vak] ?? [];
    const exists = list.some(
      (span) => span.sourceRowId === info.sourceRowId && span.role === info.role,
    );
    if (!exists) {
      list.push(info);
    }
    entry[vak] = list;
    multiWeekByWeek.set(weekId, entry);
  };
  const today = new Date();

  const vacationWeekRegistrations: {
    weekId: string;
    isoYear: number;
    week: number;
    info: VacationWeekInfo;
  }[] = [];
  const vacationWeekSet = new Set<string>();

  const registerVacationWeek = (isoYear: number, week: number, vacation: SchoolVacation) => {
    const { week: canonicalWeek, isoYear: canonicalYear } = canonicalizeIsoWeek(week, isoYear);
    const weekId = makeWeekId(canonicalYear, canonicalWeek);
    vacationWeekRegistrations.push({
      weekId,
      isoYear: canonicalYear,
      week: canonicalWeek,
      info: {
        id: vacation.id,
        name: vacation.name,
        region: vacation.region,
        startDate: vacation.startDate,
        endDate: vacation.endDate,
        schoolYear: vacation.schoolYear,
        label: vacation.label,
      },
    });
    vacationWeekSet.add(weekId);
  };

  const shiftStartToSchoolWeek = (startDate: Date, endDate: Date) => {
    const aligned = new Date(startDate);
    const day = aligned.getUTCDay();
    if (day === 6) {
      aligned.setUTCDate(aligned.getUTCDate() + 2);
    } else if (day === 0) {
      aligned.setUTCDate(aligned.getUTCDate() + 1);
    }
    if (aligned.getTime() > endDate.getTime()) {
      return new Date(startDate);
    }
    return aligned;
  };

  for (const vacation of activeVacations) {
    const start = parseIsoDate(vacation.startDate);
    const end = parseIsoDate(vacation.endDate);
    if (!start || !end) {
      continue;
    }
    let startDate = start;
    let endDate = end;
    if (endDate.getTime() < startDate.getTime()) {
      [startDate, endDate] = [endDate, startDate];
    }
    const adjustedStart = shiftStartToSchoolWeek(startDate, endDate);
    let cursor = getIsoWeekStart(getIsoWeekYear(adjustedStart), getIsoWeek(adjustedStart));
    const limit = getIsoWeekStart(getIsoWeekYear(endDate), getIsoWeek(endDate));
    while (cursor.getTime() <= limit.getTime()) {
      const isoYear = getIsoWeekYear(cursor);
      const wk = getIsoWeek(cursor);
      registerVacationWeek(isoYear, wk, vacation);
      cursor = new Date(cursor);
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  const hasVakantieText = (value?: string | null, options?: NormalizeOptions) => {
    const normalized = normalizeText(value, options);
    return normalized ? normalized.toLocaleLowerCase("nl-NL").includes("vakantie") : false;
  };

  const rowContainsVakantie = (row: DocRow) => {
    if (!row) return false;
    if (hasVakantieText(row.onderwerp) || hasVakantieText(row.les)) {
      return true;
    }
    if (Array.isArray(row.leerdoelen) && row.leerdoelen.some((item) => hasVakantieText(item))) {
      return true;
    }
    if (
      hasVakantieText(row.huiswerk, { preserveLineBreaks: true }) ||
      hasVakantieText(row.opdracht, { preserveLineBreaks: true })
    ) {
      return true;
    }
    if (row.toets?.type && hasVakantieText(row.toets.type)) {
      return true;
    }
    return false;
  };

  for (const doc of docs) {
    if (!doc.enabled) {
      continue;
    }
    const rows = docRows[doc.fileId] ?? [];
    const activeRows = rows.filter((row) => row && row.enabled !== false);

    const weekOverrides = new Map<number, { week: number; isoYear: number }>();

    if (activeRows.length) {
      for (const row of activeRows) {
        const weekCandidates: number[] = [];
        if (Array.isArray(row.weeks)) {
          for (const value of row.weeks) {
            if (typeof value === "number") {
              weekCandidates.push(value);
          }
        }
      }
      if (typeof row.week === "number") {
        weekCandidates.push(row.week);
      }
      const uniqueWeeks: number[] = [];
      const seenWeeks = new Set<number>();
      for (const candidate of weekCandidates) {
        if (!Number.isFinite(candidate)) continue;
        const normalized = Math.trunc(candidate);
        if (normalized < 1 || normalized > 53) continue;
        if (seenWeeks.has(normalized)) continue;
        seenWeeks.add(normalized);
        uniqueWeeks.push(normalized);
      }
      if (!uniqueWeeks.length) {
        continue;
      }

      const candidateDates: (string | null | undefined)[] = [];
      if (row.datum) {
        candidateDates.push(row.datum);
      }
      if (row.datum_eind) {
        candidateDates.push(row.datum_eind);
      }
      if (row.inleverdatum) {
        candidateDates.push(row.inleverdatum);
      }

        const resolvedWeeks: { sourceWeek: number; week: number; isoYear: number; weekId: string }[] = [];
        const seenWeekIds = new Set<string>();
        for (const sourceWeek of uniqueWeeks) {
          const { week: canonicalWeek, isoYear } = resolveWeekIdentifier(sourceWeek, {
            schooljaar: doc.schooljaar,
            candidateDates,
            today,
          });
          const weekId = makeWeekId(isoYear, canonicalWeek);
          if (seenWeekIds.has(weekId)) {
            continue;
          }
          seenWeekIds.add(weekId);
          ensureWeek(canonicalWeek, isoYear);
          resolvedWeeks.push({ sourceWeek, week: canonicalWeek, isoYear, weekId });
          if (!weekOverrides.has(sourceWeek)) {
            weekOverrides.set(sourceWeek, { week: canonicalWeek, isoYear });
          }
        }

        if (!resolvedWeeks.length) {
          continue;
        }

        resolvedWeeks.sort((a, b) => {
          if (a.isoYear !== b.isoYear) return a.isoYear - b.isoYear;
          if (a.week !== b.week) return a.week - b.week;
          return a.weekId.localeCompare(b.weekId);
        });

        const anchor = resolvedWeeks[0];
        const { weekId: anchorWeekId, vakMap } = ensureWeek(anchor.week, anchor.isoYear);
        if (
          vacationWeekSet.size > 0 &&
          vacationWeekSet.has(anchorWeekId) &&
          rowContainsVakantie(row)
        ) {
          continue;
        }
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

        if (resolvedWeeks.length > 1) {
          const spanStartResolution =
            typeof row.week_span_start === "number"
              ? resolveWeekIdentifier(row.week_span_start, {
                  schooljaar: doc.schooljaar,
                  candidateDates,
                  today,
                }).week
              : anchor.week;
          const spanEndResolution =
            typeof row.week_span_end === "number"
              ? resolveWeekIdentifier(row.week_span_end, {
                  schooljaar: doc.schooljaar,
                  candidateDates,
                  today,
                }).week
              : resolvedWeeks[resolvedWeeks.length - 1].week;

          const baseSpan: MultiWeekSpanInfo = {
            sourceRowId: row.source_row_id ?? undefined,
            label: row.week_label ?? undefined,
            fromWeek: spanStartResolution,
            toWeek: spanEndResolution,
            role: "start",
            startDate: row.datum ?? undefined,
            endDate: row.datum_eind ?? undefined,
          };
          registerMultiWeekSpan(anchorWeekId, doc.vak, baseSpan);
          for (let idxWeek = 1; idxWeek < resolvedWeeks.length; idxWeek += 1) {
            const spanWeek = resolvedWeeks[idxWeek];
            registerMultiWeekSpan(spanWeek.weekId, doc.vak, {
              ...baseSpan,
              role: "continue",
            });
          }
        }
      }
    }

    const weekRange = expandWeekRange(doc.beginWeek, doc.eindWeek);
    for (const wk of weekRange) {
      const override = weekOverrides.get(wk);
      if (override) {
        ensureWeek(override.week, override.isoYear);
      } else {
        const { week: canonicalWeek, isoYear } = resolveWeekIdentifier(wk, {
          schooljaar: doc.schooljaar,
          today,
        });
        ensureWeek(canonicalWeek, isoYear);
      }
    }
  }

  const vacationWeeks: Record<string, VacationWeekInfo[]> = {};
  for (const { weekId, isoYear, week, info } of vacationWeekRegistrations) {
    ensureWeek(week, isoYear);
    const list = (vacationWeeks[weekId] ??= []);
    if (!list.some((entry) => entry.id === info.id)) {
      list.push(info);
    }
  }

  const resultByWeek: Record<string, Record<string, WeekData>> = {};
  const allWeekIds = new Set<string>([
    ...byWeek.keys(),
    ...multiWeekByWeek.keys(),
  ]);
  for (const weekId of allWeekIds) {
    const vakMap = byWeek.get(weekId) ?? {};
    const spanMap = multiWeekByWeek.get(weekId) ?? {};
    const vakKeys = new Set<string>([
      ...Object.keys(vakMap),
      ...Object.keys(spanMap),
    ]);
    const entries: Record<string, WeekData> = {};
    for (const vak of vakKeys) {
      const acc = vakMap[vak];
      const data: WeekData = {};
      if (acc) {
        const uniqJoin = (values: string[], sep: string) => {
          const unique = Array.from(new Set(values));
          return unique.length ? unique.join(sep) : undefined;
        };
        const sortedDates = Array.from(new Set(acc.dates)).sort();
        data.lesstof = uniqJoin(acc.lesstof, "\n");
        data.huiswerk = uniqJoin(acc.huiswerk, "\n");
        data.huiswerkItems = acc.huiswerkItems.length ? [...acc.huiswerkItems] : undefined;
        data.deadlines = uniqJoin(acc.deadlines, "; ");
        data.opmerkingen = uniqJoin(acc.opmerkingen, "\n");
        data.date = sortedDates[0];
      }
      const spans = spanMap[vak];
      if (spans?.length) {
        data.multiWeekSpans = spans.map((span) => ({ ...span }));
      }
      entries[vak] = data;
    }
    resultByWeek[weekId] = entries;
  }

  Object.values(vacationWeeks).forEach((list) => {
    list.sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
      return a.region.localeCompare(b.region, "nl-NL");
    });
  });

  const weeks = Array.from(weekInfoMap.values()).sort((a, b) => {
    if (a.isoYear !== b.isoYear) return a.isoYear - b.isoYear;
    if (a.nr !== b.nr) return a.nr - b.nr;
    return a.id.localeCompare(b.id);
  });
  
  return { weeks, byWeek: resultByWeek, vacationsByWeek: vacationWeeks };
};

type InitialStateKeys =
  | "docs"
  | "docsInitialized"
  | "docRows"
  | "weekData"
  | "schoolVacations"
  | "studyGuides"
  | "guideVersions"
  | "guideDiffs"
  | "versionRows"
  | "selectedGuideId"
  | "selectedVersionId"
  | "pendingReviews"
  | "activeReviewId"
  | "customHomework"
  | "homeworkAdjustments"
  | "mijnVakken"
  | "huiswerkWeergave"
  | "themePresets"
  | "activeThemeId"
  | "theme"
  | "backgroundImage"
  | "surfaceOpacity"
  | "enableHomeworkEditing"
  | "enableCustomHomework"
  | "enableAutoUpdate"
  | "doneMap"
  | "weekIdxWO"
  | "niveauWO"
  | "leerjaarWO"
  | "weekPeriode"
  | "matrixStartIdx"
  | "matrixCount"
  | "matrixNiveau"
  | "matrixLeerjaar"
  | "matrixPeriode"
  | "eventsPeriode"
  | "lastVisitedRoute";

export const createInitialState = (): Pick<State, InitialStateKeys> => {
  const { presets, activeThemeId, theme, backgroundImage, surfaceOpacity } =
    resolveActiveThemeState(createThemePresets(), "default");
  return {
    docs: [],
    docsInitialized: false,
    docRows: {},
    weekData: { weeks: [], byWeek: {}, vacationsByWeek: {} },
    schoolVacations: [],
    studyGuides: [],
    guideVersions: {},
    guideDiffs: {},
    versionRows: {},
    selectedGuideId: null,
    selectedVersionId: null,
    pendingReviews: {},
    activeReviewId: null,
    customHomework: {},
    homeworkAdjustments: {},
    mijnVakken: [],
    huiswerkWeergave: "perOpdracht",
    themePresets: presets,
    activeThemeId,
    theme,
    backgroundImage,
    surfaceOpacity,
    enableHomeworkEditing: true,
    enableCustomHomework: true,
    enableAutoUpdate: true,
    doneMap: {},
    weekIdxWO: 0,
    niveauWO: "ALLE",
    leerjaarWO: "ALLE",
    weekPeriode: "ALLE",
    matrixStartIdx: -1,
    matrixCount: 3,
    matrixNiveau: "ALLE",
    matrixLeerjaar: "ALLE",
    matrixPeriode: "ALLE",
    eventsPeriode: "ALLE",
    lastVisitedRoute: "/",
  };
};

export const useAppStore = create<State>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      setDocs: (d) => {
        const prevDocs = get().docs;
        const prevEnabled = new Map(prevDocs.map((doc) => [doc.fileId, doc.enabled] as const));
        const nextDocs = sortDocsByUploadedAt(
          d.map((doc) => {
            const normalizedVak = formatVakName(doc.vak);
            const uploadedAt = doc.uploadedAt ?? new Date().toISOString();
            return {
              ...doc,
              vak: normalizedVak,
              uploadedAt,
              enabled: prevEnabled.get(doc.fileId) ?? true,
            };
          })
        );
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
        const nextVersionRows = { ...get().versionRows };
        for (const key of Object.keys(nextVersionRows)) {
          if (!nextDocIds.has(key)) {
            delete nextVersionRows[key];
          }
        }
        const weekData = computeWeekAggregation(nextDocs, filteredRows, get().schoolVacations);
        set({
          docs: nextDocs,
          mijnVakken,
          docRows: filteredRows,
          weekData,
          versionRows: nextVersionRows,
        });
      },
      removeDoc: (fileId) => {
        const state = get();
        const next = state.docs.filter((x) => x.fileId !== fileId);
        const mijnVakken = computeMijnVakken(next, state.mijnVakken);
        const nextRows = { ...state.docRows };
        delete nextRows[fileId];
        const weekData = computeWeekAggregation(next, nextRows, state.schoolVacations);
        const nextGuideVersions = { ...state.guideVersions };
        delete nextGuideVersions[fileId];
        const nextGuideDiffs = { ...state.guideDiffs };
        delete nextGuideDiffs[fileId];
        const nextVersionRows = { ...state.versionRows };
        delete nextVersionRows[fileId];
        const nextStudyGuides = state.studyGuides.filter((guide) => guide.guideId !== fileId);
        let selectedGuideId = state.selectedGuideId;
        let selectedVersionId = state.selectedVersionId;
        if (selectedGuideId === fileId) {
          selectedGuideId = nextStudyGuides[0]?.guideId ?? null;
          if (selectedGuideId) {
            const versions = nextGuideVersions[selectedGuideId] ?? [];
            selectedVersionId = versions[0]?.versionId ?? null;
          } else {
            selectedVersionId = null;
          }
        }
        set({
          docs: next,
          mijnVakken,
          docRows: nextRows,
          weekData,
          guideVersions: nextGuideVersions,
          guideDiffs: nextGuideDiffs,
          versionRows: nextVersionRows,
          studyGuides: nextStudyGuides,
          selectedGuideId,
          selectedVersionId,
        });
      },
      addDoc: (doc) => {
        const prevDocs = get().docs;
        const normalizedVak = formatVakName(doc.vak);
        const uploadedAt = doc.uploadedAt ?? new Date().toISOString();
        const nextDoc = { ...doc, vak: normalizedVak, uploadedAt, enabled: true };
        const next = sortDocsByUploadedAt([...prevDocs, nextDoc]);
        const hadVakBefore = prevDocs.some((existing) => existing.vak === normalizedVak);
        const mijnVakken = computeMijnVakken(next, get().mijnVakken, {
          ensure: hadVakBefore ? undefined : [normalizedVak],
        });
        const nextRows = { ...get().docRows };
        if (!nextRows[doc.fileId]) {
          nextRows[doc.fileId] = [];
        }
        const weekData = computeWeekAggregation(next, nextRows, get().schoolVacations);
        set({ docs: next, mijnVakken, docRows: nextRows, weekData });
      },
      replaceDoc: (fileId, nextDoc) => {
        const normalizedVak = formatVakName(nextDoc.vak);
        const next = sortDocsByUploadedAt(
          get().docs.map((x) =>
            x.fileId === fileId
              ? {
                  ...nextDoc,
                  vak: normalizedVak,
                  uploadedAt:
                    nextDoc.uploadedAt ?? x.uploadedAt ?? new Date().toISOString(),
                  enabled: x.enabled,
                }
              : x
          )
        );
        const mijnVakken = computeMijnVakken(next, get().mijnVakken);
        const weekData = computeWeekAggregation(next, get().docRows, get().schoolVacations);
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
        const weekData = computeWeekAggregation(next, get().docRows, get().schoolVacations);
        set({ docs: next, mijnVakken, weekData });
      },
      setDocRows: (fileId, rows) => {
        const state = get();
        const nextRows = { ...state.docRows, [fileId]: rows };
        const nextVersionRows = { ...state.versionRows };
        const doc = state.docs.find((d) => d.fileId === fileId);
        const versionId = doc?.versionId ?? null;
        if (versionId != null) {
          const entry = { ...(nextVersionRows[fileId] ?? {}) };
          entry[versionId] = rows;
          nextVersionRows[fileId] = entry;
        }
        const weekData = computeWeekAggregation(state.docs, nextRows, state.schoolVacations);
        set({ docRows: nextRows, weekData, versionRows: nextVersionRows });
      },
      setDocRowsBulk: (entries) => {
        const nextRows = { ...get().docRows };
        for (const [fileId, rows] of Object.entries(entries)) {
          nextRows[fileId] = rows;
        }
        const state = get();
        const nextVersionRows = { ...state.versionRows };
        for (const [fileId, rows] of Object.entries(entries)) {
          const doc = state.docs.find((d) => d.fileId === fileId);
          const versionId = doc?.versionId ?? null;
          if (versionId != null) {
            const map = { ...(nextVersionRows[fileId] ?? {}) };
            map[versionId] = rows;
            nextVersionRows[fileId] = map;
          }
        }
        const weekData = computeWeekAggregation(state.docs, nextRows, state.schoolVacations);
        set({ docRows: nextRows, weekData, versionRows: nextVersionRows });
      },
      setStudyGuides: (guides) => {
        set((state) => {
          const allowed = new Set(guides.map((guide) => guide.guideId));
          const nextGuideVersions: Record<string, StudyGuideVersion[]> = {};
          for (const guide of guides) {
            const current = state.guideVersions[guide.guideId] ?? [];
            const withoutLatest = current.filter(
              (version) => version.versionId !== guide.latestVersion.versionId
            );
            nextGuideVersions[guide.guideId] = [guide.latestVersion, ...withoutLatest];
          }
          const nextGuideDiffs: Record<string, Record<number, DocDiff>> = {};
          for (const [guideId, diffMap] of Object.entries(state.guideDiffs)) {
            if (allowed.has(guideId)) {
              nextGuideDiffs[guideId] = diffMap;
            }
          }
          const nextVersionRows: Record<string, Record<number, DocRow[]>> = {};
          for (const [guideId, rowsMap] of Object.entries(state.versionRows)) {
            if (allowed.has(guideId)) {
              nextVersionRows[guideId] = rowsMap;
            }
          }
          let selectedGuideId = state.selectedGuideId;
          if (!selectedGuideId || !allowed.has(selectedGuideId)) {
            selectedGuideId = guides[0]?.guideId ?? null;
          }
          let selectedVersionId = state.selectedVersionId;
          if (selectedGuideId) {
            const versions = nextGuideVersions[selectedGuideId] ?? [];
            if (!versions.some((version) => version.versionId === selectedVersionId)) {
              selectedVersionId = versions[0]?.versionId ?? null;
            }
          } else {
            selectedVersionId = null;
          }
          return {
            studyGuides: guides,
            guideVersions: nextGuideVersions,
            guideDiffs: nextGuideDiffs,
            versionRows: nextVersionRows,
            selectedGuideId,
            selectedVersionId,
          };
        });
      },
      setGuideVersions: (guideId, versions) => {
        set((state) => {
          const next = { ...state.guideVersions, [guideId]: versions };
          let selectedVersionId = state.selectedVersionId;
          if (state.selectedGuideId === guideId) {
            if (!versions.some((version) => version.versionId === selectedVersionId)) {
              selectedVersionId = versions[0]?.versionId ?? null;
            }
          }
          return { guideVersions: next, selectedVersionId };
        });
      },
      setGuideDiff: (guideId, versionId, diff) => {
        set((state) => {
          const next = { ...state.guideDiffs };
          const entry = { ...(next[guideId] ?? {}) };
          entry[versionId] = diff;
          next[guideId] = entry;
          return { guideDiffs: next };
        });
      },
      setVersionRows: (guideId, versionId, rows) => {
        set((state) => {
          const entry = { ...(state.versionRows[guideId] ?? {}) };
          entry[versionId] = rows;
          const nextVersionRows = { ...state.versionRows, [guideId]: entry };
          const doc = state.docs.find((d) => d.fileId === guideId);
          if (doc?.versionId === versionId) {
            const nextDocRows = { ...state.docRows, [guideId]: rows };
          const weekData = computeWeekAggregation(state.docs, nextDocRows, state.schoolVacations);
            return { versionRows: nextVersionRows, docRows: nextDocRows, weekData };
          }
          return { versionRows: nextVersionRows };
        });
      },
      selectGuideVersion: (guideId, versionId) =>
        set({ selectedGuideId: guideId, selectedVersionId: versionId }),
      clearGuideSelection: () => set({ selectedGuideId: null, selectedVersionId: null }),
      setPendingReview: (review) => {
        set((state) => {
          const next = { ...state.pendingReviews, [review.parseId]: review };
          const activeReviewId = state.activeReviewId ?? review.parseId;
          return { pendingReviews: next, activeReviewId };
        });
      },
      removePendingReview: (parseId) => {
        set((state) => {
          if (!(parseId in state.pendingReviews)) {
            return {};
          }
          const next = { ...state.pendingReviews };
          delete next[parseId];
          let activeReviewId = state.activeReviewId;
          if (state.activeReviewId === parseId) {
            const remaining = Object.keys(next);
            activeReviewId = remaining.length ? remaining[0] : null;
          }
          return { pendingReviews: next, activeReviewId };
        });
      },
      setActiveReview: (parseId) => set({ activeReviewId: parseId }),
      applyCommitResult: (commit, rows, diff) => {
        const { guideId, version } = commit;
        set((state) => {
          const nextDocs = (() => {
            const normalizedVak = formatVakName(version.meta.vak);
            const updatedMeta: DocMeta = {
              ...version.meta,
              vak: normalizedVak,
              uploadedAt: version.meta.uploadedAt ?? new Date().toISOString(),
            };
            const existing = state.docs.find((doc) => doc.fileId === guideId);
            if (existing) {
              return sortDocsByUploadedAt(
                state.docs.map((doc) =>
                  doc.fileId === guideId
                    ? {
                        ...updatedMeta,
                        enabled: doc.enabled,
                      }
                    : doc
                )
              );
            }
            return sortDocsByUploadedAt([
              ...state.docs,
              { ...updatedMeta, enabled: true } as DocRecord,
            ]);
          })();
          const mijnVakken = computeMijnVakken(nextDocs, state.mijnVakken, {
            ensure: [formatVakName(version.meta.vak)],
          });
          const nextGuideVersions = { ...state.guideVersions };
          const versions = nextGuideVersions[guideId] ?? [];
          const filtered = versions.filter((item) => item.versionId !== version.versionId);
          nextGuideVersions[guideId] = [version, ...filtered];
          const versionCountForGuide = nextGuideVersions[guideId].length;
          const nextGuideDiffs = { ...state.guideDiffs };
          if (diff) {
            const entry = { ...(nextGuideDiffs[guideId] ?? {}) };
            entry[version.versionId] = diff;
            nextGuideDiffs[guideId] = entry;
          }
          const nextVersionRows = { ...state.versionRows };
          const versionEntry = { ...(nextVersionRows[guideId] ?? {}) };
          versionEntry[version.versionId] = rows;
          nextVersionRows[guideId] = versionEntry;
          const nextDocRows = { ...state.docRows, [guideId]: rows };
          const weekData = computeWeekAggregation(nextDocs, nextDocRows, state.schoolVacations);
          const nextStudyGuides = (() => {
            const existing = state.studyGuides.find((g) => g.guideId === guideId);
            if (existing) {
              const versionCount = Math.max(
                existing.versionCount,
                versionCountForGuide,
                version.versionId
              );
              return state.studyGuides.map((guide) =>
                guide.guideId === guideId
                  ? {
                      guideId,
                      latestVersion: version,
                      versionCount,
                    }
                  : guide
              );
            }
            return [
              ...state.studyGuides,
              {
                guideId,
                latestVersion: version,
                versionCount: Math.max(version.versionId, versionCountForGuide),
              },
            ];
          })();
          return {
            docs: nextDocs,
            docRows: nextDocRows,
            weekData,
            mijnVakken,
            guideVersions: nextGuideVersions,
            guideDiffs: nextGuideDiffs,
            versionRows: nextVersionRows,
            studyGuides: nextStudyGuides,
            selectedGuideId: guideId,
            selectedVersionId: version.versionId,
          };
        });
      },

      setSchoolVacations: (entries) => {
        set((state) => {
          const normalized = sortVacations(
            entries.map((entry) => ({ ...entry, active: entry.active ?? true }))
          );
          const weekData = computeWeekAggregation(state.docs, state.docRows, normalized);
          return { schoolVacations: normalized, weekData };
        });
      },
      addSchoolVacations: (entries) => {
        if (!entries.length) {
          return;
        }
        set((state) => {
          const existing = [...state.schoolVacations];
          const byExternal = new Map<string, string>();
          existing.forEach((vac) => {
            if (vac.externalId) {
              byExternal.set(vac.externalId, vac.id);
            }
          });
          const now = new Date().toISOString();
          let changed = false;
          for (const entry of entries) {
            const externalKey = entry.externalId ?? null;
            const matchedId = externalKey ? byExternal.get(externalKey) : undefined;
            const targetId = matchedId ?? entry.id ?? generateId();
            const index = existing.findIndex((vac) => vac.id === targetId);
            const base = index >= 0 ? existing[index] : undefined;
            const nextEntry: SchoolVacation = {
              ...entry,
              id: targetId,
              externalId: entry.externalId ?? base?.externalId ?? null,
              active: entry.active ?? base?.active ?? true,
              createdAt: base?.createdAt ?? entry.createdAt ?? now,
              updatedAt: entry.updatedAt ?? now,
            };
            if (index >= 0) {
              existing[index] = nextEntry;
            } else {
              existing.push(nextEntry);
            }
            if (externalKey) {
              byExternal.set(externalKey, targetId);
            }
            changed = true;
          }
          if (!changed) {
            return {};
          }
          const sorted = sortVacations(existing);
          const weekData = computeWeekAggregation(state.docs, state.docRows, sorted);
          return { schoolVacations: sorted, weekData };
        });
      },
      updateSchoolVacation: (id, update) => {
        if (!update) {
          return;
        }
        set((state) => {
          const idx = state.schoolVacations.findIndex((vac) => vac.id === id);
          if (idx === -1) {
            return {};
          }
          const current = state.schoolVacations[idx];
          const nextEntry: SchoolVacation = {
            ...current,
            ...update,
            updatedAt: update.updatedAt ?? new Date().toISOString(),
          };
          const nextList = [...state.schoolVacations];
          nextList[idx] = nextEntry;
          const sorted = sortVacations(nextList);
          const weekData = computeWeekAggregation(state.docs, state.docRows, sorted);
          return { schoolVacations: sorted, weekData };
        });
      },
      removeSchoolVacation: (id) => {
        set((state) => {
          const next = state.schoolVacations.filter((vac) => vac.id !== id);
          if (next.length === state.schoolVacations.length) {
            return {};
          }
          const weekData = computeWeekAggregation(state.docs, state.docRows, next);
          return { schoolVacations: next, weekData };
        });
      },
      clearSchoolVacations: () => {
        set((state) => {
          if (state.schoolVacations.length === 0) {
            return {};
          }
          const weekData = computeWeekAggregation(state.docs, state.docRows, []);
          return { schoolVacations: [], weekData };
        });
      },
      setSchoolVacationActive: (id, active) => {
        set((state) => {
          const idx = state.schoolVacations.findIndex((vac) => vac.id === id);
          if (idx === -1) {
            return {};
          }
          const current = state.schoolVacations[idx];
          if (current.active === active) {
            return {};
          }
          const nextEntry: SchoolVacation = {
            ...current,
            active,
            updatedAt: new Date().toISOString(),
          };
          const nextList = [...state.schoolVacations];
          nextList[idx] = nextEntry;
          const sorted = sortVacations(nextList);
          const weekData = computeWeekAggregation(state.docs, state.docRows, sorted);
          return { schoolVacations: sorted, weekData };
        });
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
      setActiveTheme: (id) =>
        set((state) => {
          const preset = state.themePresets.find((item) => item.id === id);
          if (!preset) {
            const fallback = state.themePresets.find((item) => item.id === "default") ??
              builtinThemePresets[0];
            return {
              activeThemeId: fallback.id,
              theme: cloneThemeSettings(fallback.settings),
              backgroundImage: fallback.backgroundImage ?? null,
              surfaceOpacity: fallback.surfaceOpacity ?? 100,
            };
          }
          return {
            activeThemeId: preset.id,
            theme: cloneThemeSettings(preset.settings),
            backgroundImage: preset.backgroundImage ?? null,
            surfaceOpacity: preset.surfaceOpacity ?? 100,
          };
        }),
      addCustomTheme: (name) => {
        const trimmed = name.trim();
        const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        set((state) => {
          const activePreset =
            state.themePresets.find((preset) => preset.id === state.activeThemeId) ??
            state.themePresets[0] ??
            builtinThemePresets[0];
          const nextPreset: ThemePreset = {
            id,
            name: trimmed || "Mijn thema",
            settings: cloneThemeSettings(activePreset?.settings ?? defaultTheme),
            backgroundImage: activePreset?.backgroundImage ?? null,
            surfaceOpacity: activePreset?.surfaceOpacity ?? 100,
          };
          return {
            themePresets: [...state.themePresets, nextPreset],
            activeThemeId: id,
            theme: cloneThemeSettings(nextPreset.settings),
            backgroundImage: nextPreset.backgroundImage ?? null,
            surfaceOpacity: nextPreset.surfaceOpacity ?? 100,
          };
        });
      },
      updateCustomTheme: (id, update) =>
        set((state) => {
          const idx = state.themePresets.findIndex(
            (preset) => preset.id === id && !preset.builtIn
          );
          if (idx === -1) {
            return {};
          }
          const nextPresets = [...state.themePresets];
          const current = nextPresets[idx];
          const nextPreset: ThemePreset = {
            ...current,
            name: update.name?.trim() ? update.name.trim() : current.name,
            settings: update.settings
              ? cloneThemeSettings(update.settings)
              : cloneThemeSettings(current.settings),
            backgroundImage:
              update.backgroundImage !== undefined
                ? update.backgroundImage
                : current.backgroundImage ?? null,
            surfaceOpacity:
              update.surfaceOpacity !== undefined
                ? clampSurfaceOpacity(update.surfaceOpacity)
                : clampSurfaceOpacity(current.surfaceOpacity),
            builtIn: false,
          };
          nextPresets[idx] = nextPreset;
          const patch: Partial<State> = { themePresets: nextPresets };
          if (state.activeThemeId === id && update.settings) {
            patch.theme = cloneThemeSettings(nextPreset.settings);
          }
          if (state.activeThemeId === id && update.backgroundImage !== undefined) {
            patch.backgroundImage = nextPreset.backgroundImage ?? null;
          }
          if (state.activeThemeId === id && update.surfaceOpacity !== undefined) {
            patch.surfaceOpacity = nextPreset.surfaceOpacity ?? 100;
          }
          return patch;
        }),
      removeCustomTheme: (id) =>
        set((state) => {
          const target = state.themePresets.find((preset) => preset.id === id);
          if (!target || target.builtIn) {
            return {};
          }
          const nextPresets = state.themePresets.filter((preset) => preset.id !== id);
          if (state.activeThemeId === id) {
            const fallback = nextPresets.find((preset) => preset.id === "default") ??
              builtinThemePresets[0];
            return {
              themePresets: nextPresets,
              activeThemeId: fallback.id,
              theme: cloneThemeSettings(fallback.settings),
              backgroundImage: fallback.backgroundImage ?? null,
              surfaceOpacity: fallback.surfaceOpacity ?? 100,
            };
          }
          return {
            themePresets: nextPresets,
          };
        }),
      setThemeColor: (key, value) =>
        set((state) => {
          const nextTheme = { ...state.theme, [key]: value };
          const activePresetIdx = state.themePresets.findIndex(
            (preset) => preset.id === state.activeThemeId && !preset.builtIn
          );
          if (activePresetIdx === -1) {
            return { theme: nextTheme };
          }
          const nextPresets = [...state.themePresets];
          const current = nextPresets[activePresetIdx];
          nextPresets[activePresetIdx] = {
            ...current,
            settings: { ...current.settings, [key]: value },
          };
          return { theme: nextTheme, themePresets: nextPresets };
        }),
      resetTheme: () =>
        set((state) => {
          const fallback = state.themePresets.find((preset) => preset.id === "default") ??
            builtinThemePresets[0];
          return {
            activeThemeId: fallback.id,
            theme: cloneThemeSettings(fallback.settings),
            backgroundImage: fallback.backgroundImage ?? null,
            surfaceOpacity: fallback.surfaceOpacity ?? 100,
          };
        }),
      setBackgroundImage: (value) =>
        set((state) => {
          const patch: Partial<State> = { backgroundImage: value };
          const activePresetIdx = state.themePresets.findIndex(
            (preset) => preset.id === state.activeThemeId && !preset.builtIn
          );
          if (activePresetIdx === -1) {
            return patch;
          }
          const nextPresets = [...state.themePresets];
          const current = nextPresets[activePresetIdx];
          nextPresets[activePresetIdx] = {
            ...current,
            backgroundImage: value ?? null,
          };
          patch.themePresets = nextPresets;
          return patch;
        }),
      resetBackgroundImage: () =>
        set((state) => {
          const patch: Partial<State> = { backgroundImage: null };
          const activePresetIdx = state.themePresets.findIndex(
            (preset) => preset.id === state.activeThemeId && !preset.builtIn
          );
          if (activePresetIdx === -1) {
            return patch;
          }
          const nextPresets = [...state.themePresets];
          const current = nextPresets[activePresetIdx];
          nextPresets[activePresetIdx] = {
            ...current,
            backgroundImage: null,
          };
          patch.themePresets = nextPresets;
          return patch;
        }),
      setSurfaceOpacity: (value) =>
        set((state) => {
          const clamped = clampSurfaceOpacity(value);
          const patch: Partial<State> = { surfaceOpacity: clamped };
          const activePresetIdx = state.themePresets.findIndex(
            (preset) => preset.id === state.activeThemeId && !preset.builtIn
          );
          if (activePresetIdx === -1) {
            return patch;
          }
          const nextPresets = [...state.themePresets];
          const current = nextPresets[activePresetIdx];
          nextPresets[activePresetIdx] = {
            ...current,
            surfaceOpacity: clamped,
          };
          patch.themePresets = nextPresets;
          return patch;
        }),
      resetSurfaceOpacity: () =>
        set((state) => {
          const patch: Partial<State> = { surfaceOpacity: 100 };
          const activePresetIdx = state.themePresets.findIndex(
            (preset) => preset.id === state.activeThemeId && !preset.builtIn
          );
          if (activePresetIdx === -1) {
            return patch;
          }
          const nextPresets = [...state.themePresets];
          const current = nextPresets[activePresetIdx];
          nextPresets[activePresetIdx] = {
            ...current,
            surfaceOpacity: 100,
          };
          patch.themePresets = nextPresets;
          return patch;
        }),
      setEnableHomeworkEditing: (value) =>
        set(() => ({ enableHomeworkEditing: !!value })),
      setEnableCustomHomework: (value) =>
        set(() => ({ enableCustomHomework: !!value })),
      setEnableAutoUpdate: (value) =>
        set(() => ({ enableAutoUpdate: !!value })),

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
      setWeekPeriode: (p) => {
        const next = p && p.trim() ? p : "ALLE";
        set({ weekPeriode: next });
      },
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
      setMatrixPeriode: (p) => {
        const next = p && p.trim() ? p : "ALLE";
        set({ matrixPeriode: next });
      },
      setEventsPeriode: (p) => {
        const next = p && p.trim() ? p : "ALLE";
        set({ eventsPeriode: next });
      },
      setLastVisitedRoute: (path) =>
        set((state) => {
          const sanitized = path && path.trim() ? path : "/";
          if (state.lastVisitedRoute === sanitized) {
            return {};
          }
          return { lastVisitedRoute: sanitized };
        }),
      markDocsInitialized: () => set({ docsInitialized: true }),

      resetAppState: () => {
        const initial = createInitialState();
        set(initial);
      },
    }),
    {
      name: "vlier-planner-state",
      version: 6,
      partialize: (state) => ({
        docs: state.docs,
        docRows: state.docRows,
        weekData: state.weekData,
        schoolVacations: state.schoolVacations,
        customHomework: state.customHomework,
        homeworkAdjustments: state.homeworkAdjustments,
        mijnVakken: state.mijnVakken,
        huiswerkWeergave: state.huiswerkWeergave,
        themePresets: state.themePresets,
        activeThemeId: state.activeThemeId,
        theme: state.theme,
        backgroundImage: state.backgroundImage,
        surfaceOpacity: state.surfaceOpacity,
        enableHomeworkEditing: state.enableHomeworkEditing,
        enableCustomHomework: state.enableCustomHomework,
        enableAutoUpdate: state.enableAutoUpdate,
        doneMap: state.doneMap,
        weekIdxWO: state.weekIdxWO,
        niveauWO: state.niveauWO,
        leerjaarWO: state.leerjaarWO,
        weekPeriode: state.weekPeriode,
        matrixStartIdx: state.matrixStartIdx,
        matrixCount: state.matrixCount,
        matrixNiveau: state.matrixNiveau,
        matrixLeerjaar: state.matrixLeerjaar,
        matrixPeriode: state.matrixPeriode,
        eventsPeriode: state.eventsPeriode,
        lastVisitedRoute: state.lastVisitedRoute,
      }),
      migrate: (persistedState, version) => {
        if (!persistedState) {
          return createInitialState();
        }
        if (version >= 5) {
          const state = persistedState as State;
          const withDefaults = {
            ...state,
            matrixPeriode: state.matrixPeriode ?? "ALLE",
            weekPeriode: state.weekPeriode ?? "ALLE",
            eventsPeriode: state.eventsPeriode ?? "ALLE",
          };
          const presets = createThemePresets(withDefaults.themePresets);
          const resolved = resolveActiveThemeState(presets, withDefaults.activeThemeId);
          const normalizedVacations = sortVacations(
            Array.isArray(state.schoolVacations)
              ? state.schoolVacations.map((entry) => ({ ...entry, active: entry.active ?? true }))
              : []
          );
          return {
            ...withDefaults,
            themePresets: resolved.presets,
            activeThemeId: resolved.activeThemeId,
            theme: resolved.theme,
            backgroundImage: resolved.backgroundImage,
            surfaceOpacity: resolved.surfaceOpacity,
          };
        }
        if (version >= 4) {
          const state = persistedState as State;
          const withDefaults = {
            ...state,
            matrixPeriode: state.matrixPeriode ?? "ALLE",
            weekPeriode: state.weekPeriode ?? "ALLE",
            eventsPeriode: state.eventsPeriode ?? "ALLE",
          };
          const presets = createThemePresets(withDefaults.themePresets);
          const resolved = resolveActiveThemeState(presets, withDefaults.activeThemeId);
          return {
            ...withDefaults,
            themePresets: resolved.presets,
            activeThemeId: resolved.activeThemeId,
            theme: resolved.theme,
            backgroundImage: resolved.backgroundImage,
            surfaceOpacity: resolved.surfaceOpacity,
            schoolVacations: normalizedVacations,
            weekData: computeWeekAggregation(
              Array.isArray(state.docs) ? state.docs : [],
              state.docRows ?? {},
              normalizedVacations
            ),
          };
        }
        const legacy = persistedState as State & {
          themePresets?: ThemePreset[];
          activeThemeId?: string;
          backgroundImage?: string | null;
          surfaceOpacity?: number;
        };
        const presets = createThemePresets(legacy.themePresets);
        const storedTheme = legacy.theme ?? defaultTheme;
        const storedBackgroundImage = legacy.backgroundImage ?? null;
        const storedSurfaceOpacity = clampSurfaceOpacity(legacy.surfaceOpacity);
        const matchingPreset = presets.find((preset) => {
          const settings = preset.settings;
          return (
            settings.background === storedTheme.background &&
            settings.surface === storedTheme.surface &&
            settings.accent === storedTheme.accent &&
            settings.text === storedTheme.text &&
            settings.muted === storedTheme.muted &&
            settings.border === storedTheme.border &&
            settings.accentText === storedTheme.accentText
          );
        });
        const resolvedActiveId = matchingPreset?.id ?? legacy.activeThemeId ?? "default";
        const needsCustomPreset =
          !matchingPreset ||
          (matchingPreset?.builtIn &&
            (storedBackgroundImage !== (matchingPreset.backgroundImage ?? null) ||
              storedSurfaceOpacity !== clampSurfaceOpacity(matchingPreset.surfaceOpacity)));
        let nextPresets = presets;
        let activeThemeId = resolvedActiveId;
        if (needsCustomPreset) {
          let customId = "custom-migrated";
          let suffix = 1;
          while (nextPresets.some((preset) => preset.id === customId)) {
            customId = `custom-migrated-${suffix++}`;
          }
          const basePreset =
            matchingPreset ?? presets.find((preset) => preset.id === legacy.activeThemeId);
          nextPresets = [
            ...presets,
            {
              id: customId,
              name: basePreset?.name ? `${basePreset.name} (kopie)` : "Mijn thema",
              settings: cloneThemeSettings(storedTheme),
              backgroundImage: storedBackgroundImage,
              surfaceOpacity: storedSurfaceOpacity,
            },
          ];
          activeThemeId = customId;
        } else {
          nextPresets = presets.map((preset) =>
            preset.id === resolvedActiveId && !preset.builtIn
              ? {
                  ...preset,
                  backgroundImage: storedBackgroundImage,
                  surfaceOpacity: storedSurfaceOpacity,
                }
              : preset
          );
        }
        const resolved = resolveActiveThemeState(nextPresets, activeThemeId);
        const migrated = {
          ...legacy,
          themePresets: resolved.presets,
          activeThemeId: resolved.activeThemeId,
          theme: resolved.theme,
          backgroundImage: resolved.backgroundImage,
          surfaceOpacity: resolved.surfaceOpacity,
          matrixPeriode: legacy.matrixPeriode ?? "ALLE",
          weekPeriode: legacy.weekPeriode ?? "ALLE",
          eventsPeriode: legacy.eventsPeriode ?? "ALLE",
        } as State;
        const normalizedVacations = sortVacations(
          Array.isArray(migrated.schoolVacations)
            ? migrated.schoolVacations.map((entry) => ({ ...entry, active: entry.active ?? true }))
            : []
        );
        return {
          ...migrated,
          schoolVacations: normalizedVacations,
          weekData: computeWeekAggregation(
            Array.isArray(migrated.docs) ? migrated.docs : [],
            migrated.docRows ?? {},
            normalizedVacations
          ),
        };
      },
    }
  )
);

/**
 * Helper om bij app-start de docs uit de backend te laden.
 * (Dynamische import voorkomt bundling/circular issues.)
 */
export async function hydrateDocsFromApi() {
  const store = useAppStore.getState();
  try {
    const { apiGetStudyGuides, apiGetDocRows } = await import("../lib/api");
    const guides = await apiGetStudyGuides();
    store.setStudyGuides(guides);
    const docs = guides.map((guide) => ({ ...guide.latestVersion.meta } as DocMeta));
    store.setDocs(docs);
    if (!docs.length) {
      store.setDocRowsBulk({});
      return;
    }
    const rowsEntries = await Promise.all(
      guides.map(async (guide) => {
        try {
          const rows = await apiGetDocRows(guide.guideId, guide.latestVersion.versionId);
          return [guide.guideId, rows] as [string, DocRow[]];
        } catch (err) {
          console.warn(`Kon rijen niet hydrateren voor ${guide.guideId}:`, err);
          return [guide.guideId, [] as DocRow[]];
        }
      })
    );
    const rowsMap = Object.fromEntries(rowsEntries) as Record<string, DocRow[]>;
    store.setDocRowsBulk(rowsMap);
  } catch (e) {
    console.warn("Kon docs niet hydrateren:", e);
  } finally {
    store.markDocsInitialized();
  }
}

export async function hydrateDocRowsFromApi(fileId: string, versionId?: number) {
  try {
    const { apiGetDocRows } = await import("../lib/api");
    const rows = await apiGetDocRows(fileId, versionId);
    const store = useAppStore.getState();
    if (versionId != null) {
      store.setVersionRows(fileId, versionId, rows);
    } else {
      store.setDocRows(fileId, rows);
    }
  } catch (e) {
    console.warn(`Kon rijen niet ophalen voor ${fileId}:`, e);
  }
}
