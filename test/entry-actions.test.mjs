import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entryActions,
  entryBreadcrumb,
  entryTransition,
  isCurrentEntry,
  learningItems,
} from '../src/entry-actions.js';

test('entryBreadcrumb joins library, volume, and category with safe defaults', () => {
  assert.deepEqual(entryBreadcrumb({ category: 'Architecture' }, { label: 'A – B' }), {
    volumeLabel: 'A – B',
    category: 'Architecture',
    text: 'Library / A – B / Architecture',
  });
  assert.deepEqual(entryBreadcrumb({}, null), {
    volumeLabel: '',
    category: 'General',
    text: 'Library / General',
  });
  assert.deepEqual(entryBreadcrumb({ category: ' ' }, { label: 'Y – Z' }), {
    volumeLabel: 'Y – Z',
    category: 'General',
    text: 'Library / Y – Z / General',
  });
});

test('entryActions exposes ask, map, share in order with graph gating', () => {
  assert.deepEqual(entryActions({ hasGraph: true, hasAsk: true }).map((a) => a.id), ['ask', 'map', 'share']);
  assert.equal(entryActions({ hasGraph: false }).find((a) => a.id === 'map').enabled, false);
  assert.equal(entryActions({ hasGraph: false }).find((a) => a.id === 'ask').enabled, true);
  assert.equal(entryActions({ hasGraph: false }).find((a) => a.id === 'share').enabled, true);
  assert.equal(entryActions({ hasAsk: false }).find((a) => a.id === 'ask').enabled, false);
});

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

test('learningItems falls back to deterministic neighbors and handles empty input', () => {
  const neighbors = [
    { node: { slug: 'a', label: 'A' }, edge: { weight: 5 } },
    { node: { slug: 'b', label: 'B' }, edge: { weight: 3 } },
    { node: { slug: 'c', label: 'C' }, edge: { weight: 2 } },
    { node: { slug: 'd', label: 'D' }, edge: { weight: 1 } },
    { node: { slug: 'e', label: 'E' }, edge: { weight: 0 } },
  ];
  assert.deepEqual(learningItems({ trail: null, neighbors, currentSlug: 'current', limit: 4 }).map((i) => i.slug), [
    'a', 'b', 'c', 'd',
  ]);
  assert.deepEqual(learningItems({ trail: null, neighbors: [], currentSlug: 'current' }), []);
  assert.deepEqual(learningItems({}), []);
});

test('isCurrentEntry rejects delayed results after the active slug changes', () => {
  assert.equal(isCurrentEntry('attention', 'attention'), true);
  assert.equal(isCurrentEntry('quantization', 'attention'), false);
  assert.equal(isCurrentEntry(null, 'attention'), false);
});

test('entryTransition picks ritual, short, and instant per policy', () => {
  assert.equal(entryTransition({ spreadOpen: false, mode: 'index', reducedMotion: false }), 'ritual');
  assert.equal(entryTransition({ spreadOpen: true, mode: 'entry', reducedMotion: false }), 'short');
  assert.equal(entryTransition({ spreadOpen: true, mode: 'index', reducedMotion: false }), 'ritual');
  assert.equal(entryTransition({ spreadOpen: true, mode: 'entry', reducedMotion: true }), 'instant');
  assert.equal(entryTransition({ spreadOpen: false, mode: 'index', reducedMotion: true }), 'instant');
});
