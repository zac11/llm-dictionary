import { buildCoOccurrenceCandidates } from './graph-analysis.mjs';
import { normalizeGraphLabel } from '../src/term-schema.js';

export const GRAPH_SCHEMA_VERSION = 1;
export const GRAPH_GENERATOR_VERSION = 1;
const RELATED_WEIGHT = 10;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const round = (value, precision = 6) => Number(value.toFixed(precision));
const nodeId = (slug) => `term:${slug}`;
const pairKey = (a, b) => (a < b ? `${a}\0${b}` : `${b}\0${a}`);

const GENERIC_NAME_TOKENS = new Set([
  'ai', 'artificial', 'intelligence', 'machine', 'learning', 'model', 'models', 'system',
  'systems', 'data', 'language', 'computer', 'computing', 'method', 'methods', 'algorithm',
  'algorithms', 'technology', 'technologies', 'analysis', 'application', 'applications',
]);

function significantNameTokens(term) {
  return new Set(
    normalizeGraphLabel(`${term.term} ${term.aka.join(' ')}`)
      .split(' ')
      .filter((token) => token.length > 1 && !GENERIC_NAME_TOKENS.has(token))
  );
}

function qualifyRelatedEdges(terms) {
  const bySlug = new Map(terms.map((term) => [term.slug, term]));
  const outgoing = new Map(terms.map((term) => [term.slug, new Set(term.related)]));
  const tokens = new Map(terms.map((term) => [term.slug, significantNameTokens(term)]));
  const text = new Map(
    terms.map((term) => [term.slug, ` ${normalizeGraphLabel(`${term.definition} ${term.details}`)} `])
  );
  const qualified = [];

  for (const source of terms) {
    for (const targetSlug of [...source.related].sort((a, b) => a.localeCompare(b))) {
      const target = bySlug.get(targetSlug);
      const basis = [];
      if (outgoing.get(targetSlug).has(source.slug)) basis.push('reciprocal');
      const sharedTokens = [...tokens.get(source.slug)].filter((token) => tokens.get(targetSlug).has(token));
      if (sharedTokens.length) basis.push('shared-name-token');
      const targetLabel = normalizeGraphLabel(target.term);
      if (targetLabel && text.get(source.slug).includes(` ${targetLabel} `)) basis.push('text-reference');
      if (!basis.length) continue;
      qualified.push({ source, target, basis, sharedTokens });
    }
  }

  const incoming = new Map();
  for (const edge of qualified) incoming.set(edge.target.slug, (incoming.get(edge.target.slug) || 0) + 1);
  const hubThreshold = Math.ceil(terms.length * 0.05);
  const excludedHubs = [...incoming]
    .filter(([, count]) => count > hubThreshold)
    .map(([slug]) => slug)
    .sort((a, b) => a.localeCompare(b));
  const excluded = new Set(excludedHubs);
  const edges = qualified
    .filter((edge) => !excluded.has(edge.target.slug))
    .map((edge) => ({
      source: nodeId(edge.source.slug),
      predicate: 'RELATED',
      target: nodeId(edge.target.slug),
      weight: RELATED_WEIGHT,
      derived: false,
      evidence: {
        basis: edge.basis,
        sharedTokens: edge.sharedTokens,
      },
    }));
  return { edges, excludedHubs, inputCount: terms.reduce((sum, term) => sum + term.related.length, 0) };
}

function buildEdges(terms, { includeCoOccurs }) {
  const related = qualifyRelatedEdges(terms);
  if (!includeCoOccurs) {
    return {
      edges: related.edges,
      relatedInputCount: related.inputCount,
      excludedRelatedHubs: related.excludedHubs,
      excludedCoOccurrenceHubs: [],
      coOccurrenceCandidates: 0,
    };
  }

  const candidates = buildCoOccurrenceCandidates(terms);
  const incoming = new Map();
  for (const candidate of candidates) incoming.set(candidate.target, (incoming.get(candidate.target) || 0) + 1);
  const hubThreshold = Math.ceil(terms.length * 0.05);
  const excludedCoOccurrenceHubs = [...incoming]
    .filter(([, count]) => count > hubThreshold)
    .map(([slug]) => slug)
    .sort((a, b) => a.localeCompare(b));
  const excluded = new Set(excludedCoOccurrenceHubs);
  const coOccurrenceEdges = candidates
    .filter(
      (candidate) =>
        candidate.score >= 5 &&
        candidate.evidence.canonical &&
        !excluded.has(candidate.target)
    )
    .map((candidate) => ({
      source: nodeId(candidate.source),
      predicate: 'CO_OCCURS',
      target: nodeId(candidate.target),
      weight: candidate.score,
      derived: true,
      evidence: {
        definition: candidate.evidence.definition,
        details: candidate.evidence.details,
        mentions: candidate.evidence.mentions,
      },
    }));

  return {
    edges: [...related.edges, ...coOccurrenceEdges],
    relatedInputCount: related.inputCount,
    excludedRelatedHubs: related.excludedHubs,
    excludedCoOccurrenceHubs,
    coOccurrenceCandidates: candidates.length,
  };
}

