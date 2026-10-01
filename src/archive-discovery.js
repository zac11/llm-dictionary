// Pure discovery models for the archive home: daily term, recently added,
// recent history, random term, and welcome-state persistence.
// No DOM access at module scope; storage is injected so these stay testable.

import { isIsoDate } from './term-schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic daily pick: same UTC day -> same term, regardless of input order. */
export function termOfDay(terms, date) {
  const slugs = [...new Set(terms.map((term) => term.slug).filter(Boolean))].sort();
  if (!slugs.length) return null;
  const dayIndex = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS
  );
  const slug = slugs[((dayIndex % slugs.length) + slugs.length) % slugs.length];
  return terms.find((term) => term.slug === slug) || null;
}

/** Newest-first terms with a verified ISO `addedAt`, slug as the stable tie-break. */
export function recentlyAdded(terms, { limit = 8 } = {}) {
  return terms
    .filter((term) => isIsoDate(term.addedAt))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

/**
 * Versioned recent-history store. Falls back to an in-memory list whenever the
 * injected storage throws (denied) or is absent; malformed JSON reads as empty.
 */
export function createRecentHistory({
  storage = null,
  limit = 8,
  key = 'theaidictionary:recent:v1',
} = {}) {
  let memory = [];
  let usable = storage != null;

  const load = () => {
    if (!usable) return memory;
    try {
      const raw = storage.getItem(key);
      if (raw == null) return memory;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed && parsed.recentTerms) ? parsed.recentTerms : [];
    } catch {
      return memory;
    }
  };

  const save = (slugs) => {
    memory = [...slugs];
    if (!usable) return;
    try {
      storage.setItem(key, JSON.stringify({ version: 1, recentTerms: slugs }));
    } catch {
      usable = false;
    }
  };

  return {
    /** Return stored slugs that still exist, oldest dropped to the limit. */
    read(validSlugs = []) {
      const valid = new Set(validSlugs);
      const stored = load();
      const cleaned = [...new Set(stored.filter((slug) => valid.has(slug)))];
      if (cleaned.length !== stored.length) save(cleaned);
      return cleaned.slice(0, limit);
    },
    /** Move a slug to the front, deduplicate, cap at the limit, persist. */
    record(slug) {
      const next = [slug, ...load().filter((s) => s !== slug)].slice(0, limit);
      save(next);
      return next;
    },
    clear() {
      memory = [];
      if (!usable) return;
      try {
        storage.removeItem(key);
      } catch {
        usable = false;
      }
    },
  };
}

/** Uniform random term; empty input and a busy shell both yield nothing. */
export function randomTerm(terms, random = Math.random) {
  if (!terms.length) return null;
  const index = Math.min(terms.length - 1, Math.floor(random() * terms.length));
  return terms[index];
}

/** Random Term gate: respect `state.busy` before delegating to random selection. */
export function discoveryTarget({ busy = false, terms = [], random = Math.random } = {}) {
  if (busy) return null;
  return randomTerm(terms, random);
}

export const WELCOME_KEY = 'theaidictionary:welcome:v1';

/** Read the persisted welcome preference; defaults open when absent or unreadable. */
export function readWelcomeState(storage) {
  if (!storage) return { collapsed: false };
  try {
    const raw = storage.getItem(WELCOME_KEY);
    if (raw == null) return { collapsed: false };
    const parsed = JSON.parse(raw);
    return { collapsed: parsed && parsed.version === 1 ? Boolean(parsed.collapsed) : false };
  } catch {
    return { collapsed: false };
  }
}

/** Persist the welcome preference; storage failures are non-fatal. */
export function writeWelcomeState(storage, { collapsed }) {
  if (!storage) return;
  try {
    storage.setItem(WELCOME_KEY, JSON.stringify({ version: 1, collapsed: Boolean(collapsed) }));
  } catch {
    // The welcome panel still operates on its in-memory state for this session.
  }
}
