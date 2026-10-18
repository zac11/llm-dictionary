import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TERM_TYPE,
  TERM_TYPES,
  entryPresentation,
  isIsoDate,
  isStoryType,
  isValidRangeFolder,
  normalizeGraphLabel,
  normalizeTerm,
  normalizeTermType,
  rangeFolderForLetter,
  rankSearchEntries,
  slugifyTerm,
  validateTerm,
} from '../src/term-schema.js';

test('slugifyTerm handles ampersands, accents, punctuation, and surrounding separators', () => {
  assert.equal(slugifyTerm('  Café & C++  '), 'cafe-and-c');
});

test('normalizeGraphLabel normalizes case, apostrophes, and whitespace', () => {
  assert.equal(normalizeGraphLabel('  Zipf’s   Law '), 'zipfs law');
});

test('range helpers only accept canonical two-letter volumes', () => {
  assert.equal(rangeFolderForLetter('A'), 'a-b');
  assert.equal(rangeFolderForLetter('z'), 'y-z');
  assert.equal(rangeFolderForLetter('?'), null);
  assert.equal(isValidRangeFolder('a-b'), true);
  assert.equal(isValidRangeFolder('b-c'), false);
});

test('normalizeTerm preserves an explicit slug and normalizes optional fields', () => {
  const term = normalizeTerm(
    {
      term: ' Café Search ',
      letter: 'c',
      slug: 'existing-slug',
      aka: ' Alias ',
      related: [' other-term '],
      citation: { title: ' Paper ', authors: [' Author '] },
    },
    'c-d/example.json'
  );
  assert.deepEqual(term, {
    slug: 'existing-slug',
    term: 'Café Search',
    letter: 'C',
    category: 'General',
    type: 'concept',
    aka: ['Alias'],
    definition: '',
    details: '',
    story: '',
    deceased: false,
    profile: { links: [], highlights: [] },
    coverage: [],
    related: ['other-term'],
    citation: { title: 'Paper', authors: ['Author'], year: '', venue: '', url: '' },
    addedAt: '',
    _src: 'c-d/example.json',
  });
});

test('validateTerm reports folder, required-field, duplicate, and citation errors', () => {
  const raw = {
    term: 'Attention',
    letter: 'A',
    slug: 'Bad Slug',
    aka: ['Focus', 'focus'],
    related: 'transformer',
    citation: { authors: 'Someone' },
  };
  const term = normalizeTerm(raw);
  const codes = validateTerm(term, { raw, folder: 'c-d', filename: 'attention.json' }).map((issue) => issue.code);
  assert.deepEqual(
    new Set(codes),
    new Set([
      'invalid-slug',
      'missing-definition',
      'missing-details',
      'folder-letter-mismatch',
      'filename-slug-mismatch',
      'duplicate-aka',
      'invalid-related-shape',
      'invalid-authors-shape',
      'missing-citation-title',
      'missing-type',
    ])
  );
});

test('validateTerm rejects malformed list values and related slugs', () => {
  const raw = {
    term: 'Attention',
    letter: 'A',
    slug: 'attention',
    definition: 'Definition',
    details: 'Details',
    aka: ['Valid', 4],
    related: ['Bad Slug'],
    citation: { title: 'Source', authors: ['Author', null] },
  };
  const codes = validateTerm(normalizeTerm(raw), { raw }).map((issue) => issue.code);
  assert.deepEqual(
    new Set(codes),
    new Set(['invalid-aka-value', 'invalid-related-slug', 'invalid-author-value', 'missing-type'])
  );
});

test('isIsoDate accepts only real calendar dates in YYYY-MM-DD', () => {
  assert.equal(isIsoDate('2026-09-19'), true);
  assert.equal(isIsoDate('2026-02-29'), false); // 2026 is not a leap year
  assert.equal(isIsoDate('2024-02-29'), true); // 2024 is a leap year
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('2026-00-10'), false);
  assert.equal(isIsoDate('2026-1-01'), false);
  assert.equal(isIsoDate(''), false);
  assert.equal(isIsoDate(20260919), false);
  assert.equal(isIsoDate(undefined), false);
});

test('normalizeTerm preserves valid addedAt and blanks invalid or absent dates', () => {
  assert.equal(normalizeTerm({ term: 'A', addedAt: '2026-09-19' }).addedAt, '2026-09-19');
  assert.equal(normalizeTerm({ term: 'A', addedAt: 'not-a-date' }).addedAt, '');
  assert.equal(normalizeTerm({ term: 'A' }).addedAt, '');
});

test('validateTerm flags invalid addedAt values', () => {
  const codes = validateTerm(normalizeTerm({ term: 'Attention', letter: 'A', addedAt: '2026-13-40' }), {
    raw: { term: 'Attention', letter: 'A', slug: 'attention', addedAt: '2026-13-40' },
  })
    .map((issue) => issue.code);
  assert.ok(codes.includes('invalid-added-at'));
});

test('normalizeTermType canonicalizes known types and aliases, and rejects typos', () => {
  assert.equal(normalizeTermType('Person'), 'person');
  assert.equal(normalizeTermType(' organisation '), 'organization');
  assert.equal(normalizeTermType('Organization'), 'organization');
  assert.equal(normalizeTermType('people'), 'person');
  assert.equal(normalizeTermType('concept'), 'concept');
  assert.equal(normalizeTermType('personn'), null);
  assert.equal(normalizeTermType(''), null);
  assert.equal(normalizeTermType(undefined), null);
});

