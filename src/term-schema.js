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

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Controlled entity-kind vocabulary. `category` answers "which topic does this
 * belong to?"; `type` answers "what kind of thing is this?" and decides how the
 * entry is presented in the reader (see `entryPresentation`).
 */
export const TERM_TYPES = [
  'concept',
  'person',
  'organization',
  'event',
  'model',
  'dataset',
  'benchmark',
  'tool',
  'paper',
  'venue',
  'policy',
  'award',
];

export const DEFAULT_TERM_TYPE = 'concept';

/** Human-readable labels, shared by the reader and the Contribute form. */
export const TERM_TYPE_LABELS = {
  concept: 'Concept',
  person: 'Person',
  organization: 'Organization',
  event: 'Event',
  model: 'Model',
  dataset: 'Dataset',
  benchmark: 'Benchmark',
  tool: 'Tool',
  paper: 'Paper',
  venue: 'Venue',
  policy: 'Policy',
  award: 'Award',
};

/**
 * The three ways a second spread can read. Concepts keep their story; people
 * and organizations show a profile (what they did, where to find them); events,
 * papers, venues and policies show coverage (dated references).
 */
export const TYPE_PRESENTATIONS = {
  concept: 'story',
  model: 'story',
  dataset: 'story',
  benchmark: 'story',
  tool: 'story',
  person: 'profile',
  organization: 'profile',
  event: 'coverage',
  paper: 'coverage',
  venue: 'coverage',
  policy: 'coverage',
  award: 'coverage',
};

const TYPE_ALIASES = {
  people: 'person',
  persons: 'person',
  scientist: 'person',
  researcher: 'person',
  org: 'organization',
  organisation: 'organization',
  company: 'organization',
  institute: 'organization',
  lab: 'organization',
  technique: 'concept',
  method: 'concept',
  algorithm: 'concept',
  architecture: 'concept',
  idea: 'concept',
  topic: 'concept',
  term: 'concept',
  conference: 'event',
  summit: 'event',
  incident: 'event',
  milestone: 'event',
  network: 'model',
  corpus: 'dataset',
  evaluation: 'benchmark',
  library: 'tool',
  framework: 'tool',
  publication: 'paper',
  journal: 'venue',
  law: 'policy',
  regulation: 'policy',
};

const typeKey = (value) => String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z]+/g, '');

/**
 * Canonical type for a raw value: `null` when the value is unrecognized, so
 * authors can be told about a typo instead of silently getting a default.
 */
export function normalizeTermType(value) {
  const key = typeKey(value);
  if (!key) return null;
  if (TERM_TYPES.includes(key)) return key;
  return TYPE_ALIASES[key] || null;
}

/** Which of the three second spreads a type uses. */
export function entryPresentation(type) {
  return TYPE_PRESENTATIONS[type] || TYPE_PRESENTATIONS[DEFAULT_TERM_TYPE];
}

/** True when the entry's second spread is the story vignette. */
export function isStoryType(type) {
  return entryPresentation(type) === 'story';
}

const normalizeLink = (value) => {
  const source = isRecord(value) ? value : {};
  const url = String(source.url || '').trim();
  if (!url) return null;
  return { label: String(source.label || '').trim(), url };
};

/** `{ links, highlights }` — links to a person's or organization's own pages. */
export function normalizeProfile(value) {
  const source = isRecord(value) ? value : {};
  return {
    links: asArray(source.links).map(normalizeLink).filter(Boolean),
    highlights: cleanList(source.highlights),
  };
}

const normalizeCoverageItem = (value) => {
  const source = isRecord(value) ? value : {};
  const title = String(source.title || '').trim();
  const url = String(source.url || '').trim();
  if (!title && !url) return null;
  return {
    title,
    source: String(source.source || '').trim(),
    date: String(source.date || '').trim(),
    url,
  };
};

/** Dated references that cover an event, paper, venue or policy. */
export function normalizeCoverage(value) {
  return asArray(value).map(normalizeCoverageItem).filter(Boolean);
}

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

const includesPhrase = (value, phrase) => ` ${value} `.includes(` ${phrase} `);

