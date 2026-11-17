// Offline evals for the weekly term-generation agent: fixture LLM replies, no
// API calls. Units come through weekly-agent-boundary.mjs, so these test
// generate-weekly-terms.mjs when it exports them and the core module otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWeeklyAgent } from '../scripts/weekly-agent-boundary.mjs';
import { FIXTURES, runOfflineEvals, runReplyEval, toMarkdown } from '../scripts/eval-weekly-agent.mjs';
import { DUPLICATE_REASONS, REJECTION_REASONS, computeMetrics, loadDictionaryTerms } from '../scripts/weekly-terms-core.mjs';
import { slugifyTerm } from '../src/term-schema.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');
const json = (name) => JSON.parse(fixture(name));
const agent = await loadWeeklyAgent();
const existing = json('existing-terms.json');
const reasonsOf = (result) => Object.fromEntries(result.rejected.map((item) => [item.slug || '#malformed', item.reason]));
const countBy = (items, reason) => items.filter((item) => item.reason === reason).length;

// ------------------------------------------------------------- parsing --

test('parseCandidates reads a fenced array, a { terms } wrapper and JSON Lines', () => {
  const entry = { term: 'Prefix Caching', letter: 'P' };
  assert.deepEqual(agent.parseCandidates('```json\n[' + JSON.stringify(entry) + ']\n```').candidates, [entry]);
  assert.deepEqual(agent.parseCandidates(JSON.stringify({ terms: [entry, entry] })).candidates, [entry, entry]);
  assert.deepEqual(agent.parseCandidates(`${JSON.stringify(entry)}\n${JSON.stringify(entry)}`).candidates, [entry, entry]);
});

test('parseCandidates salvages valid objects around a broken one', () => {
  const reply = '[{"term":"A","letter":"A"}, {term: "B"}, {"term":"C {with} braces","letter":"C"}]';
  const { candidates, malformed } = agent.parseCandidates(reply);
  assert.deepEqual(candidates.map((item) => item.term), ['A', 'C {with} braces']);
  assert.equal(malformed.length, 1);
});

test('parseCandidates keeps non-object items when salvaging a broken array', () => {
  const valid = JSON.stringify({ term: 'Prefix Caching', letter: 'P' });
  const parsed = agent.parseCandidates(`[${valid}, null,]`);
  assert.equal(parsed.candidates.length, 2);
  const { accepted, rejected } = agent.filterCandidates(parsed, existing);
  assert.equal(accepted.length + rejected.length, 2);
  assert.ok(rejected.some((item) => item.reason === 'malformed-json'));
});

test('parseCandidates recovers entries after a missing comma or an unclosed nested array', () => {
  const missingComma = agent.parseCandidates('[{"term":"A","letter":"A"} {"term":"B","letter":"B"}, null,]');
  assert.deepEqual(missingComma.candidates, [{ term: 'A', letter: 'A' }, { term: 'B', letter: 'B' }, null]);
  const leadingNull = agent.parseCandidates('[null {"term":"A","letter":"A"} 7,]');
  assert.deepEqual(leadingNull.candidates, [null, { term: 'A', letter: 'A' }, 7]);
  const unclosed = agent.parseCandidates('[{"term":"A","aka":["x"}, {"term":"B","letter":"B"}, {"term":"C","letter":"C"}]');
  assert.deepEqual(unclosed.candidates.map((item) => item.term), ['B', 'C']);
  assert.equal(unclosed.malformed.length, 1);
  const wrapped = agent.parseCandidates('{"terms":[{"term":"A","aka":["x"}, {"term":"B","letter":"B"}]}');
  assert.deepEqual(wrapped.candidates.map((item) => item.term), ['B']);
  assert.equal(wrapped.malformed.length, 1);
});

test('parseCandidates and filterCandidates reject prose and non-object items as malformed-json', () => {
  const prose = agent.parseCandidates('Sorry, I cannot help with that.');
  assert.equal(prose.candidates.length, 0);
  assert.equal(agent.filterCandidates(prose, existing).rejected[0].reason, 'malformed-json');
  const mixed = agent.filterCandidates(agent.parseCandidates('["just a string", 42]'), existing);
  assert.deepEqual(mixed.rejected.map((item) => item.reason), ['malformed-json', 'malformed-json']);
});

// ------------------------------------------------------------ accuracy --

