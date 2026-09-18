import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionarySource, normalizedSourceHash } from '../scripts/graph-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('repository dictionary passes structural graph validation', () => {
  const { terms, diagnostics } = loadDictionarySource(join(root, 'dictionary'));
  assert.equal(terms.length, 1527);
  assert.equal(diagnostics.filter((item) => item.level === 'error').length, 0);
  assert.equal(diagnostics.filter((item) => item.code === 'ambiguous-alias').length, 2);
});

test('normalized source hashing is stable across input ordering', () => {
  const { terms } = loadDictionarySource(join(root, 'dictionary'));
  assert.equal(normalizedSourceHash(terms), normalizedSourceHash([...terms].reverse()));
  assert.match(normalizedSourceHash(terms), /^[a-f0-9]{64}$/);
});
