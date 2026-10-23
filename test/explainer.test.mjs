import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPLAINER_LAYOUTS,
  TYPE_LAYOUTS,
  explainerIssues,
  explainerLayout,
  explainerSections,
  normalizeDiagram,
  normalizeExplainer,
} from '../src/explainer.js';
import { layoutDiagram, renderDiagramSvg, wrapLabel } from '../src/diagram.js';
import { TERM_TYPES, normalizeTerm } from '../src/term-schema.js';
import { entrySecondPage, hasSecondPage } from '../src/entry-actions.js';
import { buildMessages, extractJson, parseExplainerReply } from '../scripts/explainer-prompt.mjs';
import { refineConcept } from '../scripts/classify-types.mjs';

test('every entry type reads through one of the eight layouts', () => {
  assert.equal(Object.keys(EXPLAINER_LAYOUTS).length, 8);
  assert.equal(explainerLayout('library'), 'library');
  for (const type of TERM_TYPES) assert.ok(EXPLAINER_LAYOUTS[TYPE_LAYOUTS[type]], type);
  assert.equal(explainerLayout('architecture'), 'anatomy');
  assert.equal(explainerLayout('person'), 'person');
  assert.equal(explainerLayout('event'), 'timeline');
  assert.equal(explainerLayout('metric'), 'measure');
  assert.equal(explainerLayout('nonsense'), 'concept');
});

