const BULLET_RE = /[•●◦▪▫]/g;
const BASE_SPLIT_RE = /[;\r\n]/;
const VERB_AFTER_COMMA_WORDS = [
  "bestudeer",
  "bestuderen",
  "leer",
  "leren",
  "maak",
  "maken",
  "werk",
  "werken",
  "herhaal",
  "herhalen",
  "oefen",
  "oefenen",
  "lees",
  "lezen",
  "samenvat",
  "samenvatten",
  "bekijk",
  "bekijken",
  "schrijf",
  "schrijven",
  "afrond",
  "afronden",
  "afmaak",
  "afmaken",
  "voorbereid",
  "voorbereiden",
  "doe",
  "doen",
  "inlever",
  "inleveren",
  "invul",
  "invullen",
  "bespreek",
  "bespreken",
  "analyseer",
  "analyseren",
  "onderzoek",
  "onderzoeken",
  "present",
  "presenteren",
];
const VERB_WORD_RE = new RegExp(
  `\\b(?:${VERB_AFTER_COMMA_WORDS.join("|")})\\b`,
  "gi"
);
const TRAILING_VERB_SEPARATOR_RE = /\s*(?:,|\ben\b|\bof\b|&|\+|\/|-)\s*$/i;

function stripTrailingVerbSeparator(value: string): string {
  let current = value;
  while (current) {
    const next = current.replace(TRAILING_VERB_SEPARATOR_RE, "");
    if (next === current) {
      break;
    }
    current = next;
  }
  return current.trim();
}

function splitOnHomeworkVerbs(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  VERB_WORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let verbCount = 0;
  let lastIndex = 0;
  const parts: string[] = [];

  while ((match = VERB_WORD_RE.exec(trimmed)) !== null) {
    verbCount += 1;
    if (verbCount === 1) continue;

    const beforeVerb = trimmed.slice(lastIndex, match.index);
    const cleaned = stripTrailingVerbSeparator(beforeVerb);
    if (cleaned) {
      parts.push(cleaned);
    }
    lastIndex = match.index;
  }

  const remainder = trimmed.slice(lastIndex).trim();
  if (verbCount <= 1) {
    return remainder ? [remainder] : [];
  }
  if (remainder) {
    parts.push(remainder);
  }
  return parts;
}
const KEYWORD_PATTERNS = [
  "Opg\\.?\\s*\\d+(?:\\.\\d+)*[a-z]?",
  "Opgaven\\s+\\d+",
  "Opdrachten?\\s+\\d+",
  "Par(?:agraaf)?\\s+\\d+[a-z]?",
  "Hoofdstuk\\s+\\d+",
  "Bl(?:z|ad)\\.?\\s*\\d+",
  "§\\s*\\d+",
];

type KeywordRule = {
  lookahead: RegExp;
  occurrence: RegExp;
};

const KEYWORD_RULES: KeywordRule[] = KEYWORD_PATTERNS.map((pattern) => ({
  lookahead: new RegExp(`(?=${pattern})`, "i"),
  occurrence: new RegExp(pattern, "gi"),
}));

export function splitHomeworkItems(raw?: string | null): string[] {
  if (!raw) return [];
  const sanitized = raw.replace(BULLET_RE, "\n");
  const initialParts = sanitized
    .split(BASE_SPLIT_RE)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const expanded = initialParts.flatMap((part) => {
    let segments = [part];
    for (const rule of KEYWORD_RULES) {
      segments = segments.flatMap((segment) => {
        const trimmed = segment.trim();
        if (!trimmed) return [];
        rule.occurrence.lastIndex = 0;
        const matches = trimmed.match(rule.occurrence);
        if (!matches || matches.length < 2) {
          return [trimmed];
        }
        const pieces = trimmed
          .split(rule.lookahead)
          .map((piece) => piece.trim())
          .filter(Boolean);
        return pieces.length > 1 ? pieces : [trimmed];
      });
    }
    segments = segments.flatMap((segment) => splitOnHomeworkVerbs(segment));
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
