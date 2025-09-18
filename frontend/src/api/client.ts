const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function jsonFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const client = {
  getWeeks: (from: string, to: string) =>
    jsonFetch(`${API_URL}/api/weeks?from=${from}&to=${to}`),
  getDeadlines: (week: number, year: number) =>
    jsonFetch(`${API_URL}/api/deadlines?week=${week}&year=${year}`),
  getMatrix: (period: number, year: number) =>
    jsonFetch(`${API_URL}/api/matrix?period=${period}&year=${year}`),
  getStudyUnits: () => jsonFetch(`${API_URL}/api/study-units`),
  getAssessments: (period: number, year: number) =>
    jsonFetch(`${API_URL}/api/assessments?period=${period}&year=${year}`),
  uploadAndParse: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return jsonFetch(`${API_URL}/api/uploads`, { method: "POST", body: fd });
  },
};
export type ApiClient = typeof client;
