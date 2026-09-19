export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const RANGE_FOLDERS = new Set(
  Array.from({ length: 13 }, (_, index) => {
    const start = LETTERS[index * 2];
    const end = LETTERS[index * 2 + 1];
    return `${start.toLowerCase()}-${end.toLowerCase()}`;
  })
);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanList = (value) =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => String(item).trim())
    .filter(Boolean);

export function slugifyTerm(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeGraphLabel(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'with', 'is',
  'are', 'as', 'at', 'by', 'from', 'that', 'this', 'it', 'its', 'their', 'our',
  'your', 'using', 'used', 'via', 'into', 'than', 'then', 'which', 'when',
  'where', 'what', 'how', 'not', 'no', 'be', 'been', 'being', 'was', 'were',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'has', 'have',
  'had', 'do', 'does', 'did',
]);

/** Lowercase, unicode-normalized, stopword-filtered search tokens. */
export function tokenizeText(value, { minLength = 2, stopwords = STOPWORDS } = {}) {
  return normalizeGraphLabel(value)
    .split(' ')
    .filter((token) => token.length >= minLength && !stopwords.has(token));
}

export function isValidLetter(value) {
  return typeof value === 'string' && value.length === 1 && LETTERS.includes(value);
}

export function isValidRangeFolder(value) {
  return RANGE_FOLDERS.has(value);
}

export function rangeFolderForLetter(value) {
  const letter = String(value || '').toUpperCase();
  // Guard: `LETTERS.indexOf('')` returns 0 (empty string matches at index 0),
  // which would wrongly map a missing/empty letter to the A–B folder.
  if (!letter) return null;
  const index = LETTERS.indexOf(letter);
  if (index === -1) return null;
  const start = LETTERS[Math.floor(index / 2) * 2];
  const end = LETTERS[Math.floor(index / 2) * 2 + 1];
  return `${start.toLowerCase()}-${end.toLowerCase()}`;
}

export function normalizeTerm(raw, source = '') {
  if (!isRecord(raw)) return null;
  const term = String(raw.term || '').trim();
  if (!term) return null;
  const letter = String(raw.letter || term[0] || '').trim().toUpperCase();
  if (!isValidLetter(letter)) return null;
  const citation = isRecord(raw.citation) ? raw.citation : {};
  return {
    slug: String(raw.slug || slugifyTerm(term)).trim(),
    term,
    letter,
    category: String(raw.category || 'General').trim() || 'General',
    aka: cleanList(raw.aka),
    definition: String(raw.definition || '').trim(),
    details: String(raw.details || '').trim(),
    story: String(raw.story || '').trim(),
    related: cleanList(raw.related),
    citation: {
      title: String(citation.title || '').trim(),
      authors: Array.isArray(citation.authors) ? cleanList(citation.authors) : [],
      year: citation.year || '',
      venue: String(citation.venue || '').trim(),
      url: String(citation.url || '').trim(),
    },
    _src: source,
  };
}

export function validateTerm(term, context = {}) {
  const issues = [];
  const add = (level, code, message) => issues.push({ level, code, message });
  const raw = context.raw;

  if (!term) {
    add('error', 'invalid-term', 'Entry cannot be normalized into a valid term.');
    return issues;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(term.slug)) {
    add('error', 'invalid-slug', `Slug “${term.slug}” must be lowercase kebab-case.`);
  }
  if (!term.definition) add('error', 'missing-definition', 'Definition is required.');
  if (!term.details) add('error', 'missing-details', 'Details are required.');
  if (!isValidLetter(term.letter)) add('error', 'invalid-letter', `Letter “${term.letter}” is invalid.`);

  if (context.folder && rangeFolderForLetter(term.letter) !== context.folder) {
    add(
      'error',
      'folder-letter-mismatch',
      `Letter ${term.letter} belongs in ${rangeFolderForLetter(term.letter)}, not ${context.folder}.`
    );
  }
  if (context.filename && context.filename.replace(/\.json$/i, '') !== term.slug) {
    add('warning', 'filename-slug-mismatch', `Filename does not match slug “${term.slug}”.`);
  }

  for (const [field, values] of [
    ['aka', term.aka],
    ['related', term.related],
  ]) {
    const seen = new Set();
    for (const value of values) {
      const key = normalizeGraphLabel(value);
      if (seen.has(key)) add('error', `duplicate-${field}`, `Duplicate ${field} value “${value}”.`);
      seen.add(key);
    }
  }

  if (raw && raw.aka !== undefined && !Array.isArray(raw.aka) && typeof raw.aka !== 'string') {
    add('error', 'invalid-aka-shape', 'aka must be a string or an array of strings.');
  }
  if (raw && Array.isArray(raw.aka) && raw.aka.some((value) => typeof value !== 'string' || !value.trim())) {
    add('error', 'invalid-aka-value', 'aka values must be non-empty strings.');
  }
  if (raw && raw.related !== undefined && !Array.isArray(raw.related)) {
    add('error', 'invalid-related-shape', 'related must be an array of slugs.');
  }
  if (raw && Array.isArray(raw.related) && raw.related.some((value) => typeof value !== 'string' || !value.trim())) {
    add('error', 'invalid-related-value', 'related values must be non-empty strings.');
  }
  for (const related of term.related) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(related)) {
      add('error', 'invalid-related-slug', `Related value “${related}” must be lowercase kebab-case.`);
    }
  }
  if (raw && raw.citation !== undefined && !isRecord(raw.citation)) {
    add('error', 'invalid-citation-shape', 'citation must be an object.');
  }
  if (raw && isRecord(raw.citation)) {
    if (raw.citation.authors !== undefined && !Array.isArray(raw.citation.authors)) {
      add('error', 'invalid-authors-shape', 'citation.authors must be an array.');
    }
    if (
      Array.isArray(raw.citation.authors) &&
      raw.citation.authors.some((value) => typeof value !== 'string' || !value.trim())
    ) {
      add('error', 'invalid-author-value', 'citation.authors values must be non-empty strings.');
    }
    const hasCitationValue = ['title', 'authors', 'year', 'venue', 'url'].some((key) => {
      const value = raw.citation[key];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    });
    if (hasCitationValue && !term.citation.title) {
      add('error', 'missing-citation-title', 'A non-empty citation must include a title.');
    }
  }

  return issues;
}
