import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateWeeklyTerms } from '../scripts/generate-weekly-terms.mjs';

test('weekly generation writes only new valid terms and keeps the provider reply for evaluation', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'weekly-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, 'dictionary', 'o-p');
  mkdirSync(folder, { recursive: true });
  const existing = { term: 'Prompt Caching', slug: 'prompt-caching', aka: ['Context Cache'] };
  const existingFile = join(folder, 'prompt-caching.json');
  writeFileSync(existingFile, JSON.stringify(existing));

  const entry = {
    term: 'Paged Attention',
    letter: 'p',
    category: 'Transformers and Attention',
    type: 'concept',
    definition: 'Paged Attention stores the key-value cache in fixed-size blocks.',
    details: 'Sequences can refer to noncontiguous cache blocks, which reduces memory fragmentation.',
    citation: { title: 'Efficient Memory Management for Large Language Model Serving with PagedAttention', url: 'https://arxiv.org/abs/2309.06180' },
  };
  const reply = JSON.stringify({ terms: [entry, existing, { ...entry, term: 'Prefix Sharing', definition: '' }, entry] });
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ choices: [{ message: { content: reply } }] }));
  const env = {
    DEEPSEEK_API_KEY: 'test-key',
    WEEKLY_REPLY_PATH: '.weekly/reply.txt',
    WEEKLY_PR_BODY_PATH: '.weekly/pr-body.md',
  };

  assert.match(await generateWeeklyTerms({ root, env }), /added 1 entries and rejected 3 candidates/);
  const prompt = JSON.parse(fetch.mock.calls[0].arguments[1].body).messages[1].content;
  assert.match(prompt, /Prompt Caching\nprompt-caching\nContext Cache/);
  const generated = readFileSync(join(folder, 'paged-attention.json'), 'utf8');
  const { addedAt, ...stored } = JSON.parse(generated);
  assert.match(addedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(stored, { ...entry, letter: 'P', slug: 'paged-attention' });
  assert.equal(readFileSync(join(root, env.WEEKLY_REPLY_PATH), 'utf8'), reply);
  assert.match(readFileSync(join(root, env.WEEKLY_PR_BODY_PATH), 'utf8'), /dictionary\/o-p\/paged-attention\.json/);

  assert.match(await generateWeeklyTerms({ root, env }), /added 0 entries/);
  assert.deepEqual(readdirSync(folder).sort(), ['paged-attention.json', 'prompt-caching.json']);
  assert.equal(readFileSync(join(folder, 'paged-attention.json'), 'utf8'), generated);
  assert.equal(readFileSync(existingFile, 'utf8'), JSON.stringify(existing));
});

test('weekly generation fails clearly when the provider key is missing', async () => {
  await assert.rejects(generateWeeklyTerms({ env: {} }), /DEEPSEEK_API_KEY or GEMINI_API_KEY/);
});
