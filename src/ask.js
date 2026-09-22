// Local, grounded Q&A over the generated retrieval corpus. Works offline, no key.
import { normalizeGraphLabel, tokenizeText } from './term-schema.js';

const RETRIEVAL_SCHEMA_VERSION = 1;

let corpusPromise = null;
const rankingStats = new WeakMap();

async function loadCorpus() {
  if (!corpusPromise) {
    corpusPromise = (async () => {
      const manifestResponse = await fetch('/generated/manifest.json', { cache: 'no-cache' });
      if (!manifestResponse.ok) throw new Error(`Manifest failed (${manifestResponse.status}).`);
      const manifest = await manifestResponse.json();
      if (typeof manifest.retrievalUrl !== 'string') throw new Error('No retrieval corpus in manifest.');
      const response = await fetch(manifest.retrievalUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Retrieval corpus failed (${response.status}).`);
      const corpus = await response.json();
      if (corpus.schemaVersion !== RETRIEVAL_SCHEMA_VERSION || !Array.isArray(corpus.terms)) {
        throw new Error('Unsupported retrieval corpus.');
      }
      const bySlug = new Map(corpus.terms.map((entry) => [entry.slug, entry]));
      return { corpus, bySlug };
    })().catch((error) => {
      corpusPromise = null;
      throw error;
    });
  }
  return corpusPromise;
}

function termFrequency(tokens) {
  const frequencies = new Map();
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  return frequencies;
}

function getRankingStats(corpus) {
  if (rankingStats.has(corpus)) return rankingStats.get(corpus);
  const documentFrequency = new Map();
  let totalLength = 0;
  for (const entry of corpus.terms) {
    const categoryTokens = tokenizeText(entry.category);
    const tokens = [...entry.termTokens, ...categoryTokens, ...entry.textTokens];
    totalLength += entry.termTokens.length * 3 + categoryTokens.length * 2 + entry.textTokens.length;
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }
  const stats = {
    documentCount: corpus.terms.length,
    documentFrequency,
    averageLength: totalLength / Math.max(1, corpus.terms.length),
  };
  rankingStats.set(corpus, stats);
  return stats;
}

function scoreEntry(entry, ql, qTokens, stats) {
  let score = 0;
  const reasons = [];
  const termNorm = normalizeGraphLabel(entry.term);
  const aliasNorms = entry.aliases.map((alias) => normalizeGraphLabel(alias));
  const queryPhrase = ` ${ql} `;
  if (normalizeGraphLabel(entry.slug) === ql || termNorm === ql) {
    return { entry, score: 100, reasons: ['exact-term'] };
  }
  if (aliasNorms.includes(ql)) {
    return { entry, score: 100, reasons: ['exact-alias'] };
  }
  if (` ${ql} `.includes(` ${termNorm} `)) {
    score += 95;
    reasons.push('term-in-query');
  } else if (aliasNorms.some((alias) => queryPhrase.includes(` ${alias} `))) {
    score += 92;
    reasons.push('alias-in-query');
  } else if (ql.length >= 3 && termNorm.startsWith(ql)) {
    score += 70;
    reasons.push('prefix');
  }

  const categoryTokens = tokenizeText(entry.category);
  const termFrequencies = termFrequency(entry.termTokens);
  const categoryFrequencies = termFrequency(categoryTokens);
  const textFrequencies = termFrequency(entry.textTokens);
  const documentLength = entry.termTokens.length * 3 + categoryTokens.length * 2 + entry.textTokens.length;
  const matched = new Set();
  let bm25 = 0;
  for (const token of new Set(qTokens)) {
    const frequency = (termFrequencies.get(token) || 0) * 3
      + (categoryFrequencies.get(token) || 0) * 2
      + (textFrequencies.get(token) || 0);
    if (!frequency) continue;
    matched.add(token);
    const documents = stats.documentFrequency.get(token) || 0;
    const idf = Math.log(1 + (stats.documentCount - documents + 0.5) / (documents + 0.5));
    const denominator = frequency + 1.2 * (0.25 + 0.75 * documentLength / Math.max(1, stats.averageLength));
    bm25 += idf * frequency * 2.2 / denominator;
  }
  if (bm25) {
    score += Math.min(65, bm25 * 8);
    reasons.push(`bm25:${bm25.toFixed(3)}`);
  }
  if (matched.size) {
    const coverage = matched.size / Math.max(1, new Set(qTokens).size);
    score += coverage * 18;
    reasons.push(`coverage:${coverage.toFixed(3)}`);
  }
  if (normalizeGraphLabel(entry.category) === ql) {
    score += 25;
    reasons.push('category');
  }
  return { entry, score, reasons };
}

/** Deterministic weighted ranker over the corpus. Exported for tests. */
export function rankTerms(query, corpus, { limit = 8 } = {}) {
  const ql = normalizeGraphLabel(query);
  const qTokens = tokenizeText(query);
  if (!ql || !qTokens.length) return [];
  const stats = getRankingStats(corpus);
  return corpus.terms
    .map((entry) => scoreEntry(entry, ql, qTokens, stats))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.slug.localeCompare(b.entry.slug))
    .slice(0, limit);
}

/** Detect "A vs B", "difference between A and B", "compare A and B". Exported for tests. */
export function parseComparison(query) {
  const q = query.trim().replace(/[?!.]+$/, '');
  const patterns = [
    /^compare\s+(.+?)\s+(?:and|to|with)\s+(.+)$/i,
    /^difference\s+between\s+(.+?)\s+and\s+(.+)$/i,
    /^(.+?)\s+vs\.?\s+(.+)$/i,
    /^(.+?)\s+versus\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match) return [match[1].trim(), match[2].trim()];
  }
  return null;
}

function resolve(phrase, { corpus, bySlug }) {
  const norm = normalizeGraphLabel(phrase);
  for (const entry of corpus.terms) {
    if (
      normalizeGraphLabel(entry.slug) === norm ||
      normalizeGraphLabel(entry.term) === norm ||
      entry.aliases.some((alias) => normalizeGraphLabel(alias) === norm)
    ) {
      return entry;
    }
  }
  return rankTerms(phrase, corpus, { limit: 1 })[0]?.entry || null;
}

function synthesize(query, corpus, bySlug) {
  const comparison = parseComparison(query);
  if (comparison) {
    const a = resolve(comparison[0], { corpus, bySlug });
    const b = resolve(comparison[1], { corpus, bySlug });
    if (a && b && a.slug !== b.slug) {
      const aRel = new Set(a.related);
      const bRel = new Set(b.related);
      const shared = [...aRel].filter((slug) => bRel.has(slug)).slice(0, 6);
      const onlyA = [...aRel].filter((slug) => !bRel.has(slug)).slice(0, 4);
      const onlyB = [...bRel].filter((slug) => !aRel.has(slug)).slice(0, 4);
      return { type: 'compare', a, b, shared, onlyA, onlyB };
    }
  }

  const ranked = rankTerms(query, corpus, { limit: 8 });
  if (!ranked.length) {
    const qTokens = tokenizeText(query);
    const suggestions = corpus.terms
      .map((entry) => {
        const set = new Set(entry.termTokens);
        const overlap = qTokens.filter((token) => set.has(token)).length;
        return { entry, overlap };
      })
      .filter((result) => result.overlap >= 1)
      .sort((a, b) => b.overlap - a.overlap || a.entry.slug.localeCompare(b.entry.slug))
      .slice(0, 3)
      .map((result) => result.entry);
    return { type: 'no-match', suggestions };
  }

  const top = ranked[0];
  const looksLikeDefinition = /^(what|whats|what's|define|definition|explain)\b/i.test(query.trim());
  if (top.score >= 90 || looksLikeDefinition) {
    return { type: 'definition', entry: top.entry, related: top.entry.related.slice(0, 5) };
  }
  return { type: 'broad', results: ranked.slice(0, 5) };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sourceLink(entry) {
  if (!entry.citation || !entry.citation.url) return null;
  const link = el('a', 'ask-source-link', entry.citation.title || 'Read the source');
  link.href = entry.citation.url;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}

export function buildRetrievalContext(query, corpus, bySlug, { limit = 10 } = {}) {
  const primary = [];
  const comparison = parseComparison(query);
  if (comparison) {
    const a = resolve(comparison[0], { corpus, bySlug });
    const b = resolve(comparison[1], { corpus, bySlug });
    if (a) primary.push(a);
    if (b) primary.push(b);
  }
  for (const { entry } of rankTerms(query, corpus, { limit: 8 })) primary.push(entry);

  const seen = new Set();
  const selected = [];
  for (const entry of primary) {
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    selected.push(entry);
    if (selected.length >= limit) break;
  }
  for (const entry of [...selected]) {
    for (const slug of [...(entry.related || []), ...(entry.coOccurring || [])]) {
      if (seen.has(slug)) continue;
      const neighbor = bySlug.get(slug);
      if (!neighbor) continue;
      seen.add(slug);
      selected.push(neighbor);
      if (selected.length >= limit) break;
    }
    if (selected.length >= limit) break;
  }

  return selected.map((entry) => ({
    slug: entry.slug,
    term: entry.term,
    aliases: entry.aliases,
    category: entry.category,
    definition: entry.definition,
    details: entry.details,
    citation: entry.citation,
  }));
}

export class AskChat {
  constructor(root, { onOpenTerm } = {}) {
    this.root = root;
    this.onOpenTerm = onOpenTerm;
    this.input = root.querySelector('#ask-input');
    this.form = root.querySelector('#ask-form');
    this.answer = root.querySelector('#ask-answer');
    this.status = root.querySelector('#ask-status');
    this._data = null;
    this._busy = false;
    this._bind();
  }

  _bind() {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this._answer();
    });
  }

  async open() {
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    this.input.focus();
    if (!this._data) {
      try {
        this.status.textContent = 'Loading the encyclopaedia index…';
        this._data = await loadCorpus();
        this.status.textContent = 'Ask about any AI term — try “difference between RAG and fine-tuning”.';
      } catch {
        this.status.textContent = 'The index could not be loaded — please try again later.';
      }
    }
  }

  close() {
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
  }

  async _answer() {
    const query = this.input.value.trim();
    if (!query || this._busy) return;
    if (!this._data) {
      this.status.textContent = 'The index is still loading — one moment.';
      return;
    }
    const { corpus, bySlug } = this._data;

    this._setBusy(true);
    this.status.textContent = 'Asking Kimi…';
    const remote = await this._tryRemote(query, corpus, bySlug);
    if (remote) {
      this.status.textContent = remote.retrieval === 'typesafe'
        ? 'Grounded answer from Kimi with TypeSafe-ranked dictionary sources.'
        : 'Grounded answer from Kimi, with sources from the dictionary.';
      this._renderRemote(remote, query);
    } else {
      this.status.textContent = 'Ask about any AI term — try “difference between RAG and fine-tuning”.';
      this._render(synthesize(query, corpus, bySlug), query);
    }
    this._setBusy(false);
  }

  _setBusy(busy) {
    this._busy = busy;
    const submit = this.root.querySelector('#ask-submit');
    if (submit) submit.disabled = busy;
  }

  _buildContext(query, corpus, bySlug) {
    return buildRetrievalContext(query, corpus, bySlug);
  }

  async _tryRemote(query, corpus, bySlug) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context: this._buildContext(query, corpus, bySlug) }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) return null;
      const data = await response.json();
      return data?.mode === 'llm' && data.answer ? data : null;
    } catch {
      return null;
    }
  }

  _renderRemote(result, query) {
    const container = this.answer;
    container.replaceChildren();
    const answer = String(result.answer || '').replace(/\[([a-z0-9-]{1,120})\]/gi, '').trim();
    const kicker = result.retrieval === 'typesafe'
      ? 'Grounded answer · Kimi · TypeSafe-ranked'
      : 'Grounded answer · Kimi';
    container.append(el('p', 'ask-answer-kicker', kicker));
    container.append(el('h3', 'ask-answer-title', query));
    container.append(this._markdown(answer));
    if (Array.isArray(result.sources) && result.sources.length) {
      const row = el('div', 'ask-chip-row');
      for (const source of result.sources) {
        if (source?.slug && source?.term) row.append(this._chip(source.slug, source.term));
      }
      container.append(el('p', 'ask-answer-meta', 'Sources:'), row);
    }
  }

  /** Tiny, safe markdown-lite renderer: paragraphs, bold, italic, inline code. */
  _markdown(text) {
    const frag = document.createDocumentFragment();
    for (const raw of String(text || '').split(/\n{2,}/)) {
      const block = raw.trim();
      if (!block) continue;
      const para = el('p', 'ask-answer-def');
      para.innerHTML = this._inline(block);
      frag.appendChild(para);
    }
    return frag;
  }

  _inline(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  _chip(slug, label) {
    const button = el('button', 'ask-chip');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      button.blur();
      this.onOpenTerm?.(slug);
    });
    return button;
  }

  _render(result, query) {
    const container = this.answer;
    container.replaceChildren();
    if (result.type === 'compare') {
      container.append(
        el('p', 'ask-answer-kicker', 'Comparison'),
        el('h3', 'ask-answer-title', `${result.a.term} vs ${result.b.term}`)
      );
      container.append(this._termBlock(result.a));
      container.append(this._termBlock(result.b));
      container.append(this._neighborBlock('Shared concepts', result.shared));
      if (result.onlyA.length) container.append(this._neighborBlock(`Only in ${result.a.term}`, result.onlyA));
      if (result.onlyB.length) container.append(this._neighborBlock(`Only in ${result.b.term}`, result.onlyB));
    } else if (result.type === 'definition') {
      const entry = result.entry;
      container.append(
        el('p', 'ask-answer-kicker', entry.category),
        el('h3', 'ask-answer-title', entry.term)
      );
      if (entry.aliases.length) container.append(el('p', 'ask-answer-meta', `Also known as: ${entry.aliases.join(', ')}`));
      container.append(el('p', 'ask-answer-def', entry.definition));
      container.append(el('p', 'ask-answer-details', entry.details.slice(0, 500)));
      const link = sourceLink(entry);
      if (link) container.append(link);
      if (result.related.length) container.append(this._neighborBlock('Related concepts', result.related));
    } else if (result.type === 'broad') {
      container.append(el('p', 'ask-answer-kicker', 'Top matches'), el('h3', 'ask-answer-title', 'Terms that match'));
      for (const { entry } of result.results) {
        const row = el('div', 'ask-broad-row');
        row.append(this._chip(entry.slug, entry.term), el('p', 'ask-broad-def', entry.definition.slice(0, 220)));
        container.append(row);
      }
    } else {
      container.append(el('h3', 'ask-answer-title', 'Nothing matched'), el('p', 'ask-answer-meta', `No terms matched “${query}”.`));
      if (result.suggestions.length) {
        container.append(el('p', 'ask-answer-meta', 'Try one of these:'));
        const row = el('div', 'ask-chip-row');
        for (const entry of result.suggestions) row.append(this._chip(entry.slug, entry.term));
        container.append(row);
      }
    }
  }

  _termBlock(entry) {
    const block = el('section', 'ask-compare-term');
    block.append(el('h4', 'ask-compare-name', entry.term));
    block.append(el('p', 'ask-answer-def', entry.definition));
    const link = sourceLink(entry);
    if (link) block.append(link);
    return block;
  }

  _neighborBlock(title, slugs) {
    const block = el('section', 'ask-neighbors');
    block.append(el('h4', 'ask-neighbors-title', title));
    const row = el('div', 'ask-chip-row');
    for (const slug of slugs) {
      const entry = this._data.bySlug.get(slug);
      if (entry) row.append(this._chip(slug, entry.term));
    }
    block.append(row);
    return block;
  }
}
