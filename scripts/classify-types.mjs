// -----------------------------------------------------------------------------
//  Type classifier — writes an entity `type` onto every dictionary entry.
//
//  Run:  node scripts/classify-types.mjs            (write types, keep hand-set ones)
//        node scripts/classify-types.mjs --force    (re-evaluate every entry)
//        node scripts/classify-types.mjs --dry-run  (report only)
//        node scripts/classify-types.mjs --dry-run --samples
//        node scripts/classify-types.mjs --refine   (sort concepts into architecture,
//                                                    algorithm, model, metric …)
//
//  `category` says which topic an entry belongs to; `type` says what kind of
//  thing it is, and the reader shows a story, a profile or coverage accordingly
//  (see `entryPresentation` in src/term-schema.js).
//
//  Most entries are concepts, which is also the default when nothing matches.
//  Only person, organization, event, venue and policy are detected here —
//  classification leans on how a definition opens ("… (born 1965) is a
//  Canadian computer scientist", "… is an American research institute", "On
//  November 17, 2023, …"), because that reads far more reliably than a keyword
//  sweep over the whole entry. Anything it is unsure about stays a concept,
//  which preserves today's story-driven reading.
//
//  Person and event entries lose their generated `story`: the vignette template
//  ("a small key that opens a bigger door … and that idea is Sam Altman") reads
//  as nonsense for anything that is not a concept. Their profile/coverage
//  spreads replace it.
// -----------------------------------------------------------------------------

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { entryPresentation, normalizeTermType } from '../src/term-schema.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT = join(ROOT, 'dictionary');

const DRY_RUN = process.argv.includes('--dry-run');
const SAMPLES = process.argv.includes('--samples');
// By default a type that was set by hand (or by an import) is left alone.
const FORCE = process.argv.includes('--force');
// Re-sort entries typed "concept" into the finer kinds (see `refineConcept`).
const REFINE = process.argv.includes('--refine');

// ------------------------------------------------------------------ patterns --
const NATIONALITY =
  '(?:American|British|Canadian|French|German|Indian|Chinese|Israeli|Russian|Japanese|Australian|Italian|Spanish|Dutch|Swiss|Austrian|Polish|Brazilian|Iranian|Korean|Swedish|Danish|Finnish|Norwegian|Greek|Turkish|Egyptian|Nigerian|Kenyan|Ghanaian|Singaporean|Irish|Scottish|Welsh|Hungarian|Czech|Romanian|Belgian|Portuguese|Mexican|Argentine|Argentinian|Ukrainian|Bulgarian|Croatian|Serbian|Slovak|Slovenian|Lithuanian|Latvian|Estonian|Icelandic|New Zealand|South African|Pakistani|Bangladeshi|Sri Lankan|Vietnamese|Thai|Indonesian|Malaysian|Filipino|Taiwanese|Hong Kong|Iraqi|Lebanese|Jordanian|Saudi|Emirati|Qatari|Kuwaiti|Syrian|Afghan|Armenian|Georgian|Azerbaijani|Uzbek|Kazakh|Nepali|Burmese|Cambodian|Mongolian|Colombian|Chilean|Peruvian|Venezuelan|Cuban|Jamaican|Moroccan|Tunisian|Algerian|Ethiopian|Ugandan|Tanzanian|Zimbabwean|Senegalese)';

const OCCUPATION =
  '(?:computer scientist|data scientist|research scientist|scientist|researcher|professor|engineer|entrepreneur|businessman|businesswoman|business magnate|investor|venture capitalist|executive|chief executive|author|writer|co-author|mathematician|linguist|academic|scholar|inventor|physicist|psychologist|philosopher|economist|journalist|technologist|physician|chemist|biologist|neuroscientist|roboticist|historian|educator|anthropologist|sociologist|statistician|activist|politician|attorney|lawyer|consultant|analyst|designer|artist|musician|composer|film director|director|producer|pilot|translator|poet|editor|columnist|broadcaster|presenter|diplomat|official|founder|co-founder|cofounder|developer|programmer|architect|industrialist|philanthropist|teacher|lecturer)';

const ORG_NOUN =
  '(?:research (?:institute|institution|organization|organisation|lab|laboratory|group|center|centre|company|foundation)|software company|technology company|tech company|artificial intelligence company|AI company|computer company|robotics company|internet company|startup|spin-?off|subsidiary|non-?profit(?: organization)?|charitable organization|trade association|standards (?:body|organization)|think tank|advocacy group|publisher|consortium|coalition|alliance|association|society|institute|institution|laboratory|company|organisation|organization|foundation|agency|firm|group(?! of)|venture|studio|bank|autonomous body|statutory body|government body)';

