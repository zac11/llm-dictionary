// The type-aware second spread. Each entry type reads through one of seven
// layouts — a concept explains how it works, an architecture shows its anatomy,
// a person shows their work — and `explainer` holds the content for it. No DOM
// here: src/ui.js renders the sections, src/diagram.js draws the figure.

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');
const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(value);

/** Field shapes an explainer section can take. */
const KINDS = {
  text: (value) => text(value),
  list: (value) => asArray(value).map(text).filter(Boolean),
  items: (value) =>
    asArray(value)
      .map((item) => (isRecord(item) ? { name: text(item.name), detail: text(item.detail) } : { name: text(item), detail: '' }))
      .filter((item) => item.name),
  events: (value) =>
    asArray(value)
      .map((item) => (isRecord(item) ? { when: text(item.when), what: text(item.what) } : null))
      .filter((item) => item && item.what),
  works: (value) =>
    asArray(value)
      .map((item) => {
        if (!isRecord(item)) return text(item) ? { title: text(item), year: '', url: '' } : null;
        const url = text(item.url);
        return { title: text(item.title), year: text(item.year), url: isHttpUrl(url) ? url : '' };
      })
      .filter((item) => item && item.title),
};

/**
 * The seven layouts. `sections` is the reading order of the right-hand page:
 * `[field, heading, kind, icon]`. `figure` says which picture leads when an
 * entry has both a drawn diagram and a photograph.
 */
export const EXPLAINER_LAYOUTS = {
  concept: {
    title: 'How it works',
    cue: 'See how it works',
    figure: 'diagram',
    sections: [
      ['intuition', 'The intuition', 'text', 'sparkles'],
      ['howItWorks', 'How it works', 'list', 'cog'],
      ['example', 'An example', 'text', 'lightbulb'],
      ['whyItMatters', 'Why it matters', 'text', 'target'],
      ['misconceptions', 'Common mix-ups', 'list', 'alert'],
    ],
  },
  anatomy: {
    title: 'Anatomy',
    cue: 'Look inside',
    figure: 'diagram',
    sections: [
      ['components', 'The parts', 'items', 'layers'],
      ['flow', 'How data moves through it', 'list', 'arrow-right'],
      ['origin', 'Where it came from', 'text', 'clock'],
      ['lineage', 'What it replaced, what it led to', 'text', 'network'],
      ['whyItMatters', 'Why it matters', 'text', 'target'],
    ],
  },
  steps: {
    title: 'Step by step',
    cue: 'Walk through it',
    figure: 'diagram',
    sections: [
      ['goal', 'The goal', 'text', 'target'],
      ['inputs', 'Goes in', 'list', 'arrow-right'],
      ['outputs', 'Comes out', 'list', 'arrow-up-right'],
      ['steps', 'The steps', 'list', 'cog'],
      ['example', 'A small example', 'text', 'lightbulb'],
      ['tradeoffs', 'Trade-offs', 'list', 'alert'],
    ],
  },
  person: {
    title: 'Their work',
    cue: 'See their work',
    figure: 'image',
    sections: [
      ['knownFor', 'Known for', 'text', 'sparkles'],
      ['contributions', 'What they did', 'items', 'lightbulb'],
      ['timeline', 'Timeline', 'events', 'clock'],
      ['keyWorks', 'Key works', 'works', 'book-open'],
      ['affiliations', 'Where they worked', 'list', 'graduation-cap'],
    ],
  },
  organization: {
    title: 'What they built',
    cue: 'See what they built',
    figure: 'image',
    sections: [
      ['mission', 'The mission', 'text', 'target'],
      ['founded', 'Founded', 'text', 'clock'],
      ['built', 'What they built', 'items', 'layers'],
      ['milestones', 'Milestones', 'events', 'sparkles'],
    ],
  },
  timeline: {
    title: 'What happened',
    cue: 'See what happened',
    figure: 'image',
    sections: [
      ['timeline', 'Timeline', 'events', 'clock'],
      ['parties', 'Who was involved', 'list', 'users'],
      ['outcome', 'The outcome', 'text', 'target'],
      ['whyItMatters', 'Why it matters', 'text', 'sparkles'],
    ],
  },
  measure: {
    title: 'What it measures',
    cue: 'See what it measures',
    figure: 'diagram',
    sections: [
      ['measures', 'What it measures', 'text', 'target'],
      ['howScored', 'How it is scored', 'list', 'cog'],
      ['formula', 'The formula', 'formula', 'sigma'],
      ['example', 'A worked example', 'text', 'lightbulb'],
      ['typicalResults', 'Typical results', 'text', 'sparkles'],
      ['caveats', 'Caveats', 'list', 'alert'],
    ],
  },
};

/** Which layout each entry type reads through. */
export const TYPE_LAYOUTS = {
  concept: 'concept',
  tool: 'concept',
  architecture: 'anatomy',
  model: 'anatomy',
  algorithm: 'steps',
  person: 'person',
  organization: 'organization',
  event: 'timeline',
  policy: 'timeline',
  paper: 'timeline',
  venue: 'timeline',
  award: 'timeline',
  metric: 'measure',
  benchmark: 'measure',
  dataset: 'measure',
};

