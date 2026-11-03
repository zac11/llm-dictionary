import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCollectionDiagnostics, loadDictionarySource, normalizedSourceHash } from '../scripts/graph-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('repository dictionary passes structural graph validation', () => {
  const { terms, diagnostics } = loadDictionarySource(join(root, 'dictionary'));
  assert.ok(terms.length >= 3000, `expected at least 3000 terms, got ${terms.length}`);
  assert.equal(diagnostics.filter((item) => item.level === 'error').length, 0);
  assert.equal(diagnostics.filter((item) => item.code === 'ambiguous-alias').length, 2);
});

test('normalized source hashing is stable across input ordering', () => {
  const { terms } = loadDictionarySource(join(root, 'dictionary'));
  assert.equal(normalizedSourceHash(terms), normalizedSourceHash([...terms].reverse()));
  assert.match(normalizedSourceHash(terms), /^[a-f0-9]{64}$/);
});

test('every bundled learning path resolves to dictionary terms', () => {
  const { terms } = loadDictionarySource(join(root, 'dictionary'));
  const errors = loadCollectionDiagnostics(join(root, 'collections'), terms).filter((item) => item.level === 'error');
  assert.deepEqual(errors, []);
  const broken = loadCollectionDiagnostics(join(root, 'collections'), terms.filter((term) => term.slug !== 'attention'));
  assert.ok(broken.some((item) => item.code === 'unknown-collection-slug'));
});
