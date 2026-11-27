import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateWeeklyTerms } from '../scripts/generate-weekly-terms.mjs';
import { buildWeeklyMessages, newNames, parseNames, proposeWeeklyTerms } from '../scripts/weekly-terms-core.mjs';

const existing = { term: 'Prompt Caching', slug: 'prompt-caching', aka: ['Context Cache'] };
const entry = {
  term: 'Paged Attention',
  letter: 'p',
  category: 'Transformers and Attention',
  type: 'concept',
  definition: 'Paged Attention stores the key-value cache in fixed-size blocks.',
  details: 'Sequences can refer to noncontiguous cache blocks, which reduces memory fragmentation.',
  citation: { title: 'Efficient Memory Management for Large Language Model Serving with PagedAttention', url: 'https://arxiv.org/abs/2309.06180' },
};
const namesReply = JSON.stringify({ names: ['Paged Attention', 'Prompt Caching', 'context cache', 'Prefix Sharing', 'paged  attention'] });
const termsReply = JSON.stringify({ terms: [entry, existing, { ...entry, term: 'Prefix Sharing', definition: '' }, entry] });

const mockProvider = (t) =>
  t.mock.method(globalThis, 'fetch', async (url, { body }) => {
    const { messages } = JSON.parse(body);
    const reply = messages[0].content.includes('{"names"') ? namesReply : termsReply;
    return Response.json({ choices: [{ message: { content: reply } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  });

test('weekly generation writes only new valid terms and keeps the provider reply for evaluation', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'weekly-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, 'dictionary', 'o-p');
  mkdirSync(folder, { recursive: true });
  const existingFile = join(folder, 'prompt-caching.json');
  writeFileSync(existingFile, JSON.stringify(existing));

  const fetch = mockProvider(t);
  const explained = [];
  const explainers = (_root, provider, slugs) => {
    explained.push({ provider: provider.name, slugs });
    return 'written: 1, failed: 0';
  };
  const env = {
    DEEPSEEK_API_KEY: 'test-key',
    WEEKLY_REPLY_PATH: '.weekly/reply.txt',
    WEEKLY_PR_BODY_PATH: '.weekly/pr-body.md',
  };

  const summary = await generateWeeklyTerms({ root, env, explainers });
  assert.match(summary, /added 1 entries and rejected 3 candidates/);
  assert.match(summary, /Tokens: 400 in \+ 200 out over 4 calls/);
  assert.match(summary, /Explainers: written: 1, failed: 0/);
  assert.deepEqual(explained, [{ provider: 'deepseek', slugs: ['paged-attention'] }]);

  const prompts = fetch.mock.calls.map((call) => JSON.parse(call.arguments[1].body).messages[1].content);
  for (const prompt of prompts) assert.doesNotMatch(prompt, /prompt-caching/);
  assert.equal(prompts.at(-1), 'Write dictionary entries for these 2 AI terms:\nPaged Attention\nPrefix Sharing');

  const generated = readFileSync(join(folder, 'paged-attention.json'), 'utf8');
  const { addedAt, ...stored } = JSON.parse(generated);
  assert.match(addedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(stored, { ...entry, letter: 'P', slug: 'paged-attention' });
  assert.equal(readFileSync(join(root, env.WEEKLY_REPLY_PATH), 'utf8'), termsReply);
  assert.match(readFileSync(join(root, env.WEEKLY_PR_BODY_PATH), 'utf8'), /dictionary\/o-p\/paged-attention\.json/);

  assert.match(await generateWeeklyTerms({ root, env, explainers }), /added 0 entries/);
  assert.equal(explained.length, 1);
  assert.deepEqual(readdirSync(folder).sort(), ['paged-attention.json', 'prompt-caching.json']);
  assert.equal(readFileSync(join(folder, 'paged-attention.json'), 'utf8'), generated);
  assert.equal(readFileSync(existingFile, 'utf8'), JSON.stringify(existing));
});

test('weekly generation still writes terms when the explainer run fails', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'weekly-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'dictionary', 'o-p'), { recursive: true });
  mockProvider(t);
  const explainers = () => {
    throw new Error('LLM 401: bad key\nstack');
  };
  const summary = await generateWeeklyTerms({ root, env: { DEEPSEEK_API_KEY: 'k' }, explainers });
  assert.match(summary, /added 1 entries/);
  assert.match(summary, /Explainers: not written \(LLM 401: bad key\)/);
});

test('weekly generation writes explainers for concept-style terms only', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'weekly-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'dictionary'));
  const person = { ...entry, term: 'Paula Example', type: 'person', definition: 'Paula Example is a researcher.', details: 'She studies memory-efficient serving.', profile: { knownFor: 'Memory-efficient serving' }, citation: { title: 'Paula Example', url: 'https://example.org/paula' } };
  t.mock.method(globalThis, 'fetch', async (url, { body }) => {
    const names = JSON.parse(body).messages[0].content.includes('{"names"');
    const content = JSON.stringify(names ? { names: ['Paged Attention', 'Paula Example'] } : { terms: [entry, person] });
    return Response.json({ choices: [{ message: { content } }] });
  });
  const explained = [];
  const summary = await generateWeeklyTerms({ root, env: { DEEPSEEK_API_KEY: 'k' }, explainers: (_root, _provider, slugs) => explained.push(...slugs) && 'written: 1, failed: 0' });
  assert.match(summary, /added 2 entries/);
  assert.deepEqual(explained, ['paged-attention']);
});

test('weekly generation rejects entries for names it did not request', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'weekly-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'dictionary'));
  const extra = { ...entry, term: 'Ring Attention', letter: 'r', citation: { title: 'Ring Attention', url: 'https://arxiv.org/abs/2310.01889' } };
  t.mock.method(globalThis, 'fetch', async (url, { body }) => {
    const names = JSON.parse(body).messages[0].content.includes('{"names"');
    const content = JSON.stringify(names ? { names: ['Paged Attention'] } : { terms: [entry, extra] });
    return Response.json({ choices: [{ message: { content } }] });
  });
  const summary = await generateWeeklyTerms({ root, env: { DEEPSEEK_API_KEY: 'k' }, explainers: () => '' });
  assert.match(summary, /added 1 entries and rejected 1 candidates/);
  assert.ok(existsSync(join(root, 'dictionary', 'o-p', 'paged-attention.json')));
  assert.ok(!existsSync(join(root, 'dictionary', 'q-r', 'ring-attention.json')));
});

test('weekly generation fails when no name reply parses', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'weekly-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'dictionary'));
  t.mock.method(globalThis, 'fetch', async () => Response.json({ choices: [{ message: { content: 'sorry, no JSON' } }] }));
  await assert.rejects(generateWeeklyTerms({ root, env: { DEEPSEEK_API_KEY: 'k' } }), /no parseable names/);
});

