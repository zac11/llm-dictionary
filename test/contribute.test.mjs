import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIssueBody,
  buildIssueUrl,
  collectBatchIssues,
  formRowToTerm,
  MAX_ISSUE_URL_LENGTH,
  parseCoverage,
  parseProfileLinks,
  termFileJson,
  termFilePath,
} from '../src/contribute.js';

const validRow = {
  term: 'Mixture of Experts',
  category: 'Architecture',
  aka: 'MoE, Sparse MoE',
  definition: 'A model that routes each input to a small subset of expert networks.',
  details: 'Mixture-of-experts layers scale model capacity without scaling compute per token.',
  related: 'Transformers, attention',
  citeTitle: 'Outrageously Large Neural Networks',
  citeAuthors: 'Noam Shazeer, Azalia Mirhoseini',
  citeYear: '2017',
  citeVenue: 'ICLR',
  citeUrl: 'https://arxiv.org/abs/1701.06538',
};

test('formRowToTerm normalizes a full row into a valid term', () => {
  const { term, issues } = formRowToTerm(validRow);
  assert.deepEqual(issues, []);
  assert.equal(term.term, 'Mixture of Experts');
  assert.equal(term.slug, 'mixture-of-experts');
  assert.equal(term.letter, 'M');
  assert.deepEqual(term.aka, ['MoE', 'Sparse MoE']);
  assert.deepEqual(term.related, ['transformers', 'attention']);
  assert.equal(term.citation.title, 'Outrageously Large Neural Networks');
  assert.deepEqual(term.citation.authors, ['Noam Shazeer', 'Azalia Mirhoseini']);
});

test('formRowToTerm defaults category and drops empty optional fields', () => {
  const { term, issues } = formRowToTerm({
    term: 'Test Term',
    definition: 'A definition.',
    details: 'Some details.',
  });
  assert.deepEqual(issues, []);
  assert.equal(term.category, 'General');
  assert.deepEqual(term.aka, []);
  assert.deepEqual(term.related, []);
  assert.equal(term.citation.title, '');
});

test('formRowToTerm flags missing definition and details', () => {
  const { issues } = formRowToTerm({ term: 'Empty Term' });
  const codes = issues.map((issue) => issue.code);
  assert.ok(codes.includes('missing-definition'));
  assert.ok(codes.includes('missing-details'));
});

test('formRowToTerm flags a citation without a title', () => {
  const { issues } = formRowToTerm({
    term: 'Cited Term',
    definition: 'A definition.',
    details: 'Some details.',
    citeUrl: 'https://example.com',
  });
  assert.ok(issues.some((issue) => issue.code === 'missing-citation-title'));
});

test('formRowToTerm rejects a missing term name', () => {
  const { term, issues } = formRowToTerm({ definition: 'd', details: 'd' });
  assert.equal(term, null);
  assert.ok(issues.some((issue) => issue.code === 'invalid-term'));
});

test('collectBatchIssues catches duplicate slugs within the batch', () => {
  const a = formRowToTerm(validRow);
  const b = formRowToTerm({ ...validRow, term: 'Mixture Of Experts' });
  const issues = collectBatchIssues([a, b]);
  assert.ok(issues.some((message) => message.includes('submitted twice')));
});

test('collectBatchIssues catches collisions with the live corpus', () => {
  const entry = formRowToTerm(validRow);
  const issues = collectBatchIssues([entry], { knownSlugs: new Set(['mixture-of-experts']) });
  assert.ok(issues.some((message) => message.includes('already exists')));
});

test('collectBatchIssues validates related slugs against corpus plus batch', () => {
  const entry = formRowToTerm(validRow);
  // transformers/attention unknown -> flagged
  const flagged = collectBatchIssues([entry], { knownSlugs: new Set() });
  assert.ok(flagged.some((message) => message.includes('unknown slug')));
  // provided by the batch itself -> fine
  const sibling = formRowToTerm({ term: 'Transformers', definition: 'd', details: 'd' });
  const ok = collectBatchIssues([entry, sibling], { knownSlugs: new Set(['attention']) });
  assert.deepEqual(ok, []);
  // corpus unavailable (null) -> checks skipped
  assert.deepEqual(collectBatchIssues([entry], { knownSlugs: null }), []);
});

test('termFilePath maps the letter to its range folder', () => {
  const { term } = formRowToTerm(validRow);
  assert.equal(termFilePath(term), 'dictionary/m-n/mixture-of-experts.json');
});

test('termFileJson emits canonical key order and omits empty fields', () => {
  const { term } = formRowToTerm(validRow);
  const parsed = JSON.parse(termFileJson(term));
  assert.deepEqual(Object.keys(parsed), [
    'term',
    'letter',
    'category',
    'type',
    'aka',
    'definition',
    'details',
    'related',
    'citation',
    'slug',
  ]);
  assert.equal(parsed.citation.year, 2017); // numeric year
  const minimal = formRowToTerm({ term: 'Solo Term', definition: 'd', details: 'd' }).term;
  const minimalParsed = JSON.parse(termFileJson(minimal));
  assert.deepEqual(Object.keys(minimalParsed), [
    'term',
    'letter',
    'category',
    'type',
    'definition',
    'details',
    'slug',
  ]);
  assert.equal(minimalParsed.type, 'concept');
});

