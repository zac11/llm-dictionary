import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageStats } from '../src/coverage.js';

const make = (letter, category, type = 'concept', extra = {}) => ({ letter, category, type, ...extra });

test('coverageStats counts letters, categories and types and flags thin areas', () => {
  const terms = [];
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXY') for (let i = 0; i < 4; i++) terms.push(make(letter, 'Core'));
  terms.push(make('Z', 'Rare', 'person', { explainer: {}, contributors: [{ name: 'x' }] }));
  const stats = coverageStats(terms);
  assert.equal(stats.total, 101);
  assert.equal(stats.letters.length, 26);
  assert.equal(stats.letterMedian, 4);
  assert.deepEqual(stats.thinLetters.map(({ letter }) => letter), ['Z']);
  assert.deepEqual(stats.topCategories[0], { category: 'Core', count: 100 });
  assert.deepEqual(stats.thinCategories, [{ category: 'Rare', count: 1 }]);
  assert.deepEqual(stats.types.map(({ type }) => type), ['concept', 'person']);
  assert.equal(stats.withExplainer, 1);
  assert.equal(stats.withContributors, 1);
});

test('coverageStats handles an empty shelf', () => {
  const stats = coverageStats([]);
  assert.equal(stats.total, 0);
  assert.equal(stats.thinLetters.length, 0);
  assert.equal(stats.topCategories.length, 0);
});
