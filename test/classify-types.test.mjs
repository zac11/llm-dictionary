import test from 'node:test';
import assert from 'node:assert/strict';
import { applyType, classifyRecord } from '../scripts/classify-types.mjs';

const record = (overrides = {}) => ({
  term: 'Placeholder',
  letter: 'P',
  category: 'Artificial intelligence',
  definition: 'A definition.',
  details: 'Some details.',
  slug: 'placeholder',
  ...overrides,
});

test('classifyRecord reads a Wikipedia-style birth line as a person', () => {
  const classified = classifyRecord(
    record({
      term: 'Sam Altman',
      definition:
        'Samuel Harris Altman (born April 22, 1985) is an American entrepreneur and investor who has been the chief executive officer (CEO) of OpenAI since 2019.',
    })
  );
  assert.deepEqual(classified, { type: 'person', reason: 'born' });
});

test('classifyRecord reads an occupation opening as a person', () => {
  assert.equal(
    classifyRecord(record({ term: 'Samy Bengio', definition: 'Samy Bengio is a Canadian computer scientist working at Apple.' })).type,
    'person'
  );
  // a disambiguating parenthetical must not hide the name shape
  assert.equal(
    classifyRecord(
      record({
        term: 'Stephen Robertson (computer scientist)',
        definition: 'Stephen Robertson is a British computer scientist.',
      })
    ).type,
    'person'
  );
});

test('classifyRecord does not mistake a work or an occasion for a person', () => {
  assert.equal(
    classifyRecord(
      record({
        term: 'Never Gonna Stop (Rick Astley song)',
        definition: '"Never Gonna Stop" is a song written and performed by English singer-songwriter Rick Astley.',
        details: 'It was released as the second single from his ninth studio album.',
      })
    ).type,
    'concept'
  );
  assert.equal(
    classifyRecord(
      record({
        term: 'RuleML Symposium',
        definition:
          'The annual International Web Rule Symposium (RuleML) is an international academic conference on rule technologies.',
      })
    ).type,
    'event'
  );
});

test('classifyRecord recognises organizations, venues, policies, awards and events', () => {
  assert.equal(
    classifyRecord(
      record({
        term: 'AI Now Institute',
        definition:
          'The AI Now Institute (AI Now) is an American research institute studying the social implications of artificial intelligence.',
      })
    ).type,
    'organization'
  );
  assert.equal(
    classifyRecord(
      record({
        term: 'Journal of Machine Learning Research',
        definition: 'The Journal of Machine Learning Research is a peer-reviewed open access scientific journal covering machine learning.',
      })
    ).type,
    'venue'
  );
  assert.equal(
    classifyRecord(
      record({
        term: 'Artificial Intelligence Act',
        definition: 'The Artificial Intelligence Act (AI Act) is a European Union regulation concerning artificial intelligence (AI).',
      })
    ).type,
    'policy'
  );
  assert.equal(
    classifyRecord(
      record({
        term: 'Loebner Prize',
        definition:
          'The Loebner Prize was an annual competition in artificial intelligence that awarded prizes to the most human-like programs.',
      })
    ).type,
    'award'
  );
  assert.equal(
    classifyRecord(
      record({
        term: 'AI Safety Summit 2023',
        definition:
          'The AI Safety Summit 2023 was an international conference on the safety and regulation of artificial intelligence.',
      })
    ).type,
    'event'
  );
});

test('classifyRecord defaults technical entries and date-led history to the safe choice', () => {
  assert.equal(
    classifyRecord(
      record({
        term: 'Mixture of Experts',
        definition: 'An architecture with many specialized sub-networks plus a router that activates only a few per input.',
      })
    ).type,
    'concept'
  );
  assert.equal(
    classifyRecord(
      record({
        term: 'Non-negative matrix factorization',
        definition: 'Non-negative matrix factorization is a group of algorithms in multivariate analysis and linear algebra.',
      })
    ).type,
    'concept'
  );
  assert.equal(
    classifyRecord(
      record({
        term: 'Removal of Sam Altman from OpenAI',
        definition: "On November 17, 2023, OpenAI's board of directors ousted co-founder and chief executive Sam Altman.",
      })
    ).type,
    'event'
  );
});

test('applyType puts the type after category and drops stories that no longer apply', () => {
  const person = applyType(
    {
      term: 'Sam Altman',
      letter: 'S',
      category: 'Artificial intelligence',
      definition: 'd',
      details: 'd',
      story: 'A small key that opens a bigger door … and that idea is Sam Altman.',
      related: ['openai'],
      slug: 'sam-altman',
    },
    'person'
  );
  assert.deepEqual(Object.keys(person), [
    'term',
    'letter',
    'category',
    'type',
    'definition',
    'details',
    'related',
    'slug',
  ]);
  assert.equal(person.type, 'person');

  const concept = applyType({ term: 'MoE', letter: 'M', category: 'Architecture', story: 'Once upon a time.' }, 'concept');
  assert.deepEqual(Object.keys(concept), ['term', 'letter', 'category', 'type', 'story']);
  assert.equal(applyType({ term: 'No category', letter: 'N' }, 'concept').type, 'concept');
});

test('applyType is idempotent for an already-typed record', () => {
  const original = {
    term: 'Sam Altman',
    letter: 'S',
    category: 'Artificial intelligence',
    type: 'person',
    definition: 'd',
    details: 'd',
    slug: 'sam-altman',
  };
  assert.deepEqual(applyType(original, 'person'), original);
});
