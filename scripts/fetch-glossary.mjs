// -----------------------------------------------------------------------------
//  Wikipedia glossary fetcher → data/ai_terms_extra.json
//
//  Run:  node scripts/fetch-glossary.mjs [--limit=N] [--dry-run]
//
//  Pulls article titles from a set of AI/ML-related Wikipedia categories,
//  fetches each article's lead extract, and writes records in the same shape
//  `scripts/import-data.mjs` consumes. Existing dictionary names/aliases are
//  skipped, so re-running is safe and only produces genuinely new terms.
//
//  After this writes the file, run:
//    npm run import    # merge data/ai_terms_extra.json into dictionary/
//    npm run stories   # add story + related to the new terms
//    npm run graph     # rebuild the knowledge graph
// -----------------------------------------------------------------------------

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGraphLabel, slugifyTerm } from '../src/term-schema.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://en.wikipedia.org/w/api.php';

const LIMIT = Number(
  (process.argv.find((a) => a.startsWith('--limit=')) || '--limit=0').split('=')[1]
);
const DRY_RUN = process.argv.includes('--dry-run');
const DEPTH = 4;
const MAX_CANDIDATES = 4000;

const CATEGORIES = [
  'Artificial intelligence',
  'Machine learning',
  'Deep learning',
  'Generative artificial intelligence',
  'Large language models',
  'Natural language processing',
  'Computational linguistics',
  'Speech recognition',
  'Speech synthesis',
  'Computer vision',
  'Data mining',
  'Information retrieval',
  'Machine translation',
  'Artificial neural networks',
  'Reinforcement learning',
  'Knowledge representation',
  'Optimization algorithms and methods',
  'Statistical classification',
  'Robotics',
  'AI safety',
];

const SKIP_TITLE = /^(List of|Lists of|Outline of|Glossary of|Index of|Comparison of|Timeline of)/i;
const SKIP_TAIL = /\(disambiguation\)$/i;

// The lead must mention at least one of these to be considered an AI/ML term.
const RELEVANCE_SIGNALS = [
  'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
  'neural networks', 'language model', 'large language model', 'natural language',
  'speech recognition', 'computer vision', 'data mining', 'reinforcement learning',
  'generative artificial intelligence', 'generative ai', 'information retrieval',
  'computational linguistics', 'machine translation', 'pattern recognition',
  'optimization algorithm', 'recommender system', 'speech synthesis',
  'image recognition', 'artificial neural', 'transformer model',
  'transformer architecture', 'knowledge graph', 'supervised learning',
  'unsupervised learning', 'chatbot', 'robotics', 'llm', 'genai',
  'ai model', 'ai system', 'ai agent', 'foundation model',
];

function isRelevant(text) {
  const lower = text.toLowerCase();
  return RELEVANCE_SIGNALS.some((signal) => lower.includes(signal));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, retries = 5) {
  const url = new URL(API);
  url.search = new URLSearchParams({ format: 'json', ...params }).toString();
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'TheAiDictionary-glossary/1.0 (contact: local maintainer)' },
      });
    } catch {
      if (attempt === retries) throw new Error('fetch failed');
      await sleep(Math.min(30000, 2000 * 2 ** attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      await sleep(retryAfter || Math.min(20000, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
    return res.json();
  }
  throw new Error('Wikipedia API rate limited after retries');
}

function loadExistingNames() {
  const names = new Set();
  const dictDir = join(ROOT, 'dictionary');
  for (const folder of readdirSync(dictDir)) {
    if (!/^[a-z]-[a-z]$/.test(folder)) continue;
    for (const file of readdirSync(join(dictDir, folder))) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(readFileSync(join(dictDir, folder, file), 'utf8'));
        if (raw.term) names.add(normalizeGraphLabel(raw.term));
        for (const alias of raw.aka || []) names.add(normalizeGraphLabel(alias));
      } catch {
        // ignore unreadable files
      }
    }
  }
  return names;
}

async function collectTitles(existing, target = MAX_CANDIDATES) {
  const found = new Map(); // normalized title -> { title, category }
  const queue = CATEGORIES.map((category) => ({ page: `Category:${category}`, category, depth: 0 }));
  const visited = new Set();

  while (queue.length && found.size < target) {
    const { page, category, depth } = queue.shift();
    if (visited.has(page)) continue;
    visited.add(page);

    const data = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: page,
      cmlimit: '500',
      cmtype: 'page|subcat',
    });
    await sleep(120);

    for (const member of data.query?.categorymembers || []) {
      if (member.ns === 14) {
        if (depth + 1 < DEPTH) queue.push({ page: member.title, category, depth: depth + 1 });
        continue;
      }
      const norm = normalizeGraphLabel(member.title);
      if (
        SKIP_TITLE.test(member.title) ||
        SKIP_TAIL.test(member.title) ||
        existing.has(norm) ||
        found.has(norm)
      ) {
        continue;
      }
      found.set(norm, { title: member.title, category });
    }
  }
  return found;
}

