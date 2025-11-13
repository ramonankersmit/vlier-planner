export type DocMeta = {
  fileId: string;
  guideId?: string | null;
  versionId?: number | null;
  bestand: string;
  vak: string;
  niveau: "HAVO" | "VWO";
  leerjaar: string;
  periode: number;
  beginWeek: number;
  eindWeek: number;
  schooljaar?: string | null;
  uploadedAt?: string | null;
};

export type DocToets = {
  type?: string | null;
  weging?: string | null;
  herkansing?: string | null;
};

export type DocResource = {
  type?: string | null;
  title?: string | null;
  url?: string | null;
};

export type DocRow = {
  week?: number | null;
  weeks?: number[] | null;
  week_span_start?: number | null;
  week_span_end?: number | null;
  week_label?: string | null;
  datum?: string | null;
  datum_eind?: string | null;
  les?: string | null;
  onderwerp?: string | null;
  leerdoelen?: string[] | null;
  huiswerk?: string | null;
  opdracht?: string | null;
  inleverdatum?: string | null;
  toets?: DocToets | null;
  bronnen?: DocResource[] | null;
  notities?: string | null;
  klas_of_groep?: string | null;
  locatie?: string | null;
  enabled?: boolean | null;
  source_row_id?: string | null;
};

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export type DiffSummary = {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
};

export type DiffField = {
  status: DiffStatus;
  old: unknown;
  new: unknown;
};

export type DiffRow = {
  index: number;
  status: DiffStatus;
  fields: Record<string, DiffField>;
};

export type DocDiff = {
  diffSummary: DiffSummary;
  diff: DiffRow[];
};

export type UploadWarnings = {
  unknownSubject: boolean;
  missingWeek: boolean;
  duplicateDate: boolean;
  duplicateWeek: boolean;
};

export type ReviewDraft = DocDiff & {
  parseId: string;
  meta: DocMeta;
  rows: DocRow[];
  warnings: UploadWarnings;
  fileName?: string;
  storedFile?: string;
};

export type StudyGuideVersion = {
  versionId: number;
  createdAt: string;
  meta: DocMeta;
  diffSummary: DiffSummary;
  warnings: UploadWarnings;
};

export type StudyGuide = {
  guideId: string;
  versionCount: number;
  latestVersion: StudyGuideVersion;
};

export type StudyGuideDiff = DocDiff & {
  guideId: string;
  versionId: number;
};

export type ReviewUpdatePayload = {
  meta?: Partial<DocMeta>;
  rows?: DocRow[];
};

export type CommitResponse = {
  guideId: string;
  version: StudyGuideVersion;
};

export type SchoolVacationImport = {
  id: string;
  name: string;
  region: string;
  startDate: string;
  endDate: string;
  schoolYear: string;
  source: string;
  label: string;
  rawText?: string | null;
  notes?: string | null;
};

export type SchoolVacationDownload = {
  schoolYear: string;
  source: string;
  retrievedAt: string;
  title?: string | null;
  vacations: SchoolVacationImport[];
};

function resolveApiBase(): string {
  const envBase = (import.meta.env.VITE_API_BASE ?? "").trim();
  if (envBase) {
    return envBase;
  }

  if (!import.meta.env.DEV) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
  }

  return "http://localhost:8000";
}

export const API_BASE = resolveApiBase();
const BASE = API_BASE;

export async function apiListDocs(): Promise<DocMeta[]> {
  const r = await fetch(`${BASE}/api/docs`);
  if (!r.ok) throw new Error(`list_docs failed: ${r.status}`);
  return (await r.json()) as DocMeta[];
}

