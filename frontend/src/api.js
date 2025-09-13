export async function parseFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const res = await fetch(import.meta.env.VITE_API_URL || 'http://localhost:8000/parse', {
    method: 'POST',
    body: fd
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
