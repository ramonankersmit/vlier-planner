const BULLET_RE = /[•●◦▪▫]/g;
const NUMBER_OPGAVEN_SPLIT_RE = /\b(?:[A-Za-z]+\d+|\d+)\s+(?=Opgaven\b)/gi;
const VOORKENNIS_HEADING_RE = /\bVoorkennis\b/g;
const LINE_BREAK_CHARS = /[;\r\n\u000b\u000c\u0085\u2028\u2029]/;

function isLineBreakChar(char?: string): boolean {
  if (!char) return false;
  LINE_BREAK_CHARS.lastIndex = 0;
  return LINE_BREAK_CHARS.test(char);
}
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
  "Voorkennis(?:\\s*[:\-])?",
];

type KeywordRule = {
  occurrence: RegExp;
};

const KEYWORD_RULES: KeywordRule[] = KEYWORD_PATTERNS.map((pattern) => ({
  occurrence: new RegExp(pattern, "gi"),
}));

function splitOnKeywordRule(value: string, rule: KeywordRule): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  rule.occurrence.lastIndex = 0;
  const matches = Array.from(trimmed.matchAll(rule.occurrence));
  if (matches.length < 2) {
    return [trimmed];
  }

  const prefix = trimmed.slice(0, matches[0].index ?? 0).trim();
  const pieces: string[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index ?? 0;
    const end = matches[index + 1]?.index ?? trimmed.length;
    const chunk = trimmed.slice(start, end).trim();
    const combined = prefix ? `${prefix} ${chunk}` : chunk;
    const cleaned = stripTrailingVerbSeparator(combined)
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned) {
      pieces.push(cleaned);
    }
  }

  return pieces.length > 0 ? pieces : [trimmed];
}

function insertLineBreakBeforeVoorkennis(value: string): string {
  VOORKENNIS_HEADING_RE.lastIndex = 0;
  return value.replace(
    VOORKENNIS_HEADING_RE,
    (match, offset: number, fullString: string) => {
      if (offset === 0) {
        return match;
      }
      const previousChar = fullString[offset - 1];
      if (isLineBreakChar(previousChar)) {
        return match;
      }
      return `\n${match}`;
    }
  );
}

export function splitHomeworkItems(raw?: string | null): string[] {
  if (!raw) return [];
  const sanitized = insertLineBreakBeforeVoorkennis(
    raw.replace(BULLET_RE, "\n").replace(NUMBER_OPGAVEN_SPLIT_RE, (match) => `${match.trimEnd()}\n`)
  );
  const initialParts = sanitized
    .split(LINE_BREAK_CHARS)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const expanded = initialParts.flatMap((part) => {
    const verbSegments = splitOnHomeworkVerbs(part);
    return verbSegments.flatMap((segment) => {
      let keywordSegments = [segment];
      for (const rule of KEYWORD_RULES) {
        keywordSegments = keywordSegments.flatMap((piece) =>
          splitOnKeywordRule(piece, rule)
        );
      }
      return keywordSegments;
    });
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
