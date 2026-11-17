// -----------------------------------------------------------------------------
//  Evals for the weekly term-generation agent.
//
//  node scripts/eval-weekly-agent.mjs                 offline fixtures (no API calls)
//  node scripts/eval-weekly-agent.mjs --input FILE    score a saved LLM reply against dictionary/
//  node scripts/eval-weekly-agent.mjs --live          one real call (DEEPSEEK_API_KEY or GEMINI_API_KEY)
//
//  --format json|markdown (default json)   --out FILE (also write the report there)
//
//  Offline mode exits 1 when any fixture decision differs from its label.
//  --live is a manual / scheduled check and never runs under `npm test`.
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadWeeklyAgent } from './weekly-agent-boundary.mjs';
import {
  buildWeeklyMessages,
  computeMetrics,
  loadDictionaryTerms,
  metricsMarkdown,
  pickProvider,
  requestCandidates,
} from './weekly-terms-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = join(ROOT, 'test', 'fixtures', 'weekly-agent');
export const SUITES = ['accuracy', 'duplicates'];

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function evaluate(agent, reply, existingTerms, expected) {
  const parsed = agent.parseCandidates(reply);
  const result = agent.filterCandidates(parsed, existingTerms);
  return { result, metrics: computeMetrics(result, { expected }) };
}

/** Run every fixture suite; returns `{ mode, implementation, suites, totals, passed }`. */
export async function runOfflineEvals({ fixtures = FIXTURES, agent = null } = {}) {
  agent = agent || (await loadWeeklyAgent());
  const existingTerms = readJson(join(fixtures, 'existing-terms.json'));
  const suites = {};
  const merged = { accepted: [], rejected: [] };
  for (const name of SUITES) {
    const reply = readFileSync(join(fixtures, `${name}-reply.txt`), 'utf8');
    const { result, metrics } = evaluate(agent, reply, existingTerms, readJson(join(fixtures, `${name}-expected.json`)));
    suites[name] = metrics;
    merged.accepted.push(...result.accepted);
    merged.rejected.push(...result.rejected);
  }
  const totals = computeMetrics(merged);
  const decisions = SUITES.reduce((sum, name) => sum + suites[name].decisionTotal, 0);
  const correct = SUITES.reduce((sum, name) => sum + suites[name].decisionMatched, 0);
  totals.decisionAccuracy = decisions ? Math.round((correct / decisions) * 1000) / 10 : 0;
  return {
    mode: 'offline',
    implementation: agent.source,
    suites,
    totals,
    passed: SUITES.every((name) => suites[name].mismatches.length === 0),
  };
}

/** Score one LLM reply against the tracked dictionary/ entries. */
export async function runReplyEval(reply, { root = ROOT, agent = null } = {}) {
  agent = agent || (await loadWeeklyAgent());
  const { metrics } = evaluate(agent, reply, loadDictionaryTerms(root), null);
  return { mode: 'input', implementation: agent.source, totals: metrics };
}

async function runLiveEval({ count }) {
  const provider = pickProvider();
  if (!provider) throw new Error('--live needs DEEPSEEK_API_KEY or GEMINI_API_KEY');
  const agent = await loadWeeklyAgent();
  const existingTerms = loadDictionaryTerms(ROOT);
  const messages = buildWeeklyMessages(agent.buildExclusionList(existingTerms), { count });
  const { reply, usage } = await requestCandidates(provider, messages);
  const { metrics } = evaluate(agent, reply, existingTerms, null);
  return { mode: 'live', provider: provider.name, model: provider.model, usage, implementation: agent.source, totals: metrics };
}

export function toMarkdown(report) {
  const parts = [];
  if (report.mode === 'offline') {
    parts.push(metricsMarkdown(report.totals, { title: 'Weekly agent eval — offline fixtures', note: `Decision accuracy vs. labelled fixtures: **${report.totals.decisionAccuracy}%** (${report.passed ? 'pass' : 'FAIL'}).` }));
  } else if (report.mode === 'live') {
    parts.push(metricsMarkdown(report.totals, { title: `Weekly agent eval — live (${report.provider} / ${report.model})`, note: `Tokens: ${report.usage.prompt} in + ${report.usage.completion} out.` }));
  } else {
    parts.push(metricsMarkdown(report.totals, { title: 'Weekly agent eval — this run' }));
  }
  return parts.join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      live: { type: 'boolean', default: false },
      input: { type: 'string' },
      format: { type: 'string', default: 'json' },
      out: { type: 'string' },
      count: { type: 'string', default: '10' },
    },
  });
  const report = values.live
    ? await runLiveEval({ count: Number(values.count) || 10 })
    : values.input
      ? await runReplyEval(readFileSync(values.input, 'utf8'))
      : await runOfflineEvals();
  const text = values.format === 'markdown' ? toMarkdown(report) : JSON.stringify(report, null, 2);
  if (values.out) writeFileSync(values.out, `${text}\n`);
  console.log(text);
  if (report.mode === 'offline' && !report.passed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