export async function apiDeleteDoc(fileId: string): Promise<void> {
  const r = await fetch(`${BASE}/api/docs/${fileId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`delete_doc failed: ${r.status}`);
}

export async function apiDeleteAllDocs(): Promise<void> {
  const r = await fetch(`${BASE}/api/docs`, { method: "DELETE" });
  if (!r.ok) throw new Error(`delete_all_docs failed: ${r.status}`);
}

export async function apiUploadDoc(file: File): Promise<ReviewDraft[]> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`upload failed: ${r.status} – ${txt}`);
  }
  return (await r.json()) as ReviewDraft[];
}

export async function apiGetDocRows(fileId: string, versionId?: number): Promise<DocRow[]> {
  const params = versionId != null ? `?versionId=${versionId}` : "";
  const r = await fetch(`${BASE}/api/docs/${fileId}/rows${params}`);
  if (!r.ok) {
    throw new Error(`get_rows failed: ${r.status}`);
  }
  return (await r.json()) as DocRow[];
}

export type DocPreview = {
  mediaType: string;
  url?: string;
  html?: string;
  filename?: string;
};

export async function apiGetDocPreview(fileId: string, versionId?: number): Promise<DocPreview> {
  const params = versionId != null ? `?versionId=${versionId}` : "";
  const r = await fetch(`${BASE}/api/docs/${fileId}/preview${params}`);
  if (!r.ok) {
    throw new Error(`preview_doc failed: ${r.status}`);
  }
  return (await r.json()) as DocPreview;
}

export async function apiGetStudyGuides(): Promise<StudyGuide[]> {
  const r = await fetch(`${BASE}/api/study-guides`);
  if (!r.ok) {
    throw new Error(`study_guides failed: ${r.status}`);
  }
  return (await r.json()) as StudyGuide[];
}

export async function apiGetStudyGuideVersions(guideId: string): Promise<StudyGuideVersion[]> {
  const r = await fetch(`${BASE}/api/study-guides/${guideId}/versions`);
  if (!r.ok) {
    throw new Error(`guide_versions failed: ${r.status}`);
  }
  return (await r.json()) as StudyGuideVersion[];
}

export async function apiFetchSchoolVacations(
  schoolYear: string
): Promise<SchoolVacationDownload> {
  const params = new URLSearchParams({ schoolYear });
  const r = await fetch(`${BASE}/api/school-vacations?${params.toString()}`);
  if (!r.ok) {
    throw new Error(`school_vacations failed: ${r.status}`);
  }
  return (await r.json()) as SchoolVacationDownload;
}

export async function apiGetStudyGuideDiff(
  guideId: string,
  versionId: number
): Promise<StudyGuideDiff> {
  const r = await fetch(`${BASE}/api/study-guides/${guideId}/diff/${versionId}`);
  if (!r.ok) {
    throw new Error(`guide_diff failed: ${r.status}`);
  }
  return (await r.json()) as StudyGuideDiff;
}

export async function apiGetReview(parseId: string): Promise<ReviewDraft> {
  const r = await fetch(`${BASE}/api/reviews/${parseId}`);
  if (!r.ok) {
    throw new Error(`get_review failed: ${r.status}`);
  }
  return (await r.json()) as ReviewDraft;
}

export async function apiUpdateReview(
  parseId: string,
  payload: ReviewUpdatePayload
): Promise<ReviewDraft> {
  const r = await fetch(`${BASE}/api/reviews/${parseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    throw new Error(`update_review failed: ${r.status}`);
  }
  return (await r.json()) as ReviewDraft;
}

export async function apiCommitReview(parseId: string): Promise<CommitResponse> {
  const r = await fetch(`${BASE}/api/reviews/${parseId}/commit`, {
    method: "POST",
  });
  if (!r.ok) {
    throw new Error(`commit_review failed: ${r.status}`);
  }
  return (await r.json()) as CommitResponse;
}

export async function apiDeleteReview(parseId: string): Promise<void> {
  const r = await fetch(`${BASE}/api/reviews/${parseId}`, { method: "DELETE" });
  if (!r.ok) {
    throw new Error(`delete_review failed: ${r.status}`);
  }
}

export async function apiCreateReviewFromVersion(
  guideId: string,
  versionId?: number | null
): Promise<ReviewDraft> {
  const payload: { guideId: string; versionId?: number } = { guideId };
  if (versionId != null) {
    payload.versionId = versionId;
  }
  const r = await fetch(`${BASE}/api/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    throw new Error(`create_review failed: ${r.status}`);
  }
  return (await r.json()) as ReviewDraft;
}

export type UpdateInfo = {
  current: string;
  latest: string | null;
  has_update: boolean;
  asset_url?: string | null;
  asset_name?: string | null;
  notes?: string | null;
};

export type UpdateInstallResponse = {
  status: "started";
  installerPath: string;
  restartInitiated?: boolean;
  targetVersion?: string;
};

export async function apiGetVersion(): Promise<{ version: string }> {
  const response = await fetch(`${BASE}/api/system/version`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`version_fetch failed: ${response.status}`);
  }
  return response.json();
}

export async function apiCheckUpdate(): Promise<UpdateInfo> {
  const response = await fetch(`${BASE}/api/system/update`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`update_check failed: ${response.status}`);
  }
  return response.json();
}

export async function apiInstallUpdate(
  version: string,
  options?: { silent?: boolean }
): Promise<UpdateInstallResponse> {
  const payload = {
    version,
    silent: options?.silent ?? true,
  };

  const response = await fetch(`${BASE}/api/system/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`update_install failed: ${response.status} – ${message}`);
  }
  return (await response.json()) as UpdateInstallResponse;
}