test('accuracy eval: 20 proposed, parse / schema rates and exactly the valid novel terms accepted', () => {
  const parsed = agent.parseCandidates(fixture('accuracy-reply.txt'));
  const result = agent.filterCandidates(parsed, existing);
  const expected = json('accuracy-expected.json');
  const metrics = computeMetrics(result, { expected });

  assert.equal(metrics.proposed, 20);
  assert.equal(metrics.parsed, 19);
  assert.equal(metrics.parseRate, 95);
  assert.equal(metrics.schemaValid, 13); // 10 valid + 1 alias duplicate + 2 that only warn
  assert.equal(metrics.schemaPassRate, 68.4);

  const wantAccepted = Object.keys(expected).filter((slug) => expected[slug] === 'accepted').sort();
  assert.deepEqual(result.accepted.map((item) => item.slug).sort(), wantAccepted);
  assert.equal(metrics.accuracy, metrics.expectedAccuracy);
  assert.equal(metrics.accuracy, 50); // 10 accepted / 20 proposed
  assert.equal(metrics.decisionAccuracy, 100, JSON.stringify(metrics.mismatches));
  assert.ok(result.accepted.every((item) => item.entry.slug === item.slug));
});

test('accuracy eval: each bad candidate is rejected for the right reason', () => {
  const result = agent.filterCandidates(agent.parseCandidates(fixture('accuracy-reply.txt')), existing);
  const reasons = reasonsOf(result);
  const detail = Object.fromEntries(result.rejected.map((item) => [item.slug || '#malformed', item.detail]));
  assert.equal(reasons['#malformed'], 'malformed-json');
  assert.equal(reasons['paged-attention'], 'schema-invalid');
  assert.match(detail['paged-attention'], /missing-citation/);
  assert.match(detail['speculative-rejection'], /missing-citation-title/);
  assert.match(detail['sliding-window-attention'], /letter-mismatch/);
  assert.match(detail['quantization-aware-training'], /invalid-type/);
  assert.match(detail['reward-hacking'], /missing-definition/);
  assert.match(detail['Logit Lens!'], /invalid-slug/);
  assert.equal(reasons['byte-latent-transformer'], 'validation-warning');
  assert.match(detail['byte-latent-transformer'], /non-canonical-type/);
  assert.equal(reasons['model-collapse'], 'validation-warning');
  assert.match(detail['model-collapse'], /missing-type/);
});

// ---------------------------------------------------------- duplicates --

test('duplicate eval: exact count flagged per category', () => {
  const result = agent.filterCandidates(agent.parseCandidates(fixture('duplicates-reply.txt')), existing);
  assert.equal(countBy(result.rejected, 'duplicate-slug'), 2);
  assert.equal(countBy(result.rejected, 'duplicate-aka'), 2);
  assert.equal(countBy(result.rejected, 'duplicate-term'), 3);
  assert.equal(countBy(result.rejected, 'duplicate-in-batch'), 3);
  assert.equal(result.rejected.length, 10);
  assert.deepEqual(result.accepted.map((item) => item.term), ['Prefix Caching', 'Model Context Protocol', 'Test-Time Compute']);
  const metrics = computeMetrics(result, { expected: json('duplicates-expected.json') });
  assert.equal(metrics.duplicatesFlagged, 10);
  assert.equal(metrics.decisionAccuracy, 100, JSON.stringify(metrics.mismatches));
});

test('duplicate eval: (a) existing slug, (b) alias, (c) case/whitespace variants, (d) in-batch repeats', () => {
  const result = agent.filterCandidates(agent.parseCandidates(fixture('duplicates-reply.txt')), existing);
  const byTerm = Object.fromEntries(result.rejected.map((item) => [item.term, item.reason]));
  assert.equal(byTerm['Attention Mechanism'], 'duplicate-slug'); // explicit slug "attention"
  assert.equal(byTerm['Naïve Bayes'], 'duplicate-slug'); // slug naive-bayes
  assert.equal(byTerm.RAG, 'duplicate-aka');
  assert.equal(byTerm['Low-Rank Adaptation'], 'duplicate-aka');
  assert.equal(byTerm['large language model'], 'duplicate-term');
  assert.equal(byTerm['Mixture   of  Experts'], 'duplicate-term');
  assert.equal(byTerm['KV-cache'], 'duplicate-term');
  assert.equal(byTerm['prefix caching'], 'duplicate-in-batch');
  assert.equal(byTerm['Test Time Compute'], 'duplicate-in-batch');
  assert.equal(byTerm.MCP, 'duplicate-in-batch'); // alias of an entry accepted earlier in the batch
});

test('duplicate eval: in-batch dedup only counts accepted entries', () => {
  const good = { term: 'Prefix Caching', letter: 'P', type: 'concept', definition: 'd', details: 'd', citation: { title: 't', url: 'https://example.com' } };
  const bad = { ...good, citation: undefined };
  const { accepted, rejected } = agent.filterCandidates([bad, good], existing);
  assert.deepEqual(rejected.map((item) => item.reason), ['schema-invalid']);
  assert.equal(accepted.length, 1);
});

