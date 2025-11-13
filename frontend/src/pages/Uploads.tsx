import React from "react";
import clsx from "clsx";
import {
  Info,
  FileText,
  Trash2,
  XCircle,
  ClipboardList,
  AlertTriangle,
  XOctagon,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DocRecord } from "../app/store";
import { useAppStore, hydrateDocRowsFromApi } from "../app/store";
import type {
  DocDiff,
  DiffRow,
  DiffStatus,
  DocRow,
  ReviewDraft,
  StudyGuideVersion,
  CommitResponse,
  StudyGuide,
} from "../lib/api";
import {
  apiUploadDoc,
  apiDeleteDoc,
  apiGetStudyGuideVersions,
  apiGetStudyGuideDiff,
  apiCommitReview,
  apiDeleteReview,
  apiCreateReviewFromVersion,
} from "../lib/api";
import { expandWeekRange, parseIsoDate } from "../lib/calendar";
import { useDocumentPreview } from "../components/DocumentPreviewProvider";
import SchoolVacationManager from "../components/SchoolVacationManager";
import { useFocusTrap } from "../lib/useFocusTrap";
import {
  DiffRowsList,
  DiffSummaryBadges,
  diffStatusLabels,
  diffStatusStyles,
} from "../components/DiffViewer";

type Filters = {
  vak: string;
  niveau: string;
  leerjaar: string;
  periode: string;
};

type WeekSegment = { start: number; end: number };

type UploadListEntry =
  | { kind: "pending"; doc: DocRecord; review: ReviewDraft }
  | { kind: "active"; doc: DocRecord; guide?: StudyGuide | null };

const reviewWarningLabels: Record<keyof ReviewDraft["warnings"], string> = {
  unknownSubject: "Vak onbekend",
  missingWeek: "Week ontbreekt",
  duplicateDate: "Dubbele datum",
  duplicateWeek: "Dubbele week",
};

function isValidWeek(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 53;
}

function expandWeeksFromMeta(doc: DocRecord): number[] {
  return expandWeekRange(doc.beginWeek, doc.eindWeek);
}

function collectWeeksFromRow(row: DocRow): number[] {
  const collected = new Set<number>();
  const addWeek = (value?: number | null) => {
    if (isValidWeek(value)) {
      collected.add(value);
    }
  };

  row.weeks?.forEach(addWeek);
  addWeek(row.week);

  if (collected.size) {
    addWeek(row.week_span_start);
    addWeek(row.week_span_end);
  } else {
    const expanded = expandWeekRange(row.week_span_start, row.week_span_end);
    expanded.forEach(addWeek);
  }

  return Array.from(collected);
}

function groupWeeks(sortedWeeks: number[]): WeekSegment[] {
  if (!sortedWeeks.length) {
    return [];
  }
  const segments: WeekSegment[] = [];
  let start = sortedWeeks[0];
  let prev = sortedWeeks[0];
  for (let i = 1; i < sortedWeeks.length; i++) {
    const current = sortedWeeks[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    segments.push({ start, end: prev });
    start = current;
    prev = current;
  }
  segments.push({ start, end: prev });
  return segments;
}

function formatSegments(segments: WeekSegment[]): string {
  if (!segments.length) {
    return "";
  }
  return segments
    .map((segment) =>
      segment.start === segment.end ? `${segment.start}` : `${segment.start}–${segment.end}`
    )
    .join(" · ");
}

export function computeDocWeekInfo(doc: DocRecord, rows?: DocRow[]) {
  const weekSet = new Set<number>();
  rows?.forEach((row) => {
    collectWeeksFromRow(row).forEach((wk) => weekSet.add(wk));
  });

  if (!weekSet.size) {
    expandWeeksFromMeta(doc).forEach((wk) => weekSet.add(wk));
  } else {
    [doc.beginWeek, doc.eindWeek].forEach((wk) => {
      if (isValidWeek(wk)) {
        weekSet.add(wk);
      }
    });
  }

  const sortedWeeks = Array.from(weekSet)
    .filter(isValidWeek)
    .sort((a, b) => a - b);

  const segments = groupWeeks(sortedWeeks);

  let orderedSegments = segments;
  const begin = isValidWeek(doc.beginWeek) ? doc.beginWeek : undefined;
  if (begin !== undefined && segments.length > 1) {
    const hasLowerThanBegin = sortedWeeks.some((wk) => wk < begin);
    if (hasLowerThanBegin) {
      const beginIdx = segments.findIndex((segment) => begin >= segment.start && begin <= segment.end);
      if (beginIdx > 0) {
        orderedSegments = [...segments.slice(beginIdx), ...segments.slice(0, beginIdx)];
      }
    }
  }

  const label = formatSegments(orderedSegments);

  return {
    weeks: sortedWeeks,
    label,
  };
}

function formatWeekSet(weeks: Iterable<number>): string {
  const unique = Array.from(new Set(Array.from(weeks).filter(isValidWeek))).sort((a, b) => a - b);
  return unique.length ? formatSegments(groupWeeks(unique)) : "—";
}

function formatVersionLabel(version: StudyGuideVersion): string {
  const parsed = parseIsoDate(version.createdAt);
  if (!parsed) {
    return `Versie ${version.versionId}`;
  }
  return `Versie ${version.versionId} • ${parsed.toLocaleString("nl-NL")}`;
}

function reviewToDocRecord(review: ReviewDraft): DocRecord {
  return {
    ...(review.meta as DocRecord),
    enabled: false,
  };
}

function hasDuplicateDates(rows: DocRow[]): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.enabled === false) {
      continue;
    }
    const value = row?.datum?.trim();
    if (!value) {
      continue;
    }
    if (seen.has(value)) {
      return true;
    }
    seen.add(value);
  }
  return false;
}

function hasReviewWarnings(review: ReviewDraft): boolean {
  const blockingWarningKeys: Array<keyof ReviewDraft["warnings"]> = [
    "unknownSubject",
    "missingWeek",
  ];
  if (blockingWarningKeys.some((key) => review.warnings[key])) {
    return true;
  }
  if (hasDuplicateDates(review.rows)) {
    return true;
  }
  return false;
}

function useMetadata(docs: DocRecord[], docRows: Record<string, DocRow[]>) {
  const vakken = Array.from(new Set(docs.map((d) => d.vak))).sort();
  const niveaus = Array.from(new Set(docs.map((d) => d.niveau))).sort() as string[];
  const leerjaren = Array.from(new Set(docs.map((d) => d.leerjaar))).sort();
  const periodes = Array.from(new Set(docs.map((d) => d.periode))).sort((a, b) => a - b);
  const overallWeeks = new Set<number>();
  docs.forEach((doc) => {
    const info = computeDocWeekInfo(doc, docRows[doc.fileId]);
    info.weeks.forEach((wk) => overallWeeks.add(wk));
  });
  const weekBereik = formatWeekSet(overallWeeks);
  return { vakken, niveaus, leerjaren, periodes, weekBereik };
}

