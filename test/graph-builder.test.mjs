import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, GRAPH_SCHEMA_VERSION } from '../scripts/graph-builder.mjs';

const term = (slug, related = [], overrides = {}) => ({
  slug,
  term: slug.replace(/-/g, ' '),
  letter: slug[0].toUpperCase(),
  category: 'Test',
  aka: [],
  definition: '',
  details: '',
  related,
  ...overrides,
});

test('buildGraph emits a deterministic, versioned, term-only graph', () => {
  const terms = [term('alpha', ['beta']), term('beta', ['alpha']), term('gamma')];
  const first = buildGraph(terms, { sourceHash: 'source' });
  const second = buildGraph([...terms].reverse(), { sourceHash: 'source' });
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, GRAPH_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(first.nodes), ['term:alpha', 'term:beta', 'term:gamma']);
  assert.equal(first.edges.length, 2);
  assert.equal(first.edges.every((edge) => edge.predicate === 'RELATED' && !edge.derived), true);
  assert.equal(first.edges.every((edge) => edge.source in first.nodes && edge.target in first.nodes), true);
  assert.equal(first.meta.counts.isolatedTerms, 1);
});

test('PageRank handles reciprocal edges and an isolated dangling node', () => {
  const graph = buildGraph(
    [term('alpha', ['beta']), term('beta', ['alpha']), term('gamma')],
    { sourceHash: 'source' }
  );
  const centralities = Object.values(graph.nodes).map((node) => node.centrality);
  assert.ok(Math.abs(centralities.reduce((sum, value) => sum + value, 0) - 1) < 0.00001);
  assert.equal(graph.nodes['term:alpha'].centrality, graph.nodes['term:beta'].centrality);
  assert.ok(graph.nodes['term:alpha'].centrality > graph.nodes['term:gamma'].centrality);
  assert.equal(graph.meta.analytics.pageRankConverged, true);
});

test('layout coordinates and communities cover every node within the declared range', () => {
  const graph = buildGraph(
    [term('alpha', ['beta']), term('beta'), term('gamma', ['delta']), term('delta')],
    { sourceHash: 'source' }
  );
  for (const node of Object.values(graph.nodes)) {
    assert.ok(node.community in graph.communities);
    assert.ok(node.x >= -1 && node.x <= 1);
    assert.ok(node.y >= -1 && node.y <= 1);
  }
  assert.equal(
    Object.values(graph.communities).reduce((sum, community) => sum + community.size, 0),
    4
  );
});

test('uncorroborated related edges are excluded while reciprocal links are retained', () => {
  const graph = buildGraph(
    [
      term('alpha', ['beta', 'gamma']),
      term('beta', ['alpha']),
      term('gamma'),
    ],
    { sourceHash: 'source' }
  );
  assert.equal(graph.meta.related.inputEdges, 3);
  assert.equal(graph.meta.related.acceptedEdges, 2);
  assert.deepEqual(graph.edges.map((edge) => `${edge.source}->${edge.target}`), [
    'term:alpha->term:beta',
    'term:beta->term:alpha',
  ]);
});

test('co-occurrence edges are gated off by default and filtered when enabled', () => {
  const terms = [
    term('alpha', [], { details: 'Beta is relevant.' }),
    term('beta'),
  ];
  const without = buildGraph(terms, { sourceHash: 'source' });
  const withCoOccurrence = buildGraph(terms, { sourceHash: 'source', includeCoOccurs: true });
  assert.equal(without.meta.counts.coOccurrenceEdges, 0);
  assert.equal(without.meta.coOccurrence.enabled, false);
  assert.equal(withCoOccurrence.meta.counts.coOccurrenceEdges, 1);
  assert.equal(withCoOccurrence.edges[0].predicate, 'CO_OCCURS');
  assert.equal(withCoOccurrence.edges[0].evidence.details, true);
});
