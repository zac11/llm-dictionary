// -----------------------------------------------------------------------------
//  Explainer generator — writes a type-aware `explainer` onto dictionary entries.
//
//  Run:  node --env-file=.env scripts/generate-explainers.mjs --only transformer,geoffrey-hinton
//        node --env-file=.env scripts/generate-explainers.mjs --type person --limit 50
//        node --env-file=.env scripts/generate-explainers.mjs --all --concurrency 4
//        node scripts/generate-explainers.mjs --only transformer --dry-run   (print the prompt)
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
import { buildMessages, parseExplainerReply } from './explainer-prompt.mjs';
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
  const config = getLlmConfig();
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
  const retyped = [];
  const weak = [];

  const work = async ({ path, raw, entry }) => {
    const wiki = await cachedWikipedia(entry, CACHE).catch(() => null);
    const messages = buildMessages(entry, wiki);
    if (DRY_RUN) {
      console.log(`\n=== ${entry.slug} ===\n${messages[1].content}`);
      return;
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const reply = await complete(config, messages);
        const { type, explainer, issues } = parseExplainerReply(reply, entry, wiki);
        if (!explainer) throw new Error(issues.join('; '));
        writeFileSync(path, `${JSON.stringify(applyExplainer(raw, type, explainer), null, 2)}\n`);
        written++;
        if (type !== entry.type) retyped.push(`${entry.slug}: ${entry.type} -> ${type}`);
        if (issues.length) weak.push(`${entry.slug}: ${issues.join('; ')}`);
        console.log(`  ✓ ${entry.slug} (${type})`);
        return;
      } catch (error) {
        if (attempt === 2) {
          failed++;
          console.log(`  ✗ ${entry.slug}: ${error.message}`);
        }
      }
    }
  };

  const pending = [...queue];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (pending.length) await work(pending.shift());
    })
  );

  if (DRY_RUN) return;
  console.log(`\nwritten: ${written}, failed: ${failed}`);
  if (retyped.length) console.log(`\nretyped (${retyped.length}):\n  ${retyped.join('\n  ')}`);
  if (weak.length) console.log(`\nneeds a look (${weak.length}):\n  ${weak.join('\n  ')}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
