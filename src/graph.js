let graphPromise = null;

export function validateGraph(graph) {
  if (!graph || graph.schemaVersion !== 1 || !graph.nodes || !Array.isArray(graph.edges)) {
    throw new Error('Unsupported or malformed graph data.');
  }
  for (const edge of graph.edges) {
    if (!graph.nodes[edge.source] || !graph.nodes[edge.target]) {
      throw new Error(`Graph edge references a missing node: ${edge.source} -> ${edge.target}`);
    }
  }
  return graph;
}

export function createGraphIndex(graph) {
  validateGraph(graph);
  const bySlug = new Map(Object.values(graph.nodes).map((node) => [node.slug, node]));
  const adjacency = new Map([...bySlug.keys()].map((slug) => [slug, new Map()]));
  for (const edge of graph.edges) {
    const source = graph.nodes[edge.source].slug;
    const target = graph.nodes[edge.target].slug;
    const add = (from, to) => {
      const current = adjacency.get(from).get(to);
      if (!current || edge.weight > current.weight) adjacency.get(from).set(to, edge);
    };
    add(source, target);
    add(target, source);
  }
  return { graph, bySlug, adjacency };
}

export async function loadGraph({ fetcher = globalThis.fetch, force = false } = {}) {
  if (force) graphPromise = null;
  if (!graphPromise) {
    graphPromise = (async () => {
      const manifestResponse = await fetcher('/generated/manifest.json', { cache: 'no-cache' });
      if (!manifestResponse.ok) throw new Error(`Graph manifest failed with ${manifestResponse.status}.`);
      const manifest = await manifestResponse.json();
      if (manifest.schemaVersion !== 1 || typeof manifest.graphUrl !== 'string') {
        throw new Error('Unsupported graph manifest.');
      }
      const graphResponse = await fetcher(manifest.graphUrl, { cache: 'force-cache' });
      if (!graphResponse.ok) throw new Error(`Graph data failed with ${graphResponse.status}.`);
      return createGraphIndex(await graphResponse.json());
    })().catch((error) => {
      graphPromise = null;
      throw error;
    });
  }
  return graphPromise;
}

export function neighbors(index, slug, { predicates } = {}) {
  const allowed = predicates ? new Set(predicates) : null;
  return [...(index.adjacency.get(slug) || [])]
    .filter(([, edge]) => !allowed || allowed.has(edge.predicate))
    .map(([neighbor, edge]) => ({ node: index.bySlug.get(neighbor), edge }))
    .sort((a, b) => b.edge.weight - a.edge.weight || a.node.label.localeCompare(b.node.label));
}

export function shortestConceptTrail(index, from, to, { predicates, maxNodes = 8 } = {}) {
  if (!index.bySlug.has(from) || !index.bySlug.has(to)) return null;
  if (from === to) return [from];
  const allowed = predicates ? new Set(predicates) : null;
  const distance = new Map([[from, 0]]);
  const previous = new Map();
  const queue = [{ slug: from, distance: 0 }];

  while (queue.length) {
    queue.sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug));
    const current = queue.shift();
    if (current.distance !== distance.get(current.slug)) continue;
    if (current.slug === to) break;
    for (const [next, edge] of index.adjacency.get(current.slug)) {
      if (allowed && !allowed.has(edge.predicate)) continue;
      const candidate = current.distance + 1 / Math.max(edge.weight, 0.001);
      if (candidate < (distance.get(next) ?? Infinity)) {
        distance.set(next, candidate);
        previous.set(next, current.slug);
        queue.push({ slug: next, distance: candidate });
      }
    }
  }
  if (!previous.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(previous.get(path[0]));
  return path.length <= maxNodes ? path : null;
}

// Curated starting concepts for concept trails: broad, well-known subjects the
// dictionary covers. A trail walks from the nearest one to a given term.
export const FOUNDATION_SLUGS = [
  'artificial-intelligence',
  'machine-learning',
  'deep-learning',
  'neural-network',
  'natural-language-processing',
  'computer-vision',
  'reinforcement-learning',
  'information-retrieval',
  'data-mining',
  'machine-translation',
  'speech-recognition',
  'speech-synthesis',
  'supervised-learning',
  'unsupervised-learning',
  'generative-model',
  'transformer',
  'optimization',
  'knowledge-representation',
  'robotics',
];

/**
 * Shortest weighted trail from any node in `fromSlugs` to `to`.
 * Weighted Dijkstra means curated RELATED edges (weight 10) are preferred over
 * derived CO_OCCURS edges. Returns { path, root } (root → … → to), or null when
 * unreachable or longer than maxNodes.
 */
export function nearestTrail(index, fromSlugs, to, { predicates, maxNodes = 5 } = {}) {
  if (!index.bySlug.has(to)) return null;
  const allowed = predicates ? new Set(predicates) : null;
  const distance = new Map();
  const previous = new Map();
  const queue = [];

  for (const from of fromSlugs) {
    if (!index.bySlug.has(from) || distance.has(from)) continue;
    distance.set(from, 0);
    queue.push({ slug: from, distance: 0 });
  }
  if (!distance.size) return null;

  while (queue.length) {
    queue.sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug));
    const current = queue.shift();
    if (current.distance !== distance.get(current.slug)) continue;
    if (current.slug === to) break;
    for (const [next, edge] of index.adjacency.get(current.slug)) {
      if (allowed && !allowed.has(edge.predicate)) continue;
      const candidate = current.distance + 1 / Math.max(edge.weight, 0.001);
      if (candidate < (distance.get(next) ?? Infinity)) {
        distance.set(next, candidate);
        previous.set(next, current.slug);
        queue.push({ slug: next, distance: candidate });
      }
    }
  }

  if (!distance.has(to)) return null;
  const path = [to];
  let cursor = to;
  while (previous.has(cursor)) {
    cursor = previous.get(cursor);
    path.unshift(cursor);
  }
  if (path.length > maxNodes) return null;
  return { path, root: cursor };
}
