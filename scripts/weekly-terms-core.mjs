// -----------------------------------------------------------------------------
//  Pure units of the weekly term-generation agent.
//
//  `scripts/generate-weekly-terms.mjs` (the agent) and the offline evals both
//  use these, so the evals can check dedup and validation without calling an
//  LLM. The generator and the live eval both call the provider through
//  `proposeWeeklyTerms` (names first, then full entries for new names only).
// -----------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { completionOptions } from '../netlify/functions/ask.mjs';
import { normalizeGraphLabel, normalizeTerm, slugifyTerm, validateTerm } from '../src/term-schema.js';

export const REJECTION_REASONS = [
  'malformed-json',
  'schema-invalid',
  'validation-warning',
  'duplicate-slug',
  'duplicate-term',
  'duplicate-aka',
  'duplicate-in-batch',
];

export const DUPLICATE_REASONS = REJECTION_REASONS.filter((reason) => reason.startsWith('duplicate-'));

/**
 * validateTerm warnings that do not block a new entry: explainers are written
 * later by `generate-explainers.mjs`, so a fresh concept never has one.
 */
export const NON_BLOCKING_WARNINGS = new Set(['missing-explainer', 'missing-example']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWebUrl = (value) => /^https?:\/\/\S+$/i.test(String(value || '').trim());
const labelKey = (value) => normalizeGraphLabel(value);
const termName = (raw) => (isRecord(raw) ? String(raw.term || '').trim() : '');
const candidateSlug = (raw) => String((isRecord(raw) && raw.slug) || slugifyTerm(termName(raw))).trim();
const akaList = (raw) =>
  (Array.isArray(raw && raw.aka) ? raw.aka : raw && raw.aka ? [raw.aka] : [])
    .map((value) => String(value).trim())
    .filter(Boolean);

/** Every existing term name, slug and alias, in that order, without exact repeats. */
export function buildExclusionList(terms) {
  const seen = new Set();
  const out = [];
  const push = (value) => {
    const text = String(value || '').trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  };
  for (const raw of terms || []) {
    if (!isRecord(raw)) continue;
    push(raw.term);
    push(raw.slug || slugifyTerm(raw.term));
    for (const alias of akaList(raw)) push(alias);
  }
  return out;
}

// ---------------------------------------------------------------- parsing --

const FENCE = /```(?:json|jsonc|javascript)?\s*\n?([\s\S]*?)```/i;

const unwrapList = (value) => {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    for (const key of ['terms', 'candidates', 'entries', 'items']) {
      if (Array.isArray(value[key])) return value[key];
    }
    return [value];
  }
  return null;
};

const tryJson = (text) => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

/** Top-level `{…}` spans inside an array body, string-aware. */
function objectSpans(text) {
  const spans = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0) spans.push(text.slice(start, i + 1));
    }
  }
  if (depth > 0 && start >= 0) spans.push(text.slice(start));
  return spans;
}

/**
 * Top-level items of an array body (text after its `[`), string-aware, so
 * non-object items such as `null` survive salvage and get rejected later.
 */
function arrayItems(text) {
  const items = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let escaped = false;
  const push = (end) => {
    const item = text.slice(start, end).trim();
    if (item) items.push(item);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if ((ch === '}' || ch === ']') && depth > 0) depth--;
    else if (depth === 0 && (ch === ',' || ch === ']')) {
      push(i);
      start = i + 1;
      if (ch === ']') return items;
    }
  }
  push(text.length);
  return items;
}

// An unparseable item may hold several objects (a missing comma, or an
// unclosed `[` that swallowed later entries); split it on braces instead,
// keeping any text between objects as its own fragment so it still counts.
const splitBroken = (items) =>
  items.flatMap((item) => {
    if (tryJson(item).ok || !item.includes('{')) return [item];
    const spans = objectSpans(item);
    if (!spans.length) return [item];
    const parts = [];
    const keep = (text) => {
      const rest = text.replace(/^[\s,\]}]+|[\s,\]}]+$/g, '');
      if (rest) parts.push(rest);
    };
    let cursor = 0;
    for (const span of spans) {
      const at = item.indexOf(span, cursor);
      keep(item.slice(cursor, at));
      parts.push(span);
      cursor = at + span.length;
    }
    keep(item.slice(cursor));
    return parts;
  });

