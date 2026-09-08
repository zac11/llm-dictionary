// Loads every term JSON file living in /dictionary/<a-b..y-z>/*.json
// and exposes them grouped by volume (letter range) with search helpers.

const modules = import.meta.glob('../dictionary/*/*.json', {
  eager: true,
  import: 'default',
});

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 13 volumes: A-B, C-D, ... Y-Z  -> folder names a-b ... y-z
export const RANGES = (() => {
  const out = [];
  for (let i = 0; i < LETTERS.length; i += 2) {
    const a = LETTERS[i];
    const b = LETTERS[i + 1];
    out.push({
      folder: `${a.toLowerCase()}-${b.toLowerCase()}`,
      label: `${a} – ${b}`,
      letters: [a, b],
      terms: [],
    });
  }
  return out;
})();

const folderIndexOf = (folder) =>
  RANGES.findIndex((r) => r.folder === folder);

function normalize(raw, file) {
  const term = String(raw.term || '').trim();
  if (!term) return null;
  const letter = String(raw.letter || term[0]).toUpperCase();
  if (!LETTERS.includes(letter)) return null;
  const citation = raw.citation || {};
  return {
    slug: raw.slug || term.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    term,
    letter,
    category: raw.category || 'General',
    aka: Array.isArray(raw.aka) ? raw.aka : raw.aka ? [raw.aka] : [],
    definition: raw.definition || '',
    details: raw.details || '',
    citation: {
      title: citation.title || '',
      authors: Array.isArray(citation.authors) ? citation.authors : [],
      year: citation.year || '',
      venue: citation.venue || '',
      url: citation.url || '',
    },
    _src: file,
  };
}

const byTerm = (a, b) => a.term.localeCompare(b.term);

for (const [path, raw] of Object.entries(modules)) {
  // path looks like ../../dictionary/a-b/attention.json
  const m = path.match(/dictionary\/([a-z]-[a-z])\/([^/]+)\.json$/);
  if (!m) continue;
  const [folder, slug] = [m[1], m[2]];
  const idx = folderIndexOf(folder);
  if (idx === -1) continue;
  const norm = normalize(raw, path);
  if (!norm) continue;
  RANGES[idx].terms.push(norm);
}

// Keep terms inside a volume sorted (by letter then by term).
for (const range of RANGES) {
  range.terms.sort(
    (a, b) => a.letter.localeCompare(b.letter) || byTerm(a, b)
  );
  range.count = range.terms.length;
}

const ALL = RANGES.flatMap((r) => r.terms).sort(byTerm);

/** All terms sorted alphabetically. */
export const allTerms = ALL;

/** Volumes with at least one word. */
export const volumes = RANGES.filter((r) => r.terms.length > 0);

/** Map letter -> range volume. */
export const volumeByLetter = (letter) => {
  const L = letter.toUpperCase();
  const idx = Math.floor((LETTERS.indexOf(L)) / 2);
  return idx >= 0 && idx < RANGES.length ? RANGES[idx] : null;
};

export const findTerm = (slug) => ALL.find((t) => t.slug === slug) || null;

export const rangeTerms = (folder) => {
  const idx = folderIndexOf(folder);
  return idx === -1 ? [] : RANGES[idx].terms;
};

/** Lightweight full-text search over a term's fields. */
export function searchTerms(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const needles = q.split(/\s+/).filter(Boolean);
  return ALL.filter((t) => {
    const hay = [
      t.term,
      t.category,
      ...t.aka,
      t.definition,
      t.details,
      t.citation.title,
      t.citation.venue,
      ...t.citation.authors,
      String(t.citation.year),
    ]
      .join(' ')
      .toLowerCase();
    return needles.every((n) => hay.includes(n));
  });
}

/** Basic sanity info surfaced in the console for authors/maintenance. */
export const summary = () =>
  `Loaded ${ALL.length} terms across ${volumes.length} volumes.`;

export default { allTerms, volumes, summary };
