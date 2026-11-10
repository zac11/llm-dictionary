import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompactMessages, parseCompactReply } from '../scripts/explainer-prompt.mjs';

const entry = (slug) => ({ slug, term: slug, type: 'concept', definition: `${slug} def`, details: 'x'.repeat(2000) });

test('compact prompt batches entries and clips long context', () => {
  const batch = [{ entry: entry('a'), wiki: { extract: 'w'.repeat(5000) } }, { entry: entry('b'), wiki: null }];
  const [, user] = buildCompactMessages(batch);
  assert.match(user.content, /### a/);
  assert.match(user.content, /### b/);
  assert.ok(user.content.length < 3000, `prompt too long: ${user.content.length}`);
});

test('compact reply maps items to entries and flags incomplete ones', () => {
  const batch = [{ entry: entry('a'), wiki: { url: 'https://en.wikipedia.org/wiki/A', title: 'A' } }, { entry: entry('b'), wiki: null }, { entry: entry('c'), wiki: null }];
  const reply = JSON.stringify({
    items: [
      { slug: 'a', lead: 'Lead.', eli5: 'E.', practitioner: 'P.', paperLevel: 'L.', example: 'Ex.', usedIn: [{ name: 'Search', detail: 'ranking' }] },
      { slug: 'b', lead: 'Lead.', eli5: 'E.' },
    ],
  });
  const out = parseCompactReply(reply, batch);
  const a = out.get('a').explainer;
  assert.deepEqual(a.tiers, { eli5: 'E.', practitioner: 'P.', paperLevel: 'L.' });
  assert.equal(a.example, 'Ex.');
  assert.equal(a.usedIn[0].name, 'Search');
  assert.equal(a.sources[0].url, 'https://en.wikipedia.org/wiki/A');
  assert.equal(out.get('b').explainer, null);
  assert.deepEqual(out.get('c').issues, ['missing from reply']);
});

test('compact reply rejects missing Used in and sentences about the sources', () => {
  const batch = [{ entry: entry('a'), wiki: null }, { entry: entry('b'), wiki: null }];
  const item = { lead: 'Lead.', eli5: 'E.', practitioner: 'P.', example: 'Ex.' };
  const reply = JSON.stringify({
    items: [
      { ...item, slug: 'a', paperLevel: 'L.', usedIn: [] },
      { ...item, slug: 'b', paperLevel: 'Architectural details are not specified here.', usedIn: [{ name: 'X', detail: 'y' }] },
    ],
  });
  const out = parseCompactReply(reply, batch);
  assert.deepEqual(out.get('a').issues, ['missing Used in']);
  assert.deepEqual(out.get('b').issues, ['talks about the sources']);
});
