import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentEntry, learningItems } from '../src/entry-actions.js';

test('learningItems prefers trail order, excludes current, dedupes, and limits', () => {
  const labelOf = (slug) => `Label ${slug}`;
  const trail = { path: ['root', 'mid', 'current'] };
  const neighbors = [
    { node: { slug: 'mid', label: 'Mid' }, edge: { weight: 5 } },
    { node: { slug: 'other', label: 'Other' }, edge: { weight: 3 } },
    { node: { slug: 'current', label: 'Current' }, edge: { weight: 1 } },
  ];
  const items = learningItems({ trail, neighbors, currentSlug: 'current', limit: 4, labelOf });
  assert.deepEqual(items, [
    { slug: 'root', label: 'Label root', relation: 'connected' },
    { slug: 'mid', label: 'Label mid', relation: 'connected' },
    { slug: 'other', label: 'Other', relation: 'related' },
  ]);
});

test('learningItems never labels suggestions as prerequisites', () => {
  const items = learningItems({
    trail: { path: ['a', 'b', 'current'] },
    neighbors: [],
    currentSlug: 'current',
    labelOf: (slug) => slug,
  });
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.relation === 'connected' || item.relation === 'related'));
});

test('learningItems falls back to deterministic neighbors and handles empty input', () => {
  const neighbors = [
    { node: { slug: 'a', label: 'A' }, edge: { weight: 5 } },
    { node: { slug: 'b', label: 'B' }, edge: { weight: 3 } },
    { node: { slug: 'c', label: 'C' }, edge: { weight: 2 } },
    { node: { slug: 'd', label: 'D' }, edge: { weight: 1 } },
    { node: { slug: 'e', label: 'E' }, edge: { weight: 0 } },
  ];
  assert.deepEqual(
    learningItems({ trail: null, neighbors, currentSlug: 'current', limit: 4 }).map((i) => i.slug),
    ['a', 'b', 'c', 'd']
  );
  assert.deepEqual(learningItems({ trail: null, neighbors: [], currentSlug: 'current' }), []);
  assert.deepEqual(learningItems({}), []);
});

test('isCurrentEntry rejects delayed results after the active slug changes', () => {
  assert.equal(isCurrentEntry('attention', 'attention'), true);
  assert.equal(isCurrentEntry('quantization', 'attention'), false);
  assert.equal(isCurrentEntry(null, 'attention'), false);
});
