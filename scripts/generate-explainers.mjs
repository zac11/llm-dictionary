// -----------------------------------------------------------------------------
//  Explainer generator — writes a type-aware `explainer` onto dictionary entries.
//
//  Run:  node --env-file=.env scripts/generate-explainers.mjs --only transformer,geoffrey-hinton
//        node --env-file=.env scripts/generate-explainers.mjs --type person --limit 50
//        node --env-file=.env scripts/generate-explainers.mjs --all --concurrency 4
//        node scripts/generate-explainers.mjs --only transformer --dry-run   (print the prompt)
//        node --env-file=.env scripts/generate-explainers.mjs --all --compact --model kimi-k2.6 --max-tokens 2000000
//
//  --compact writes only what the reading-level tabs show (lead, ELI5 /
//  Practitioner / Paper-level, example, Used in) for --batch entries per call
//  (default 10) with a short Wikipedia excerpt: a fraction of the tokens of the
//  full layout. --max-tokens stops the run once reported usage reaches it.
//
//  Facts come from the entry and its Wikipedia article (cached in
//  data/wikipedia/); the writing comes from the OpenAI-compatible model set by
//  LLM_API_KEY / LLM_BASE_URL / LLM_MODEL (Kimi by default, as for /api/ask).
//  The model may correct the entry's `type` (a lawsuit typed as a concept
//  becomes an event); every change is printed. Entries that already carry an
//  explainer are skipped unless --force is passed. A written explainer replaces
//  the generic story, which is dropped.
// -----------------------------------------------------------------------------

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { completionOptions, getLlmConfig } from '../netlify/functions/ask.mjs';
import { normalizeTerm } from '../src/term-schema.js';
import { buildCompactMessages, buildMessages, parseCompactReply, parseExplainerReply } from './explainer-prompt.mjs';
import { cachedWikipedia } from './wikipedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT = join(ROOT, 'dictionary');
const CACHE = join(ROOT, 'data', 'wikipedia');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1] || fallback;
};

const ONLY = new Set(option('only').split(',').map((s) => s.trim()).filter(Boolean));
const TYPE = option('type');
const LIMIT = Number(option('limit', '0')) || Infinity;
const CONCURRENCY = Math.max(1, Number(option('concurrency', '3')) || 3);
const FORCE = flag('force');
const DRY_RUN = flag('dry-run');
const ALL = flag('all');
const COMPACT = flag('compact');
const BATCH = COMPACT ? Math.max(1, Number(option('batch', '10')) || 10) : 1;
const MODEL = option('model');
const MAX_TOKENS = Number(option('max-tokens', '0')) || Infinity;
const usage = { prompt: 0, completion: 0, calls: 0 };
const usedTokens = () => usage.prompt + usage.completion;
const MAX_ATTEMPTS = 6;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadEntries() {
  const out = [];
  for (const folder of readdirSync(DICT).sort()) {
    if (!/^[a-z]-[a-z]$/.test(folder)) continue;
    for (const file of readdirSync(join(DICT, folder)).sort()) {
      if (!file.endsWith('.json')) continue;
      const path = join(DICT, folder, file);
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      const entry = normalizeTerm(raw, path);
      if (entry) out.push({ path, raw, entry });
    }
  }
  return out;
}

/** Rebuild the record with the new type and explainer, dropping the generic story. */
/** Keep an existing explainer's sections; add the compact tiers, and an example / Used in only where missing. */
export function mergeCompact(existing, compact) {
  const out = { ...existing, tiers: compact.tiers };
  if (!existing.example && compact.example) out.example = compact.example;
  if (!(Array.isArray(existing.usedIn) && existing.usedIn.length) && compact.usedIn) out.usedIn = compact.usedIn;
  return out;
}

export function applyExplainer(raw, type, explainer) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'story' || key === 'explainer') continue;
    out[key] = key === 'type' ? type : value;
    if (key === 'details') out.explainer = explainer;
  }
  if (!out.explainer) out.explainer = explainer;
  if (!out.type) out.type = type;
  return out;
}