function buildAdjacency(slugs, edges) {
  const pairWeights = new Map();
  for (const edge of edges) {
    const source = edge.source.slice(5);
    const target = edge.target.slice(5);
    if (source === target) continue;
    const key = pairKey(source, target);
    pairWeights.set(key, Math.max(pairWeights.get(key) || 0, edge.weight));
  }
  const adjacency = new Map(slugs.map((slug) => [slug, new Map()]));
  for (const [key, weight] of pairWeights) {
    const [source, target] = key.split('\0');
    adjacency.get(source).set(target, weight);
    adjacency.get(target).set(source, weight);
  }
  return adjacency;
}

function weightedPageRank(slugs, adjacency, { damping = 0.85, tolerance = 1e-9, maxIterations = 200 } = {}) {
  const count = slugs.length;
  const rank = new Map(slugs.map((slug) => [slug, 1 / count]));
  const totals = new Map(slugs.map((slug) => [slug, [...adjacency.get(slug).values()].reduce((sum, weight) => sum + weight, 0)]));
  let converged = false;
  let iterations = 0;

  for (; iterations < maxIterations; iterations++) {
    const dangling = slugs.reduce((sum, slug) => sum + (totals.get(slug) ? 0 : rank.get(slug)), 0);
    const base = (1 - damping) / count + (damping * dangling) / count;
    const next = new Map(slugs.map((slug) => [slug, base]));
    for (const source of slugs) {
      const total = totals.get(source);
      if (!total) continue;
      for (const [target, weight] of adjacency.get(source)) {
        next.set(target, next.get(target) + damping * rank.get(source) * (weight / total));
      }
    }
    const delta = slugs.reduce((sum, slug) => sum + Math.abs(next.get(slug) - rank.get(slug)), 0);
    for (const slug of slugs) rank.set(slug, next.get(slug));
    if (delta < tolerance) {
      converged = true;
      iterations++;
      break;
    }
  }

  return { rank, converged, iterations };
}

function hashOrder(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function propagateLabels(slugs, adjacency, { maxIterations = 30 } = {}) {
  const labels = new Map(slugs.map((slug) => [slug, slug]));
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    let changes = 0;
    const order = [...slugs].sort(
      (a, b) => hashOrder(`${iterations}:${a}`) - hashOrder(`${iterations}:${b}`) || a.localeCompare(b)
    );
    for (const slug of order) {
      const neighbors = adjacency.get(slug);
      if (!neighbors.size) continue;
      const scores = new Map();
      for (const [neighbor, weight] of neighbors) {
        const label = labels.get(neighbor);
        scores.set(label, (scores.get(label) || 0) + weight);
      }
      const current = labels.get(slug);
      const ranked = [...scores].sort(
        (a, b) => b[1] - a[1] || (a[0] === current ? -1 : b[0] === current ? 1 : a[0].localeCompare(b[0]))
      );
      const next = ranked[0][0];
      if (next !== current) {
        labels.set(slug, next);
        changes++;
      }
    }
    if (!changes) {
      iterations++;
      break;
    }
  }
  return { labels, iterations };
}

function defineCommunities(terms, adjacency, labels, rank) {
  const byLabel = new Map();
  for (const term of terms) {
    const connected = adjacency.get(term.slug).size > 0;
    const label = connected ? labels.get(term.slug) : `category:${normalizeGraphLabel(term.category)}`;
    if (!byLabel.has(label)) byLabel.set(label, { members: [], fallbackCategory: connected ? null : term.category });
    byLabel.get(label).members.push(term.slug);
  }
  const degree = new Map(
    terms.map((term) => [term.slug, [...adjacency.get(term.slug).values()].reduce((sum, weight) => sum + weight, 0)])
  );
  const groups = [...byLabel.values()].map(({ members, fallbackCategory }) => {
    members.sort((a, b) => a.localeCompare(b));
    const representative = [...members].sort(
      (a, b) => degree.get(b) - degree.get(a) || rank.get(b) - rank.get(a) || a.localeCompare(b)
    )[0];
    return { members, representative, fallbackCategory };
  });
  groups.sort((a, b) => a.representative.localeCompare(b.representative));

  const communities = new Map();
  const communityBySlug = new Map();
  groups.forEach((group, index) => {
    const id = `community:${index + 1}`;
    const term = terms.find((candidate) => candidate.slug === group.representative);
    communities.set(id, {
      id,
      label: group.fallbackCategory || term.term,
      representative: group.representative,
      kind: group.fallbackCategory ? 'category-fallback' : 'detected',
      size: group.members.length,
      centrality: round(group.members.reduce((sum, slug) => sum + rank.get(slug), 0)),
    });
    for (const slug of group.members) communityBySlug.set(slug, id);
  });
  return { communities, communityBySlug };
}

