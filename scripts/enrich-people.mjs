// -----------------------------------------------------------------------------
//  People enricher — gives every person entry a real "Their work" page.
//
//  Run:  node scripts/enrich-people.mjs                 (all people)
//        node scripts/enrich-people.mjs --only ian-goodfellow,caroline-uhler
//        node scripts/enrich-people.mjs --dry-run       (print, write nothing)
//
//  No LLM: every fact comes from the person's English Wikipedia article (the
//  intro and its "Career" / "Research" sections) and their Wikidata item
//  (education, employers, awards, notable works, links, portrait). Responses
//  are cached under data/people/ (gitignored) so re-runs are free.
//
//  It also repairs page one: definitions cut at an initial ("Ian J.") are
//  re-split, and thin details are topped up from the Wikipedia intro.
// -----------------------------------------------------------------------------

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleanExtract, splitSentences } from './import-people.mjs';
import { imageCredit } from './wikipedia.mjs';
import { explainerSections, normalizeExplainer } from '../src/explainer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT = join(ROOT, 'dictionary');
const CACHE = join(ROOT, 'data', 'people');
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const USER_AGENT = 'TheAIDictionary/1.0 (https://theaidictionary.com; people enricher)';

// --- pure helpers (tested) ---------------------------------------------------

/** `{ intro, sections: [{ heading, text }] }` from a plain-text Wikipedia extract. */
export function parseSections(extract) {
  const parts = String(extract || '').split(/\n+={2,}\s*([^=\n]+?)\s*={2,}\n+/);
  const sections = [];
  for (let i = 1; i < parts.length; i += 2) sections.push({ heading: parts[i].trim(), text: (parts[i + 1] || '').trim() });
  return { intro: (parts[0] || '').trim(), sections };
}

const SKIP_SECTION = /^(?:see also|references|external links|further reading|notes|bibliography|selected (?:publications|works|bibliography)|publications|works|books|filmography|personal life|awards(?: and honou?rs)?|honou?rs(?: and awards)?)$/i;
const WORK_SECTION = /career|research|work|contribution|achievement|invent|scien|academ|education|biography|life|business|founding|professional|legacy|impact|startup|company/i;
const CONTRIBUTION = /\b(?:invent(?:ed|or)|introduc(?:ed|ing)|propos(?:ed|ing)|develop(?:ed|ing)|co-?invent|pioneer(?:ed|ing)?|creat(?:ed|or)|co-?creat|found(?:ed|er)|co-?found|design(?:ed)?|led|leads|built|wrote|co-?wrote|author(?:ed)?|co-?author|discover(?:ed)?|known for|contribut(?:ed|ions?)|first to)\b/i;
const YEAR = /\b(1[89]\d\d|20\d\d)\b/;

export const tidy = (sentence) =>
  cleanExtract(sentence)
    .replace(/\s*\[\d+\]/g, '')
    .replace(/\s*\(?\bhttps?:\/\/[^\s)]+\)?/g, '')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
const words = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3);

/** True when most of a sentence's words already appear in the given text. */
export function alreadySaid(sentence, text) {
  const pool = new Set(words(text));
  const own = words(sentence);
  if (!own.length) return true;
  return own.filter((w) => pool.has(w)).length / own.length > 0.7;
}

/** Re-split a definition that was cut at an initial ("Ian J." + "Goodfellow (born 1987) is …"). */
export function repairLead(definition, details) {
  const def = String(definition || '').trim();
  const rest = String(details || '').trim();
  const joined = `${def} ${rest}`.trim();
  const [first, ...others] = splitSentences(joined);
  if (!first || first === def || first.length <= def.length || !joined.startsWith(first)) return null;
  return { definition: first, details: others.join(' ') || rest };
}

const year = (time) => {
  const match = String(time || '').match(/^[+-]?(\d{4})/);
  return match ? match[1] : '';
};

const article = (description) => (/^[aeiou]/i.test(description) ? 'an' : 'a');