test('normalizeExplainer keeps only the fields of the type layout, cleaned', () => {
  const explainer = normalizeExplainer(
    {
      lead: '  A person who built things. ',
      knownFor: 'Backpropagation',
      timeline: [{ when: 1986, what: 'Co-authored the backprop paper' }, { when: '2000' }],
      keyWorks: [{ title: 'Learning representations', year: '1986', url: 'javascript:alert(1)' }],
      intuition: 'belongs to concepts, dropped',
      image: { src: 'http://insecure.example/x.png' },
      sources: [{ title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/X' }, { url: 'nope' }],
    },
    'person'
  );
  assert.deepEqual(explainer, {
    layout: 'person',
    lead: 'A person who built things.',
    knownFor: 'Backpropagation',
    timeline: [{ when: '1986', what: 'Co-authored the backprop paper' }],
    keyWorks: [{ title: 'Learning representations', year: '1986', url: '' }],
    sources: [{ title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/X' }],
  });
  assert.equal(normalizeExplainer({ knownFor: 'no lead' }, 'person'), null);
  assert.equal(normalizeExplainer('text', 'concept'), null);
});

test('explainerSections follows the layout order and skips empty fields', () => {
  const sections = explainerSections(
    normalizeExplainer({ lead: 'L', example: 'E', intuition: 'I', misconceptions: [] }, 'concept')
  );
  assert.deepEqual(
    sections.map((s) => s.field),
    ['intuition', 'example']
  );
});

test('explainerIssues flags thin explainers, broken diagrams and uncredited images', () => {
  assert.deepEqual(explainerIssues({ lead: 'L', intuition: 'I', example: 'E', whyItMatters: 'W' }, 'concept'), []);
  const issues = explainerIssues(
    { lead: 'L', intuition: 'I', diagram: { nodes: ['a'] }, image: { src: 'https://x.org/a.png' } },
    'concept'
  );
  assert.ok(issues.some((m) => m.includes('sections are filled')));
  assert.ok(issues.some((m) => m.includes('diagram')));
  assert.ok(issues.some((m) => m.includes('credit')));
});

test('normalizeDiagram derives ids, drops dangling and duplicate edges', () => {
  const diagram = normalizeDiagram({
    nodes: ['Input', { id: 'enc', label: 'Encoder' }, 'Input', { label: '' }],
    edges: [
      { from: 'input', to: 'enc' },
      ['input', 'enc'],
      { from: 'enc', to: 'missing' },
      { from: 'enc', to: 'enc' },
    ],
  });
  assert.deepEqual(diagram, {
    nodes: [
      { id: 'input', label: 'Input', note: '' },
      { id: 'enc', label: 'Encoder', note: '' },
    ],
    edges: [{ from: 'input', to: 'enc', label: '' }],
    caption: '',
  });
  assert.equal(normalizeDiagram({ nodes: ['a', 'b'], edges: [] }), null);
});

test('layoutDiagram layers nodes top to bottom and routes loops back up', () => {
  const diagram = normalizeDiagram({
    nodes: ['Tokens', 'Attention', 'Feed-forward', 'Output'],
    edges: [
      ['tokens', 'attention'],
      ['attention', 'feed-forward'],
      ['feed-forward', 'attention', 'repeat'],
      ['feed-forward', 'output'],
    ],
  });
  const { boxes, edges } = layoutDiagram(diagram);
  const y = Object.fromEntries(boxes.map((b) => [b.id, b.y]));
  assert.ok(y.tokens < y.attention && y.attention < y['feed-forward'] && y['feed-forward'] < y.output);
  assert.equal(edges.length, 4);
  const svg = renderDiagramSvg(diagram, { id: 'dg-test' });
  assert.match(svg, /^<svg class="dg-svg"/);
  assert.match(svg, /marker id="dg-test-arrow"/);
  assert.match(svg, />repeat</);
  assert.equal(renderDiagramSvg(null), '');
});

test('wrapLabel wraps on words and truncates past the line budget', () => {
  assert.deepEqual(wrapLabel('Multi-head self attention block', 12), ['Multi-head', 'self…']);
  assert.deepEqual(wrapLabel('Short', 12), ['Short']);
});

test('an explainer turns the second page into its layout', () => {
  const term = normalizeTerm({
    term: 'Transformer',
    type: 'architecture',
    explainer: { lead: 'A network built on attention.', components: [{ name: 'Encoder' }] },
  });
  assert.equal(term.explainer.layout, 'anatomy');
  assert.deepEqual(entrySecondPage(term), {
    presentation: 'explainer',
    layout: 'anatomy',
    title: 'Anatomy',
    cue: 'Look inside',
    counter: 'anatomy',
  });
  assert.equal(hasSecondPage({ ...term, story: '' }), true);
});

test('buildMessages grounds the prompt in the entry and Wikipedia', () => {
  const entry = normalizeTerm({ term: 'Raine v. OpenAI', type: 'event', definition: 'D', details: 'A lawsuit.' });
  const [system, user] = buildMessages(entry, { title: 'Raine v. OpenAI', extract: 'Filed in August 2025.' });
  assert.match(system.content, /Never invent facts/);
  assert.match(user.content, /Filed in August 2025/);
  assert.match(user.content, /What happened/);
  assert.match(user.content, /"timeline"/);
  assert.doesNotMatch(user.content, /"diagram"/);
});

test('parseExplainerReply accepts fenced JSON, keeps known types, and adds Wikipedia credit', () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a": 1}\n```'), { a: 1 });
  const entry = normalizeTerm({ term: 'Raine v. OpenAI', type: 'concept' });
  const wiki = {
    title: 'Raine v. OpenAI',
    url: 'https://en.wikipedia.org/wiki/Raine_v._OpenAI',
    image: null,
  };
  const reply = JSON.stringify({
    type: 'event',
    explainer: {
      lead: 'A wrongful-death lawsuit.',
      timeline: [{ when: '2025-08-26', what: 'Filed' }],
      outcome: 'Ongoing.',
      whyItMatters: 'Chatbot safety.',
      image: { src: 'https://made-up.example/x.png', credit: 'model' },
    },
  });
  const parsed = parseExplainerReply(reply, entry, wiki);
  assert.equal(parsed.type, 'event');
  assert.equal(parsed.explainer.image, undefined);
  assert.deepEqual(parsed.explainer.sources, [{ title: 'Wikipedia: Raine v. OpenAI', url: wiki.url }]);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parseExplainerReply('{"type":"wizard","explainer":{"lead":"x"}}', entry, null).type, 'concept');
});

test('refineConcept sorts technical concepts into finer kinds and leaves ideas alone', () => {
  const r = (term, definition) => refineConcept({ term, definition, details: '' });
  assert.equal(r('Raine v. OpenAI', 'Raine v. OpenAI is an ongoing lawsuit filed in 2025.'), 'event');
  assert.equal(r('Hopfield network', 'A Hopfield network is a form of recurrent neural network.'), 'architecture');
  assert.equal(r('Junction tree algorithm', 'The junction tree algorithm is a method used in machine learning.'), 'algorithm');
  assert.equal(r('MNIST database', 'The MNIST database is a large database of handwritten digits.'), 'dataset');
  assert.equal(r('ROUGE (metric)', 'ROUGE is a set of metrics used for evaluating summarization.'), 'metric');
  assert.equal(r('Dataset shift', 'Dataset shift is a change in the data distribution.'), null);
  assert.equal(r('Overfitting', 'Overfitting is the production of an analysis that corresponds too closely to data.'), null);
});

test('library explainers keep Python and JavaScript code variants', () => {
  const explainer = normalizeExplainer(
    {
      lead: 'Install it and run a first example.',
      createdBy: 'Hugging Face.',
      install: { python: 'pip install transformers', js: 'npm install @huggingface/transformers', ruby: 'gem install x' },
      quickstart: [{ lang: 'py', code: '\nprint("hi")\n\n' }, { lang: 'typescript', code: '' }],
      inAi: 'Run open models.',
      intuition: 'belongs to concepts, dropped',
    },
    'library'
  );
  assert.equal(explainer.layout, 'library');
  assert.deepEqual(explainer.install, [
    { lang: 'python', code: 'pip install transformers' },
    { lang: 'javascript', code: 'npm install @huggingface/transformers' },
  ]);
  assert.deepEqual(explainer.quickstart, [{ lang: 'python', code: 'print("hi")' }]);
  assert.equal(explainer.intuition, undefined);
  assert.deepEqual(explainerIssues(explainer, 'library'), []);
  assert.equal(entrySecondPage({ type: 'library', explainer }).title, 'Install & use');
});
