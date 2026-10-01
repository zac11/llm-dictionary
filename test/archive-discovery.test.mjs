import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecentHistory,
  discoveryTarget,
  randomTerm,
  readWelcomeState,
  recentlyAdded,
  termOfDay,
  writeWelcomeState,
  WELCOME_KEY,
} from '../src/archive-discovery.js';

const terms = (slugs) => slugs.map((slug) => ({ slug, term: slug, addedAt: '' }));

// ---------- termOfDay ----------

test('termOfDay returns the same term for the same UTC date regardless of order', () => {
  const a = terms(['alpha', 'beta', 'gamma', 'delta']);
  const b = terms(['delta', 'gamma', 'beta', 'alpha']);
  const date = new Date('2026-09-30T12:00:00Z');
  assert.equal(termOfDay(a, date).slug, termOfDay(b, date).slug);
});

test('termOfDay rotates on adjacent dates and returns null for empty input', () => {
  const list = terms(['alpha', 'beta', 'gamma']);
  const day1 = new Date('2026-09-30T00:00:00Z');
  const day2 = new Date('2026-10-01T00:00:00Z');
  assert.notEqual(termOfDay(list, day1).slug, termOfDay(list, day2).slug);
  assert.equal(termOfDay([], day1), null);
});

// ---------- recentlyAdded ----------

test('recentlyAdded sorts newest first, breaks ties by slug, and caps at the limit', () => {
  const list = [
    { slug: 'a', addedAt: '2026-09-10' },
    { slug: 'b', addedAt: '2026-09-19' },
    { slug: 'c', addedAt: '2026-09-19' },
    { slug: 'd', addedAt: '2026-09-12' },
    { slug: 'e', addedAt: '' },
    { slug: 'f', addedAt: 'not-a-date' },
  ];
  assert.deepEqual(recentlyAdded(list, { limit: 8 }).map((t) => t.slug), ['b', 'c', 'd', 'a']);
  assert.deepEqual(recentlyAdded(list, { limit: 2 }).map((t) => t.slug), ['b', 'c']);
});

// ---------- randomTerm / discoveryTarget ----------

test('randomTerm maps boundary random values to valid bounds and null on empty', () => {
  const list = terms(['a', 'b', 'c', 'd']);
  assert.equal(randomTerm(list, () => 0).slug, 'a');
  assert.equal(randomTerm(list, () => 0.999999).slug, 'd');
  assert.equal(randomTerm(list, () => 1).slug, 'd');
  assert.equal(randomTerm([], () => 0), null);
});

test('discoveryTarget returns null while busy and delegates while idle', () => {
  const list = terms(['a', 'b']);
  assert.equal(discoveryTarget({ busy: true, terms: list, random: () => 0 }), null);
  assert.equal(discoveryTarget({ busy: false, terms: list, random: () => 0 }).slug, 'a');
});

test('discoveryTarget is safe on empty input and never returns an out-of-range term', () => {
  assert.equal(discoveryTarget({ busy: false, terms: [], random: () => 0 }), null);
  const list = terms(['a', 'b', 'c']);
  const pick = discoveryTarget({ busy: false, terms: list, random: () => 1 });
  assert.ok(list.some((term) => term.slug === pick.slug));
});

// ---------- createRecentHistory ----------

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    _data: data,
  };
}

test('recent history dedupes to the front and caps at eight slugs', () => {
  const storage = memoryStorage();
  const history = createRecentHistory({ storage });
  history.record('a');
  history.record('b');
  history.record('a');
  assert.deepEqual(history.read(['a', 'b']), ['a', 'b']);
  for (let i = 0; i < 12; i++) history.record(`slug-${i}`);
  assert.equal(history.read(Array.from({ length: 12 }, (_, i) => `slug-${i}`)).length, 8);
});

test('recent recording is idempotent for repeated entry opens', () => {
  const storage = memoryStorage();
  const history = createRecentHistory({ storage });
  history.record('attention');
  history.record('attention');
  history.record('attention');
  assert.deepEqual(history.read(['attention', 'other']), ['attention']);
});

test('recent history filters stale slugs and persists the cleaned list', () => {
  const storage = memoryStorage({
    'theaidictionary:recent:v1': JSON.stringify({ version: 1, recentTerms: ['a', 'stale', 'b'] }),
  });
  const history = createRecentHistory({ storage });
  assert.deepEqual(history.read(['a', 'b']), ['a', 'b']);
  const persisted = JSON.parse(storage.getItem('theaidictionary:recent:v1'));
  assert.deepEqual(persisted.recentTerms, ['a', 'b']);
});

test('recent history recovers from malformed JSON', () => {
  const storage = memoryStorage({ 'theaidictionary:recent:v1': '{not json' });
  const history = createRecentHistory({ storage });
  assert.deepEqual(history.read(['a']), []);
  history.record('a');
  assert.deepEqual(history.read(['a']), ['a']);
});

test('recent history falls back to memory when storage throws', () => {
  const throwing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  const history = createRecentHistory({ storage: throwing });
  history.record('a');
  assert.deepEqual(history.read(['a']), ['a']); // served from in-memory fallback
});

// ---------- welcome state ----------

test('welcome state defaults open and round-trips a collapsed preference', () => {
  const storage = memoryStorage();
  assert.deepEqual(readWelcomeState(storage), { collapsed: false });
  writeWelcomeState(storage, { collapsed: true });
  assert.deepEqual(readWelcomeState(storage), { collapsed: true });
  assert.equal(WELCOME_KEY, 'theaidictionary:welcome:v1');
});

test('welcome state treats corrupt or missing storage as open', () => {
  assert.deepEqual(readWelcomeState(null), { collapsed: false });
  const corrupt = memoryStorage({ 'theaidictionary:welcome:v1': 'oops' });
  assert.deepEqual(readWelcomeState(corrupt), { collapsed: false });
});
