// Learning paths: curated, ordered lists of term slugs under collections/.
// Pure helpers — no DOM — so the build's check pipeline and the UI share them.

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** `{ id, title, description, terms }` or null when the file has no title. */
export function normalizeCollection(raw, id = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const title = text(raw.title);
  if (!title) return null;
  const terms = [];
  for (const value of Array.isArray(raw.terms) ? raw.terms : []) {
    const slug = text(value);
    if (slug && !terms.includes(slug)) terms.push(slug);
  }
  return {
    id: text(raw.id) || id,
    title,
    description: text(raw.description),
    order: Number.isFinite(raw.order) ? raw.order : 100,
    terms,
  };
}

/** Collections in shelf order: explicit `order`, then title. */
export function sortCollections(collections) {
  return [...collections].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** Collections that include a slug, with the slug's position in each. */
export function collectionsForSlug(collections, slug) {
  return collections
    .map((collection) => ({ collection, index: collection.terms.indexOf(slug) }))
    .filter((hit) => hit.index !== -1);
}

/** Previous/next slugs around a position in a collection (null at either end). */
export function pathNeighbors(collection, index) {
  return {
    prev: index > 0 ? collection.terms[index - 1] : null,
    next: index < collection.terms.length - 1 ? collection.terms[index + 1] : null,
  };
}

/**
 * Check raw collection files against the dictionary. `files` is a list of
 * `{ file, raw }`; `knownSlugs` a Set of every term slug. Every slug must
 * resolve to a term — that is an error, so the build fails on a broken path.
 */
export function validateCollections(files, knownSlugs) {
  const issues = [];
  const ids = new Map();
  for (const { file, raw } of files) {
    const add = (level, code, message) => issues.push({ level, code, file, message });
    const id = file.replace(/^.*\//, '').replace(/\.json$/, '');
    const collection = normalizeCollection(raw, id);
    if (!collection) {
      add('error', 'invalid-collection', 'Collection needs a JSON object with a title.');
      continue;
    }
    if (ids.has(collection.id)) add('error', 'duplicate-collection-id', `Collection id “${collection.id}” is also used by ${ids.get(collection.id)}.`);
    ids.set(collection.id, file);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collection.id)) add('error', 'invalid-collection-id', `Collection id “${collection.id}” must be a lowercase slug.`);
    if (!collection.description) add('warning', 'missing-collection-description', 'Collection has no description.');
    if (!Array.isArray(raw.terms)) add('error', 'invalid-collection-terms', 'terms must be an array of term slugs.');
    else {
      const seen = new Set();
      for (const value of raw.terms) {
        const slug = text(value);
        if (!slug) add('error', 'invalid-collection-slug', 'Every collection term must be a non-empty slug string.');
        else if (seen.has(slug)) add('warning', 'duplicate-collection-slug', `“${slug}” appears more than once.`);
        else if (!knownSlugs.has(slug)) add('error', 'unknown-collection-slug', `“${slug}” does not match any dictionary term.`);
        seen.add(slug);
      }
    }
    if (collection.terms.length < 2) add('error', 'short-collection', 'A learning path needs at least two terms.');
  }
  return issues;
}
