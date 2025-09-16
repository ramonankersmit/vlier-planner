const BULLET_RE = /[•●◦▪▫]/g;
const BASE_SPLIT_RE = /[;\n]/;
const KEYWORD_SPLITTERS = [
  /(?=Opgaven\s+\d+)/i,
  /(?=Opdrachten?\s+\d+)/i,
  /(?=Par(?:agraaf)?\s+\d+[a-z]?)/i,
  /(?=Hoofdstuk\s+\d+)/i,
  /(?=Bl(?:z|ad)\.?\s*\d+)/i,
  /(?=§\s*\d+)/,
];

export function splitHomeworkItems(raw?: string | null): string[] {
  if (!raw) return [];
  const sanitized = raw.replace(BULLET_RE, "\n");
  const initialParts = sanitized
    .split(BASE_SPLIT_RE)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const expanded = initialParts.flatMap((part) => {
    let segments = [part];
    for (const splitter of KEYWORD_SPLITTERS) {
      segments = segments.flatMap((segment) => {
        const trimmed = segment.trim();
        if (!trimmed) return [];
        const pieces = trimmed.split(splitter).map((piece) => piece.trim()).filter(Boolean);
        return pieces.length > 1 ? pieces : [trimmed];
      });
    }
    return segments;
  });

  const normalized = expanded
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of normalized) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}
