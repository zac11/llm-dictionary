import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGraphIndex,
  loadGraph,
  neighbors,
  shortestConceptTrail,
  validateGraph,
} from '../src/graph.js';

const graph = {
  schemaVersion: 1,
  nodes: {
    'term:alpha': { id: 'term:alpha', slug: 'alpha', label: 'Alpha' },
    'term:beta': { id: 'term:beta', slug: 'beta', label: 'Beta' },
    'term:gamma': { id: 'term:gamma', slug: 'gamma', label: 'Gamma' },
  },
  edges: [
    { source: 'term:alpha', target: 'term:gamma', predicate: 'CO_OCCURS', weight: 1 },
    { source: 'term:alpha', target: 'term:beta', predicate: 'RELATED', weight: 10 },
    { source: 'term:beta', target: 'term:gamma', predicate: 'RELATED', weight: 10 },
  ],
  communities: {},
};

test('validateGraph rejects missing edge endpoints', () => {
  assert.throws(
    () => validateGraph({ ...graph, edges: [{ source: 'term:alpha', target: 'term:missing' }] }),
    /missing node/
  );
});

test('graph indexes expose undirected, weighted neighbors', () => {
  const index = createGraphIndex(graph);
  assert.deepEqual(neighbors(index, 'beta').map(({ node }) => node.slug), ['alpha', 'gamma']);
  assert.deepEqual(
    neighbors(index, 'alpha', { predicates: ['CO_OCCURS'] }).map(({ node }) => node.slug),
    ['gamma']
  );
});

test('shortestConceptTrail prefers stronger multi-edge paths', () => {
  const index = createGraphIndex(graph);
  assert.deepEqual(shortestConceptTrail(index, 'alpha', 'gamma'), ['alpha', 'beta', 'gamma']);
  assert.equal(shortestConceptTrail(index, 'missing', 'gamma'), null);
  assert.equal(shortestConceptTrail(index, 'alpha', 'gamma', { maxNodes: 2 }), null);
});

test('loadGraph deduplicates concurrent manifest and graph requests', async () => {
  let calls = 0;
  const fetcher = async (url) => {
    calls++;
    return new Response(JSON.stringify(url.includes('manifest')
      ? { schemaVersion: 1, graphUrl: '/generated/graph.test.json' }
      : graph));
  };
  const [first, second] = await Promise.all([
    loadGraph({ fetcher, force: true }),
    loadGraph({ fetcher }),
  ]);
  assert.equal(first, second);
  assert.equal(calls, 2);
});