export default function Uploads() {
  // Globale docs + acties uit de store
  const {
    docs,
    removeDoc,
    setDocEnabled,
    docRows,
    studyGuides,
    guideVersions,
    guideDiffs,
    versionRows,
    selectedGuideId,
    selectedVersionId,
    selectGuideVersion,
    clearGuideSelection,
    setGuideVersions,
    setGuideDiff,
    setPendingReview,
    setActiveReview,
    pendingReviews,
    applyCommitResult,
    removePendingReview,
  } = useAppStore();
  const navigate = useNavigate();
  const { openPreview } = useDocumentPreview();

  // Lokale UI state
  const [filters, setFilters] = React.useState<Filters>({
    vak: "",
    niveau: "",
    leerjaar: "",
    periode: "",
  });
  const [detailDoc, setDetailDoc] = React.useState<DocRecord | null>(null);
  const [isUploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [activeTab, setActiveTab] = React.useState<"documents" | "vacations">("documents");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const dragCounterRef = React.useRef(0);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const detailDialogRef = React.useRef<HTMLDivElement | null>(null);
  const [startingReviewId, setStartingReviewId] = React.useState<string | null>(null);
  const pageSize = 10;

  const pendingReviewList = React.useMemo(() => {
    const entries = Object.values(pendingReviews);
    return entries.sort((a, b) => {
      const tsA = Date.parse(a.meta.uploadedAt ?? "");
      const tsB = Date.parse(b.meta.uploadedAt ?? "");
      return (Number.isNaN(tsB) ? 0 : tsB) - (Number.isNaN(tsA) ? 0 : tsA);
    });
  }, [pendingReviews]);

  const pendingReviewByFileId = React.useMemo(() => {
    const map = new Map<string, ReviewDraft>();
    for (const review of pendingReviewList) {
      const fileId = review.meta.fileId;
      if (fileId) {
        map.set(fileId, review);
      }
    }
    return map;
  }, [pendingReviewList]);

  const pendingReviewCount = pendingReviewList.length;

  const pendingDocRecords = React.useMemo(() => pendingReviewList.map(reviewToDocRecord), [
    pendingReviewList,
  ]);

  const docRowsForMetadata = React.useMemo(() => {
    const base: Record<string, DocRow[]> = { ...docRows };
    pendingReviewList.forEach((review) => {
      const fileId = review.meta.fileId;
      if (!fileId) {
        return;
      }
      if (!base[fileId]) {
        base[fileId] = review.rows;
      }
    });
    return base;
  }, [docRows, pendingReviewList]);

  const meta = useMetadata([...docs, ...pendingDocRecords], docRowsForMetadata);

  const uploadEntries = React.useMemo<UploadListEntry[]>(() => {
    const guideMap = new Map(studyGuides.map((guide) => [guide.guideId, guide]));
    const entries: UploadListEntry[] = [];
    pendingReviewList.forEach((review) => {
      entries.push({ kind: "pending", doc: reviewToDocRecord(review), review });
    });
    docs.forEach((doc) => {
      entries.push({ kind: "active", doc, guide: guideMap.get(doc.fileId) ?? null });
    });
    return entries.sort((a, b) => {
      const tsA = Date.parse(a.doc.uploadedAt ?? "");
      const tsB = Date.parse(b.doc.uploadedAt ?? "");
      return (Number.isNaN(tsB) ? 0 : tsB) - (Number.isNaN(tsA) ? 0 : tsA);
    });
  }, [pendingReviewList, docs, studyGuides]);

  const handleOpenReviewWizard = React.useCallback(
    (parseId?: string) => {
      if (!parseId) {
        return;
      }
      setActiveReview(parseId);
      navigate(`/review/${parseId}`);
    },
    [navigate, setActiveReview]
  );

  const handleReviewClick = React.useCallback(
    async (entry: UploadListEntry) => {
      if (entry.kind === "pending") {
        const { parseId } = entry.review;
        setActiveReview(parseId);
        setDetailDoc(null);
        navigate(`/review/${parseId}`);
        return;
      }
      const existing = pendingReviewList.find(
        (review) => review.meta.fileId === entry.doc.fileId
      );
      if (existing) {
        setActiveReview(existing.parseId);
        setDetailDoc(null);
        navigate(`/review/${existing.parseId}`);
        return;
      }
      setStartingReviewId(entry.doc.fileId);
      setError(null);
      try {
        const review = await apiCreateReviewFromVersion(
          entry.doc.fileId,
          entry.doc.versionId ?? null
        );
        setPendingReview(review);
        setActiveReview(review.parseId);
        setDetailDoc(null);
        navigate(`/review/${review.parseId}`);
      } catch (err: any) {
        console.warn(err);
        setError(err?.message || "Review starten mislukt");
      } finally {
        setStartingReviewId(null);
      }
    },
    [
      navigate,
      pendingReviewList,
      setActiveReview,
      setDetailDoc,
      setError,
      setPendingReview,
      setStartingReviewId,
    ]
  );

  const handleDeletePending = React.useCallback(
    async (review: ReviewDraft) => {
      const confirmed = window.confirm(
        `Weet je zeker dat je de review voor "${review.meta.bestand}" wilt verwijderen?`
      );
      if (!confirmed) {
        return;
      }
      try {
        await apiDeleteReview(review.parseId);
        removePendingReview(review.parseId);
      } catch (err: any) {
        console.warn(err);
        setError(err?.message || "Review verwijderen mislukt");
      }
    },
    [removePendingReview, setError]
  );

  const formatPendingMoment = React.useCallback((value?: string | null) => {
    if (!value) {
      return "Onbekend moment";
    }
    const parsed = parseIsoDate(value);
    if (!parsed) {
      return value;
    }
    return parsed.toLocaleString("nl-NL", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }, []);

  const reset = () =>
    setFilters({
      vak: "",
      niveau: "",
      leerjaar: "",
      periode: "",
    });

  const filteredEntries = React.useMemo(() => {
    return uploadEntries.filter((entry) => {
      const doc = entry.doc;
      const byVak =
        !filters.vak || doc.vak.toLowerCase().includes(filters.vak.trim().toLowerCase());
      const byNiv = !filters.niveau || doc.niveau === (filters.niveau as any);
      const byLeer = !filters.leerjaar || doc.leerjaar === filters.leerjaar;
      const byPer = !filters.periode || String(doc.periode) === filters.periode;
      return byVak && byNiv && byLeer && byPer;
    });
  }, [uploadEntries, filters]);

  React.useEffect(() => {
    setPage(1);
  }, [filters.vak, filters.niveau, filters.leerjaar, filters.periode]);

  React.useEffect(() => {
    setPage(1);
  }, [uploadEntries.length]);

  const totalPages = filteredEntries.length ? Math.ceil(filteredEntries.length / pageSize) : 1;
  const clampedPage = Math.min(page, totalPages);

  React.useEffect(() => {
    if (clampedPage !== page) {
      setPage(clampedPage);
    }
  }, [clampedPage, page]);
  
  const startIdx = (clampedPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filteredEntries.length);
  const visibleEntries = filteredEntries.slice(startIdx, endIdx);

  async function processFiles(fileList: FileList | File[] | null) {
    if (!fileList) {
      return;
    }
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList);
    if (!files.length) {
      return;
    }
    setUploading(true);
    setError(null);
    const errors: string[] = [];
    const pending: ReviewDraft[] = [];
    for (const file of files) {
      try {
        const responses = await apiUploadDoc(file);
        for (const review of responses) {
          if (hasReviewWarnings(review)) {
            pending.push(review);
            continue;
          }
          try {
            const commit: CommitResponse = await apiCommitReview(review.parseId);
            applyCommitResult(commit, review.rows, review);
          } catch (commitErr: any) {
            console.warn(`Automatisch committen mislukt voor ${file.name}:`, commitErr);
            errors.push(
              `${file.name}: automatisch opslaan mislukt (${commitErr?.message ?? "onbekende fout"})`
            );
            pending.push(review);
          }
        }
      } catch (e: any) {
        errors.push(`${file.name}: ${e?.message || "Upload mislukt"}`);
      }
    }
    pending.forEach((review) => {
      setPendingReview(review);
    });
    if (errors.length) {
      setError(errors.join(" | "));
    }
    setUploading(false);
  }

  async function handleUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    await processFiles(ev.target.files);
    ev.target.value = "";
  }

  const handleDrop: React.DragEventHandler<HTMLDivElement> = async (event) => {
    event.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    await processFiles(event.dataTransfer?.files ?? null);
  };

  const handleDragEnter: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    dragCounterRef.current += 1;
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleDropZoneKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFileDialog();
    }
  };

  async function handleDelete(doc: DocRecord) {
    const confirmed = window.confirm(
      `Weet je zeker dat je "${doc.bestand}" wilt verwijderen?`
    );
    if (!confirmed) return;
    try {
      await apiDeleteDoc(doc.fileId);
      removeDoc(doc.fileId); // verwijder uit globale store
    } catch (e: any) {
      console.warn(e);
      setError(e?.message || "Verwijderen mislukt");
    }
  }

  const toggleGebruik = (doc: DocRecord) => {
    setDocEnabled(doc.fileId, !doc.enabled);
  };

  React.useEffect(() => {
    if (!detailDoc) {
      clearGuideSelection();
      return;
    }
    const guideId = detailDoc.fileId;
    const versionsForGuide = guideVersions[guideId];
    const defaultVersion =
      versionsForGuide?.[0]?.versionId ?? detailDoc.versionId ?? null;
    if (selectedGuideId !== guideId) {
      selectGuideVersion(guideId, defaultVersion ?? null);
      return;
    }
    if (selectedVersionId == null && defaultVersion != null) {
      selectGuideVersion(guideId, defaultVersion);
    }
  }, [
    detailDoc,
    guideVersions,
    selectedGuideId,
    selectedVersionId,
    selectGuideVersion,
    clearGuideSelection,
  ]);

  React.useEffect(() => {
    if (!detailDoc) {
      return;
    }
    const guide = studyGuides.find((item) => item.guideId === detailDoc.fileId);
    if (!guide) {
      return;
    }
    const cachedVersions = guideVersions[guide.guideId];
    if (!cachedVersions || cachedVersions.length < guide.versionCount) {
      apiGetStudyGuideVersions(guide.guideId)
        .then((versions) => setGuideVersions(guide.guideId, versions))
        .catch((err) => {
          console.warn(`Kon versies niet laden voor ${guide.guideId}:`, err);
        });
    }
  }, [detailDoc, studyGuides, guideVersions, setGuideVersions]);

  React.useEffect(() => {
    if (
      !detailDoc ||
      selectedGuideId !== detailDoc.fileId ||
      selectedVersionId == null
    ) {
      return;
    }
    const diffEntry = guideDiffs[detailDoc.fileId]?.[selectedVersionId];
    if (!diffEntry) {
      apiGetStudyGuideDiff(detailDoc.fileId, selectedVersionId)
        .then((diff) => setGuideDiff(detailDoc.fileId, selectedVersionId, diff))
        .catch((err) => {
          console.warn(
            `Kon diff niet laden voor ${detailDoc.fileId}#${selectedVersionId}:`,
            err
          );
        });
    }
  }, [
    detailDoc,
    selectedGuideId,
    selectedVersionId,
    guideDiffs,
    setGuideDiff,
  ]);

  React.useEffect(() => {
    if (
      !detailDoc ||
      selectedGuideId !== detailDoc.fileId ||
      selectedVersionId == null
    ) {
      return;
    }
    const hasRows = versionRows[detailDoc.fileId]?.[selectedVersionId]?.length;
    if (!hasRows) {
      hydrateDocRowsFromApi(detailDoc.fileId, selectedVersionId);
    }
  }, [
    detailDoc,
    selectedGuideId,
    selectedVersionId,
    versionRows,
  ]);

  const detailRows: DocRow[] = React.useMemo(() => {
    if (!detailDoc) return [];
    const guideId = detailDoc.fileId;
    const versionId =
      selectedGuideId === guideId && selectedVersionId != null
        ? selectedVersionId
        : detailDoc.versionId ?? null;
    if (versionId != null) {
      const stored = versionRows[guideId]?.[versionId];
      if (stored) {
        return stored;
      }
      if (versionId === detailDoc.versionId) {
        return docRows[guideId] ?? [];
      }
    }
    return docRows[guideId] ?? [];
  }, [
    detailDoc,
    selectedGuideId,
    selectedVersionId,
    versionRows,
    docRows,
  ]);

  const versionList: StudyGuideVersion[] = React.useMemo(() => {
    if (!detailDoc) return [];
    return guideVersions[detailDoc.fileId] ?? [];
  }, [detailDoc, guideVersions]);

  const selectedVersionMeta: StudyGuideVersion | null = React.useMemo(() => {
    if (!detailDoc) return null;
    if (!versionList.length) return null;
    if (selectedGuideId !== detailDoc.fileId || selectedVersionId == null) {
      return versionList[0] ?? null;
    }
    return (
      versionList.find((version) => version.versionId === selectedVersionId) ??
      versionList[0] ??
      null
    );
  }, [detailDoc, versionList, selectedGuideId, selectedVersionId]);

  const currentDiff: DocDiff | null = React.useMemo(() => {
    if (
      !detailDoc ||
      selectedGuideId !== detailDoc.fileId ||
      selectedVersionId == null
    ) {
      return null;
    }
    return guideDiffs[detailDoc.fileId]?.[selectedVersionId] ?? null;
  }, [detailDoc, selectedGuideId, selectedVersionId, guideDiffs]);

  const metadataDiffByIndex = React.useMemo(() => {
    const map = new Map<number, DiffRow>();
    if (!currentDiff) {
      return map;
    }
    currentDiff.diff.forEach((entry) => {
      if (entry.status !== "removed") {
        map.set(entry.index, entry);
      }
    });
    return map;
  }, [currentDiff]);

  const detailWeekInfo = React.useMemo(() => {
    if (!detailDoc) {
      return null;
    }
    return computeDocWeekInfo(detailDoc, detailRows);
  }, [detailDoc, detailRows]);

  const detailWeekFallback = React.useMemo(() => {
    if (!detailDoc) {
      return "—";
    }
    const begin = isValidWeek(detailDoc.beginWeek) ? `${detailDoc.beginWeek}` : "—";
    const end = isValidWeek(detailDoc.eindWeek) ? `${detailDoc.eindWeek}` : "—";
    return begin === "—" && end === "—" ? "—" : `wk ${begin}–${end}`;
  }, [detailDoc]);

  const aggregate = React.useMemo(() => {
    if (!detailDoc || !detailRows.length) {
      return null;
    }
    const weekSet = new Set<number>();
    const dateList: string[] = [];
    const deadlines = new Set<string>();
    const opdrachten = new Set<string>();
    const huiswerk = new Set<string>();
    const bronnen = new Map<string, { label: string; url: string }>();
    const toetsen: { key: string; label: string; week?: number | null; datum?: string | null }[] = [];

    detailRows.forEach((row, idx) => {
      if (isValidWeek(row.week)) {
        weekSet.add(row.week);
      }
      if (row.datum) {
        dateList.push(row.datum);
      }
      if (row.inleverdatum) {
        deadlines.add(row.inleverdatum);
      }
      if (row.opdracht) {
        opdrachten.add(row.opdracht);
      }
      if (row.huiswerk) {
        huiswerk.add(row.huiswerk);
      }
      if (row.bronnen) {
        row.bronnen.forEach((br) => {
          if (!br?.url) return;
          if (!bronnen.has(br.url)) {
            const label = br.title && br.title.trim() ? br.title.trim() : br.url;
            bronnen.set(br.url, { label, url: br.url });
          }
        });
      }
      if (row.toets && (row.toets.type || row.toets.weging || row.toets.herkansing)) {
        const parts: string[] = [];
        if (row.toets.type) {
          parts.push(row.toets.type);
        }
        if (row.toets.weging) {
          parts.push(`weging ${row.toets.weging}`);
        }
        if (row.toets.herkansing && row.toets.herkansing !== "onbekend") {
          parts.push(`herkansing ${row.toets.herkansing}`);
        }
        const label = parts.length ? parts.join(" • ") : "Toetsmoment";
        toetsen.push({
          key: `${row.week ?? ""}-${row.datum ?? ""}-${idx}`,
          label,
          week: row.week,
          datum: row.datum,
        });
      }
    });

    dateList.sort();
    const weeks = Array.from(weekSet).sort((a, b) => a - b);
    const fallbackLabel = formatWeekSet(weekSet);
    const normalizedWeekLabel = detailWeekInfo?.label || (fallbackLabel === "—" ? "" : fallbackLabel);

    return {
      rowCount: detailRows.length,
      weeks,
      firstWeek: weeks[0],
      lastWeek: weeks[weeks.length - 1],
      firstDate: dateList[0],
      lastDate: dateList[dateList.length - 1],
      deadlines: Array.from(deadlines).sort(),
      opdrachten: Array.from(opdrachten),
      huiswerk: Array.from(huiswerk),
      bronnen: Array.from(bronnen.values()),
      toetsen,
      weekLabel: normalizedWeekLabel,
    };
  }, [detailDoc, detailRows, detailWeekInfo]);

  const dateFormatter = React.useMemo(() => new Intl.DateTimeFormat("nl-NL"), []);
  const timeFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  const formatDateTime = React.useCallback(
    (value?: string | null): { date: string; time: string } => {
      if (!value) return { date: "—", time: "" };
      const parsed = parseIsoDate(value) ?? new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return { date: value, time: "" };
      }
      return {
        date: dateFormatter.format(parsed),
        time: timeFormatter.format(parsed),
      };
    },
    [dateFormatter, timeFormatter]
  );

  const formatDate = React.useCallback(
    (value?: string | null) => formatDateTime(value).date,
    [formatDateTime]
  );

  const previewRows = detailRows.slice(0, 8);
  const hasMoreRows = detailRows.length > previewRows.length;
  useFocusTrap(detailDialogRef, !!detailDoc);

  React.useEffect(() => {
    if (!detailDoc) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDetailDoc(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailDoc]);

  React.useEffect(() => {
    if (activeTab === "documents" || !detailDoc) {
      return;
    }
    setDetailDoc(null);
  }, [activeTab, detailDoc]);

  const tabButtonClass = (tab: "documents" | "vacations") =>
    clsx(
      "rounded-full px-3 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--app-border)]",
      activeTab === tab
        ? "bg-[var(--app-accent)] text-white shadow"
        : "theme-surface theme-muted hover:bg-slate-100/80"
    );

  const headingLabel =
    activeTab === "documents" ? "Uploads & Documentbeheer" : "Schoolvakanties";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-semibold theme-text">{headingLabel}</div>
        <div
          role="tablist"
          aria-label="Beheer"
          className="inline-flex items-center gap-1 rounded-full border theme-border theme-surface p-1 shadow-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "documents"}
            className={tabButtonClass("documents")}
            onClick={() => setActiveTab("documents")}
          >
            Documenten
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "vacations"}
            className={tabButtonClass("vacations")}
            onClick={() => setActiveTab("vacations")}
          >
            Schoolvakanties
          </button>
        </div>
      </div>

      {activeTab === "documents" ? (
        <>
          {pendingReviewCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-900">
                {pendingReviewCount === 1
                  ? "Er staat 1 upload klaar voor review"
                  : `Er staan ${pendingReviewCount} uploads klaar voor review`}
              </div>
              <p className="mt-1 text-xs text-amber-800">
                Documenten met aandachtspunten staan gemarkeerd in de tabel. Start de review via de knop "Review" of open direct de wizard.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenReviewWizard(pendingReviewList[0]?.parseId)}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100"
            >
              Reviewwizard openen
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {pendingReviewList.slice(0, 3).map((review) => {
              const warningLabels = Object.entries(review.warnings)
                .filter(([, value]) => value)
                .map(([key]) => reviewWarningLabels[key as keyof ReviewDraft["warnings"]]);
              return (
                <button
                  key={review.parseId}
                  type="button"
                  onClick={() => handleOpenReviewWizard(review.parseId)}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:bg-amber-50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium text-amber-900">{review.meta.bestand}</div>
                      <div className="text-xs text-amber-800">
                        {review.meta.vak ? (
                          <span>
                            {review.meta.vak} • {review.meta.niveau ?? "niveau onbekend"} • leerjaar {review.meta.leerjaar ?? "?"}
                          </span>
                        ) : (
                          <span>Vak nog onbekend</span>
                        )}
                      </div>
                      <div className="text-xs text-amber-700">{formatPendingMoment(review.meta.uploadedAt)}</div>
                    </div>
                    <DiffSummaryBadges summary={review.diffSummary} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {warningLabels.length ? (
                      warningLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800"
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
                        Geen onzekerheden
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {pendingReviewCount > 3 && (
              <div className="text-xs text-amber-800">
                +{pendingReviewCount - 3} extra review(s) zichtbaar in de wizard.
              </div>
            )}
          </div>
        </div>
          )}

          {/* Uploadblok */}
          <div className="rounded-2xl border theme-border theme-surface p-4">
        <div className="mb-1 font-medium theme-text">Bestanden uploaden</div>
        <div className="text-sm theme-muted">
          Kies een <strong>PDF</strong> of <strong>DOCX</strong>. Metadata wordt automatisch herkend.
        </div>
        <div
          data-tour-id="upload-dropzone"
          role="button"
          tabIndex={0}
          aria-label="Studiewijzers uploaden"
          aria-describedby="upload-dropzone-help"
          onClick={openFileDialog}
          onKeyDown={handleDropZoneKeyDown}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={clsx(
            "mt-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--app-border)]",
            isDragOver ? "border-slate-500 bg-slate-100/80" : "theme-border theme-surface"
          )}
        >
          <span className="text-base font-medium theme-text">Sleep je studiewijzer hierheen</span>
          <span id="upload-dropzone-help" className="mt-2 text-sm theme-muted">
            of klik om te bladeren. We ondersteunen meerdere bestanden tegelijk.
          </span>
          <span className="mt-4 inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-1 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm">
            Bladeren
          </span>
          <input
            ref={fileInputRef}
            id="studiewijzer-upload"
            type="file"
            accept=".pdf,.docx"
            multiple
            className="sr-only"
            onChange={handleUpload}
          />
        </div>
        {isUploading && <div className="mt-3 text-sm theme-muted">Bezig met uploaden…</div>}
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </div>

      {/* Metadata-overzicht */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border theme-border theme-surface p-3">
          <div className="text-xs theme-muted mb-1">Beschikbare vakken</div>
          <div className="flex flex-wrap gap-1">
            {meta.vakken.map((v) => (
              <span key={v} className="text-xs rounded-full border theme-border theme-surface px-2 py-0.5">
                {v}
              </span>
            ))}
            {meta.vakken.length === 0 && <span className="text-xs theme-muted opacity-70">—</span>}
          </div>
        </div>
        <div className="rounded-2xl border theme-border theme-surface p-3">
          <div className="text-xs theme-muted mb-1">Niveaus</div>
          <div className="flex flex-wrap gap-1">
            {meta.niveaus.map((n) => (
              <span key={n} className="text-xs rounded-full border theme-border theme-surface px-2 py-0.5">
                {n}
              </span>
            ))}
            {meta.niveaus.length === 0 && <span className="text-xs theme-muted opacity-70">—</span>}
          </div>
        </div>
        <div className="rounded-2xl border theme-border theme-surface p-3">
          <div className="text-xs theme-muted mb-1">Leerjaren</div>
          <div className="flex flex-wrap gap-1">
            {meta.leerjaren.map((j) => (
              <span key={j} className="text-xs rounded-full border theme-border theme-surface px-2 py-0.5">
                {j}
              </span>
            ))}
            {meta.leerjaren.length === 0 && <span className="text-xs theme-muted opacity-70">—</span>}
          </div>
        </div>
        <div className="rounded-2xl border theme-border theme-surface p-3">
          <div className="text-xs theme-muted mb-1">Periodes &amp; Weken</div>
          <div className="flex flex-wrap items-center gap-1">
            {meta.periodes.map((p) => (
              <span key={p} className="text-xs rounded-full border theme-border theme-surface px-2 py-0.5">
                P{p}
              </span>
            ))}
            <span className="text-xs theme-muted ml-2">
              {meta.weekBereik === "—" ? "wk —" : `wk ${meta.weekBereik}`}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div
        data-tour-id="search-filters"
        role="region"
        aria-labelledby="upload-filter-heading"
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <span id="upload-filter-heading" className="sr-only">
          Filters voor uploads
        </span>
        <input
          placeholder="Zoek vak…"
          aria-label="Zoek op vak"
          value={filters.vak}
          onChange={(e) => setFilters((f) => ({ ...f, vak: e.target.value }))}
          className="rounded-md border theme-border theme-surface px-2 py-1"
        />
        <select
          className="rounded-md border theme-border theme-surface px-2 py-1"
          value={filters.niveau}
          aria-label="Filter op niveau"
          onChange={(e) => setFilters((f) => ({ ...f, niveau: e.target.value }))}
        >
          <option value="">Alle niveaus</option>
          {meta.niveaus.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border theme-border theme-surface px-2 py-1"
          value={filters.leerjaar}
          aria-label="Filter op leerjaar"
          onChange={(e) => setFilters((f) => ({ ...f, leerjaar: e.target.value }))}
        >
          <option value="">Alle leerjaren</option>
          {meta.leerjaren.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border theme-border theme-surface px-2 py-1"
          value={filters.periode}
          aria-label="Filter op periode"
          onChange={(e) => setFilters((f) => ({ ...f, periode: e.target.value }))}
        >
          <option value="">Alle periodes</option>
          {meta.periodes.map((p) => (
            <option key={p} value={String(p)}>
              P{p}
            </option>
          ))}
        </select>
        {(filters.vak || filters.niveau || filters.leerjaar || filters.periode) && (
          <button
            onClick={reset}
            className="ml-2 inline-flex items-center gap-1 rounded-md border theme-border theme-surface px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--app-border)]"
            title="Reset filters"
          >
            <XCircle size={14} /> Reset
          </button>
        )}
      </div>

      {/* Tabel */}
      <div className="rounded-2xl border theme-border theme-surface overflow-x-auto">
        {filteredEntries.length === 0 ? (
          <div className="p-6 text-sm theme-muted">Geen documenten gevonden.</div>
        ) : (
          <>
            <table className="table-auto min-w-max text-sm">
              <thead className="text-xs font-medium theme-muted border-b theme-border">
                <tr>
                  <th className="px-4 py-3 text-center font-medium w-16">
                    <span className="sr-only">Gebruik</span>
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Acties</th>
                  <th className="px-4 py-3 text-left font-medium">Bestand</th>
                  <th className="px-4 py-3 text-left font-medium">Datum / Tijd</th>
                  <th className="px-4 py-3 text-left font-medium">Vak</th>
                  <th className="px-4 py-3 text-left font-medium">Niveau</th>
                  <th className="px-4 py-3 text-left font-medium">Jaar</th>
                  <th className="px-4 py-3 text-left font-medium">Per.</th>
                  <th className="px-4 py-3 text-left font-medium">Weken</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry, i) => {
                  const d = entry.doc;
                  const { date, time } = formatDateTime(d.uploadedAt ?? null);
                  const rowsForInfo =
                    entry.kind === "pending" ? entry.review.rows : docRows[d.fileId];
                  const info = computeDocWeekInfo(d, rowsForInfo);
                  const beginLabel = isValidWeek(d.beginWeek) ? `${d.beginWeek}` : "—";
                  const endLabel = isValidWeek(d.eindWeek) ? `${d.eindWeek}` : "—";
                  const fallbackWeekLabel =
                    beginLabel === "—" && endLabel === "—" ? "—" : `wk ${beginLabel}–${endLabel}`;
                  const linkedReview =
                    entry.kind === "active" ? pendingReviewByFileId.get(d.fileId) ?? null : null;
                  const warningMessages = (() => {
                    if (entry.kind === "pending") {
                      const labels = Object.entries(entry.review.warnings)
                        .filter(([, value]) => value)
                        .map(([key]) => reviewWarningLabels[key as keyof ReviewDraft["warnings"]]);
                      return labels;
                    }
                    if (linkedReview) {
                      const labels = Object.entries(linkedReview.warnings)
                        .filter(([, value]) => value)
                        .map(([key]) => reviewWarningLabels[key as keyof ReviewDraft["warnings"]]);
                      return labels;
                    }
                    const versionWarnings = entry.guide?.latestVersion.warnings;
                    if (!versionWarnings) {
                      return [];
                    }
                    const labels = Object.entries(versionWarnings)
                      .filter(([, value]) => value)
                      .map(([key]) => reviewWarningLabels[key as keyof ReviewDraft["warnings"]]);
                    return labels;
                  })();
                  const hasBlockingWarnings = (() => {
                    if (entry.kind === "pending") {
                      return (
                        entry.review.warnings.unknownSubject || entry.review.warnings.missingWeek
                      );
                    }
                    if (linkedReview) {
                      return linkedReview.warnings.unknownSubject || linkedReview.warnings.missingWeek;
                    }
                    return false;
                  })();
                  const hasActiveWarnings = warningMessages.length > 0;
                  const StatusIcon = hasBlockingWarnings
                    ? XOctagon
                    : hasActiveWarnings
                    ? AlertTriangle
                    : null;
                  const statusColorClasses = hasBlockingWarnings
                    ? "text-red-600"
                    : hasActiveWarnings
                    ? "text-amber-600"
                    : "";
                  const statusTextColor = hasBlockingWarnings
                    ? "text-red-600"
                    : hasActiveWarnings
                    ? "text-amber-700"
                    : "theme-muted";
                  const statusIconTestId = hasBlockingWarnings
                    ? "status-icon-error"
                    : hasActiveWarnings
                    ? "status-icon-warning"
                    : undefined;
                  const showWarnings = hasActiveWarnings;
                  const rowClassName = clsx(
                    i > 0 ? "border-t theme-border" : "",
                    entry.kind === "pending" && "bg-amber-50"
                  );
                  const reviewButtonTitle =
                    entry.kind === "pending"
                      ? "Review openen"
                      : "Start nieuwe review";
                  const isReviewLoading =
                    entry.kind === "active" && startingReviewId === d.fileId;
                  const reviewButtonClass = clsx(
                    "rounded-lg border p-1 disabled:cursor-not-allowed disabled:opacity-60",
                    entry.kind === "pending"
                      ? "border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200"
                      : "theme-border theme-surface"
                  );
                  return (
                    <tr key={`${entry.kind}-${d.fileId}-${entry.kind === "pending" ? entry.review.parseId : d.versionId ?? "latest"}`} className={rowClassName}>
                      <td className="px-4 py-3 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => entry.kind === "active" && toggleGebruik(d)}
                          disabled={entry.kind !== "active"}
                          className={clsx(
                            "inline-flex items-center justify-center",
                            entry.kind !== "active" && "cursor-not-allowed opacity-40"
                          )}
                          aria-label={
                            entry.kind === "active"
                              ? d.enabled
                                ? `Gebruik uitschakelen voor ${d.bestand}`
                                : `Gebruik inschakelen voor ${d.bestand}`
                              : `In review – niet in gebruik`
                          }
                          title={
                            entry.kind === "active"
                              ? d.enabled
                                ? `${d.bestand} is actief – klik om te deactiveren`
                                : `${d.bestand} is inactief – klik om te activeren`
                              : "Document staat in review – activeren niet mogelijk"
                          }
                        >
                          {entry.kind === "active" ? (
                            d.enabled ? (
                              <ToggleRight size={18} className="text-emerald-600" />
                            ) : (
                              <ToggleLeft size={18} className="theme-muted" />
                            )
                          ) : (
                            <ToggleLeft size={18} className="theme-muted" />
                          )}
                          <span className="sr-only">
                            {entry.kind === "active"
                              ? d.enabled
                                ? "Actief"
                                : "Inactief"
                              : "Niet beschikbaar"
                            }
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                          <button
                            onClick={() => void handleReviewClick(entry)}
                            title={reviewButtonTitle}
                            aria-label={reviewButtonTitle}
                            aria-busy={isReviewLoading}
                            disabled={isReviewLoading}
                            className={reviewButtonClass}
                          >
                            <ClipboardList size={16} />
                          </button>
                          {entry.kind === "active" ? (
                            <>
                              <button
                                title={`Bron: ${d.bestand}`}
                                className="rounded-lg border theme-border theme-surface p-1"
                                onClick={() => openPreview({ fileId: d.fileId, filename: d.bestand })}
                              >
                                <FileText size={16} />
                              </button>
                              <button
                                onClick={() => setDetailDoc(d)}
                                title="Meta-details"
                                className="rounded-lg border theme-border theme-surface p-1"
                              >
                                <Info size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(d)}
                                title="Verwijder"
                                className="rounded-lg border theme-border theme-surface p-1 text-red-600"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleDeletePending(entry.review)}
                              title="Review verwijderen"
                              aria-label="Review verwijderen"
                              className="rounded-lg border border-red-200 bg-red-50 p-1 text-red-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top break-words" title={d.bestand}>
                        <div className="font-medium">{d.bestand}</div>
                        {entry.kind === "pending" && (
                          <div className="text-xs text-amber-700">Review vereist</div>
                        )}
                        {showWarnings && (
                          <div className="mt-1 flex items-start gap-2 text-xs leading-tight">
                            {StatusIcon && (
                              <StatusIcon
                                size={14}
                                aria-hidden="true"
                                data-testid={statusIconTestId}
                                className={clsx("mt-0.5 flex-shrink-0", statusColorClasses)}
                              />
                            )}
                            <div className={clsx("space-y-0.5", statusTextColor)}>
                              {warningMessages.map((message, index) => (
                                <div key={`${d.fileId}-warning-${index}`}>{message}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="leading-tight">
                          <div>{date}</div>
                          {time && <div className="text-xs theme-muted">{time}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">{d.vak}</td>
                      <td className="px-4 py-3 align-top">{d.niveau}</td>
                      <td className="px-4 py-3 align-top">{d.leerjaar}</td>
                      <td className="px-4 py-3 align-top">P{d.periode}</td>
                      <td className="px-4 py-3 align-top">
                        {info.label ? `wk ${info.label}` : fallbackWeekLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t theme-border px-4 py-3 text-xs theme-muted">
              <div>
                Toont {startIdx + 1}–{endIdx} van {filteredEntries.length} bestanden
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, clampedPage - 1))}
                  disabled={clampedPage === 1}
                  className="rounded-md border theme-border theme-surface px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Vorige
                </button>
                <span>
                  Pagina {clampedPage} van {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, clampedPage + 1))}
                  disabled={clampedPage === totalPages}
                  className="rounded-md border theme-border theme-surface px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Volgende
                </button>
              </div>
            </div>
          </>
        )}
      </div>

        </>
      ) : (
        <SchoolVacationManager />
      )}

      {/* Detail modal */}
      {activeTab === "documents" && detailDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setDetailDoc(null);
            }
          }}
        >
          <div
            ref={detailDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-modal-title"
            className="w-full max-w-4xl overflow-hidden rounded-2xl border theme-border theme-surface shadow-lg"
          >
            <div className="flex items-center justify-between border-b theme-border px-6 py-4">
              <h2
                id="detail-modal-title"
                className="text-lg font-semibold truncate"
                title={detailDoc.bestand}
              >
                Metadata — {detailDoc.bestand}
              </h2>
              <button
                onClick={() => setDetailDoc(null)}
                className="rounded-md border theme-border theme-surface px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--app-border)]"
                aria-label="Sluiten"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto px-6 py-5 text-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Vak</div>
                  <div className="font-medium theme-text">{detailDoc.vak}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Niveau</div>
                  <div>{detailDoc.niveau}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Jaar</div>
                  <div>{detailDoc.leerjaar}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Per.</div>
                  <div>P{detailDoc.periode}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Weekbereik</div>
                  <div>{detailWeekInfo?.label ? `wk ${detailWeekInfo.label}` : detailWeekFallback}</div>
                </div>
                <div>
                  <div className="text-xs theme-muted uppercase tracking-wide">Schooljaar</div>
                  <div>{detailDoc.schooljaar || "—"}</div>
                </div>
              </div>

              {aggregate ? (
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="font-medium theme-text">Geëxtraheerde gegevens</div>
                    <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-lg border theme-border theme-soft p-3">
                        <div className="theme-muted mb-1 uppercase tracking-wide">Aantal regels</div>
                        <div className="text-base font-semibold">{aggregate.rowCount}</div>
                      </div>
                      <div className="rounded-lg border theme-border theme-soft p-3">
                        <div className="theme-muted mb-1 uppercase tracking-wide">Unieke weken</div>
                        <div>{aggregate.weekLabel ? `wk ${aggregate.weekLabel}` : "—"}</div>
                      </div>
                      <div className="rounded-lg border theme-border theme-soft p-3">
                        <div className="theme-muted mb-1 uppercase tracking-wide">Datumbereik</div>
                        <div>
                          {aggregate.firstDate ? formatDate(aggregate.firstDate) : "—"} –
                          {" "}
                          {aggregate.lastDate ? formatDate(aggregate.lastDate) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {aggregate.deadlines.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Deadlines &amp; inleverdata</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                        {aggregate.deadlines.map((deadline) => (
                          <li key={deadline}>{formatDate(deadline)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aggregate.toetsen.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Toetsmomenten</div>
                      <ul className="mt-2 space-y-1 text-xs">
                        {aggregate.toetsen.map((item) => (
                          <li key={item.key} className="rounded-lg border theme-border theme-soft px-3 py-2">
                            <div className="font-semibold">
                              {item.week ? `Week ${item.week}` : "Week onbekend"}
                              {item.datum ? ` · ${formatDate(item.datum)}` : ""}
                            </div>
                            <div>{item.label}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aggregate.opdrachten.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Opdrachten</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                        {aggregate.opdrachten.slice(0, 6).map((item) => (
                          <li key={item} className="whitespace-pre-wrap">{item}</li>
                        ))}
                        {aggregate.opdrachten.length > 6 && (
                          <li className="theme-muted">… en {aggregate.opdrachten.length - 6} meer</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {aggregate.huiswerk.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Huiswerk</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                        {aggregate.huiswerk.slice(0, 6).map((item) => (
                          <li key={item} className="whitespace-pre-wrap">{item}</li>
                        ))}
                        {aggregate.huiswerk.length > 6 && (
                          <li className="theme-muted">… en {aggregate.huiswerk.length - 6} meer</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {aggregate.bronnen.length > 0 && (
                    <div>
                      <div className="font-medium theme-text">Bronnen &amp; links</div>
                      <ul className="mt-2 space-y-1 text-xs">
                        {aggregate.bronnen.map((br) => (
                          <li key={br.url}>
                            <a
                              href={br.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {br.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <div className="font-medium theme-text">Versies &amp; wijzigingen</div>
                    {versionList.length ? (
                      <div className="mt-3 space-y-4">
                        <label className="block text-xs font-medium uppercase tracking-wide theme-muted">
                          Kies versie
                          <select
                            value={selectedVersionMeta?.versionId ?? ""}
                            onChange={(event) => {
                              const next = Number.parseInt(event.target.value, 10);
                              selectGuideVersion(
                                detailDoc.fileId,
                                Number.isNaN(next) ? null : next
                              );
                            }}
                            className="mt-1 w-full rounded-md border theme-border bg-white px-3 py-2 text-sm"
                          >
                            {versionList.map((version) => (
                              <option key={version.versionId} value={version.versionId}>
                                {formatVersionLabel(version)}
                              </option>
                            ))}
                          </select>
                        </label>

                        {selectedVersionMeta && (
                          <>
                            <div className="space-y-2 rounded-lg border theme-border theme-soft p-3">
                              <DiffSummaryBadges
                                summary={
                                  currentDiff?.diffSummary ?? selectedVersionMeta.diffSummary
                                }
                              />
                              {selectedVersionMeta.versionId === 1 ? (
                                <div className="text-xs theme-muted">
                                  Dit is de eerste versie van deze studiewijzer.
                                </div>
                              ) : currentDiff ? (
                                <DiffRowsList
                                  diff={currentDiff.diff}
                                  emptyLabel="Geen verschillen met de vorige versie."
                                />
                              ) : (
                                <div className="text-xs theme-muted">Diff wordt geladen…</div>
                              )}
                            </div>

                            <div>
                              <div className="text-sm font-medium theme-text">
                                Rijen (alleen lezen)
                              </div>
                              <div className="mt-2 overflow-x-auto">
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-left theme-muted">
                                      <th className="px-3 py-2">Status</th>
                                      <th className="px-3 py-2">Actief</th>
                                      <th className="px-3 py-2">Week</th>
                                      <th className="px-3 py-2">Datum</th>
                                      <th className="px-3 py-2">Les</th>
                                      <th className="px-3 py-2">Onderwerp</th>
                                      <th className="px-3 py-2">Huiswerk</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detailRows.map((row, idx) => {
                                      const rowDiff = metadataDiffByIndex.get(idx);
                                      const rowStatus = (rowDiff?.status ?? "unchanged") as DiffStatus;
                                      const isDisabled = row.enabled === false;
                                      return (
                                        <tr
                                          key={`version-row-${idx}`}
                                          className={clsx(
                                            "border-t theme-border align-top",
                                            isDisabled && "opacity-60"
                                          )}
                                        >
                                          <td className="px-3 py-2 align-top">
                                            <span
                                              className={clsx(
                                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                                                diffStatusStyles[rowStatus]
                                              )}
                                            >
                                              {diffStatusLabels[rowStatus]}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 align-top">
                                            {isDisabled ? "Uit" : "Aan"}
                                          </td>
                                          <td className="px-3 py-2 align-top font-semibold">
                                            {row.week ?? "—"}
                                          </td>
                                          <td className="px-3 py-2 align-top">
                                            {row.datum ? formatDate(row.datum) : "—"}
                                          </td>
                                          <td className="px-3 py-2 align-top whitespace-pre-wrap">
                                            {row.les || "—"}
                                          </td>
                                          <td className="px-3 py-2 align-top whitespace-pre-wrap">
                                            {row.onderwerp || "—"}
                                          </td>
                                          <td className="px-3 py-2 align-top whitespace-pre-wrap">
                                            {row.huiswerk || "—"}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    {detailRows.length === 0 && (
                                      <tr>
                                        <td
                                          colSpan={7}
                                          className="px-3 py-4 text-center theme-muted"
                                        >
                                          Geen rijen beschikbaar voor deze versie.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs theme-muted">Geen versies beschikbaar.</div>
                    )}
                  </div>

                  <div>
                    <div className="font-medium theme-text">Voorbeeld van geëxtraheerde rijen</div>
                    <div className="mt-2 overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-left theme-muted">
                            <th className="px-3 py-2">Week</th>
                            <th className="px-3 py-2">Datum</th>
                            <th className="px-3 py-2">Onderwerp</th>
                            <th className="px-3 py-2">Huiswerk</th>
                            <th className="px-3 py-2">Opdracht</th>
                            <th className="px-3 py-2">Inleverdatum</th>
                            <th className="px-3 py-2">Toets</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, idx) => (
                            <tr key={`${row.week ?? ""}-${row.datum ?? ""}-${idx}`} className="border-t theme-border align-top">
                              <td className="px-3 py-2 font-semibold">{row.week ?? "—"}</td>
                              <td className="px-3 py-2">{row.datum ? formatDate(row.datum) : "—"}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap">{row.onderwerp || "—"}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap">{row.huiswerk || "—"}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap">{row.opdracht || "—"}</td>
                              <td className="px-3 py-2">{row.inleverdatum ? formatDate(row.inleverdatum) : "—"}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap">
                                {row.toets && (row.toets.type || row.toets.weging || row.toets.herkansing)
                                  ? [row.toets.type, row.toets.weging ? `weging ${row.toets.weging}` : null, row.toets.herkansing && row.toets.herkansing !== "onbekend"
                                      ? `herkansing ${row.toets.herkansing}`
                                      : null]
                                      .filter(Boolean)
                                      .join(" • ")
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                          {previewRows.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-3 py-4 text-center theme-muted">
                                Geen regels beschikbaar.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {hasMoreRows && (
                      <div className="mt-2 text-xs theme-muted">
                        Er zijn in totaal {detailRows.length} rijen beschikbaar. Bekijk het bestand voor de volledige inhoud.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-5 text-sm theme-muted">Geen gedetailleerde gegevens gevonden voor dit document.</div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
