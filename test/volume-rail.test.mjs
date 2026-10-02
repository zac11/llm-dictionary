import test from 'node:test';
import assert from 'node:assert/strict';
import { volumeRailItems } from '../src/navigation.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function makeRanges({ empty = [] } = {}) {
  const out = [];
  for (let i = 0; i < LETTERS.length; i += 2) {
    const a = LETTERS[i];
    const b = LETTERS[i + 1];
    const folder = `${a.toLowerCase()}-${b.toLowerCase()}`;
    out.push({
      folder,
      label: `${a} – ${b}`,
      letters: [a, b],
      terms: empty.includes(folder)
        ? []
        : Array.from({ length: i + 5 }, (_, k) => ({ slug: `${folder}-term-${k}` })),
    });
  }
  return out;
}

test('volumeRailItems emits all 13 ranges in deterministic A–Z order', () => {
  const items = volumeRailItems(makeRanges());
  assert.equal(items.length, 13);
  assert.deepEqual(
    items.map((i) => i.label),
    [
      'A – B', 'C – D', 'E – F', 'G – H', 'I – J', 'K – L', 'M – N',
      'O – P', 'Q – R', 'S – T', 'U – V', 'W – X', 'Y – Z',
    ]
  );
  assert.deepEqual(items.map((i) => i.folder), [
    'a-b', 'c-d', 'e-f', 'g-h', 'i-j', 'k-l', 'm-n',
    'o-p', 'q-r', 's-t', 'u-v', 'w-x', 'y-z',
  ]);
  assert.deepEqual(items[0].letters, ['A', 'B']);
  assert.deepEqual(items[12].letters, ['Y', 'Z']);
});

test('volumeRailItems reports live counts from the range terms', () => {
  const items = volumeRailItems(makeRanges());
  assert.equal(items[0].count, 5); // a-b has 5 terms
  assert.equal(items[1].count, 7); // c-d has 7 terms
  assert.equal(items[12].count, 29); // y-z has 29 terms
  assert.equal(items[0].disabled, false);
});

test('volumeRailItems disables empty ranges rather than removing them', () => {
  const items = volumeRailItems(makeRanges({ empty: ['a-b', 'y-z'] }));
  assert.equal(items.length, 13);
  assert.equal(items[0].count, 0);
  assert.equal(items[0].disabled, true);
  assert.equal(items[1].disabled, false);
  assert.equal(items[12].count, 0);
  assert.equal(items[12].disabled, true);
  assert.ok(items.slice(1, 12).every((i) => !i.disabled));
});
