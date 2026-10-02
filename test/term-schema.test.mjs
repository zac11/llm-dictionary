import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isIsoDate,
  isValidRangeFolder,
  normalizeGraphLabel,
  normalizeTerm,
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
    aka: ['Alias'],
    definition: '',
    details: '',
    story: '',
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
    new Set(['invalid-aka-value', 'invalid-related-slug', 'invalid-author-value'])
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
