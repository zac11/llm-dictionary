// -----------------------------------------------------------------------------
//  People importer — adds a JSON list of people to the dictionary.
//
//  Run:  node scripts/import-people.mjs <file.json> [more.json …] [--dry-run]
//        node scripts/import-people.mjs <file.json> --no-wiki   (offline)
//
//  Accepted shapes: an array of records, { "people": [ … ] }, or a single
//  record. Recognised fields (first present wins):
//
//    name
//    famous_for | known_for | role
//    contribution | contributions | bio | details
//    url | website | linkedin
//    category
//
//  Each person becomes dictionary/<range>/<slug>.json with:
//
//    type       "person" — the reader shows a profile, not a story
//    definition the first sentence of the Wikipedia intro, so every entry reads
//               consistently; falls back to the supplied "famous_for"
//    details    the supplied contribution text (that is the "what they did"
//               prose), topped up from the Wikipedia intro when it is thin
//    profile    curated links from the supplied website/LinkedIn URLs
//    citation   the Wikipedia article, when one was found
//
//  People already in the dictionary — matched by name or alias, ignoring
//  accents, middle initials and parentheticals — are left untouched.
// -----------------------------------------------------------------------------

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeTerm, rangeFolderForLetter, slugifyTerm, validateTerm } from '../src/term-schema.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT = join(ROOT, 'dictionary');
const DRY_RUN = process.argv.includes('--dry-run');
const NO_WIKI = process.argv.includes('--no-wiki');
const OFFLINE = process.argv.includes('--offline');
const FILES = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
// Wikipedia throttles bursts; results are cached so a re-run is instant.
const WIKI_CACHE = join(tmpdir(), 'aidictionary-wiki-cache.json');

// Display names that the source lists spell inconsistently.
const DISPLAY_OVERRIDES = {
  'shawn swyx wang': { term: 'Swyx (Shawn Wang)', aka: ['Shawn Wang', 'swyx'] },
  teknium: { term: 'Teknium', aka: ['Ryan (Teknium)'] },
};

/** Wikipedia disambiguation pages must not become definitions. */
const DISAMBIGUATION = /may refer to|can refer to|is the name of|topics referred to|most commonly refers to/i;

/**
 * A search result can be a namesake (an actor, a footballer). A biography in
 * this dictionary should at least mention the field somewhere.
 */
const PLAUSIBLE_BIO =
  /artificial intelligen|computer|comput|machine learn|algorithm|\bdata\b|software|hardware|semiconductor|technolog|robot|neural|language|mathematic|logician|program|cyber|information|statistic|engineer|electronic|\bchip/i;

const CATEGORY_MAP = {
  'Historical pioneer': 'Artificial intelligence',
  'Deep learning pioneer / academic': 'Deep learning',
  'Lab leader / founder / executive': 'Artificial intelligence',
  'Transformer / LLM researcher': 'Large language models',
  'AI engineer / educator / practitioner': 'AI Engineering',
  'AI ethics / safety / critic': 'AI safety',
  'India / testing & QE focus': 'AI Engineering',
};

const TRANSLITERATE = { Ł: 'L', ł: 'l', Ø: 'O', ø: 'o', Đ: 'D', đ: 'd', Þ: 'Th', þ: 'th', ß: 'ss', Æ: 'AE', æ: 'ae', Œ: 'OE', œ: 'oe' };