function salvageItems(body) {
  const wrapped = body.match(/"(?:terms|candidates|entries|items)"\s*:\s*\[/);
  if (wrapped) return splitBroken(arrayItems(body.slice(wrapped.index + wrapped[0].length)));
  const bracket = body.indexOf('[');
  const brace = body.indexOf('{');
  if (bracket >= 0 && (brace < 0 || bracket < brace)) return splitBroken(arrayItems(body.slice(bracket + 1)));
  return brace >= 0 ? objectSpans(body.slice(brace)) : [];
}

/**
 * Turn an LLM reply into candidate objects. Accepts a JSON array, an object
 * wrapping one (`{ "terms": [...] }`), JSON Lines, or any of those inside a
 * ```json fence. When the whole reply is not valid JSON, each top-level object
 * is parsed on its own so one broken entry does not sink the batch.
 *
 * Returns `{ candidates, malformed }`: `candidates` is every parsed list item
 * (objects, or other JSON values the filter will reject), `malformed` lists
 * fragments that could not be parsed, each `{ index, text, error }`.
 */
export function parseCandidates(llmReply) {
  const reply = String(llmReply == null ? '' : llmReply);
  const fenced = reply.match(FENCE);
  const body = (fenced ? fenced[1] : reply).trim();
  if (!body) return { candidates: [], malformed: [{ index: 0, text: reply, error: 'empty reply' }] };

  const whole = tryJson(body);
  if (whole.ok) {
    const list = unwrapList(whole.value);
    if (list) return { candidates: list, malformed: [] };
    return { candidates: [], malformed: [{ index: 0, text: body, error: 'reply is not a list of terms' }] };
  }

  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((line) => line.startsWith('{'))) {
    const parsedLines = lines.map(tryJson);
    if (parsedLines.every((item) => item.ok)) return { candidates: parsedLines.map((item) => item.value), malformed: [] };
  }

  const spans = salvageItems(body);
  if (!spans.length) return { candidates: [], malformed: [{ index: 0, text: body, error: whole.error }] };
  const candidates = [];
  const malformed = [];
  spans.forEach((text, index) => {
    const parsed = tryJson(text);
    if (parsed.ok) candidates.push(parsed.value);
    else malformed.push({ index, text, error: parsed.error });
  });
  return { candidates, malformed };
}

// -------------------------------------------------------------- filtering --

/**
 * Agent-level rules on top of `validateTerm`: generated entries must cite a
 * source and file under the letter their name starts with.
 */
export function candidateIssues(raw) {
  const term = normalizeTerm(raw);
  const issues = validateTerm(term, { raw });
  if (!term) return issues;
  const add = (level, code, message) => issues.push({ level, code, message });
  const citation = isRecord(raw.citation) ? raw.citation : {};
  if (!String(citation.title || '').trim() && !String(citation.url || '').trim()) {
    add('error', 'missing-citation', 'Generated terms must cite a source (citation.title + citation.url).');
  } else if (!isWebUrl(citation.url)) {
    add('error', 'invalid-citation-url', 'citation.url must be an http(s) URL.');
  }
  const first = term.term.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')[0].toUpperCase();
  if (/[A-Z]/.test(first) && first !== term.letter) {
    add('error', 'letter-mismatch', `“${term.term}” starts with ${first}, not ${term.letter}.`);
  }
  return issues;
}

function indexExisting(existingTerms) {
  const slugs = new Map();
  const names = new Map();
  const aliases = new Map();
  for (const raw of existingTerms || []) {
    if (!isRecord(raw) || !termName(raw)) continue;
    const slug = candidateSlug(raw);
    slugs.set(slug, slug);
    names.set(labelKey(raw.term), slug);
    for (const alias of akaList(raw)) {
      if (!aliases.has(labelKey(alias))) aliases.set(labelKey(alias), slug);
    }
  }
  return { slugs, names, aliases };
}

/**
 * Split candidates into `{ accepted, rejected }`.
 *
 * `candidates` is an array of raw entries or the result of `parseCandidates`
 * (its `malformed` fragments are rejected as `malformed-json`). Checks run in
 * this order and the first hit wins: malformed-json, duplicate-term (name
 * matches an existing name, ignoring case/whitespace/punctuation),
 * duplicate-aka (name matches an existing alias), duplicate-slug, schema-invalid,
 * validation-warning, duplicate-in-batch (repeats an entry accepted earlier in
 * the same batch).
 *
 * Accepted items: `{ index, slug, term, entry }` (entry has `slug` filled in).
 * Rejected items: `{ index, slug, term, reason, detail, entry, issues, schemaValid }`.
 */