test('weekly generation fails clearly when the provider key is missing', async () => {
  await assert.rejects(generateWeeklyTerms({ env: {} }), /DEEPSEEK_API_KEY or GEMINI_API_KEY/);
});

test('name pass: parses names and drops existing terms, aliases, slugs and repeats', () => {
  assert.deepEqual(parseNames(namesReply).length, 5);
  assert.deepEqual(parseNames('["A", {"term":"B"}, null]'), ['A', 'B']);
  assert.deepEqual(newNames(parseNames(namesReply), [existing]), ['Paged Attention', 'Prefix Sharing']);
  assert.deepEqual(newNames(['Prompt-Caching', 'prompt caching'], [existing]), []);
});

test('two-pass proposal stops asking for names once enough are new and skips earlier names on retries', async () => {
  const calls = [];
  const replies = [['Prompt Caching', 'Alpha'], ['Alpha', 'Beta', 'Gamma'], ['never asked']];
  const request = async (_provider, messages) => {
    calls.push(messages);
    const reply = messages[0].content.includes('{"names"') ? JSON.stringify({ names: replies.shift() }) : '{"terms":[]}';
    return { reply, usage: { prompt: 10, completion: 5 } };
  };
  const result = await proposeWeeklyTerms({}, [existing], { count: 3, oversample: 2, request });
  assert.deepEqual(result.names, ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(result.usage, { prompt: 30, completion: 15, calls: 3 });
  assert.match(calls[0][1].content, /^List 6 distinct/);
  assert.match(calls[1][1].content, /do not repeat:\nPrompt Caching\nAlpha$/);
  assert.match(calls[2][1].content, /these 3 AI terms:\nAlpha\nBeta\nGamma$/);
});

test('two-pass proposal skips the entry call when no new names turn up', async () => {
  let calls = 0;
  const request = async () => {
    calls++;
    return { reply: '{"names":["Prompt Caching"]}', usage: {} };
  };
  const result = await proposeWeeklyTerms({}, [existing], { request });
  assert.equal(calls, 3);
  assert.deepEqual(result, { names: [], proposed: 1, reply: '', usage: { prompt: 0, completion: 0, calls: 3 } });
});

test('the entry prompt asks for method types, a person known-for and exact authors', () => {
  const [system] = buildWeeklyMessages(['DoRA']);
  assert.match(system.content, /use "paper" only when the entry is about the paper itself/);
  assert.match(system.content, /"profile":\{"knownFor"/);
  assert.match(system.content, /leave "authors" empty rather than guess/);
});
