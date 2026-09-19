import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidRangeFolder,
  normalizeGraphLabel,
  normalizeTerm,
  rangeFolderForLetter,
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
