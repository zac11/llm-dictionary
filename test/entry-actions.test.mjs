import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entryActions,
  entryBreadcrumb,
  entryTransition,
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

test('entryTransition picks ritual, short, and instant per policy', () => {
  assert.equal(entryTransition({ spreadOpen: false, mode: 'index', reducedMotion: false }), 'ritual');
  assert.equal(entryTransition({ spreadOpen: true, mode: 'entry', reducedMotion: false }), 'short');
  assert.equal(entryTransition({ spreadOpen: true, mode: 'index', reducedMotion: false }), 'ritual');
  assert.equal(entryTransition({ spreadOpen: true, mode: 'entry', reducedMotion: true }), 'instant');
  assert.equal(entryTransition({ spreadOpen: false, mode: 'index', reducedMotion: true }), 'instant');
});
