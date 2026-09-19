import test from 'node:test';
import assert from 'node:assert/strict';
import { parseComparison, rankTerms } from '../src/ask.js';
import { tokenizeText } from '../src/term-schema.js';

const corpus = {
  schemaVersion: 1,
  terms: [
    {
      slug: 'retrieval-augmented-generation',
      term: 'Retrieval-Augmented Generation',
      aliases: ['RAG'],
      category: 'Architecture',
      definition: 'A generation pattern that retrieves context first.',
      details: 'Retrieval-augmented generation combines a retriever with a generator.',
      termTokens: ['retrieval', 'augmented', 'generation', 'rag'],
      textTokens: ['retrieval', 'augmented', 'generation', 'retriever', 'generator'],
      related: ['fine-tuning'],
      coOccurring: [],
    },
    {
      slug: 'fine-tuning',
      term: 'Fine-tuning',
      aliases: [],
      category: 'Training',
      definition: 'Adapting a pre-trained model on task data.',
      details: 'Fine-tuning updates model weights on a smaller task-specific dataset.',
      termTokens: ['fine', 'tuning'],
      textTokens: ['fine', 'tuning', 'model', 'weights'],
      related: ['retrieval-augmented-generation'],
      coOccurring: [],
    },
    {
      slug: 'graphrag',
      term: 'GraphRAG',
      aliases: [],
      category: 'Architecture',
      definition: 'RAG over a knowledge graph.',
      details: 'GraphRAG builds and queries a knowledge graph extracted from documents.',
      termTokens: ['graphrag'],
      textTokens: ['graphrag', 'knowledge', 'graph'],
      related: [],
      coOccurring: [],
    },
  ],
};

test('tokenizeText lowercases, filters stopwords and punctuation', () => {
  assert.deepEqual(tokenizeText('Low-Rank Adaptation of the Models'), [
    'low',
    'rank',
    'adaptation',
    'models',
  ]);
});

test('parseComparison detects vs / difference / compare phrasings', () => {
  assert.deepEqual(parseComparison('RAG vs fine-tuning'), ['RAG', 'fine-tuning']);
  assert.deepEqual(parseComparison('difference between RAG and fine-tuning'), ['RAG', 'fine-tuning']);
  assert.deepEqual(parseComparison('compare RAG and fine-tuning'), ['RAG', 'fine-tuning']);
  assert.equal(parseComparison('what is RAG'), null);
});

test('rankTerms scores exact terms and aliases highest, deterministically', () => {
  const exact = rankTerms('retrieval-augmented-generation', corpus);
  assert.equal(exact[0].entry.slug, 'retrieval-augmented-generation');
  assert.equal(exact[0].score, 100);

  const alias = rankTerms('RAG', corpus);
  assert.equal(alias[0].entry.slug, 'retrieval-augmented-generation');
  assert.equal(alias[0].score, 85);

  const empty = rankTerms('zzzz', corpus);
  assert.deepEqual(empty, []);
});