test('buildIssueBody lists file paths and JSON blocks', () => {
  const { term } = formRowToTerm(validRow);
  const body = buildIssueBody([term]);
  assert.match(body, /## New term submission/);
  assert.match(body, /dictionary\/m-n\/mixture-of-experts\.json/);
  assert.match(body, /```json/);
  assert.match(body, /"slug": "mixture-of-experts"/);
  assert.match(body, /graph:check/);
});

test('buildIssueUrl builds a prefilled github.com issue URL', () => {
  const a = formRowToTerm(validRow).term;
  const single = new URL(buildIssueUrl([a]));
  assert.equal(single.host, 'github.com');
  assert.equal(single.pathname, '/zac11/llm-dictionary/issues/new');
  assert.equal(single.searchParams.get('title'), 'Add term: Mixture of Experts');
  assert.equal(single.searchParams.get('labels'), 'term-contribution');
  assert.ok(single.searchParams.get('body').includes('Mixture of Experts'));

  const b = formRowToTerm({ term: 'Expert Choice', definition: 'd', details: 'd' }).term;
  const multi = new URL(buildIssueUrl([a, b]));
  assert.equal(multi.searchParams.get('title'), 'Add 2 terms: Mixture of Experts, Expert Choice');
});

test('single-term URLs stay well under the length guard', () => {
  const { term } = formRowToTerm(validRow);
  const url = buildIssueUrl([term]);
  assert.ok(url.length < MAX_ISSUE_URL_LENGTH, `url length ${url.length}`);
});

test('parseProfileLinks reads Label | URL lines and tolerates a bare URL', () => {
  assert.deepEqual(
    parseProfileLinks('LinkedIn | https://www.linkedin.com/in/samaltman\n\nhttps://x.com/sama\nWiki | https://en.wikipedia.org/wiki/a'),
    [
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/samaltman' },
      { label: '', url: 'https://x.com/sama' },
      { label: 'Wiki', url: 'https://en.wikipedia.org/wiki/a' },
    ]
  );
  assert.deepEqual(parseProfileLinks(''), []);
});

test('parseCoverage reads Title | URL | Source | date lines', () => {
  assert.deepEqual(
    parseCoverage('Board fires Altman | https://reuters.com/a | Reuters | 2023-11-17\nNo date | https://example.com/b'),
    [
      { title: 'Board fires Altman', url: 'https://reuters.com/a', source: 'Reuters', date: '2023-11-17' },
      { title: 'No date', url: 'https://example.com/b' },
    ]
  );
  assert.deepEqual(parseCoverage('   '), []);
});

test('formRowToTerm builds a typed person profile', () => {
  const { term, issues } = formRowToTerm({
    term: 'Sam Altman',
    type: 'person',
    category: 'Artificial intelligence',
    definition: 'CEO of OpenAI since 2019.',
    details: 'He co-founded OpenAI in 2015.',
    highlights: 'Co-founded OpenAI (2015)\nCEO of OpenAI (2019–present)',
    links: 'LinkedIn | https://www.linkedin.com/in/samaltman',
  });
  assert.deepEqual(issues, []);
  assert.equal(term.type, 'person');
  assert.deepEqual(term.profile.highlights, ['Co-founded OpenAI (2015)', 'CEO of OpenAI (2019–present)']);
  assert.deepEqual(term.profile.links, [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/samaltman' },
  ]);
  const parsed = JSON.parse(termFileJson(term));
  assert.equal(parsed.type, 'person');
  assert.deepEqual(Object.keys(parsed.profile), ['links', 'highlights']);
});

test('formRowToTerm surfaces a mismatched type as a warning-backed problem', () => {
  const { issues } = formRowToTerm({
    term: 'Mixture of Experts',
    type: 'concept',
    definition: 'd',
    details: 'd',
    highlights: 'Should not be here',
  });
  assert.ok(issues.some((issue) => issue.code === 'unexpected-profile'));
});

test('formRowToTerm builds a typed event with coverage', () => {
  const { term, issues } = formRowToTerm({
    term: 'Removal of Sam Altman from OpenAI',
    type: 'event',
    definition: 'On November 17, 2023, the board ousted Altman.',
    details: 'He was reinstated five days later.',
    coverage: 'Board fires Altman | https://reuters.com/a | Reuters | 2023-11-17',
  });
  assert.deepEqual(issues, []);
  assert.deepEqual(term.coverage, [
    { title: 'Board fires Altman', url: 'https://reuters.com/a', source: 'Reuters', date: '2023-11-17' },
  ]);
  const parsed = JSON.parse(termFileJson(term));
  assert.equal(parsed.coverage.length, 1);
  assert.equal(parsed.coverage[0].date, '2023-11-17');
});