const EVENT_NOUN =
  '(?:conference|summit|symposium|workshop|forum|convention|hackathon|olympiad|competition|contest|challenge|incident|scandal|controversy|lawsuit|ban|freeze|moratorium|referendum|protest|strike|boycott|crisis|breach|leak|outage|shutdown|removal|resignation|reinstatement|declaration|memorandum)';

const AWARD_NOUN = '(?:award|prize|medal|fellowship)';

/** Openings that describe a work or an occasion, so the byline is not the subject. */
const NOT_A_PERSON =
  /\bis (?:an?|the) (?:[\w'’-]+ ){0,4}(?:song|album|single|novel|book|short story|story|essay|article|blog ?post|film|movie|documentary|artwork|painting|sculpture|series|poem|play|musical|opera|video|game|website|paper|report|document|memoir|biography|autobiography|society|conference|symposium|workshop|forum|journal|magazine|newspaper)\b/i;

/** Openings that describe something other than an event, whatever its name. */
const NOT_AN_EVENT =
  /\bis (?:an?|the) (?:benchmark|test|testbed|game|simulation|dataset|framework|library|toolkit|algorithm|technique|method|process|report|paper|book|article|essay|document|survey|organization|organisation|company|institute|university|journal|law|regulation|project|platform|system|software)\b/i;

const PERSON_NAME = /^(?:[A-Z][\p{L}'’.-]*|[A-Z]\.)(?:\s+(?:[A-Z][\p{L}'’.-]*|[A-Z]\.)){1,3}$/u;

/** Words that mark a term as a concept even when it reads like a proper noun. */
const CONCEPT_TERM =
  /\b(?:learning|model|models|modelling|modeling|network|networks|neural|algorithm|algorithms|method|methods|methodology|technique|techniques|approach|framework|architecture|architectures|layer|layers|function|functions|loss|gradient|optimization|optimisation|training|inference|embedding|embeddings|token|tokens|tokenization|dataset|datasets|corpus|corpora|benchmark|benchmarks|metric|metrics|evaluation|search|tree|graph|clustering|classification|regression|agent|agents|prompt|prompting|retrieval|vector|tensor|entropy|bayes|bayesian|markov|matrix|matrices|statistics|statistical|probability|distribution|theory|theorem|lemma|principle|paradigm|process|processing|system|systems|pipeline|protocol|api|sdk|library|toolkit|engine|platform|service|mechanism|analysis|estimation|detection|recognition|generation|translation|summarization|segmentation|reasoning|alignment|safety|ethics|bias|privacy|security|governance|regulation|law|laws|policy|policies|supervised|unsupervised|reinforcement|transfer|federated|quantization|distillation|pruning|regularization|normalization|attention|transformer|transformers|diffusion|autoencoder|gan|rnn|cnn|lstm|gpt|llm|llms|vision|speech|language|text|data|knowledge|logic|semantics|syntax|grammar|database|query|index|moe|rag|scaling|fine-tuning|finetuning|pretraining|pre-training)\b/i;

const term_is_concept = (term) => CONCEPT_TERM.test(term);

/** True for terms that name an organization regardless of the definition. */
const ORG_SUFFIX =
  /(?:,?\s+(?:Inc|Inc\.|Corp|Corp\.|Ltd|Ltd\.|LLC|GmbH|AG|SA|PLC|Co\.|Company))$|\b(?:Institute|University|Laboratory|Labs|Lab|Foundation|Consortium|Alliance|Association|Society|Council|Committee|Ministry|Corporation|Startup|Initiative|Project|Network|Group|Center|Centre|College|School|Agency)\b/;

const firstSentence = (text) => {
  const value = String(text || '').trim();
  if (!value) return '';
  const match = value.match(/^.*?[.!?](?:\s|$)/);
  return (match ? match[0] : value).trim();
};

/** "Stephen Robertson (computer scientist)" -> "Stephen Robertson". */
const bareName = (term) => String(term || '').replace(/\s*\((?:[^()]*)\)\s*$/, '').trim();

const hasBirth = (text) =>
  /\(\s*(?:[^()]{0,90}?;\s*)?born\b|\bborn (?:on )?(?:\w+ \d{1,2},? )?\d{4}\b/i.test(text);

const looksLikePerson = (record) => {
  const term = String(record.term || '').trim();
  const definition = String(record.definition || '');
  const details = String(record.details || '');
  const opening = firstSentence(definition);

  if (hasBirth(definition) || hasBirth(details.slice(0, 400))) return 'born';
  if (NOT_A_PERSON.test(opening)) return null;
  if (!PERSON_NAME.test(bareName(term))) return null;
  if (new RegExp(`\\b(?:is|was) an? (?:${NATIONALITY} )?(?:[A-Z][\\w-]* )?(?:${OCCUPATION})\\b`, 'i').test(opening)) {
    return 'occupation';
  }
  if (
    new RegExp(`\\b(?:${OCCUPATION})\\b`, 'i').test(`${opening} ${details.slice(0, 300)}`) &&
    /\b(?:he|she|his|her|him)\b/i.test(details)
  ) {
    return 'occupation-pronoun';
  }
  return null;
};

/** Organization words that outweigh a concept-sounding name like "… Institute of Language Engineering". */
const STRONG_ORG_TERM =
  /\b(?:Institute|University|Laboratory|Labs|College|School|Foundation|Corporation|Incorporated|Consortium|Association|Society|Council|Ministry|Agency|Center|Centre|Company|Inc\.|Corp\.|Ltd\.|LLC|GmbH)\b/;

const looksLikeOrganization = (record) => {
  const term = String(record.term || '').trim();
  const opening = firstSentence(record.definition);
  // A definition that says "… is an American research institute" is decisive;
  // only the name-based rule needs protection from concept-sounding names.
  if (new RegExp(`\\b(?:is|was) (?:an? |the )?(?:${NATIONALITY} )?(?:${ORG_NOUN})\\b`, 'i').test(opening)) {
    // "Labeled data is a group of samples" is not an organization, but
    // "… Institute of Language Engineering" still is one.
    if (!term_is_concept(term) || STRONG_ORG_TERM.test(term)) return 'org-noun';
  }
  if (term_is_concept(term) && !STRONG_ORG_TERM.test(term)) return null;
  if (
    ORG_SUFFIX.test(term) &&
    /\b(?:founded|co-founded|headquartered|acquired|company|corporation|subsidiary|non-?profit|research (?:lab|laboratory|institute))\b/i.test(
      `${opening} ${record.details || ''}`
    )
  ) {
    return 'org-term';
  }
  return null;
};

const looksLikeVenue = (record) => {
  const term = String(record.term || '').trim();
  const opening = firstSentence(record.definition);
  if (/\(\s*journal\s*\)/i.test(term)) return 'journal-term';
  if (/\b(?:peer-reviewed|academic|scientific|open access)\b[^.]{0,60}\bjournal\b/i.test(opening)) return 'journal-noun';
  if (/\bjournal\b/i.test(term) && !term_is_concept(term)) return 'journal-term';
  return null;
};

const LEGAL_TERM = /\b(?:Act|Bill|Regulation|Directive|Order|Law|Policy|Memorandum|Declaration|Convention|Treaty|Agreement|Compact|Statute)\b/;

const looksLikePolicy = (record) => {
  const term = String(record.term || '').trim();
  const opening = firstSentence(record.definition);
  if (!LEGAL_TERM.test(term)) return null;
  if (/\b(?:empirical|scientific|scaling) (?:law|relationship)\b|\blaw (?:of|which|that) (?:describes|relates|states)\b/i.test(opening)) {
    return null;
  }
  return new RegExp(
    '\\b(?:is|was|are) (?:an? |the )?(?:European Union|EU|US|U\\.S\\.|state|federal|proposed|draft|national)?[^.]{0,40}?\\b(?:regulation|legislation|law|statute|act|bill|directive|legal framework|executive order|policy|declaration|memorandum|treaty|convention|agreement)\\b',
    'i'
  ).test(opening)
    ? 'policy-noun'
    : null;
};

const looksLikeAward = (record) => {
  const term = String(record.term || '').trim();
  if (!new RegExp(`\\b${AWARD_NOUN}\\b`, 'i').test(term)) return null;
  const text = `${firstSentence(record.definition)} ${String(record.details || '').slice(0, 200)}`;
  return /\b(?:award|awarded|prize|prizes|medal|fellowship|honou?r|honou?red|competition|presented|established|given)\b/i.test(text)
    ? 'award-noun'
    : null;
};

const looksLikeEvent = (record) => {
  const term = String(record.term || '').trim();
  const definition = String(record.definition || '');
  const opening = firstSentence(definition);
  const eventNoun = new RegExp(`\\b(?:${EVENT_NOUN})\\b`, 'i');

  if (/^on [A-Z][a-z]+ \d{1,2}, \d{4}\b/i.test(definition.trim())) return 'date-led';
  if (NOT_AN_EVENT.test(opening)) return null;
  if (
    eventNoun.test(term) &&
    /\b(?:was|were|is|held|took place|organized|organised|announced|signed|convened|hosted|began)\b/i.test(opening)
  ) {
    return 'event-term';
  }
  if (new RegExp(`\\b(?:was|were) (?:an? |the )?(?:${NATIONALITY} )?(?:${EVENT_NOUN})\\b`, 'i').test(opening)) {
    return 'event-noun';
  }
  if (/\b(?:19|20)\d{2}\b/.test(term) && eventNoun.test(term)) return 'event-year';
  return null;
};

const ORG_BLOCKER =
  /\b(?:Institute|University|Laboratory|Labs|Company|Corporation|Inc\.|Foundation|Consortium|Alliance|Association|Society|Council|Ministry|Group|Center|Centre|Agency)\b/i;

/**
 * Classifies one raw dictionary record. Returns `{ type, reason }`, where
 * `concept` means "no confident match".
 */
export function classifyRecord(record) {
  const term = String((record && record.term) || '').trim();

  const venue = looksLikeVenue(record);
  if (venue && !PERSON_NAME.test(term)) return { type: 'venue', reason: venue };

  const person = ORG_BLOCKER.test(term) ? null : looksLikePerson(record);
  if (person) return { type: 'person', reason: person };

  const organization = looksLikeOrganization(record);
  if (organization) return { type: 'organization', reason: organization };

  const policy = looksLikePolicy(record);
  if (policy) return { type: 'policy', reason: policy };

  const award = looksLikeAward(record);
  if (award) return { type: 'award', reason: award };

  const event = looksLikeEvent(record);
  if (event) return { type: 'event', reason: event };

  return { type: 'concept', reason: 'default' };
}

// ------------------------------------------------------- concept refinement --
const IS = String.raw`\b(?:is|are|was|refers to|describes)\s+(?:an?|the|one of the)?\s*`;
const MOD = String.raw`(?:[\w'’()-]+\s+){0,5}?`;
/**
 * A finer kind for an entry that reads as a concept: architecture, algorithm,
 * model, metric, benchmark, dataset, tool, paper — or an event for a court
 * case. Reads the opening sentence the same way `classifyRecord` does and
 * returns null when unsure, so the entry stays a concept.
 */
export function refineConcept(record) {
  const term = String(record.term || '').trim();
  const opening = `${firstSentence(record.definition)} ${firstSentence(record.details)}`;
  const def = firstSentence(record.definition);
  const t = (re) => re.test(term);
  // Topic words: "Dataset shift", "Benchmark saturation", "Corpus linguistics" are ideas about the thing.
  if (/\b(?:shift|saturation|contamination|annotation|exploration|linguistics|attack|error|learning|theory|mathematics of|laws? of|processing|reasoning|computing|classification)\b/i.test(term)) return /\sv\.?\s/.test(term) ? 'event' : null;
  const o = (re) => re.test(def);
  if (/\sv\.?\s/.test(term) && /\b(?:lawsuit|case|court|suit|litigation)\b/i.test(`${record.definition} ${record.details}`.slice(0, 400))) return 'event';
  if (t(/-bench$|\bbench$|\(benchmark\)|\bGLUE\b/i) || o(new RegExp(`${IS}${MOD}benchmarks?\\b`, 'i'))) return 'benchmark';
  if (t(/\(dataset\)|\bdatabase$/i) || o(new RegExp(`${IS}${MOD}(?:dataset|data set|corpus|database of)\\b`, 'i'))) return 'dataset';
  if (o(new RegExp(`${IS}${MOD}(?:metric|evaluation measure|performance measure|scoring (?:method|function))\\b`, 'i')) || t(/\(metric\)/i)) return 'metric';
  if (o(new RegExp(`${IS}${MOD}(?:large )?(?:language |foundation |multimodal |generative |text-to-\\w+ |AI )?(?:models?|chatbots?|model family|family of[^.]{0,40}models)\\b[^.]{0,120}\\b(?:developed|released|created|trained|introduced|built|launched|made)\\s+by\\b`, 'i'))) return 'model';
  if (o(new RegExp(`${IS}${MOD}(?:open[- ]source |free |proprietary )?(?:software|python |javascript )?(?:library|libraries|framework|toolkit|software package|programming language|platform|IDE|command-line tool|SDK)\\b`, 'i')) && !o(/\btheoretical framework|conceptual framework\b/i)) return 'tool';
  if (o(new RegExp(`${IS}${MOD}(?:neural network |deep learning |network |model |transformer )?architectures?\\b`, 'i')) || o(new RegExp(`${IS}${MOD}(?:type|kind|class|family|variant) of${MOD}(?:artificial )?neural networks?\\b`, 'i')) || t(/\b(?:network|transformer|autoencoder|perceptron|LSTM|ResNet|U-Net|encoder-decoder|mixture of experts)s?\b/i) && o(/\bnetwork|architecture|layers?\b/i)) return 'architecture';
  if (o(new RegExp(`${IS}${MOD}(?:algorithms?|optimi[sz]ation (?:method|algorithm|technique)|iterative method|search (?:algorithm|method)|procedure|heuristic)\\b`, 'i')) || t(/\balgorithm\b/i)) return 'algorithm';
  if (o(new RegExp(`${IS}${MOD}(?:paper|article|preprint)\\b`, 'i'))) return 'paper';
  return null;
}

/** Rebuild a record with `type` placed after `category`, dropping dead stories. */
export function applyType(record, type) {
  const ordered = {};
  let sawCategory = false;
  for (const key of Object.keys(record)) {
    if (key === 'type') continue;
    if (key === 'story' && entryPresentation(type) !== 'story') continue;
    ordered[key] = record[key];
    if (key === 'category') {
      ordered.type = type;
      sawCategory = true;
    }
  }
  if (!sawCategory) ordered.type = type;
  return ordered;
}

function main() {
  const counts = new Map();
  const reasons = new Map();
  const samples = new Map();
  const changes = [];
  let entries = 0;
  let storiesDropped = 0;
  let alreadyTyped = 0;
  let overrides = 0;

  for (const folder of readdirSync(DICT).sort()) {
    if (!/^[a-z]-[a-z]$/.test(folder)) continue;
    const dir = join(DICT, folder);
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.json')) continue;
      const path = join(dir, file);
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      if (!raw.term) continue;
      entries++;

      const classified = classifyRecord(raw);
      const existing = normalizeTermType(raw.type);
      let type = existing && !FORCE ? existing : classified.type;
      let reason = existing && !FORCE ? 'author-set' : classified.reason;
      if (REFINE && type === 'concept') {
        const refined = refineConcept(raw);
        if (refined) {
          type = refined;
          reason = 'refined';
        }
      }
      if (existing) {
        alreadyTyped++;
        if (existing !== classified.type) overrides++;
      } else if (raw.type !== undefined && raw.type !== '') {
        changes.push(`${path}: unrecognized type “${raw.type}” -> ${type}`);
      }

      counts.set(type, (counts.get(type) || 0) + 1);
      const key = `${type}:${reason}`;
      reasons.set(key, (reasons.get(key) || 0) + 1);
      if (!samples.has(type)) samples.set(type, []);
      if (samples.get(type).length < 15) samples.get(type).push(raw.term);

      const next = applyType(raw, type);
      const after = JSON.stringify(next, null, 2);
      if (after !== JSON.stringify(raw, null, 2)) {
        if (entryPresentation(type) !== 'story' && raw.story) storiesDropped++;
        if (existing && existing !== type) changes.push(`${path}: ${existing} -> ${type} (${reason})`);
        if (!DRY_RUN) writeFileSync(path, `${after}\n`);
      }
    }
  }

  console.log('=== type report ===');
  console.log(`entries: ${entries}`);
  console.log(`already typed: ${alreadyTyped}`);
  if (overrides) {
    console.log(
      `author-set types kept: ${overrides} on which the classifier disagrees` +
        (FORCE ? ' (ignored: --force)' : ' (run with --force to re-evaluate)')
    );
  }
  console.log(`stories dropped from non-story types: ${storiesDropped}`);
  console.log(DRY_RUN ? 'mode: dry run (nothing written)' : 'mode: written');
  console.log('');
  for (const [type, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(13)} ${String(count).padStart(5)}`);
  }
  console.log('');
  for (const [key, count] of [...reasons].sort()) {
    console.log(`  ${key.padEnd(30)} ${String(count).padStart(5)}`);
  }
  if (SAMPLES) {
    console.log('');
    for (const [type, list] of [...samples].sort()) {
      console.log(`  ${type}: ${list.join(' | ')}`);
    }
  }
  if (changes.length) {
    console.log('');
    console.log(`reclassified entries: ${changes.length}`);
    for (const line of changes.slice(0, 40)) console.log(`  ${line}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