async function complete(config, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages,
        response_format: { type: 'json_object' },
        ...completionOptions(config.model),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`LLM ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const data = await response.json();
    usage.calls++;
    usage.prompt += data.usage?.prompt_tokens || 0;
    usage.completion += data.usage?.completion_tokens || 0;
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!ONLY.size && !TYPE && !ALL && !Number.isFinite(LIMIT)) {
    console.error('Pick entries with --only <slugs>, --type <type>, --limit <n> or --all.');
    process.exit(1);
  }
  const base = getLlmConfig();
  const config = base && MODEL ? { ...base, model: MODEL } : base;
  if (!config && !DRY_RUN) {
    console.error('Set LLM_API_KEY, LLM_BASE_URL and LLM_MODEL (e.g. node --env-file=.env …).');
    process.exit(1);
  }

  const queue = loadEntries()
    .filter(({ raw, entry }) => (ONLY.size ? ONLY.has(entry.slug) : true))
    .filter(({ entry }) => (TYPE ? entry.type === TYPE : true))
    .filter(({ raw }) => FORCE || ONLY.size || !raw.explainer)
    .slice(0, LIMIT);

  console.log(`${queue.length} entries to write${DRY_RUN ? ' (dry run)' : ''}`);
  let written = 0;
  let failed = 0;
  let rateLimitedRetries = 0;
  const retyped = [];
  const weak = [];

  const work = async ({ path, raw, entry }) => {
    const wiki = await cachedWikipedia(entry, CACHE).catch(() => null);
    const messages = buildMessages(entry, wiki);
    if (DRY_RUN) {
      console.log(`\n=== ${entry.slug} ===\n${messages[1].content}`);
      return;
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const reply = await complete(config, messages);
        const { type, explainer, issues } = parseExplainerReply(reply, entry, wiki);
        if (!explainer) throw new Error(issues.join('; '));
        writeFileSync(path, `${JSON.stringify(applyExplainer(raw, type, explainer), null, 2)}\n`);
        written++;
        if (type !== entry.type) retyped.push(`${entry.slug}: ${entry.type} -> ${type}`);
        if (issues.length) weak.push(`${entry.slug}: ${issues.join('; ')}`);
        console.log(`  ✓ ${entry.slug} (${type})${rateLimitedRetries ? ` [429 retries so far: ${rateLimitedRetries}]` : ''}`);
        return;
      } catch (error) {
        const rateLimited = /^LLM 429/.test(error.message) && !/quota|balance|suspended/i.test(error.message);
        if (attempt === MAX_ATTEMPTS || (!rateLimited && attempt >= 2)) {
          failed++;
          console.log(`  ✗ ${entry.slug}: ${error.message}`);
          return;
        }
        if (rateLimited) {
          rateLimitedRetries++;
          await sleep(2000 * attempt + Math.random() * 2000);
        }
      }
    }
  };

  const workBatch = async (items) => {
    const batch = [];
    for (const item of items) batch.push({ ...item, wiki: await cachedWikipedia(item.entry, CACHE).catch(() => null) });
    const messages = buildCompactMessages(batch);
    if (DRY_RUN) {
      console.log(`\n=== ${batch.map((b) => b.entry.slug).join(', ')} ===\n${messages[1].content}`);
      return;
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const results = parseCompactReply(await complete(config, messages), batch);
        for (const { path, raw, entry } of batch) {
          const { explainer, issues } = results.get(entry.slug);
          if (!explainer) {
            failed++;
            console.log(`  ✗ ${entry.slug}: ${issues.join('; ')}`);
            continue;
          }
          const merged = raw.explainer ? mergeCompact(raw.explainer, explainer) : explainer;
          writeFileSync(path, `${JSON.stringify(applyExplainer(raw, entry.type, merged), null, 2)}\n`);
          written++;
          console.log(`  ✓ ${entry.slug} [tokens so far: ${usedTokens()}]`);
        }
        return;
      } catch (error) {
        const rateLimited = /^LLM 429/.test(error.message) && !/quota|balance|suspended/i.test(error.message);
        if (attempt === MAX_ATTEMPTS || (!rateLimited && attempt >= 2)) {
          failed += batch.length;
          console.log(`  ✗ ${batch.map((b) => b.entry.slug).join(', ')}: ${error.message.slice(0, 160)}`);
          return;
        }
        if (rateLimited) {
          rateLimitedRetries++;
          await sleep(2000 * attempt + Math.random() * 2000);
        }
      }
    }
  };

  const pending = [...queue];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (pending.length && usedTokens() < MAX_TOKENS) {
        if (COMPACT) await workBatch(pending.splice(0, BATCH));
        else await work(pending.shift());
      }
    })
  );
  if (usedTokens() >= MAX_TOKENS) console.log(`\nstopped at the --max-tokens budget; ${pending.length} entries left`);

  if (DRY_RUN) return;
  console.log(`\nwritten: ${written}, failed: ${failed}, rate-limited retries: ${rateLimitedRetries}`);
  console.log(`tokens: ${usage.prompt} in + ${usage.completion} out over ${usage.calls} calls (${written ? Math.round(usedTokens() / written) : 0} per entry written)`);
  if (retyped.length) console.log(`\nretyped (${retyped.length}):\n  ${retyped.join('\n  ')}`);
  if (weak.length) console.log(`\nneeds a look (${weak.length}):\n  ${weak.join('\n  ')}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