export function explainerLayout(type) {
  return TYPE_LAYOUTS[type] || 'concept';
}

/** Every field a layout reads, with its shape (the formula is plain text). */
export function layoutFields(layout) {
  const spec = EXPLAINER_LAYOUTS[layout] || EXPLAINER_LAYOUTS.concept;
  return spec.sections.map(([field, heading, kind]) => ({ field, heading, kind: kind === 'formula' ? 'text' : kind }));
}

const MAX_DIAGRAM_NODES = 10;
const nodeId = (value) =>
  text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** `{ nodes: [{ id, label, note }], edges: [{ from, to, label }], caption }`, or null. */
export function normalizeDiagram(value) {
  if (!isRecord(value)) return null;
  const nodes = [];
  const seen = new Set();
  for (const raw of asArray(value.nodes)) {
    const label = text(isRecord(raw) ? raw.label : raw);
    const id = nodeId(isRecord(raw) && raw.id ? raw.id : label);
    if (!label || !id || seen.has(id) || nodes.length >= MAX_DIAGRAM_NODES) continue;
    seen.add(id);
    nodes.push({ id, label, note: isRecord(raw) ? text(raw.note) : '' });
  }
  if (nodes.length < 2) return null;
  const edges = [];
  const edgeKeys = new Set();
  for (const raw of asArray(value.edges)) {
    const pair = Array.isArray(raw) ? { from: raw[0], to: raw[1], label: raw[2] } : raw;
    if (!isRecord(pair)) continue;
    const from = nodeId(pair.from);
    const to = nodeId(pair.to);
    const key = `${from}>${to}`;
    if (!seen.has(from) || !seen.has(to) || from === to || edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ from, to, label: text(pair.label) });
  }
  if (!edges.length) return null;
  return { nodes, edges, caption: text(value.caption) };
}

/** A Wikimedia (or other https) picture with the credit its license requires. */
export function normalizeImage(value) {
  if (!isRecord(value)) return null;
  const src = text(value.src);
  if (!/^https:\/\/\S+$/i.test(src)) return null;
  const licenseUrl = text(value.licenseUrl);
  const page = text(value.page);
  return {
    src,
    alt: text(value.alt),
    width: Number(value.width) > 0 ? Number(value.width) : 0,
    height: Number(value.height) > 0 ? Number(value.height) : 0,
    credit: text(value.credit),
    license: text(value.license),
    licenseUrl: isHttpUrl(licenseUrl) ? licenseUrl : '',
    page: isHttpUrl(page) ? page : '',
  };
}

const normalizeSource = (value) => {
  if (!isRecord(value)) return null;
  const url = text(value.url);
  if (!isHttpUrl(url)) return null;
  return { title: text(value.title) || url, url };
};

/**
 * The explainer for an entry of the given type, or null when there is none.
 * Fields from other layouts are dropped, so a re-typed entry never shows a
 * section that belongs to a different kind of page.
 */
export function normalizeExplainer(value, type) {
  if (!isRecord(value)) return null;
  const lead = text(value.lead);
  if (!lead) return null;
  const layout = explainerLayout(type);
  const out = { layout, lead };
  for (const { field, kind } of layoutFields(layout)) {
    const normalized = KINDS[kind](value[field]);
    if (Array.isArray(normalized) ? normalized.length : normalized) out[field] = normalized;
  }
  const diagram = normalizeDiagram(value.diagram);
  if (diagram) out.diagram = diagram;
  const image = normalizeImage(value.image);
  if (image) out.image = image;
  const sources = asArray(value.sources).map(normalizeSource).filter(Boolean);
  if (sources.length) out.sources = sources;
  return out;
}

/** Sections of a normalized explainer that have content, in reading order. */
export function explainerSections(explainer) {
  if (!explainer) return [];
  const spec = EXPLAINER_LAYOUTS[explainer.layout] || EXPLAINER_LAYOUTS.concept;
  return spec.sections
    .filter(([field]) => {
      const value = explainer[field];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    })
    .map(([field, heading, kind, icon]) => ({ field, heading, kind, icon, value: explainer[field] }));
}

/** Content checks for authors and the generator; empty when the explainer reads well. */
export function explainerIssues(raw, type) {
  const issues = [];
  if (!isRecord(raw)) return ['explainer must be an object'];
  const explainer = normalizeExplainer(raw, type);
  if (!explainer) return ['explainer needs a lead'];
  const filled = explainerSections(explainer).length;
  const total = EXPLAINER_LAYOUTS[explainer.layout].sections.length;
  if (filled < Math.min(3, total)) issues.push(`only ${filled} of ${total} ${explainer.layout} sections are filled`);
  if (raw.diagram !== undefined && !explainer.diagram) issues.push('diagram needs at least two nodes joined by an edge');
  if (raw.image !== undefined && !explainer.image) issues.push('image needs an https src');
  if (explainer.image && !explainer.image.credit) issues.push('image needs a credit line');
  return issues;
}