export function rankSearchEntries(query, entries) {
  const normalizedQuery = normalizeGraphLabel(query);
  if (!normalizedQuery) return [];
  const queryTokens = tokenizeText(query);

  return entries
    .map((entry) => {
      const canonical = normalizeGraphLabel(entry.term || entry.label);
      const aliases = (entry.aka || entry.aliases || []).map(normalizeGraphLabel).filter(Boolean);
      const category = normalizeGraphLabel(entry.category);
      let score = 0;

      if (canonical === normalizedQuery) score = 1000;
      else if (aliases.includes(normalizedQuery)) score = 950;
      else if (canonical.startsWith(normalizedQuery)) score = 800;
      else if (aliases.some((alias) => alias.startsWith(normalizedQuery))) score = 760;
      else if (includesPhrase(canonical, normalizedQuery)) score = 650;
      else if (aliases.some((alias) => includesPhrase(alias, normalizedQuery))) score = 620;
      else if (queryTokens.length) {
        const nameTokens = new Set(tokenizeText(`${canonical} ${aliases.join(' ')}`));
        const overlap = queryTokens.filter((token) => nameTokens.has(token)).length;
        if (overlap === queryTokens.length) score = 500 + Math.round((overlap / nameTokens.size) * 100);
      }

      if (!score && category) {
        if (category === normalizedQuery) score = 300;
        else if (category.startsWith(normalizedQuery) || includesPhrase(category, normalizedQuery)) score = 220;
      }

      if (!score && queryTokens.length) {
        const citation = entry.citation || {};
        const searchable = normalizeGraphLabel([
          citation.title,
          citation.venue,
          ...(citation.authors || []),
          citation.year,
        ].filter(Boolean).join(' '));
        const searchableTokens = new Set(tokenizeText(searchable));
        if (queryTokens.every((token) => searchableTokens.has(token))) score = 100;
      }

      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || String(a.entry.term || a.entry.label).localeCompare(String(b.entry.term || b.entry.label)));
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

/** Strict calendar-date check: format AND a real day on the calendar. */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
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
    type: normalizeTermType(raw.type) || DEFAULT_TERM_TYPE,
    aka: cleanList(raw.aka),
    definition: String(raw.definition || '').trim(),
    details: String(raw.details || '').trim(),
    story: String(raw.story || '').trim(),
    profile: normalizeProfile(raw.profile),
    coverage: normalizeCoverage(raw.coverage),
    related: cleanList(raw.related),
    citation: {
      title: String(citation.title || '').trim(),
      authors: Array.isArray(citation.authors) ? cleanList(citation.authors) : [],
      year: citation.year || '',
      venue: String(citation.venue || '').trim(),
      url: String(citation.url || '').trim(),
    },
    addedAt: isIsoDate(raw.addedAt) ? raw.addedAt : '',
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
  if (raw && raw.addedAt !== undefined && raw.addedAt !== '' && !isIsoDate(raw.addedAt)) {
    add('error', 'invalid-added-at', `addedAt must be a valid ISO calendar date (YYYY-MM-DD).`);
  }

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

  if (raw && raw.type !== undefined && raw.type !== '' && raw.type !== null) {
    const type = normalizeTermType(raw.type);
    if (!type) {
      add('error', 'invalid-type', `Type “${String(raw.type)}” is not one of: ${TERM_TYPES.join(', ')}.`);
    } else if (raw.type !== type) {
      add('warning', 'non-canonical-type', `Type “${String(raw.type)}” should be written as “${type}”.`);
    }
  } else {
    add('warning', 'missing-type', `No type given — defaulting to “${DEFAULT_TERM_TYPE}”.`);
  }

  if (raw && raw.profile !== undefined && !isRecord(raw.profile)) {
    add('error', 'invalid-profile-shape', 'profile must be an object.');
  }
  if (raw && isRecord(raw.profile)) {
    if (raw.profile.links !== undefined && !Array.isArray(raw.profile.links)) {
      add('error', 'invalid-links-shape', 'profile.links must be an array of { label, url } objects.');
    }
    for (const value of asArray(raw.profile.links)) {
      if (!isRecord(value) || !String(value.url || '').trim()) {
        add('error', 'invalid-link-url', 'Each profile link needs a url.');
      } else if (!/^https?:\/\/\S+$/i.test(String(value.url).trim())) {
        add('error', 'invalid-link-url', `Profile link “${String(value.url)}” must be an http(s) URL.`);
      } else if (!String(value.label || '').trim()) {
        add('error', 'invalid-link-label', `Profile link “${String(value.url)}” needs a label.`);
      }
    }
    if (raw.profile.highlights !== undefined && !Array.isArray(raw.profile.highlights) && typeof raw.profile.highlights !== 'string') {
      add('error', 'invalid-highlights-shape', 'profile.highlights must be a string or an array of strings.');
    }
    if (Array.isArray(raw.profile.highlights) && raw.profile.highlights.some((value) => typeof value !== 'string' || !value.trim())) {
      add('error', 'invalid-highlight-value', 'profile.highlights values must be non-empty strings.');
    }
  }

  if (raw && raw.coverage !== undefined && !Array.isArray(raw.coverage)) {
    add('error', 'invalid-coverage-shape', 'coverage must be an array of { title, source, date, url } objects.');
  }
  for (const value of asArray(raw && raw.coverage)) {
    if (!isRecord(value)) {
      add('error', 'invalid-coverage-item', 'Each coverage item must be an object.');
      continue;
    }
    if (!String(value.title || '').trim()) add('error', 'missing-coverage-title', 'Each coverage item needs a title.');
    const url = String(value.url || '').trim();
    if (!url) add('error', 'missing-coverage-url', 'Each coverage item needs a url.');
    else if (!/^https?:\/\/\S+$/i.test(url)) add('error', 'invalid-coverage-url', `Coverage url “${url}” must be an http(s) URL.`);
    const date = String(value.date || '').trim();
    if (date && !isIsoDate(date)) add('error', 'invalid-coverage-date', `Coverage date “${date}” must be YYYY-MM-DD.`);
  }

  // Presentation coherence: the second spread is chosen by type, so data for a
  // different spread is silently unused.
  const presentation = entryPresentation(term.type);
  const hasProfile = term.profile.links.length > 0 || term.profile.highlights.length > 0;
  if (hasProfile && presentation !== 'profile') {
    add('warning', 'unexpected-profile', `profile data is unused because ${term.type} entries read as “${presentation}”.`);
  }
  if (term.coverage.length && presentation !== 'coverage') {
    add('warning', 'unexpected-coverage', `coverage data is unused because ${term.type} entries read as “${presentation}”.`);
  }
  if (term.story && presentation !== 'story') {
    add('warning', 'unexpected-story', `story is not shown for ${term.type} entries — use “${presentation}” data instead.`);
  }

  return issues;
}