test('every type maps to one of the three second spreads', () => {
  for (const type of TERM_TYPES) {
    assert.ok(['story', 'profile', 'coverage'].includes(entryPresentation(type)), type);
  }
  assert.equal(entryPresentation('person'), 'profile');
  assert.equal(entryPresentation('organization'), 'profile');
  assert.equal(entryPresentation('event'), 'coverage');
  assert.equal(entryPresentation('concept'), 'story');
  assert.equal(entryPresentation(undefined), 'story');
  assert.equal(isStoryType('concept'), true);
  assert.equal(isStoryType('person'), false);
  assert.equal(entryPresentation('nonsense'), 'story');
});

test('normalizeTerm defaults the type and normalizes profile and coverage data', () => {
  assert.equal(normalizeTerm({ term: 'Mixture of Experts' }).type, 'concept');

  const person = normalizeTerm({
    term: 'Sam Altman',
    type: 'Person',
    profile: {
      links: [{ label: ' LinkedIn ', url: ' https://www.linkedin.com/in/samaltman ' }, { url: '' }, 'nope'],
      highlights: [' Co-founded OpenAI (2015) ', ''],
    },
    coverage: [{ title: 'Board fires Altman', source: 'Reuters', date: '2023-11-17', url: 'https://example.com/a' }, {}],
  });

  assert.equal(person.type, 'person');
  assert.deepEqual(person.profile, {
    links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/samaltman' }],
    highlights: ['Co-founded OpenAI (2015)'],
  });
  assert.deepEqual(person.coverage, [
    { title: 'Board fires Altman', source: 'Reuters', date: '2023-11-17', url: 'https://example.com/a' },
  ]);
  assert.equal(person.deceased, false);
  assert.equal(normalizeTerm({ term: 'Alan Turing', deceased: true }).deceased, true);
});

test('validateTerm only accepts a boolean deceased flag on people', () => {
  const malformed = { term: 'Alan Turing', type: 'person', definition: 'd', details: 'd', deceased: 'yes' };
  const codes = validateTerm(normalizeTerm(malformed), { raw: malformed }).map((issue) => issue.code);
  assert.ok(codes.includes('invalid-deceased-shape'));

  const onConcept = { term: 'Mixture of Experts', type: 'concept', definition: 'd', details: 'd', deceased: true };
  const conceptCodes = validateTerm(normalizeTerm(onConcept), { raw: onConcept }).map((issue) => issue.code);
  assert.ok(conceptCodes.includes('unexpected-deceased'));
});

test('validateTerm reports unknown types and malformed profile/coverage data', () => {
  const raw = {
    term: 'Sam Altman',
    type: 'personn',
    definition: 'A person.',
    details: 'More about the person.',
    profile: { links: [{ label: 'LinkedIn', url: 'linkedin.com/in/samaltman' }], highlights: ['ok', 4] },
    coverage: [{ title: 'No url' }, { title: 'Bad date', url: 'https://example.com', date: '2023-13-40' }],
  };
  const codes = validateTerm(normalizeTerm(raw), { raw }).map((issue) => issue.code);
  assert.deepEqual(
    new Set(codes),
    new Set([
      'invalid-type',
      'invalid-link-url',
      'invalid-highlight-value',
      'missing-coverage-url',
      'invalid-coverage-date',
      // an unreadable type falls back to `concept`, so the person/event data is unused
      'unexpected-profile',
      'unexpected-coverage',
    ])
  );
});

test('validateTerm warns when a type and its second-spread data disagree', () => {
  const storyOnPerson = {
    term: 'Sam Altman',
    type: 'person',
    story: 'A small key that opens a bigger door.',
  };
  const personCodes = validateTerm(normalizeTerm(storyOnPerson), { raw: storyOnPerson }).map((issue) => issue.code);
  assert.ok(personCodes.includes('unexpected-story'));

  const coverageOnConcept = {
    term: 'Mixture of Experts',
    type: 'concept',
    coverage: [{ title: 'A paper', url: 'https://example.com' }],
  };
  const conceptCodes = validateTerm(normalizeTerm(coverageOnConcept), { raw: coverageOnConcept })
    .map((issue) => issue.code);
  assert.ok(conceptCodes.includes('unexpected-coverage'));
});

test('validateTerm accepts a well-formed person profile', () => {
  const raw = {
    term: 'Sam Altman',
    type: 'person',
    definition: 'CEO of OpenAI.',
    details: 'He co-founded OpenAI.',
    profile: {
      links: [
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/samaltman' },
        { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Sam_Altman' },
      ],
      highlights: ['Chief executive officer of OpenAI since 2019'],
    },
  };
  const codes = validateTerm(normalizeTerm(raw), { raw }).map((issue) => issue.code);
  assert.deepEqual(codes, []);
});

test('rankSearchEntries prioritizes exact, prefix, and whole-word term matches', () => {
  const entries = [
    { term: 'Action model learning', category: 'Artificial Intelligence', aka: [], story: 'The system runs a loop.' },
    { term: 'Agentic Loop', category: 'AI Engineering', aka: ['ReAct Loop'] },
    { term: 'Loop Engineering', category: 'AI Engineering', aka: [] },
    { term: 'Machine Learning', category: 'Foundations', aka: ['ML'] },
    { term: 'A. R. D. Prasad', category: 'Machine learning', aka: [] },
  ];

  assert.deepEqual(rankSearchEntries('Loop', entries).map(({ entry }) => entry.term), [
    'Loop Engineering',
    'Agentic Loop',
  ]);
  assert.equal(rankSearchEntries('Machine', entries)[0].entry.term, 'Machine Learning');
  assert.equal(rankSearchEntries('ML', entries)[0].entry.term, 'Machine Learning');
});
