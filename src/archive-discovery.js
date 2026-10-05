// Pure discovery models for the archive home: term of the day, recently added,
// random term, and welcome-state persistence.
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
export const WELCOME_SESSION_KEY = 'theaidictionary:welcome:v1:session';

const FRESH_WELCOME = { collapsed: false, seen: false };

/**
 * Read the persisted welcome preference. The card is a first-visit greeting, so
 * `seen` is what keeps it away on later loads; `collapsed` records an explicit
 * dismissal. Absent or unreadable state reads as a brand-new visitor.
 */
export function readWelcomeState(storage) {
  if (!storage) return { ...FRESH_WELCOME };
  try {
    const raw = storage.getItem(WELCOME_KEY);
    if (raw == null) return { ...FRESH_WELCOME };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return { ...FRESH_WELCOME };
    return { collapsed: Boolean(parsed.collapsed), seen: Boolean(parsed.seen) };
  } catch {
    return { ...FRESH_WELCOME };
  }
}

/** Persist the welcome preference, merging into whatever is already stored. */
export function writeWelcomeState(storage, patch = {}) {
  if (!storage) return;
  try {
    const current = readWelcomeState(storage);
    storage.setItem(
      WELCOME_KEY,
      JSON.stringify({
        version: 1,
        collapsed: patch.collapsed ?? current.collapsed,
        seen: patch.seen ?? current.seen,
      })
    );
  } catch {
    // The welcome panel still operates on its in-memory state for this session.
  }
}

/**
 * Session-scoped "already greeted" marker. Browsers that refuse durable storage
 * — private windows, managed profiles, storage partitioned away — still allow
 * sessionStorage, so this keeps the greeting to once per session instead of it
 * reappearing on every page load.
 */
export function readWelcomeSession(session) {
  if (!session) return false;
  try {
    return session.getItem(WELCOME_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remember, for the rest of this browser session, that the greeting was shown. */
export function writeWelcomeSession(session) {
  if (!session) return;
  try {
    session.setItem(WELCOME_SESSION_KEY, '1');
  } catch {
    // Nothing more we can do; the in-memory state still holds for this page.
  }
}

/**
 * Decide whether the first-visit greeting should open. Durable storage makes it
 * a once-ever courtesy; the session marker is the backstop for when durable
 * storage is unavailable, so a fresh profile is still greeted only once.
 *
 * When *neither* store can be written we fail closed: a greeting that cannot be
 * remembered would reappear on every single page load, which is worse than not
 * greeting at all (and is exactly what private-mode browsers used to produce).
 */
export function shouldShowWelcome({ storage = null, session = null } = {}) {
  if (!storage && !session) return false;
  const { collapsed, seen } = readWelcomeState(storage);
  if (collapsed || seen) return false;
  return !readWelcomeSession(session);
}

/** Record that the greeting has been shown, durably and for this session. */
export function markWelcomeShown({ storage = null, session = null } = {}) {
  writeWelcomeState(storage, { seen: true });
  writeWelcomeSession(session);
}