export function filterCandidates(candidates, existingTerms, { nonBlockingWarnings = NON_BLOCKING_WARNINGS } = {}) {
  const parsed = Array.isArray(candidates) ? { candidates, malformed: [] } : candidates || {};
  const list = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const existing = indexExisting(existingTerms);
  const batch = { slugs: new Map(), names: new Map() };
  const accepted = [];
  const rejected = [];
  let index = 0;

  for (const fragment of parsed.malformed || []) {
    rejected.push({
      index: index++,
      slug: '',
      term: '',
      reason: 'malformed-json',
      detail: fragment.error || 'unparseable JSON',
      entry: fragment.text,
      issues: [],
      schemaValid: false,
    });
  }

  for (const raw of list) {
    const at = index++;
    if (!isRecord(raw)) {
      rejected.push({ index: at, slug: '', term: '', reason: 'malformed-json', detail: 'candidate is not a JSON object', entry: raw, issues: [], schemaValid: false });
      continue;
    }
    const name = termName(raw);
    const slug = candidateSlug(raw);
    const issues = candidateIssues(raw);
    const errors = issues.filter((issue) => issue.level === 'error');
    const warnings = issues.filter((issue) => issue.level === 'warning' && !nonBlockingWarnings.has(issue.code));
    const schemaValid = errors.length === 0;
    const reject = (reason, detail) => rejected.push({ index: at, slug, term: name, reason, detail, entry: raw, issues, schemaValid });
    const key = labelKey(name);
    const derivedSlug = slugifyTerm(name);

    if (key && existing.names.has(key)) {
      reject('duplicate-term', `matches existing term “${existing.names.get(key)}”`);
    } else if (key && existing.aliases.has(key)) {
      reject('duplicate-aka', `matches an alias of “${existing.aliases.get(key)}”`);
    } else if (existing.slugs.has(slug) || (derivedSlug && existing.slugs.has(derivedSlug))) {
      reject('duplicate-slug', `slug “${existing.slugs.has(slug) ? slug : derivedSlug}” already exists in dictionary/`);
    } else if (!schemaValid) {
      reject('schema-invalid', errors.map((issue) => issue.code).join(', '));
    } else if (warnings.length) {
      reject('validation-warning', warnings.map((issue) => issue.code).join(', '));
    } else if (batch.slugs.has(slug) || batch.names.has(key)) {
      reject('duplicate-in-batch', `repeats “${batch.slugs.get(slug) || batch.names.get(key)}” from this batch`);
    } else {
      batch.slugs.set(slug, slug);
      batch.names.set(key, slug);
      for (const alias of akaList(raw)) if (!batch.names.has(labelKey(alias))) batch.names.set(labelKey(alias), slug);
      accepted.push({ index: at, slug, term: name, entry: { ...raw, slug } });
    }
  }
  return { accepted, rejected };
}

// ---------------------------------------------------------------- metrics --

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/**
 * Summary of one filtered batch. `expected` (optional) maps a candidate slug
 * (`#malformed` for unparseable fragments) to its known-good outcome:
 * `"accepted"`, a rejection reason, or an array of outcomes when the slug is
 * proposed more than once. With labels, `decisionAccuracy` is the share of
 * candidates whose outcome matches and `mismatches` lists the rest.
 */
export function computeMetrics({ accepted, rejected }, { expected = null } = {}) {
  const proposed = accepted.length + rejected.length;
  const rejectedByReason = Object.fromEntries(REJECTION_REASONS.map((reason) => [reason, 0]));
  for (const item of rejected) rejectedByReason[item.reason] = (rejectedByReason[item.reason] || 0) + 1;
  const parsed = proposed - rejectedByReason['malformed-json'];
  const schemaValid = accepted.length + rejected.filter((item) => item.schemaValid).length;
  const duplicatesByType = Object.fromEntries(DUPLICATE_REASONS.map((reason) => [reason, rejectedByReason[reason]]));
  const duplicatesFlagged = Object.values(duplicatesByType).reduce((sum, count) => sum + count, 0);
  const metrics = {
    proposed,
    parsed,
    parseRate: pct(parsed, proposed),
    schemaValid,
    schemaPassRate: pct(schemaValid, parsed),
    accepted: accepted.length,
    rejected: rejected.length,
    rejectedByReason,
    duplicatesFlagged,
    duplicatesByType,
    accuracy: pct(accepted.length, proposed),
  };
  if (expected) {
    const actual = new Map();
    const record = (key, outcome) => actual.set(key, [...(actual.get(key) || []), outcome]);
    for (const item of [...accepted, ...rejected].sort((a, b) => a.index - b.index)) {
      record(item.slug || '#malformed', item.reason || 'accepted');
    }
    const wanted = new Map(Object.entries(expected).map(([key, value]) => [key, [].concat(value)]));
    const mismatches = [];
    let matched = 0;
    for (const key of new Set([...actual.keys(), ...wanted.keys()])) {
      const want = [...(wanted.get(key) || [])];
      for (const outcome of actual.get(key) || []) {
        const at = want.indexOf(outcome);
        if (at >= 0) {
          want.splice(at, 1);
          matched++;
        } else mismatches.push({ key, expected: want.shift() ?? null, actual: outcome });
      }
      for (const missing of want) mismatches.push({ key, expected: missing, actual: null });
    }
    const labels = [...wanted.values()].flat();
    metrics.expectedAccepted = labels.filter((value) => value === 'accepted').length;
    metrics.expectedAccuracy = pct(metrics.expectedAccepted, labels.length);
    metrics.decisionMatched = matched;
    metrics.decisionTotal = Math.max(labels.length, proposed);
    metrics.decisionAccuracy = pct(matched, metrics.decisionTotal);
    metrics.mismatches = mismatches;
  }
  return metrics;
}