test('duplicate eval against the real dictionary/: tracked slugs, names and aliases are flagged', () => {
  const real = loadDictionaryTerms(ROOT);
  const slugs = new Set(real.map((item) => item.slug || slugifyTerm(item.term)));
  for (const slug of ['attention', 'retrieval-augmented-generation', 'large-language-model']) assert.ok(slugs.has(slug), slug);
  const make = (term, extra = {}) => ({ term, letter: term.trim()[0].toUpperCase(), type: 'concept', definition: 'd', details: 'd', citation: { title: 't', url: 'https://example.com' }, ...extra });
  const result = agent.filterCandidates(
    [make('Attention Operator', { slug: 'attention' }), make('RAG'), make('  LARGE language   model ')],
    real
  );
  assert.deepEqual(result.rejected.map((item) => item.reason), ['duplicate-slug', 'duplicate-aka', 'duplicate-term']);
});

// ------------------------------------------------------- exclusion list --

test('exclusion list contains every existing term name, slug and alias', () => {
  for (const terms of [existing, loadDictionaryTerms(ROOT)]) {
    const list = new Set(agent.buildExclusionList(terms));
    for (const item of terms) {
      assert.ok(list.has(item.term.trim()), `term ${item.term}`);
      assert.ok(list.has(item.slug || slugifyTerm(item.term)), `slug ${item.slug}`);
      for (const alias of [].concat(item.aka || [])) assert.ok(list.has(alias.trim()), `alias ${alias}`);
    }
  }
  assert.ok(agent.buildExclusionList(existing).includes('Low-Rank Adaptation'));
});

// --------------------------------------------------------------- report --

test('metrics report: offline runner summarises every suite and passes', async () => {
  const report = await runOfflineEvals({ agent });
  assert.equal(report.passed, true);
  assert.equal(report.totals.proposed, 33);
  assert.equal(report.totals.accepted, 13);
  assert.equal(report.totals.duplicatesFlagged, 11);
  assert.deepEqual(Object.keys(report.totals.rejectedByReason), REJECTION_REASONS);
  assert.deepEqual(Object.keys(report.totals.duplicatesByType), DUPLICATE_REASONS);
  const markdown = toMarkdown(report);
  for (const label of ['Terms proposed', 'Accepted', 'Duplicates flagged', 'duplicate-aka', 'Accuracy (accepted / proposed)']) {
    assert.ok(markdown.includes(label), label);
  }
  console.log(
    JSON.stringify({
      proposed: report.totals.proposed,
      accepted: report.totals.accepted,
      rejectedByReason: report.totals.rejectedByReason,
      duplicatesFlagged: report.totals.duplicatesFlagged,
      accuracy: `${report.totals.accuracy}%`,
      decisionAccuracy: `${report.totals.decisionAccuracy}%`,
    })
  );
});

test('metrics report: decision accuracy never goes negative when labels go unmatched', async () => {
  const renamed = {
    ...agent,
    filterCandidates: (candidates, existingTerms) => {
      const { accepted, rejected } = agent.filterCandidates(candidates, existingTerms);
      const rename = (item) => ({ ...item, slug: `renamed-${item.slug}` });
      return { accepted: accepted.map(rename), rejected: rejected.map(rename) };
    },
  };
  const report = await runOfflineEvals({ agent: renamed });
  assert.equal(report.passed, false);
  assert.equal(report.totals.decisionAccuracy, 0);
});

test('reply eval scores a saved reply against tracked dictionary/ entries', async () => {
  const report = await runReplyEval(fixture('duplicates-reply.txt'), { root: ROOT, agent });
  assert.equal(report.mode, 'input');
  assert.equal(report.totals.proposed, 13);
  assert.ok(report.totals.duplicatesFlagged >= 7);
});

test('module boundary prefers units exported by generate-weekly-terms.mjs and stubs the rest', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'weekly-agent-'));
  try {
    const agentPath = join(dir, 'generate-weekly-terms.mjs');
    writeFileSync(agentPath, 'export function buildExclusionList() { return ["from-agent"]; }\n');
    const loaded = await loadWeeklyAgent({ agentPath });
    assert.deepEqual(loaded.buildExclusionList([]), ['from-agent']);
    assert.equal(loaded.source.buildExclusionList, 'generate-weekly-terms.mjs');
    assert.equal(loaded.source.filterCandidates, 'weekly-terms-core.mjs');
    const missing = await loadWeeklyAgent({ agentPath: join(dir, 'nope.mjs') });
    assert.equal(missing.source.parseCandidates, 'weekly-terms-core.mjs');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