function layoutCommunities(terms, communities, communityBySlug, rank) {
  const members = new Map([...communities.keys()].map((id) => [id, []]));
  for (const term of terms) members.get(communityBySlug.get(term.slug)).push(term.slug);
  const packed = [...communities.values()]
    .map((community) => ({ ...community, radius: Math.max(1.2, Math.sqrt(community.size) * 0.24) }))
    .sort((a, b) => b.radius - a.radius || a.id.localeCompare(b.id));
  const centers = new Map();

  for (const community of packed) {
    if (!centers.size) {
      centers.set(community.id, { x: 0, y: 0, radius: community.radius });
      continue;
    }
    let attempt = 1;
    while (true) {
      const distance = 0.42 * Math.sqrt(attempt);
      const candidate = { x: Math.cos(attempt * GOLDEN_ANGLE) * distance, y: Math.sin(attempt * GOLDEN_ANGLE) * distance };
      const overlaps = [...centers.values()].some(
        (placed) => Math.hypot(candidate.x - placed.x, candidate.y - placed.y) < community.radius + placed.radius + 0.35
      );
      if (!overlaps) {
        centers.set(community.id, { ...candidate, radius: community.radius });
        break;
      }
      attempt++;
    }
  }

  const positions = new Map();
  for (const community of communities.values()) {
    const center = centers.get(community.id);
    const ordered = members.get(community.id).sort(
      (a, b) => rank.get(b) - rank.get(a) || a.localeCompare(b)
    );
    ordered.forEach((slug, index) => {
      if (!index) {
        positions.set(slug, { x: center.x, y: center.y });
        return;
      }
      const radius = center.radius * 0.82 * Math.sqrt(index / Math.max(1, ordered.length - 1));
      const angle = index * GOLDEN_ANGLE;
      positions.set(slug, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    });
  }

  let extent = 1;
  for (const position of positions.values()) extent = Math.max(extent, Math.abs(position.x), Math.abs(position.y));
  for (const [slug, position] of positions) {
    positions.set(slug, { x: round(position.x / extent), y: round(position.y / extent) });
  }
  for (const community of communities.values()) {
    const center = centers.get(community.id);
    community.x = round(center.x / extent);
    community.y = round(center.y / extent);
    community.radius = round(center.radius / extent);
  }
  return positions;
}

export function buildGraph(terms, { sourceHash, includeCoOccurs = false } = {}) {
  const sortedTerms = [...terms].sort((a, b) => a.slug.localeCompare(b.slug));
  const slugs = sortedTerms.map((term) => term.slug);
  const edgeResult = buildEdges(sortedTerms, { includeCoOccurs });
  edgeResult.edges.sort(
    (a, b) =>
      a.source.localeCompare(b.source) ||
      a.predicate.localeCompare(b.predicate) ||
      a.target.localeCompare(b.target)
  );
  const adjacency = buildAdjacency(slugs, edgeResult.edges);
  const pageRank = weightedPageRank(slugs, adjacency);
  const propagation = propagateLabels(slugs, adjacency);
  const { communities, communityBySlug } = defineCommunities(
    sortedTerms,
    adjacency,
    propagation.labels,
    pageRank.rank
  );
  const positions = layoutCommunities(sortedTerms, communities, communityBySlug, pageRank.rank);
  const nodes = {};
  for (const term of sortedTerms) {
    const position = positions.get(term.slug);
    nodes[nodeId(term.slug)] = {
      id: nodeId(term.slug),
      type: 'term',
      slug: term.slug,
      label: term.term,
      letter: term.letter,
      category: term.category,
      community: communityBySlug.get(term.slug),
      centrality: round(pageRank.rank.get(term.slug)),
      x: position.x,
      y: position.y,
    };
  }
  const communityOutput = Object.fromEntries(
    [...communities].sort(([a], [b]) => a.localeCompare(b)).map(([id, community]) => [id, community])
  );
  const isolatedTerms = slugs.filter((slug) => !adjacency.get(slug).size).length;
  const coOccurrenceEdges = edgeResult.edges.filter((edge) => edge.predicate === 'CO_OCCURS').length;

  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes,
    edges: edgeResult.edges,
    communities: communityOutput,
    meta: {
      sourceHash,
      generatorVersion: GRAPH_GENERATOR_VERSION,
      counts: {
        terms: sortedTerms.length,
        edges: edgeResult.edges.length,
        relatedEdges: edgeResult.edges.length - coOccurrenceEdges,
        coOccurrenceEdges,
        communities: communities.size,
        isolatedTerms,
      },
      analytics: {
        graph: 'weighted-undirected',
        relatedWeight: RELATED_WEIGHT,
        pageRankIterations: pageRank.iterations,
        pageRankConverged: pageRank.converged,
        labelPropagationIterations: propagation.iterations,
      },
      related: {
        inputEdges: edgeResult.relatedInputCount,
        acceptedEdges: edgeResult.edges.length - coOccurrenceEdges,
        excludedHubs: edgeResult.excludedRelatedHubs,
        qualification: ['reciprocal', 'shared-name-token', 'text-reference'],
      },
      coOccurrence: {
        enabled: includeCoOccurs,
        candidates: edgeResult.coOccurrenceCandidates,
        excludedHubs: edgeResult.excludedCoOccurrenceHubs,
        minimumScore: 5,
        requiresCanonicalMatch: true,
      },
      coordinateRange: [-1, 1],
    },
  };
}

export const _test = { buildAdjacency, weightedPageRank, propagateLabels, layoutCommunities };
