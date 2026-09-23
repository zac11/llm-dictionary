import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRetrievalContext, parseComparison, rankTerms } from '../src/ask.js';
import { tokenizeText } from '../src/term-schema.js';
import askHandler, { completionOptions, getLlmConfig, rerankEntries } from '../netlify/functions/ask.mjs';

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
      textTokens: ['graphrag', 'knowledge', 'graph', 'extracted', 'documents'],
      related: [],
      coOccurring: [],
    },
    {
      slug: 'document-processing',
      term: 'Document Processing',
      aliases: [],
      category: 'Data',
      definition: 'Transforms extracted documents.',
      details: 'Processes documents into structured records.',
      termTokens: ['document', 'processing'],
      textTokens: ['transforms', 'extracted', 'documents', 'processes', 'structured', 'records'],
      related: [],
      coOccurring: [],
    },
    {
      slug: 'machine-learning',
      term: 'Machine Learning',
      aliases: ['ML'],
      category: 'Foundations',
      definition: 'Learning patterns from data.',
      details: 'Machine learning systems improve from experience.',
      termTokens: ['machine', 'learning', 'ml'],
      textTokens: ['machine', 'learning', 'systems', 'experience'],
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
  assert.equal(alias[0].score, 100);

  const empty = rankTerms('zzzz', corpus);
  assert.deepEqual(empty, []);
});

test('rankTerms resolves acronym aliases and terms embedded in natural questions', () => {
  assert.equal(rankTerms('ML', corpus)[0].entry.slug, 'machine-learning');
  assert.ok(rankTerms('ML', corpus)[0].score >= 90);
  assert.equal(rankTerms('What is machine learning?', corpus)[0].entry.slug, 'machine-learning');
  assert.ok(rankTerms('What is machine learning?', corpus)[0].score >= 90);
});

test('rankTerms uses corpus rarity and coverage to rank focused matches', () => {
  const ranked = rankTerms('knowledge graph extracted documents', corpus);
  assert.equal(ranked[0].entry.slug, 'graphrag');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('buildRetrievalContext keeps primary matches ahead of graph expansion', () => {
  const bySlug = new Map(corpus.terms.map((entry) => [entry.slug, entry]));
  const context = buildRetrievalContext('RAG and GraphRAG', corpus, bySlug);
  assert.deepEqual(new Set(context.slice(0, 2).map((entry) => entry.slug)), new Set([
    'retrieval-augmented-generation',
    'graphrag',
  ]));
  assert.equal(context[2].slug, 'fine-tuning');
});

test('rerankEntries blends TypeSafe semantic scores with lexical order', async () => {
  const entries = corpus.terms.slice(0, 3);
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const request = JSON.parse(init.body);
    assert.equal(request.state.query, 'knowledge graph search');
    assert.equal(Object.keys(request.questions).length, 3);
    return new Response(JSON.stringify({
      answers: {
        candidate_0: { type: 'noul', noul: 0.1 },
        candidate_1: { type: 'noul', noul: 0.2 },
        candidate_2: { type: 'noul', noul: 0.95 },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await rerankEntries('knowledge graph search', entries, {
    apiKey: 'test-key',
    fetchImpl,
  });
  assert.equal(result.mode, 'typesafe');
  assert.equal(result.entries[0].slug, 'graphrag');
});

test('rerankEntries preserves lexical order when TypeSafe is unavailable', async () => {
  const entries = corpus.terms.slice(0, 3);
  const result = await rerankEntries('RAG', entries, { apiKey: '' });
  assert.equal(result.mode, 'lexical');
  assert.deepEqual(result.entries, entries);
});

test('rerankEntries leaves exact lookups to deterministic code', async () => {
  const entries = corpus.terms.slice(0, 3);
  let called = false;
  const result = await rerankEntries('RAG', entries, {
    apiKey: 'test-key',
    fetchImpl: async () => {
      called = true;
      throw new Error('should not be called');
    },
  });
  assert.equal(result.mode, 'lexical');
  assert.equal(called, false);
});

test('getLlmConfig requires all runtime provider settings', () => {
  assert.equal(getLlmConfig({ LLM_API_KEY: 'key' }), null);
  assert.equal(getLlmConfig({ LLM_API_KEY: 'key', LLM_BASE_URL: 'https://provider.example/v1' }), null);
  assert.deepEqual(getLlmConfig({
    LLM_API_KEY: ' key ',
    LLM_BASE_URL: 'https://provider.example/v1/',
    LLM_MODEL: ' model ',
  }), {
    apiKey: 'key',
    baseUrl: 'https://provider.example/v1',
    model: 'model',
  });
});

test('completionOptions use Kimi instant or low-reasoning modes', () => {
  assert.deepEqual(completionOptions('kimi-k2.5'), {
    thinking: { type: 'disabled' },
    temperature: 0.6,
    top_p: 0.95,
  });
  assert.deepEqual(completionOptions('moonshotai/kimi-k2.6'), {
    thinking: { type: 'disabled' },
    temperature: 0.6,
    top_p: 0.95,
  });
  assert.deepEqual(completionOptions('kimi-k3'), { reasoning_effort: 'low' });
  assert.deepEqual(completionOptions('other-model'), {});
});

test('ask handler sends Kimi K2 in instant mode', async () => {
  const previousFetch = globalThis.fetch;
  const previous = {
    key: process.env.LLM_API_KEY,
    base: process.env.LLM_BASE_URL,
    model: process.env.LLM_MODEL,
  };
  let upstreamBody;
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_BASE_URL = 'https://provider.example/v1';
  process.env.LLM_MODEL = 'kimi-k2.5';
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Attention weighs token relevance. [attention]' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await askHandler(new Request('https://example.test/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Attention',
        context: [{
          slug: 'attention',
          term: 'Attention',
          aliases: [],
          category: 'Architecture',
          definition: 'Attention weighs token relevance.',
          details: 'It uses queries, keys, and values.',
        }],
      }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(upstreamBody.thinking, { type: 'disabled' });
    assert.equal(upstreamBody.temperature, 0.6);
    assert.equal(upstreamBody.reasoning_efforts, undefined);
    assert.equal(upstreamBody.max_tokens, 700);
  } finally {
    globalThis.fetch = previousFetch;
    if (previous.key === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previous.key;
    if (previous.base === undefined) delete process.env.LLM_BASE_URL;
    else process.env.LLM_BASE_URL = previous.base;
    if (previous.model === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = previous.model;
  }
});
