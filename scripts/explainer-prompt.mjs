// Prompt and response handling for the explainer generator. Kept apart from the
// network code so it is testable: build the messages for one entry, then turn
// the model's JSON reply into a normalized explainer (or a list of problems).

import { EXPLAINER_LAYOUTS, explainerIssues, explainerLayout, layoutFields, normalizeExplainer } from '../src/explainer.js';
import { TERM_TYPES } from '../src/term-schema.js';

const KIND_SHAPES = {
  text: '"…"',
  list: '["…", "…"]',
  items: '[{ "name": "…", "detail": "…" }]',
  events: '[{ "when": "1986", "what": "…" }]',
  works: '[{ "title": "…", "year": "1986", "url": "https://… (only if it appears in the source)" }]',
};

const LAYOUT_BRIEFS = {
  concept: 'Explain the idea itself: the intuition first, then how it works in 3–5 short steps, a concrete example, why it matters, and 1–3 common mix-ups.',
  anatomy:
    'Describe the architecture or model as a machine with parts: name its main components and what each does, walk through how data flows through it, where it came from (who, when, which paper), and what it replaced or led to.',
  steps: 'Teach the procedure: its goal, what goes in and comes out, the steps in order, a small worked example, and its trade-offs.',
  person:
    'Tell what this person actually did — concrete contributions, not a CV. Give a dated timeline of their work, their key papers or products, and where they worked.',
  organization: 'Tell what this organization built: its mission, when and by whom it was founded, its main models, products or research, and dated milestones.',
  timeline: 'Tell what happened: a dated timeline, who was involved, the outcome so far, and why it matters for AI.',
  measure:
    'Explain what is measured and how: what it scores, the scoring procedure, the formula in plain-text notation if there is one, a worked example with numbers, typical results, and caveats.',
};

const DIAGRAM_LAYOUTS = new Set(['anatomy', 'steps', 'concept', 'measure']);

/** The JSON shape the model must return for a layout. */
export function responseShape(layout) {
  const fields = layoutFields(layout).map(({ field, kind }) => `    "${field}": ${KIND_SHAPES[kind]}`);
  const diagram = DIAGRAM_LAYOUTS.has(layout)
    ? [
        '    "diagram": { "nodes": [{ "id": "short-id", "label": "2–4 words", "note": "one line" }], "edges": [{ "from": "id", "to": "id", "label": "optional, 1–3 words" }], "caption": "…" } (or null when a diagram would not help)',
      ]
    : [];
  return ['{', '  "type": "<one of the allowed types>",', '  "explainer": {', '    "lead": "…",', ...fields.map((f) => `${f},`), ...diagram, '  }', '}'].join('\n');
}

/** Chat messages for one entry. `wiki` is the cached Wikipedia page or null. */
export function buildMessages(entry, wiki) {
  const layout = explainerLayout(entry.type);
  const system = [
    'You write the explainer page of TheAIDictionary, an illustrated encyclopaedia of AI terms read by curious non-experts and engineers alike.',
    'Write in plain, warm, precise English. No marketing language, no filler, no "In the world of AI". Never invent facts: use only the entry and the Wikipedia text supplied, and leave a field out (or use an empty list) when the sources do not support it.',
    'Each text field is 1–3 sentences; each list has 2–6 short items. Dates and names must come from the sources.',
    'Reply with a single JSON object and nothing else.',
  ].join(' ');

  const typeHint = `Current type: "${entry.type}". Allowed types: ${TERM_TYPES.join(', ')}. Keep the current type unless the sources clearly show it is wrong (for example a court case typed as a concept is an "event", a neural network design is an "architecture", a named LLM is a "model").`;
  const parts = [
    `Term: ${entry.term}`,
    entry.aka && entry.aka.length ? `Also known as: ${entry.aka.join(', ')}` : '',
    `Category: ${entry.category}`,
    typeHint,
    `Definition: ${entry.definition}`,
    `Details: ${entry.details}`,
    wiki && wiki.extract ? `Wikipedia article "${wiki.title}":\n"""\n${wiki.extract}\n"""` : 'No Wikipedia article was found: rely on the definition and details only, and keep the explainer short.',
    `Layout "${EXPLAINER_LAYOUTS[layout].title}": ${LAYOUT_BRIEFS[layout]}`,
    'If you change the type, fill the layout that belongs to the new type instead (concept/tool: How it works; architecture/model: Anatomy; algorithm: Step by step; person: Their work; organization: What they built; event/policy/paper/venue/award: What happened; metric/benchmark/dataset: What it measures). The field lists for every layout are:',
    ...Object.keys(EXPLAINER_LAYOUTS).map((name) => `- ${name}: ${layoutFields(name).map((f) => f.field).join(', ')}`),
    '"lead" is a 2–3 sentence plain-language opening that says what this is and why anyone should care — not a copy of the definition.',
    DIAGRAM_LAYOUTS.has(layout)
      ? 'For a diagram, use 3–8 nodes that show the real structure or flow (components and the data passing between them, or the steps of the procedure). Omit it for an abstract idea that has no structure to draw.'
      : '',
    `Return JSON in this shape:\n${responseShape(layout)}`,
  ].filter(Boolean);

  return [
    { role: 'system', content: system },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/** First JSON object in a reply, tolerating ```json fences and prose around it. */
export function extractJson(content) {
  const textValue = String(content || '').trim();
  const fenced = textValue.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : textValue;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('reply has no JSON object');
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * `{ type, explainer, issues }` from a model reply. The type falls back to the
 * entry's own when the model returns something unknown; the image and sources
 * come from Wikipedia, never from the model.
 */
export function parseExplainerReply(content, entry, wiki) {
  const reply = extractJson(content);
  const proposed = String(reply.type || '').trim().toLowerCase();
  const type = TERM_TYPES.includes(proposed) ? proposed : entry.type;
  const raw = { ...(reply.explainer || {}) };
  delete raw.image;
  delete raw.sources;
  if (wiki && wiki.image) raw.image = wiki.image;
  if (wiki && wiki.url) raw.sources = [{ title: `Wikipedia: ${wiki.title}`, url: wiki.url }];
  const explainer = normalizeExplainer(raw, type);
  const issues = explainer ? explainerIssues(raw, type) : ['reply has no lead'];
  if (explainer) delete explainer.layout;
  return { type, explainer, issues };
}