/** Markdown table for the weekly PR body. */
export function metricsMarkdown(metrics, { title = 'Weekly agent eval', note = '' } = {}) {
  const rows = [
    ['Terms proposed', metrics.proposed],
    ['Parsed (parse rate)', `${metrics.parsed} (${metrics.parseRate}%)`],
    ['Schema-valid (pass rate)', `${metrics.schemaValid} (${metrics.schemaPassRate}%)`],
    ['Accepted', metrics.accepted],
    ['Duplicates flagged', metrics.duplicatesFlagged],
    ...DUPLICATE_REASONS.map((reason) => [`… ${reason}`, metrics.duplicatesByType[reason]]),
    ...['malformed-json', 'schema-invalid', 'validation-warning'].map((reason) => [`Rejected: ${reason}`, metrics.rejectedByReason[reason]]),
    ['Accuracy (accepted / proposed)', `${metrics.accuracy}%`],
  ];
  if (metrics.decisionAccuracy !== undefined) rows.push(['Decision accuracy vs. labels', `${metrics.decisionAccuracy}%`]);
  return [`### ${title}`, '', note || null, note ? '' : null, '| Metric | Value |', '|---|---|', ...rows.map(([label, value]) => `| ${label} | ${value} |`), '']
    .filter((line) => line !== null)
    .join('\n');
}

// --------------------------------------------------------- dictionary I/O --

