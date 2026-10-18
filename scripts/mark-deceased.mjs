// -----------------------------------------------------------------------------
//  Mark deceased people — adds `deceased: true` to person entries.
//
//  Run:  node scripts/mark-deceased.mjs            (write flags)
//        node scripts/mark-deceased.mjs --dry-run  (report only)
//        node scripts/mark-deceased.mjs --offline  (no network, cache only)
//
//  The reader hides a person's LinkedIn link when `deceased` is true: a live
//  profile is meaningless for someone who has died. Two passes are used:
//
//    1. the entry itself — a lifespan in the definition ("(23 June 1912 –
//       7 June 1954)") or explicit death wording ("died in 2014");
//    2. the Wikipedia intro for anyone still undecided, which is where the
//       older figures hide when their dictionary definition has no dates.
//
//  Only positive evidence sets the flag, so a living person is never marked by
//  accident; a missed person simply keeps their LinkedIn link. Results are
//  cached in the system temp dir, so a re-run is instant. Set the flag by hand
//  if a curator knows better.
// -----------------------------------------------------------------------------

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { personKey } from './import-people.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT = join(ROOT, 'dictionary');
const CACHE = join(tmpdir(), 'aidictionary-death-cache.json');
const WIKITEXT_CACHE = join(tmpdir(), 'aidictionary-death-wikitext-cache.json');
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'TheAIDictionary-import/1.0 (dictionary build script)';

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Confirmed by hand: people whose Wikipedia page is an ambiguous disambiguation
 * listing that cannot be resolved automatically. Keep this tiny and sourced.
 */
const MANUAL_DECEASED = new Set(['john-mccarthy']);
const OFFLINE = process.argv.includes('--offline');

const YEAR = '(?:1[5-9]\\d{2}|20[0-9]{2})';
const YEAR_RANGE = new RegExp(`\\([^()]*?\\b${YEAR}\\b[^()]{0,40}?[–—−-][^()]{0,40}?\\b${YEAR}\\b[^()]*\\)`);
const DEATH_WORDING = /\b(?:died|was found dead|posthumously|deceased)\b/i;
const DISAMBIGUATION_PAGE = /may refer to|can refer to|is the name of|topics referred to/i;
const DOMAIN =
  /computer|artificial intelligen|machine learn|software|robotic|scientist|researcher|professor|engineer|mathematic|linguist|psycholog|logician|cybernetic|physiolog|neuro|philosoph|physicist|statistic|sociolog|anthropolog|economist/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const saveCache = () => writeFileSync(CACHE, JSON.stringify(cache));
const wikitextCache = existsSync(WIKITEXT_CACHE) ? JSON.parse(readFileSync(WIKITEXT_CACHE, 'utf8')) : {};
const saveWikitext = () => writeFileSync(WIKITEXT_CACHE, JSON.stringify(wikitextCache));

