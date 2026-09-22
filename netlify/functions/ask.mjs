// Grounded Q&A proxy for the "Ask" panel.
//
// The browser NEVER sees the LLM key. It sends a query plus a small set of
// retrieved dictionary entries, and this function calls an OpenAI-compatible
// chat-completions API (Kimi / Moonshot by default) to synthesize a grounded
// answer, keeping only citations that point back at those entries.
//
// Environment (set in Netlify UI, or a local `.env` for `netlify dev`):
//   LLM_API_KEY    required — the provider key (sk-…)
//   LLM_BASE_URL   optional — default https://api.moonshot.ai/v1
//   LLM_MODEL      optional — default kimi-latest

const DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1';
const DEFAULT_MODEL = 'kimi-k3';
const MAX_QUERY_CHARS = 500;
const MAX_CONTEXT_CHARS = 12000;
const UPSTREAM_TIMEOUT_MS = 60000;
const TYPESAFE_TIMEOUT_MS = 8000;
const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';

const hasKey = () => Boolean((process.env.LLM_API_KEY || '').trim());

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Return only [slug] markers that match the entries we actually supplied. */
function extractCitations(text, allowedSlugs) {
  const found = new Set();
  for (const match of String(text || '').matchAll(/\[([a-z0-9-]{1,120})\]/gi)) {
    const slug = match[1].toLowerCase();
    if (allowedSlugs.has(slug)) found.add(slug);
  }
  return [...found];
}

/** Trim to at most `max` words, cutting back to the last sentence end. */
function clampWords(text, max) {
  const trimmed = String(text || '').trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= max) return trimmed;
  let cut = words.slice(0, max).join(' ');
  const lastEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (lastEnd > 0) cut = cut.slice(0, lastEnd + 1);
  return cut;
}

export async function rerankEntries(query, entries, options = {}) {
  const apiKey = String(options.apiKey ?? process.env.TYPESAFE_API_KEY ?? '').trim();
  const candidates = Array.isArray(entries) ? entries.slice(0, 10) : [];
  if (!apiKey || candidates.length < 2) return { entries: candidates, mode: 'lexical' };
  const normalizedQuery = String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const firstAliases = Array.isArray(candidates[0]?.aliases) ? candidates[0].aliases : [];
  const firstNames = [candidates[0]?.term, ...firstAliases]
    .map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  if (firstNames.includes(normalizedQuery)) return { entries: candidates, mode: 'lexical' };

  const questions = Object.fromEntries(candidates.map((_, index) => [
    `candidate_${index}`,
    {
      type: 'noul',
      instructions: `Does candidates[${index}] directly answer or define the concept requested in query?`,
      criteria: {
        true: 'The candidate directly defines, explains, compares, or precisely identifies what the query asks for.',
        false: 'The candidate is only broadly related, shares generic words or a category, or does not answer the query.',
      },
    },
  ]));
  const state = {
    query,
    candidates: candidates.map((entry) => ({
      term: String(entry.term || '').slice(0, 200),
      aliases: Array.isArray(entry.aliases) ? entry.aliases.slice(0, 8).map((alias) => String(alias).slice(0, 100)) : [],
      category: String(entry.category || '').slice(0, 120),
      definition: String(entry.definition || '').slice(0, 600),
      details: String(entry.details || '').slice(0, 800),
    })),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || TYPESAFE_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl || fetch)(TYPESAFE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        state,
        model: process.env.TYPESAFE_MODEL || 'jev-latest',
        questions,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { entries: candidates, mode: 'lexical' };
    const data = await response.json();
    const scored = candidates.map((entry, index) => {
      const semantic = Number(data?.answers?.[`candidate_${index}`]?.noul);
      const lexicalPrior = (candidates.length - index) / candidates.length;
      return {
        entry,
        index,
        score: Number.isFinite(semantic) ? semantic * 0.8 + lexicalPrior * 0.2 : lexicalPrior * 0.2,
      };
    });
    if (!scored.some(({ score, index }) => score > ((candidates.length - index) / candidates.length) * 0.2)) {
      return { entries: candidates, mode: 'lexical' };
    }
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return { entries: scored.map(({ entry }) => entry), mode: 'typesafe' };
  } catch {
    return { entries: candidates, mode: 'lexical' };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  if (!hasKey()) return json(503, { error: 'not_configured' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const query = String(body.query || '').trim().slice(0, MAX_QUERY_CHARS);
  if (!query) return json(400, { error: 'Missing query' });

  const candidates = Array.isArray(body.context) ? body.context.slice(0, 10) : [];
  const reranked = await rerankEntries(query, candidates);
  const entries = reranked.entries;

  // Build the grounded context and an authoritative source map (slug → label/url).
  const sources = new Map();
  const contextBlocks = [];
  for (const entry of entries) {
    const slug = String(entry.slug || '').toLowerCase();
    if (!slug || sources.has(slug)) continue;
    const term = String(entry.term || slug).trim();
    const category = String(entry.category || '').trim();
    const definition = String(entry.definition || '').trim();
    const details = String(entry.details || '').trim();
    const citation = entry.citation && typeof entry.citation === 'object' ? entry.citation : {};
    const cite = [
      citation.title,
      Array.isArray(citation.authors) ? citation.authors.join(', ') : citation.authors,
      citation.year,
      citation.venue,
    ]
      .filter(Boolean)
      .join(' ');

    sources.set(slug, { slug, term, url: `/term/${slug}/`, citation: cite });
    const block = `[${slug}] ${term}\nCategory: ${category}\n${definition}\n${details}`;
    contextBlocks.push(block.slice(0, 2000));
  }

  if (!contextBlocks.length) return json(200, { answer: '', mode: 'local' });

  const context = contextBlocks.join('\n\n').slice(0, MAX_CONTEXT_CHARS);

  const system = [
    'You are the "Ask" assistant of TheAIDictionary, an encyclopaedia of AI and machine-learning terms.',
    'Answer the user\'s question using ONLY the entries provided. If the entries do not contain the answer, say so briefly.',
    'Cite every entry you use with its slug in square brackets, e.g. [retrieval-augmented-generation].',
    'Do not invent facts, citations, or URLs. Answer in 250 to 400 words, in plain language.',
  ].join(' ');

  const user = `ENTRIES:\n${context}\n\nQUESTION: ${query}`;

  const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LLM_API_KEY.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        reasoning_efforts: 'low',
        max_tokens: 2000,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      if (upstream.status === 429) return json(503, { error: 'rate_limited' });
      return json(502, { error: 'upstream_error' });
    }

    const data = await upstream.json();
    const rawAnswer = String(data?.choices?.[0]?.message?.content || '').trim();
    const cited = extractCitations(rawAnswer, new Set(sources.keys()));
    const cleanSources = cited.map((slug) => sources.get(slug));
    const answer = clampWords(rawAnswer, 400);

    if (!answer || !cleanSources.length) return json(200, { answer: '', mode: 'local' });

    return json(200, { answer, mode: 'llm', retrieval: reranked.mode, sources: cleanSources });
  } catch (error) {
    return json(502, { error: error.name === 'AbortError' ? 'timeout' : 'upstream_error' });
  } finally {
    clearTimeout(timer);
  }
}
