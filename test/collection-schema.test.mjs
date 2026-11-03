import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectionsForSlug,
  normalizeCollection,
  pathNeighbors,
  sortCollections,
  validateCollections,
} from '../src/collection-schema.js';

test('normalizeCollection trims fields, dedupes slugs and falls back to the file id', () => {
  const collection = normalizeCollection({ title: ' Path ', terms: [' a ', 'b', 'a', 3] }, 'my-path');
  assert.deepEqual(collection, { id: 'my-path', title: 'Path', description: '', order: 100, terms: ['a', 'b'] });
  assert.equal(normalizeCollection({ terms: ['a'] }), null);
  assert.equal(normalizeCollection([]), null);
});

test('collectionsForSlug, pathNeighbors and sortCollections walk a path in order', () => {
  const a = normalizeCollection({ title: 'B path', terms: ['x', 'y', 'z'] }, 'b');
  const b = normalizeCollection({ title: 'A path', order: 1, terms: ['y', 'w'] }, 'a');
  assert.deepEqual(sortCollections([a, b]).map((c) => c.id), ['a', 'b']);
  assert.deepEqual(collectionsForSlug([a, b], 'y').map((hit) => [hit.collection.id, hit.index]), [['b', 1], ['a', 0]]);
  assert.deepEqual(pathNeighbors(a, 0), { prev: null, next: 'y' });
  assert.deepEqual(pathNeighbors(a, 2), { prev: 'y', next: null });
});

test('validateCollections rejects unknown slugs, bad ids and short paths', () => {
  const known = new Set(['attention', 'transformer']);
  const codes = validateCollections(
    [
      { file: 'collections/good.json', raw: { title: 'Good', description: 'D', terms: ['attention', 'transformer'] } },
      { file: 'collections/bad.json', raw: { title: 'Bad', terms: ['attention', 'nope', 'attention'] } },
      { file: 'collections/Short.json', raw: { title: 'Short', description: 'D', terms: ['attention'] } },
      { file: 'collections/empty.json', raw: { terms: [] } },
    ],
    known
  ).map((issue) => `${issue.file.split('/')[1]}:${issue.code}`);
  assert.deepEqual(codes.sort(), [
    'Short.json:invalid-collection-id',
    'Short.json:short-collection',
    'bad.json:duplicate-collection-slug',
    'bad.json:missing-collection-description',
    'bad.json:unknown-collection-slug',
    'empty.json:invalid-collection',
  ]);
});
