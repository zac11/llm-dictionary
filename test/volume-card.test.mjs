import test from 'node:test';
import assert from 'node:assert/strict';
import { clampCardPosition, nextVolumeCardState, volumeCardData } from '../src/volume-card.js';

test('volumeCardData returns deterministic alphabetical samples and live count', () => {
  const volume = { folder: 'a-b', label: 'A – B', letters: ['A', 'B'] };
  const terms = [
    { term: 'BERT' },
    { term: 'Attention' },
    { term: 'Backpropagation' },
    { term: 'AI Agent' },
  ];
  assert.deepEqual(volumeCardData(volume, terms), {
    folder: 'a-b',
    label: 'A – B',
    count: 4,
    samples: ['AI Agent', 'Attention', 'Backpropagation'],
    color: '#ff7a6b',
  });
});

test('clampCardPosition keeps cards within every viewport edge', () => {
  const card = { width: 240, height: 120 };
  const viewport = { width: 1000, height: 700 };
  assert.deepEqual(clampCardPosition({ x: 500, y: 350 }, card, viewport), { left: 516, top: 290 });
  assert.deepEqual(clampCardPosition({ x: -40, y: -20 }, card, viewport), { left: 12, top: 12 });
  assert.deepEqual(clampCardPosition({ x: 990, y: 690 }, card, viewport), { left: 748, top: 568 });
  assert.equal(clampCardPosition(null, card, viewport), null);
});

test('nextVolumeCardState hides for non-interactive library states', () => {
  assert.equal(nextVolumeCardState({ folder: 'a-b' }), 'show');
  assert.equal(nextVolumeCardState({ folder: null }), 'hide');
  assert.equal(nextVolumeCardState({ folder: 'a-b', animating: true }), 'hide');
  assert.equal(nextVolumeCardState({ folder: 'a-b', pulled: true }), 'hide');
  assert.equal(nextVolumeCardState({ folder: 'a-b', paused: true }), 'hide');
});
