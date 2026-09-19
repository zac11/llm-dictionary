import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoOccurrenceCandidates, _test } from '../scripts/graph-analysis.mjs';

const term = (slug, name, aka = [], definition = '', details = '') => ({
  slug,
  term: name,
  aka,
  definition,
  details,
});

test('occurrences escapes punctuation and respects token boundaries', () => {
  assert.equal(_test.occurrences('C++ and C+++ differ', 'C++', false).length, 1);
  assert.equal(_test.occurrences('Small ML model', 'ML', true).length, 1);
  assert.equal(_test.occurrences('Small ml model', 'ML', true).length, 0);
});

test('co-occurrence candidates exclude self matches and prefer definition evidence', () => {
  const terms = [
    term('attention', 'Attention', [], 'Transformer uses attention.', ''),
    term('transformer', 'Transformer', [], '', ''),
    term('other', 'Other', [], '', 'Transformer appears here.'),
  ];
  const edges = buildCoOccurrenceCandidates(terms);
  assert.equal(edges.some((edge) => edge.source === edge.target), false);
  assert.equal(edges.find((edge) => edge.source === 'attention').target, 'transformer');
  assert.equal(edges.find((edge) => edge.source === 'attention').evidence.definition, true);
  assert.ok(
    edges.find((edge) => edge.source === 'attention').score >
      edges.find((edge) => edge.source === 'other').score
  );
});

test('short acronyms match case-sensitively and longer aliases ignore case', () => {
  const terms = [
    term('upper', 'Upper', [], '', 'Uses ML and retrieval augmented generation.'),
    term('lower', 'Lower', [], '', 'Uses ml.'),
    term('machine-learning', 'Machine Learning', ['ML']),
    term('rag', 'Retrieval-Augmented Generation', ['RAG']),
  ];
  const edges = buildCoOccurrenceCandidates(terms);
  assert.equal(edges.some((edge) => edge.source === 'upper' && edge.target === 'machine-learning'), true);
  assert.equal(edges.some((edge) => edge.source === 'lower' && edge.target === 'machine-learning'), false);
  assert.equal(edges.some((edge) => edge.source === 'upper' && edge.target === 'rag'), true);
});

test('candidate limit and tie ordering are deterministic', () => {
  const terms = [
    term('source', 'Source', [], 'Alpha Beta Gamma', ''),
    term('gamma', 'Gamma'),
    term('beta', 'Beta'),
    term('alpha', 'Alpha'),
  ];
  const edges = buildCoOccurrenceCandidates(terms, { limit: 2 }).filter((edge) => edge.source === 'source');
  assert.deepEqual(edges.map((edge) => edge.target), ['alpha', 'beta']);
});