async function api(params, { attempts = 4 } = {}) {
  if (OFFLINE) throw new Error('offline');
  const query = new URLSearchParams({ action: 'query', format: 'json', ...params });
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(`${WIKI_API}?${query}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20000),
    }).catch((error) => ({ ok: false, status: 0, error }));
    if (response.ok) {
      await sleep(2000);
      return response.json();
    }
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15000 * attempt;
    if (attempt === attempts) throw new Error(response.error?.message || `HTTP ${response.status}`);
    await sleep(Math.min(wait, 60000));
  }
  return null;
}

/** Does a definition describe someone who has died? */
export function readsAsDeceased(text) {
  const value = String(text || '');
  if (YEAR_RANGE.test(value)) return 'lifespan';
  if (DEATH_WORDING.test(value)) return 'wording';
  return null;
}

/**
 * Does a Wikipedia intro describe someone who has died? Only the opening is
 * read: a later "(2001–2010)" is a show's run, not a lifespan, and a
 * disambiguation listing is a list of namesakes, not a biography.
 */
export function wikipediaDeceased(extract) {
  const text = String(extract || '');
  if (DISAMBIGUATION_PAGE.test(text.slice(0, 200))) return null;
  // A namesake from another field ("Fernando Pereira" the photographer) is not
  // this person; a biography in this dictionary mentions the field.
  if (!DOMAIN.test(text.slice(0, 400))) return null;
  // The lifespan sits in the parenthetical that follows the name ("… (1912 –
  // 1954) was …"), not in a later "(2001–2010)" describing a TV show's run.
  const firstSentence = (text.split(/(?<=[.!?])\s/)[0] || '').slice(0, 400);
  const firstParen = firstSentence.match(/\([^()]*\)/);
  if (firstParen && YEAR_RANGE.test(firstParen[0]) && /\b(?:was|were)\b/.test(firstSentence)) {
    return 'wiki-lifespan';
  }
  if (/\b(?:died|was found dead)\b/i.test(firstSentence)) return 'wiki-wording';
  return null;
}

/**
 * A disambiguation page lists people with dates, e.g. "Nils John Nilsson
 * (1933–2019), artificial intelligence researcher". The right line is the one
 * that carries all of the name's tokens; if several people fit, the field
 * filter has to pick exactly one, otherwise nothing is decided.
 */
export function disambiguationVerdict(extract, name) {
  const text = String(extract || '');
  if (!DISAMBIGUATION_PAGE.test(text.slice(0, 200))) return null;
  const tokens = personKey(name).split(' ').filter(Boolean);
  if (!tokens.length) return null;
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const named = lines.filter((line) => tokens.every((token) => line.toLowerCase().includes(token)));
  const inField = named.filter((line) => DOMAIN.test(line));
  const pool = inField.length ? inField : named;
  if (pool.length !== 1) return null;
  const line = pool[0];
  const years = [...line.matchAll(new RegExp(`\\b(${YEAR})\\b`, 'g'))].map((match) => Number(match[1]));
  if (years.length >= 2 && years[1] > years[0] && /[–—−-]/.test(line)) return 'wiki-disambiguation';
  return null;
}

/** A disambiguation page whose plain-text extract kept no listing. */
async function wikitextFor(name) {
  const key = personKey(name);
  if (Object.prototype.hasOwnProperty.call(wikitextCache, key)) return wikitextCache[key];
  try {
    const data = await api({ prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: name });
    const page = Object.values(data?.query?.pages || {})[0];
    const text = page?.revisions?.[0]?.slots?.main?.['*'] || null;
    wikitextCache[key] = text ? { title: page.title, text } : null;
  } catch {
    wikitextCache[key] = null;
  }
  saveWikitext();
  return wikitextCache[key];
}

/**
 * Read the date from a disambiguation listing's wikitext, e.g.
 * "* [[John McCarthy (computer scientist)]] (1927–2011), American computer scientist".
 */
export function deceasedFromWikitext(text, name) {
  const tokens = personKey(name).split(' ').filter(Boolean);
  if (!tokens.length) return null;
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const named = lines.filter((line) => tokens.every((token) => line.toLowerCase().includes(token)));
  const inField = named.filter((line) => DOMAIN.test(line));
  const pool = inField.length ? inField : named;
  if (pool.length !== 1) return null;
  const years = [...pool[0].matchAll(new RegExp(`\\b(${YEAR})\\b`, 'g'))].map((match) => Number(match[1]));
  return years.length >= 2 && years[1] > years[0] && /[–—−-]/.test(pool[0]) ? 'wikitext-disambiguation' : null;
}

function collectPeople() {
  const people = [];
  for (const folder of readdirSync(DICT).sort()) {
    if (!/^[a-z]-[a-z]$/.test(folder)) continue;
    for (const file of readdirSync(join(DICT, folder)).sort()) {
      if (!file.endsWith('.json')) continue;
      const path = join(DICT, folder, file);
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      if (raw.type !== 'person') continue;
      people.push({ path, raw });
    }
  }
  return people;
}

/** Batched Wikipedia extracts (20 titles per request). */
async function extractsFor(names) {
  const out = new Map();
  const pending = names.filter((name) => !Object.prototype.hasOwnProperty.call(cache, personKey(name)));
  for (let i = 0; i < pending.length; i += 20) {
    const batch = pending.slice(i, i + 20);
    let data;
    try {
      data = await api({
        prop: 'extracts',
        exintro: '1',
        explaintext: '1',
        exlimit: 'max',
        redirects: '1',
        titles: batch.join('|'),
      });
    } catch (error) {
      console.warn(`\n! wikipedia lookup failed (${error.message}) — keeping text-only results`);
      break;
    }
    const pages = Object.values(data?.query?.pages || {});
    for (const name of batch) {
      const key = personKey(name);
      const wanted = key.split(' ');
      // A redirect may add a middle name: "Warren McCulloch" -> "Warren Sturgis McCulloch".
      const page = pages.find((candidate) => {
        const tokens = personKey(candidate.title).split(' ');
        return key === personKey(candidate.title) || wanted.every((token) => tokens.includes(token));
      });
      cache[key] = page && page.extract ? { title: page.title, extract: page.extract } : null;
      if (cache[key]) out.set(key, cache[key]);
    }
    saveCache();
    process.stdout.write(`  wikipedia: ${Math.min(i + 20, pending.length)}/${pending.length}\r`);
  }
  if (pending.length) process.stdout.write('\n');
  return out;
}

async function main() {
  const people = collectPeople();
  const results = new Map(); // personKey -> { deceased, reason }
  const undecided = [];

  for (const { raw } of people) {
    // A year range only counts in the definition — in the details it is a job
    // span ("(2022–2024)"), not a lifespan.
    const reason =
      readsAsDeceased(raw.definition || '') || (DEATH_WORDING.test(raw.details || '') ? 'wording' : null);
    if (reason) results.set(personKey(raw.term), { deceased: true, reason });
    else undecided.push(raw.term);
  }

  if (!OFFLINE && undecided.length) {
    console.log(`checking ${undecided.length} undecided people against Wikipedia…`);
    await extractsFor(undecided);
    for (const name of undecided) {
      const page = cache[personKey(name)];
      if (!page) continue;
      const extract = page.extract;
      const reason = wikipediaDeceased(extract) || disambiguationVerdict(extract, name);
      if (reason) {
        results.set(personKey(name), { deceased: true, reason });
      } else if (DISAMBIGUATION_PAGE.test(extract.slice(0, 200))) {
        const page2 = await wikitextFor(page.title);
        const fromText = page2 ? deceasedFromWikitext(page2.text, name) : null;
        if (fromText) results.set(personKey(name), { deceased: true, reason: fromText });
      }
    }
  }

  let marked = 0;
  const newly = [];
  for (const { path, raw } of people) {
    const verdict = results.get(personKey(raw.term));
    const manual = MANUAL_DECEASED.has(raw.slug);
    const shouldMark = Boolean(verdict?.deceased) || manual;
    if (shouldMark && raw.deceased !== true) {
      const ordered = {};
      for (const key of Object.keys(raw)) {
        if (key === 'deceased') continue;
        ordered[key] = raw[key];
      }
      ordered.deceased = true;
      if (!DRY_RUN) writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`);
      newly.push([raw.term, manual ? 'manual' : verdict.reason]);
    }
    if (shouldMark) marked++;
  }

  console.log(`person entries: ${people.length}`);
  console.log(`deceased: ${marked}`);
  console.log(`${DRY_RUN ? 'would mark' : 'newly marked'}: ${newly.length}`);
  for (const [term, reason] of newly.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${term} (${reason})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(DRY_RUN ? error.stack || String(error) : `mark-deceased failed: ${error.message}`);
    process.exit(1);
  });
}
