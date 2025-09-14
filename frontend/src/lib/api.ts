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

const BASE = "http://localhost:8000";

export async function apiListDocs(): Promise<DocMeta[]> {
  const r = await fetch(`${BASE}/api/docs`);
  if (!r.ok) throw new Error(`list_docs failed: ${r.status}`);
  return r.json();
}

export async function apiDeleteDoc(fileId: string): Promise<void> {
  const r = await fetch(`${BASE}/api/docs/${fileId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`delete_doc failed: ${r.status}`);
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