/** Claims of an entity for a property, as `{ id, value, start, end, point, of }`. */
export function claimValues(entity, property) {
  return ((entity && entity.claims && entity.claims[property]) || [])
    .filter((claim) => claim.rank !== 'deprecated' && claim.mainsnak && claim.mainsnak.datavalue)
    .map((claim) => {
      const value = claim.mainsnak.datavalue.value;
      const qual = (p) => {
        const snak = ((claim.qualifiers || {})[p] || [])[0];
        return snak && snak.datavalue ? snak.datavalue.value : null;
      };
      return {
        id: value && value.id ? value.id : '',
        value: typeof value === 'string' ? value : value && value.time ? value.time : '',
        start: year(qual('P580') && qual('P580').time),
        end: year(qual('P582') && qual('P582').time),
        point: year(qual('P585') && qual('P585').time),
        degree: qual('P512') && qual('P512').id ? qual('P512').id : '',
        position: qual('P794') && qual('P794').id ? qual('P794').id : qual('P39') && qual('P39').id ? qual('P39').id : '',
      };
    });
}

const upperFirst = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const withThe = (place) => (/^(?:United |Netherlands|Philippines|Czech Republic|Soviet Union|Bahamas|Gambia|Republic of|People's Republic)/.test(place) ? `the ${place}` : place);
const unique = (list) => [...new Set(list.filter(Boolean))];
const joinNames = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
const lowerFirst = (value) => (/^[A-Z][a-z]/.test(value) && !/^[A-Z][a-z]+[A-Z]/.test(value) ? value[0].toLowerCase() + value.slice(1) : value);

/**
 * The "Their work" explainer for a person, from their Wikipedia article and
 * Wikidata item. `label(id)` resolves Wikidata ids to English names.
 */
export function buildPersonExplainer({ entry, wiki, entity, label }) {
  const pageOne = `${entry.definition} ${entry.details}`;
  const surname = String(entry.term).replace(/\s*\(.*\)$/, '').split(/\s+/).pop();
  const aboutThem = (s) => /^(?:He|She|They|His|Her|Their)\b/.test(s) || s.includes(surname);
  const { intro, sections } = parseSections(wiki && wiki.extract);
  const description = (wiki && wiki.description) || (entity && entity.descriptions && entity.descriptions.en && entity.descriptions.en.value) || '';
  const name = (L) => (L ? label(L) : '');
  const fields = unique(claimValues(entity, 'P101').map((c) => name(c.id))).slice(0, 4);
  const notable = unique(claimValues(entity, 'P800').map((c) => name(c.id))).slice(0, 6);
  const verb = entry.deceased || claimValues(entity, 'P570').length ? 'was' : 'is';

  const leadParts = [];
  if (description) leadParts.push(`${entry.term} ${verb} ${article(description)} ${description.replace(/\.$/, '')}.`);
  const sex = (claimValues(entity, 'P21')[0] || {}).id;
  const their = sex === 'Q6581097' ? 'His' : sex === 'Q6581072' ? 'Her' : 'Their';
  if (fields.length) leadParts.push(`${their} work spans ${joinNames(fields.map(lowerFirst))}.`);
  const out = { lead: leadParts.join(' ') };

  // Sentences from the body of the article, in order, that page one does not already say.
  const body = sections
    .filter((s) => !SKIP_SECTION.test(s.heading) && WORK_SECTION.test(s.heading))
    .flatMap((s) => splitSentences(s.text).map(tidy))
    .filter((s) => s.length >= 40 && s.length <= 320 && !alreadySaid(s, pageOne));
  const introExtra = splitSentences(intro).map(tidy).filter((s) => s.length >= 40 && !alreadySaid(s, pageOne));

  const knownSentence = [...introExtra, ...body].find((s) => /\b(?:known|famous|noted|recogni[sz]ed|celebrated) (?:for|as)\b/i.test(s));
  if (knownSentence) out.knownFor = knownSentence;
  else if (notable.length) out.knownFor = `Notable works include ${joinNames(notable)}.`;

  const used = new Set([out.knownFor]);
  const contributions = [...introExtra, ...body].filter((s) => CONTRIBUTION.test(s) && aboutThem(s) && !used.has(s)).slice(0, 5);
  contributions.forEach((s) => used.add(s));
  if (contributions.length) out.contributions = contributions.map((s) => ({ name: s, detail: '' }));

  // Timeline: dated Wikidata facts first, then dated sentences from the article.
  const events = [];
  const born = year((claimValues(entity, 'P569')[0] || {}).value);
  const place = name((claimValues(entity, 'P19')[0] || {}).id);
  // Wikidata birth years are sometimes wrong; keep one only when Wikipedia agrees.
  if (born && `${pageOne} ${intro}`.includes(born)) events.push({ when: born, what: place ? `Born in ${withThe(place)}` : 'Born' });
  for (const c of claimValues(entity, 'P69')) {
    const when = c.end || c.start;
    if (!when || !name(c.id)) continue;
    events.push({ when, what: c.degree && name(c.degree) ? `${name(c.degree)}, ${name(c.id)}` : `Studies at ${name(c.id)}` });
  }
  const employers = new Set();
  for (const c of claimValues(entity, 'P108').sort((a, b) => Number(a.start || 9999) - Number(b.start || 9999))) {
    if (!c.start || !name(c.id) || employers.has(c.id)) continue;
    employers.add(c.id);
    const role = c.position && name(c.position) ? `${upperFirst(name(c.position))} at ` : 'Joins ';
    events.push({ when: c.start, what: `${role}${name(c.id)}${c.end && c.end !== c.start ? ` (until ${c.end})` : ''}` });
  }
  for (const c of claimValues(entity, 'P166')) {
    if (!c.point || !name(c.id)) continue;
    const award = name(c.id);
    events.push({ when: c.point, what: /\b(?:fellow|member)\b/i.test(award) ? `Named ${award}` : `Receives the ${award.replace(/^the\s+/i, '')}` });
  }
  const died = year((claimValues(entity, 'P570')[0] || {}).value);
  if (died) events.push({ when: died, what: 'Dies' });
  if (events.length < 4) {
    for (const s of [...body, ...introExtra]) {
      if (events.length >= 6) break;
      const m = s.match(YEAR);
      if (m && aboutThem(s) && !used.has(s)) {
        events.push({ when: m[1], what: s });
        used.add(s);
      }
    }
  }
  const seen = new Set();
  const timeline = events
    .filter((e) => (seen.has(`${e.when}|${e.what}`) ? false : seen.add(`${e.when}|${e.what}`)))
    .sort((a, b) => Number(a.when) - Number(b.when));
  if (timeline.length) out.timeline = timeline.length > 10 ? [timeline[0], ...timeline.slice(1).slice(-9)] : timeline;

  if (notable.length && !String(out.knownFor || '').startsWith('Notable works')) out.keyWorks = notable.map((title) => ({ title, year: '', url: '' }));

  const affiliations = unique([...claimValues(entity, 'P108').map((c) => name(c.id)), ...claimValues(entity, 'P69').map((c) => name(c.id))])
    .filter((n) => !/high school|secondary school|grammar school|gymnasium|lyc[eé]e|middle school|primary school|talented youth/i.test(n))
    .slice(0, 8);
  if (affiliations.length) out.affiliations = affiliations;

  if (!out.lead) {
    const first = out.knownFor || (contributions[0] || '');
    if (!first) return null;
    out.lead = `${entry.definition}`;
  }

  const sources = [];
  if (wiki && wiki.url) sources.push({ title: `Wikipedia: ${wiki.title}`, url: wiki.url });
  if (entity && entity.id) sources.push({ title: `Wikidata: ${entity.id}`, url: `https://www.wikidata.org/wiki/${entity.id}` });
  if (sources.length) out.sources = sources;
  return out;
}

/** An explainer worth a page: a lead plus two filled sections, or a real timeline. */
// Hand-researched explainers cite sources beyond Wikipedia/Wikidata; never regenerate them.
export function isCurated(explainer) {
  return Boolean(explainer) && (explainer.sources || []).some((source) => !/(^|\.)(wikipedia|wikidata)\.org$/.test(hostOf(source.url)));
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

export function isUseful(explainer) {
  const sections = explainerSections(normalizeExplainer(explainer, 'person'));
  return sections.length >= 1 && Boolean(explainer.lead);
}

/** Profile links Wikidata knows about that the entry does not have yet. */
export function extraLinks(entity, existing = []) {
  const have = new Set(existing.map((l) => l.url));
  const first = (p) => (claimValues(entity, p)[0] || {}).value;
  const links = [];
  const add = (label, url) => url && !have.has(url) && !existing.some((l) => l.label === label) && links.push({ label, url });
  const site = first('P856');
  if (site && /^https?:\/\//.test(site)) add('Website', site);
  if (first('P1960')) add('Google Scholar', `https://scholar.google.com/citations?user=${first('P1960')}`);
  if (first('P2037')) add('GitHub', `https://github.com/${first('P2037')}`);
  if (first('P2002')) add('X', `https://x.com/${first('P2002')}`);
  return links;
}

// --- network -----------------------------------------------------------------

async function getJson(base, params) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${base}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (response.ok) return response.json();
    if (attempt >= 4) throw new Error(`${response.status} for ${base}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

const isHuman = (entity) => claimValues(entity, 'P31').some((c) => c.id === 'Q5');

function cached(name, make) {
  const path = join(CACHE, `${name}.json`);
  if (existsSync(path)) return Promise.resolve(JSON.parse(readFileSync(path, 'utf8')));
  return make().then((value) => {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(path, JSON.stringify(value));
    return value;
  });
}

async function wikiPage(title) {
  const data = await getJson(WIKI_API, {
    action: 'query', prop: 'extracts|pageprops|pageimages|description', explaintext: '1', piprop: 'name', redirects: '1', titles: title,
  });
  const page = Object.values((data.query && data.query.pages) || {})[0];
  if (!page || page.missing !== undefined || !page.extract) return null;
  if (page.pageprops && page.pageprops.disambiguation !== undefined) return null;
  return {
    title: page.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    description: page.description || '',
    extract: page.extract,
    pageimage: page.pageimage || '',
    qid: (page.pageprops && page.pageprops.wikibase_item) || '',
  };
}

async function entities(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const data = await getJson(WIKIDATA_API, { action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'claims|descriptions|labels', languages: 'en' });
    Object.assign(out, data.entities || {});
  }
  return out;
}

async function labels(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const data = await getJson(WIKIDATA_API, { action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'labels', languages: 'en' });
    for (const [id, e] of Object.entries(data.entities || {})) if (e.labels && e.labels.en) out[id] = e.labels.en.value;
  }
  return out;
}

/** Wikipedia page + Wikidata QID for a person, verified to be a human. */
async function lookup(entry) {
  return cached(`wiki-${entry.slug}`, async () => {
    const cited = String((entry.citation && entry.citation.url) || '').match(/wikipedia\.org\/wiki\/([^?#]+)/);
    const title = cited ? decodeURIComponent(cited[1]).replace(/_/g, ' ') : entry.term;
    const page = await wikiPage(title).catch(() => null);
    if (page && page.qid) {
      if (cited) return { page, qid: page.qid };
      const [entity] = Object.values(await entities([page.qid]));
      if (isHuman(entity)) return { page, qid: page.qid };
    }
    // No (human) enwiki article: try Wikidata directly by name.
    const found = await getJson(WIKIDATA_API, { action: 'wbsearchentities', search: entry.term, language: 'en', type: 'item', limit: '5' });
    const candidates = (found.search || []).filter((s) => /scien|research|engineer|entrepreneur|professor|statistic|mathematic|founder|executive|artificial|machine learning|developer|programmer|author|investor|computer/i.test(s.description || ''));
    if (!candidates.length) return { page: null, qid: '' };
    const map = await entities(candidates.map((c) => c.id));
    const human = candidates.find((c) => isHuman(map[c.id]));
    return { page: null, qid: human ? human.id : '' };
  });
}

// --- main --------------------------------------------------------------------

function loadPeople(only) {
  const out = [];
  for (const folder of readdirSync(DICT).sort()) {
    if (!/^[a-z]-[a-z]$/.test(folder)) continue;
    for (const file of readdirSync(join(DICT, folder)).sort()) {
      if (!file.endsWith('.json')) continue;
      const path = join(DICT, folder, file);
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      const slug = raw.slug || file.replace(/\.json$/, '');
      if (raw.type !== 'person' || (only.size && !only.has(slug))) continue;
      out.push({ path, raw: { ...raw, slug } });
    }
  }
  return out;
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => { while (queue.length) await fn(queue.shift()); }));
}

/** Insert `explainer` after `details`, keeping key order stable. */
function withExplainer(raw, explainer) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'explainer') continue;
    out[key] = value;
    if (key === 'details') out.explainer = explainer;
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? '' : args[i + 1] || ''; };
  const only = new Set(opt('only').split(',').map((s) => s.trim()).filter(Boolean));
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const people = loadPeople(only);
  console.log(`${people.length} people`);

  const found = new Map();
  let done = 0;
  await pool(people, 4, async ({ raw }) => {
    found.set(raw.slug, await lookup(raw).catch((e) => ({ page: null, qid: '', error: e.message })));
    if (++done % 100 === 0) console.log(`  looked up ${done}`);
  });

  const qids = unique([...found.values()].map((f) => f.qid));
  const ents = await cached(`entities-${qids.length}-${qids[0] || 'none'}`, () => entities(qids));
  const refIds = unique(Object.values(ents).flatMap((e) => Object.values(e.claims || {}).flat().flatMap((c) => [
    c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id,
    ...Object.values(c.qualifiers || {}).flat().map((q) => q.datavalue && q.datavalue.value && q.datavalue.value.id),
  ])).filter((id) => /^Q\d+$/.test(String(id))));
  const names = await cached(`labels-${refIds.length}`, () => labels(refIds));
  const label = (id) => names[id] || '';

  const stats = { repaired: 0, toppedUp: 0, explainers: 0, images: 0, links: 0, skipped: [] };
  await pool(people, 4, async ({ path, raw }) => {
    const { page, qid } = found.get(raw.slug) || {};
    const entity = qid ? ents[qid] : null;
    let record = { ...raw };

    const repaired = repairLead(record.definition, record.details);
    if (repaired) { Object.assign(record, repaired); stats.repaired++; }

    if (page && (record.details || '').length < 260) {
      const intro = splitSentences(parseSections(page.extract).intro).map(tidy);
      const extra = intro.filter((s) => s.length >= 30 && !alreadySaid(s, `${record.definition} ${record.details}`));
      let details = record.details || '';
      for (const s of extra) { if (details.length > 520) break; details = `${details} ${s}`.trim(); }
      if (details !== record.details) { record.details = details; stats.toppedUp++; }
    }

    if (entity) {
      const links = extraLinks(entity, (record.profile && record.profile.links) || []);
      if (links.length) {
        record.profile = { links: [...((record.profile && record.profile.links) || []), ...links], highlights: (record.profile && record.profile.highlights) || [] };
        stats.links++;
      }
    }

    if (isCurated(record.explainer)) { if (!dryRun) writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`); return; }
    if (record.explainer && !force) { if (!dryRun) writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`); return; }
    const wiki = page ? { ...page } : null;
    const explainer = page || entity ? buildPersonExplainer({ entry: record, wiki, entity, label }) : null;
    if (isUseful(explainer)) {
      const file = page && page.pageimage && !/logo|icon|flag|signature/i.test(page.pageimage)
        ? `File:${page.pageimage}`
        : (claimValues(entity, 'P18')[0] || {}).value ? `File:${claimValues(entity, 'P18')[0].value}` : '';
      if (file) {
        const image = await cached(`img-${raw.slug}`, () => imageCredit(file).catch(() => null));
        if (image) { explainer.image = { ...image, alt: `${record.term}` }; stats.images++; }
      }
      record = withExplainer(record, explainer);
      stats.explainers++;
    } else {
      stats.skipped.push(raw.slug);
    }
    if (dryRun) console.log(JSON.stringify(record, null, 2));
    else writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  });

  console.log(`repaired leads: ${stats.repaired}, details topped up: ${stats.toppedUp}, explainers: ${stats.explainers}, images: ${stats.images}, link sets: ${stats.links}`);
  if (stats.skipped.length) console.log(`no explainer (${stats.skipped.length}): ${stats.skipped.join(' ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