/** ASCII-friendly form: strips accents and the few letters NFKD leaves alone. */
export function foldAscii(value) {
  return String(value || '')
    .replace(/[ŁłØøĐđÞþßÆæŒœ]/g, (char) => TRANSLITERATE[char] || char)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Merge key for a person's name: accent-free, no parentheticals or quotes,
 * middle initials dropped, tokens sorted. "Diederik P. Kingma" and
 * "Diederik Kingma" collapse to the same key.
 */
export function personKey(name) {
  const value = foldAscii(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/['’]/g, '')
    .toLowerCase();
  const tokens = (value.match(/[a-z0-9]+/g) || []).filter((token) => token.length > 1);
  return [...new Set(tokens)].sort().join(' ');
}

const firstNonEmpty = (...values) => values.map((v) => String(v == null ? '' : v).trim()).find(Boolean) || '';

/** One record from either source shape -> a flat, predictable person. */
export function normalizePerson(record) {
  const name = String((record && record.name) || '').trim();
  if (!name) return null;
  const sourceUrl = firstNonEmpty(record.url, record.website, record.linkedin);
  return {
    name,
    famousFor: firstNonEmpty(record.famous_for, record.known_for, record.role),
    contribution: firstNonEmpty(record.contribution, record.contributions, record.bio, record.details),
    url: sourceUrl,
    category: firstNonEmpty(record.category),
  };
}

/** Read a file that may be an array, { people: [] }, or one record. */
export function readPeopleFile(path) {
  const text = readFileSync(path, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    // AI-generated lists sometimes contain unescaped quotes inside a value
    // ("…image patches ("An Image is Worth 16x16 Words")…"). Retry once with
    // those escaped rather than rejecting the whole file.
    const repaired = text
      .split('\n')
      .map((line) => {
        const match = line.match(/^(\s*"[A-Za-z_]+":\s*")(.*)("[,]?)$/);
        return match ? match[1] + match[2].replace(/(?<!\\)"/g, '\\"') + match[3] : line;
      })
      .join('\n');
    data = JSON.parse(repaired);
    console.warn(`! ${path}: repaired unescaped quotes after ${error.message.split(' at ')[0]}`);
  }
  const rows = Array.isArray(data) ? data : Array.isArray(data.people) ? data.people : [data];
  return rows.map(normalizePerson).filter(Boolean);
}

/**
 * Merge records that name the same person — including a handle that is a
 * subset of the full name ("swyx" inside "Shawn swyx Wang").
 */
export function mergePeople(people) {
  const groups = new Map();
  for (const person of people) {
    const key = personKey(person.name);
    if (!key) continue;
    let target = key;
    for (const existing of groups.keys()) {
      const [small, large] = key.length <= existing.length ? [key, existing] : [existing, key];
      const subset = small.split(' ').every((token) => large.split(' ').includes(token));
      if (subset && (small.split(' ').length > 1 || small.length >= 4)) {
        target = existing;
        break;
      }
    }
    const current = groups.get(target);
    if (!current) {
      groups.set(target, { key: target, names: [person.name], famousFor: '', contribution: '', urls: [], category: '' });
    }
    const group = groups.get(target);
    if (!group.names.includes(person.name)) group.names.push(person.name);
    group.famousFor = group.famousFor || person.famousFor;
    // Sources describe the same work differently; the longest text reads best
    // and avoids "…machine intelligence. Proposed the Turing machine…" run-ons.
    if (person.contribution.length > group.contribution.length) group.contribution = person.contribution;
    if (person.url && !group.urls.includes(person.url)) group.urls.push(person.url);
    group.category = group.category || person.category;
  }
  return [...groups.values()];
}

const ABBREVIATION = /(?:\b(?:Dr|Prof|Mr|Mrs|Ms|St|Jr|Sr|vs|etc|No|e\.g|i\.e|U\.S|U\.K|Ph\.D)|\b[A-Za-z])\.$/;

/** Split prose into sentences, keeping initials ("Daniela L. Rus") intact. */
export function splitSentences(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const out = [];
  let start = 0;
  const boundary = /[.!?](?=\s|$)/g;
  let match;
  while ((match = boundary.exec(value))) {
    const sentence = value.slice(start, match.index + 1);
    if (ABBREVIATION.test(sentence)) continue;
    const next = value.slice(match.index + 1).trimStart()[0] || '';
    if (next && !/[A-Z0-9"“(]/.test(next)) continue;
    out.push(sentence.trim());
    start = match.index + 1;
  }
  const tail = value.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Tidy a Wikipedia plain-text intro for use as dictionary prose. */
export function cleanExtract(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\(\s*;\s*/g, '(')
    .replace(/\(\s*(?:US|UK|GB)?\s*:\s*;\s*/gi, '(')
    // Pronunciation leftovers from explaintext: "( EL-ee-EH-zər …; born …".
    .replace(/\(\s[^();]{0,70};\s*/g, '(')
    .replace(/\(\s*[A-Z][A-Z-]{2,}(?:\s+[\w'’-]+){0,3};\s*/g, '(')
    .replace(/\(\s*\)/g, '')
    .trim();
}

/** Batch Wikipedia intro lookup (≤ 20 titles per request). */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const USER_AGENT = 'TheAIDictionary-import/1.0 (dictionary build script)';
const PACE_MS = 2500;

const cache = existsSync(WIKI_CACHE) ? JSON.parse(readFileSync(WIKI_CACHE, 'utf8')) : { titles: {}, searches: {} };
cache.titles ||= {};
cache.searches ||= {};
const saveCache = () => writeFileSync(WIKI_CACHE, JSON.stringify(cache));

/** One Action API call, paced, honouring Retry-After when throttled. */
async function api(params, { attempts = 5 } = {}) {
  if (OFFLINE) throw new Error('offline');
  const query = new URLSearchParams({ action: 'query', format: 'json', ...params });
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(`${WIKI_API}?${query}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20000),
    }).catch((error) => ({ ok: false, status: 0, error }));
    if (response.ok) {
      await sleep(PACE_MS);
      return response.json();
    }
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15000 * attempt;
    if (attempt === attempts) throw new Error(response.error?.message || `HTTP ${response.status}`);
    await sleep(Math.min(wait, 60000));
  }
  return null;
}

/** Batched intro extracts for article titles (20 per request). */
async function extractsFor(titles) {
  const unique = [...new Set(titles)];
  const out = new Map();
  const pending = [];
  for (const title of unique) {
    const key = personKey(title);
    if (Object.prototype.hasOwnProperty.call(cache.titles, key)) {
      const hit = cache.titles[key];
      // Re-clean cached text so improved cleanup rules apply to old cache entries.
      if (hit) out.set(key, { title: hit.title, extract: cleanExtract(hit.extract) });
    } else {
      pending.push(title);
    }
  }

  for (let i = 0; i < pending.length; i += 20) {
    const batch = pending.slice(i, i + 20);
    const data = await api({
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      exlimit: 'max',
      redirects: '1',
      titles: batch.join('|'),
    });
    const pages = Object.values(data?.query?.pages || {});
    for (const requested of batch) {
      const key = personKey(requested);
      const page = pages.find((p) => personKey(p.title) === key);
      let hit = null;
      if (page && page.missing === undefined && page.extract) {
        const extract = cleanExtract(page.extract);
        if (!DISAMBIGUATION.test(extract.slice(0, 200))) hit = { title: page.title, extract };
      }
      cache.titles[key] = hit;
      if (hit) out.set(key, hit);
    }
    saveCache();
  }
  return out;
}

/**
 * Resolve one name that has no exact article (or only a disambiguation page).
 * The domain hint keeps "John McCarthy" away from the actor and the footballer.
 */
async function searchArticle(name) {
  if (Object.prototype.hasOwnProperty.call(cache.searches, name)) return cache.searches[name];
  const data = await api({
    list: 'search',
    srsearch: `${name} artificial intelligence`,
    srlimit: '5',
    srprop: '',
  });
  const wanted = new Set(personKey(name).split(' '));
  let title = null;
  for (const hit of data?.query?.search || []) {
    const candidate = String(hit.title || '');
    if (!candidate || /\(disambiguation\)/i.test(candidate)) continue;
    const tokens = new Set(personKey(candidate).split(' '));
    if ([...wanted].every((token) => tokens.has(token))) {
      title = candidate;
      break;
    }
  }
  cache.searches[name] = title;
  saveCache();
  return title;
}

/**
 * Wikipedia intro for each name, resolved in two passes: exact titles first,
 * then a search for the ones that only have a disambiguation page ("Nils
 * Nilsson" -> "Nils John Nilsson"). Unresolved names get no wiki entry.
 */
export async function fetchWikipedia(names) {
  const found = new Map(); // original person key -> { title, extract }
  const direct = await extractsFor(names);
  for (const name of names) {
    const hit = direct.get(personKey(name));
    // Same guard as the search pass: reject a namesake from another field.
    if (hit && PLAUSIBLE_BIO.test(hit.extract.slice(0, 400))) found.set(personKey(name), hit);
  }

  const unresolved = names.filter((name) => !found.has(personKey(name)));
  if (unresolved.length && !OFFLINE) {
    console.log(`  resolving ${unresolved.length} names through search…`);
    const chosen = new Map(); // article title -> original key
    for (const name of unresolved) {
      try {
        const title = await searchArticle(name);
        if (title && !chosen.has(title)) chosen.set(title, personKey(name));
      } catch (error) {
        console.warn(`! search failed for ${name} (${error.message})`);
      }
    }
    const second = await extractsFor([...chosen.keys()]);
    for (const [title, key] of chosen) {
      const hit = second.get(personKey(title));
      if (hit && PLAUSIBLE_BIO.test(hit.extract.slice(0, 400))) found.set(key, hit);
    }
  }
  return found;
}

const lowerFirst = (value) => {
  const text = String(value || '').trim().replace(/[.;]+$/, '');
  if (!text) return '';
  const head = text.split(/\s+/)[0];
  // Keep acronyms (CTO, VP, IBM, LLM) and leading digits as written.
  if (/^[A-Z]{2,}/.test(head) || /^[A-Z][a-z]*[A-Z]/.test(head) || /^\d/.test(head)) return text;
  return text[0].toLowerCase() + text.slice(1);
};

/** "an ML author" but "a professor": acronyms are read aloud, so they count as vowels. */
const articleFor = (phrase) => {
  const head = String(phrase || '').trim().split(/\s+/)[0] || '';
  if (/^[A-Z]{2,}/.test(head)) return /^[AEFHILMNORSX]/.test(head) ? 'an' : 'a';
  return /^[aeiou]/i.test(head) ? 'an' : 'a';
};

const VERB_START =
  /^(?:co-?)?(?:authored|wrote|created|built|developed|designed|introduced|proposed|invented|pioneered|founded|led|organi[sz]ed|published|formulated|discovered|coined|won|received|established|trained|launched|made|showed|demonstrated|proved|defined|laid|helped|worked|served|directed|produced|derived|applied|identified)\b/i;

const GERUND_START = /^[A-Z][a-z]+ing\b/;

const ADJECTIVE = '(?:legendary|renowned|veteran|pioneering|distinguished|senior|principal|staff|chief|founding|original|core|lead)';

const DEFINITE_ROLE = new RegExp(
  `^(?:${ADJECTIVE} )?(?:father|mother|co-?founder|founder|creator|co-?creator|inventor|co-?inventor|co-?lead|lead|lead creator|lead developer|principal author|co-?author|author|lead author|first author|maintainer|co-?maintainer|developer|co-?developer|pioneer|co-?pioneer)\\b`,
  'i'
);

const TITLE_ROLE =
  /^(?:ceo|cto|coo|cfo|president|vp|vice president|chairman|chairwoman|chair|executive chairman|director|head|chief|staff|principal|senior)\b/i;

/** Any phrase that ends in a role noun reads as "X is a <phrase>". */
const ENDS_IN_ROLE =
  /\b(?:researcher|scientist|engineer|professor|leader|author|advocate|practitioner|educator|executive|entrepreneur|investor|architect|psychologist|neuropsychologist|neuroscientist|mathematician|linguist|philosopher|economist|physicist|logician|statistician|roboticist|youtuber|podcaster|blogger|writer|journalist|activist|critic|historian|academic|businessman|businesswoman|administrator)$/i;

/** First words we are happy to lowercase mid-sentence; proper nouns stay. */
const LOWERABLE_HEAD = new RegExp(
  `^(?:${ADJECTIVE} |research )?(?:ceo|cto|coo|cfo|president|vp|vice president|chairman|chairwoman|chair|director|head|chief|staff|principal|senior|father|mother|co-?founder|founder|creator|co-?creator|inventor|co-?inventor|co-?lead|lead|developer|co-?developer|pioneer|co-?pioneer|author|co-?author|maintainer|researcher|scientist|engineer|professor|leader|advocate|practitioner|educator|executive|entrepreneur|investor|architect|psychologist|neuropsychologist|neuroscientist|mathematician|linguist|philosopher|economist|physicist|logician|statistician|roboticist|youtuber|podcaster|blogger|writer|journalist|activist|critic|historian|academic|businessman|businesswoman|administrator)\\b`,
  'i'
);

/** "Apache Spark and MLflow creator" -> "is the creator of Apache Spark and MLflow". */
const CREATOR_OF = /^(.+?)\s+(co-?creator|creator|co-?author|author|lead author|maintainer|co-?founder|founder)$/i;

/** "IBM Watson lead" -> "led IBM Watson". */
const LEAD_OF = /^(.+?)\s+(lead)$/i;

/** Definition from the supplied "famous_for", for people Wikipedia does not cover. */
export function composeDefinition(name, famousFor) {
  let phrase = String(famousFor || '')
    .trim()
    .replace(/[.;,\s]+$/, '');
  if (!phrase) return `${name} is an artificial intelligence researcher.`;
  if (VERB_START.test(phrase)) return `${name} ${lowerFirst(phrase)}.`;
  // "Coining the term… and inventing Lisp" needs "is known for", not a subject.
  if (GERUND_START.test(phrase)) return `${name} is known for ${lowerFirst(phrase)}.`;

  const creator = phrase.match(CREATOR_OF);
  // "Lead of the Phi series and 'Sparks of AGI' author" is not "author of Lead…"
  if (creator && !LOWERABLE_HEAD.test(creator[1])) {
    return `${name} is the ${lowerFirst(creator[2])} of ${creator[1]}.`;
  }
  const lead = phrase.match(LEAD_OF);
  if (lead) return `${name} led ${lead[1]}.`;

  if (DEFINITE_ROLE.test(phrase)) {
    // "Lead of X and Y author" reads better as its first clause.
    if (/^lead\b/i.test(phrase) && /\s+and\s+/i.test(phrase)) {
      phrase = phrase.split(/\s+and\s+/)[0].replace(/[,\s]+$/, '');
    }
    return `${name} is the ${lowerFirst(phrase)}.`;
  }
  if (TITLE_ROLE.test(phrase)) return `${name} is ${lowerFirst(phrase)}.`;

  // A phrase that opens or closes with a role noun reads as "X is a/an …".
  if (LOWERABLE_HEAD.test(phrase) || ENDS_IN_ROLE.test(phrase)) {
    const head = LOWERABLE_HEAD.test(phrase) ? lowerFirst(phrase) : phrase;
    return `${name} is ${articleFor(head)} ${head}.`;
  }
  const head = LOWERABLE_HEAD.test(phrase) ? lowerFirst(phrase) : phrase;
  return `${name} is known for ${head}.`;
}

/** Curated profile links from the supplied URLs; Wikipedia belongs in the citation. */
export function profileFromUrls(urls) {
  const links = [];
  const seen = new Set();
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (!url || seen.has(url) || /wikipedia\.org/i.test(url)) continue;
    seen.add(url);
    links.push({ label: /linkedin\.com/i.test(url) ? 'LinkedIn' : 'Website', url });
  }
  return { links, highlights: [] };
}

/** Build the dictionary record for one merged person. */
export function buildEntry(group, wiki) {
  const override = DISPLAY_OVERRIDES[group.key.split(' ')[0]] || DISPLAY_OVERRIDES[group.key];
  const term = override ? override.term : group.names.slice().sort((a, b) => b.length - a.length)[0];
  const slug = slugifyTerm(foldAscii(term));
  const letter = foldAscii(term).trim().charAt(0).toUpperCase();
  const intro = wiki ? splitSentences(wiki.extract) : [];
  const definition = intro.length ? intro[0] : composeDefinition(term, group.famousFor);

  const supplied = group.contribution.trim().replace(/[;,]$/, '');
  const filler = intro.slice(1, 3).join(' ');
  let details = supplied;
  if (supplied.length < 120 && filler) {
    const end = supplied && !/[.!?]$/.test(supplied) ? `${supplied}.` : supplied;
    details = [end, filler].filter(Boolean).join(' ');
  }
  if (!details) details = definition;
  // A few supplied contributions stop mid-sentence; end on the last full one.
  if (details.length > 120 && !/[.!?"')]$/.test(details)) {
    const cut = details.lastIndexOf('. ');
    if (cut > details.length * 0.5) details = details.slice(0, cut + 1);
  }

  const aka = override ? override.aka : group.names.filter((name) => name !== term);
  const profile = profileFromUrls(group.urls);

  const entry = {
    term,
    letter,
    category: CATEGORY_MAP[group.category] || 'Artificial intelligence',
    type: 'person',
  };
  if (aka.length) entry.aka = aka;
  entry.definition = definition;
  entry.details = details;
  if (profile.links.length) entry.profile = profile;
  if (wiki) {
    entry.citation = {
      title: wiki.title,
      authors: ['Wikipedia Contributors'],
      year: Number(new Date().toISOString().slice(0, 4)),
      venue: 'Wikipedia, The Free Encyclopedia',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.title.replace(/ /g, '_'))}`,
    };
  }
  entry.slug = slug;
  entry.addedAt = new Date().toISOString().slice(0, 10);
  return entry;
}

async function main() {
  if (!FILES.length) {
    console.error('usage: node scripts/import-people.mjs <file.json> [more.json …] [--dry-run] [--no-wiki]');
    process.exit(1);
  }

  const people = FILES.flatMap((file) => {
    if (!existsSync(file)) throw new Error(`no such file: ${file}`);
    return readPeopleFile(file);
  });
  const groups = mergePeople(people);

  // Existing dictionary entries, by person key over term + aliases.
  const known = new Set();
  for (const folder of readdirSync(DICT)) {
    if (!/^[a-z]-[a-z]$/.test(folder)) continue;
    for (const file of readdirSync(join(DICT, folder)).filter((f) => f.endsWith('.json'))) {
      const raw = JSON.parse(readFileSync(join(DICT, folder, file), 'utf8'));
      known.add(personKey(raw.term || ''));
      for (const alias of raw.aka || []) known.add(personKey(alias));
    }
  }

  const fresh = groups.filter((group) => !known.has(group.key));
  const skipped = groups.length - fresh.length;
  console.log(`records: ${people.length} | people: ${groups.length} | already in dictionary: ${skipped} | new: ${fresh.length}`);

  let wiki = new Map();
  if (!NO_WIKI && fresh.length) {
    const lookup = fresh.map((group) => {
      const override = DISPLAY_OVERRIDES[group.key.split(' ')[0]];
      return override ? override.term.replace(/\s*\(.*$/, '') : group.names.slice().sort((a, b) => b.length - a.length)[0];
    });
    wiki = await fetchWikipedia(lookup);
    console.log(`  wikipedia matches: ${wiki.size}/${fresh.length}`);
  }

  const created = [];
  const problems = [];
  const usedSlugs = new Map();
  for (const group of fresh) {
    const entry = buildEntry(group, wiki.get(group.key));
    const folder = rangeFolderForLetter(entry.letter);
    if (!folder) {
      problems.push(`${entry.term}: no letter range for “${entry.letter}”`);
      continue;
    }
    if (usedSlugs.has(entry.slug)) {
      problems.push(`${entry.term}: slug “${entry.slug}” already used by ${usedSlugs.get(entry.slug)}`);
      continue;
    }
    usedSlugs.set(entry.slug, entry.term);
    const target = join(DICT, folder, `${entry.slug}.json`);
    if (existsSync(target)) {
      problems.push(`${entry.term}: ${target} already exists`);
      continue;
    }
    const issues = validateTerm(normalizeTerm(entry), {
      raw: entry,
      folder,
      filename: `${entry.slug}.json`,
    }).filter((issue) => issue.level === 'error');
    if (issues.length) {
      problems.push(`${entry.term}: ${issues.map((issue) => issue.code).join(', ')}`);
      continue;
    }
    created.push({ entry, target });
  }

  for (const { entry, target } of created) {
    if (!DRY_RUN) writeFileSync(target, `${JSON.stringify(entry, null, 2)}\n`);
  }

  console.log(`${DRY_RUN ? 'would create' : 'created'}: ${created.length}`);
  if (!DRY_RUN) {
    const byType = created.reduce((acc, { entry }) => {
      const key = entry.citation ? 'with Wikipedia citation' : 'no Wikipedia citation';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    console.log(Object.entries(byType).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  }
  if (problems.length) {
    console.log(`problems: ${problems.length}`);
    for (const line of problems.slice(0, 25)) console.log(`  ${line}`);
  }
  if (DRY_RUN) {
    for (const { entry } of created.slice(0, 8)) {
      console.log(`\n--- ${entry.term} (${entry.letter}, ${entry.citation ? 'wiki' : 'no wiki'}) ---`);
      console.log(JSON.stringify(entry, null, 2));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