/** Raw entries tracked under dictionary/ (new, uncommitted files are not "existing"). */
export function loadDictionaryTerms(root, { trackedOnly = true } = {}) {
  let files = [];
  if (trackedOnly) {
    try {
      files = execFileSync('git', ['ls-files', 'dictionary/*.json'], { cwd: root, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);
    } catch {
      files = [];
    }
  }
  if (!files.length) {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((dirent) =>
        dirent.isDirectory() ? walk(join(dir, dirent.name)) : dirent.name.endsWith('.json') ? [relative(root, join(dir, dirent.name))] : []
      );
    files = walk(join(root, 'dictionary'));
  }
  return files.map((file) => JSON.parse(readFileSync(join(root, file), 'utf8')));
}

// ------------------------------------------------------------------- live --

export const PROVIDERS = {
  deepseek: { envKey: 'DEEPSEEK_API_KEY', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  gemini: { envKey: 'GEMINI_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
};

/** First provider whose API key is set (DeepSeek, then Gemini), or null. */
export function pickProvider(env = process.env) {
  for (const [name, provider] of Object.entries(PROVIDERS)) {
    const apiKey = String(env[provider.envKey] || '').trim();
    if (apiKey) {
      const baseUrl = String(env.WEEKLY_BASE_URL || provider.baseUrl).replace(/\/+$/, '');
      return { name, apiKey, baseUrl, model: String(env.WEEKLY_MODEL || provider.model) };
    }
  }
  return null;
}

const ENTRY_SHAPE =
  'Each entry: {"term","letter" (uppercase first letter of term),"category","type" (one of concept, person, organization, event, model, dataset, benchmark, tool, paper, venue, policy, award, architecture, algorithm, metric, library),' +
  '"aka":[],"definition" (one sentence),"details" (2-4 sentences),"citation":{"title","authors":[],"year","venue","url" (http(s) link to the primary source)}}. ' +
  '"type" is what the term is, not where it was published: a method or technique introduced in a paper is "concept" or "algorithm"; use "paper" only when the entry is about the paper itself. ' +
  'For a "person", add "profile":{"knownFor" (one short phrase)}. ' +
  'List citation authors exactly as on the source, in order; leave "authors" empty rather than guess.';

/**
 * Pass 1: candidate names only. No exclusion list is sent (it is ~47k tokens);
 * `newNames` drops the ones the dictionary already has. `skip` lists names
 * proposed in earlier rounds so a retry asks for different ones.
 */
export function buildNameMessages({ count = 30, size = 0, skip = [] } = {}) {
  const user = [
    `List ${count} distinct AI / LLM terms (techniques, architectures, models, benchmarks, datasets, papers, tools, people, organisations) that a specialised AI dictionary${size ? ` of ${size} entries` : ''} may still be missing.`,
    'Prefer recent (last two years) and specialised terms over well-known basics. Use each term\'s canonical name.',
    skip.length ? `Already covered, do not repeat:\n${skip.join('\n')}` : '',
  ].filter(Boolean);
  return [
    { role: 'system', content: 'You suggest entries for an A–Z dictionary of AI / LLM terminology. Reply with JSON only: {"names":["…"]}.' },
    { role: 'user', content: user.join('\n\n') },
  ];
}

/** Names from a pass-1 reply: `{"names":[…]}`, a bare array, or entries with a `term`. */
export function parseNames(reply) {
  const { candidates } = parseCandidates(reply);
  const list = candidates.length === 1 && isRecord(candidates[0]) && Array.isArray(candidates[0].names) ? candidates[0].names : candidates;
  return list.map((item) => (typeof item === 'string' ? item.trim() : termName(item))).filter(Boolean);
}

/** Names whose term, alias and slug are all absent from `existingTerms`, without repeats. */
export function newNames(names, existingTerms) {
  const existing = indexExisting(existingTerms);
  const seen = new Set();
  const out = [];
  for (const name of names || []) {
    const text = String(name || '').trim();
    const key = labelKey(text);
    if (!key || seen.has(key) || existing.names.has(key) || existing.aliases.has(key) || existing.slugs.has(slugifyTerm(text))) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Pass 2: full entries for names already checked against the dictionary. */
/** Splits accepted entries into those whose term was on the pass-1 shortlist and the rest. */
export function splitRequested(accepted, names) {
  const wanted = new Set(names.map(labelKey));
  const requested = [];
  const unrequested = [];
  for (const item of accepted) (wanted.has(labelKey(item.term)) ? requested : unrequested).push(item);
  return { requested, unrequested };
}

export function buildWeeklyMessages(names) {
  return [
    {
      role: 'system',
      content: `You write entries for an A–Z dictionary of AI / LLM terminology. Reply with JSON only: {"terms":[...]}. ${ENTRY_SHAPE} Write one entry per name and keep the name as given in "term".`,
    },
    { role: 'user', content: `Write dictionary entries for these ${names.length} AI terms:\n${names.join('\n')}` },
  ];
}

/**
 * Two-pass proposal: ask for `count * oversample` names (up to `rounds` times
 * until `count` new ones are found), then request full entries for those only.
 * Returns `{ names, proposed, reply, usage }`; `proposed` counts the distinct
 * names pass 1 parsed, `reply` is the pass-2 reply ('' when no new names
 * turned up) and `usage` sums every call.
 */
export async function proposeWeeklyTerms(provider, existingTerms, { count = 10, oversample = 3, rounds = 3, request = requestCandidates } = {}) {
  const usage = { prompt: 0, completion: 0, calls: 0 };
  const call = async (messages) => {
    const result = await request(provider, messages);
    usage.prompt += result.usage?.prompt || 0;
    usage.completion += result.usage?.completion || 0;
    usage.calls++;
    return result.reply;
  };
  const names = [];
  const skip = [];
  for (let round = 0; round < rounds && names.length < count; round++) {
    const proposed = parseNames(await call(buildNameMessages({ count: count * oversample, size: existingTerms.length, skip })));
    const fresh = newNames(proposed, [...existingTerms, ...names.map((term) => ({ term }))]);
    names.push(...fresh.slice(0, count - names.length));
    skip.push(...proposed.filter((name) => !skip.includes(name)));
  }
  if (!names.length) return { names, proposed: skip.length, reply: '', usage };
  return { names, proposed: skip.length, reply: await call(buildWeeklyMessages(names)), usage };
}

/** One chat completion; returns `{ reply, usage }`. */
export async function requestCandidates(provider, messages, { timeoutMs = 180000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ model: provider.model, messages, response_format: { type: 'json_object' }, ...completionOptions(provider.model) }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${provider.name} ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const data = await response.json();
    return {
      reply: data.choices?.[0]?.message?.content || '',
      usage: { prompt: data.usage?.prompt_tokens || 0, completion: data.usage?.completion_tokens || 0 },
    };
  } finally {
    clearTimeout(timer);
  }
}