async function fetchExtracts(records) {
  const titles = records.map((r) => r.title);
  const extracts = new Map(); // normalized title -> lead text
  // Wikipedia caps exlimit at 20 for anonymous requests, so batch accordingly.
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const data = await api({
      action: 'query',
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      exlimit: 'max',
      redirects: '1',
      titles: batch.join('|'),
    });
    for (const page of Object.values(data.query?.pages || {})) {
      if (page.extract) extracts.set(normalizeGraphLabel(page.title), page.extract);
    }
    await sleep(50);
  }
  return extracts;
}

function splitLead(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const boundary = clean.search(/[.!?]\s/);
  if (boundary === -1) return { definition: clean, details: clean };
  const definition = clean.slice(0, boundary + 1).trim();
  const remainder = clean.slice(boundary + 1).trim();
  return { definition, details: (remainder || clean).slice(0, 1200) };
}

function buildEntry({ title, category }, extract) {
  const { definition, details } = splitLead(extract);
  return {
    term: title,
    category,
    definition,
    details,
    citation: {
      title,
      authors: ['Wikipedia Contributors'],
      year: new Date().getFullYear(),
      venue: 'Wikipedia, The Free Encyclopedia',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    },
    slug: slugifyTerm(title),
  };
}

async function main() {
  const existing = loadExistingNames();
  const target = LIMIT ? Math.max(LIMIT * 5, 50) : MAX_CANDIDATES;
  const collected = await collectTitles(existing, target);
  console.log(`collected ${collected.size} candidate titles (${existing.size} existing names skipped)`);

  const records = [...collected.values()];
  const limited = LIMIT ? records.slice(0, LIMIT) : records;
  const extracts = await fetchExtracts(limited);
  console.log(`fetched extracts for ${extracts.size} of ${limited.length} titles`);

  const entries = [];
  for (const record of limited) {
    const extract = extracts.get(normalizeGraphLabel(record.title));
    if (!extract || extract.length < 40 || !isRelevant(extract)) continue;
    entries.push(buildEntry(record, extract));
  }
  entries.sort((a, b) => a.slug.localeCompare(b.slug));

  const output = join(ROOT, 'data', 'ai_terms_extra.json');
  if (DRY_RUN) {
    console.log(`[dry-run] would write ${entries.length} entries to ${output}`);
    for (const entry of entries.slice(0, 10)) console.log(`   · ${entry.term}`);
    return;
  }
  writeFileSync(output, JSON.stringify(entries, null, 2) + '\n');
  console.log(`wrote ${entries.length} entries → data/ai_terms_extra.json`);
  console.log('next: npm run import && npm run stories && npm run graph');
}

main().catch((error) => {
  console.error('fetch-glossary failed:', error.message);
  process.exitCode = 1;
});
