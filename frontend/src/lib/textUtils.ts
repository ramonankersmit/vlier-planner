export function splitHomeworkItems(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/(?:;|\n)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
