export type DocMeta = {
  fileId: string;
  bestand: string;
  vak: string;
  niveau: "HAVO" | "VWO";
  leerjaar: string;
  periode: number;
  beginWeek: number;
  eindWeek: number;
  schooljaar?: string | null;
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
  datum?: string | null;
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
};

const resolveDefaultBase = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost:8000";
};

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? resolveDefaultBase();
const BASE = API_BASE.replace(/\/$/, "");

export async function apiListDocs(): Promise<DocMeta[]> {
  const r = await fetch(`${BASE}/api/docs`);
  if (!r.ok) throw new Error(`list_docs failed: ${r.status}`);
  return r.json();
}

export async function apiDeleteDoc(fileId: string): Promise<void> {
  const r = await fetch(`${BASE}/api/docs/${fileId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`delete_doc failed: ${r.status}`);
}

export async function apiDeleteAllDocs(): Promise<void> {
  const r = await fetch(`${BASE}/api/docs`, { method: "DELETE" });
  if (!r.ok) throw new Error(`delete_all_docs failed: ${r.status}`);
}

export async function apiUploadDoc(file: File): Promise<DocMeta> {
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
  return r.json();
}

export async function apiGetDocRows(fileId: string): Promise<DocRow[]> {
  const r = await fetch(`${BASE}/api/docs/${fileId}/rows`);
  if (!r.ok) {
    throw new Error(`get_rows failed: ${r.status}`);
  }
  return r.json();
}

export type DocPreview = {
  mediaType: string;
  url?: string;
  html?: string;
  filename?: string;
};

export async function apiGetDocPreview(fileId: string): Promise<DocPreview> {
  const r = await fetch(`${BASE}/api/docs/${fileId}/preview`);
  if (!r.ok) {
    throw new Error(`preview_doc failed: ${r.status}`);
  }
  return r.json();
}
