// Local, grounded Q&A over the generated retrieval corpus. Works offline, no key.
import { normalizeGraphLabel, tokenizeText } from './term-schema.js';

const RETRIEVAL_SCHEMA_VERSION = 1;

let corpusPromise = null;

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

function scoreEntry(entry, ql, qTokens) {
  let score = 0;
  const reasons = [];
  const termNorm = normalizeGraphLabel(entry.term);
  if (entry.slug === ql || termNorm === ql) {
    score += 100;
    reasons.push('exact-term');
  } else if (entry.aliases.some((alias) => normalizeGraphLabel(alias) === ql)) {
    score += 85;
    reasons.push('exact-alias');
  } else {
    if (ql.length >= 3 && termNorm.startsWith(ql)) {
      score += 60;
      reasons.push('prefix');
    }
    const termSet = new Set(entry.termTokens);
    const termOverlap = qTokens.filter((token) => termSet.has(token)).length;
    if (termOverlap) {
      score += 35 + termOverlap * 8;
      reasons.push(`term-tokens:${termOverlap}`);
    }
    const textSet = new Set(entry.textTokens);
    const textOverlap = qTokens.filter((token) => textSet.has(token)).length;
    if (textOverlap) {
      score += 8 + textOverlap;
      reasons.push(`text-tokens:${textOverlap}`);
    }
    if (normalizeGraphLabel(entry.category) === ql) {
      score += 15;
      reasons.push('category');
    }
  }
  return { entry, score, reasons };
}

/** Deterministic weighted ranker over the corpus. Exported for tests. */
export function rankTerms(query, corpus, { limit = 8 } = {}) {
  const ql = normalizeGraphLabel(query);
  const qTokens = tokenizeText(query);
  return corpus.terms
    .map((entry) => scoreEntry(entry, ql, qTokens))
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
      entry.slug === norm ||
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

export class AskChat {
  constructor(root, { onOpenTerm } = {}) {
    this.root = root;
    this.onOpenTerm = onOpenTerm;
    this.input = root.querySelector('#ask-input');
    this.form = root.querySelector('#ask-form');
    this.answer = root.querySelector('#ask-answer');
    this.status = root.querySelector('#ask-status');
    this._data = null;
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

  _answer() {
    const query = this.input.value.trim();
    if (!query) return;
    if (!this._data) {
      this.status.textContent = 'The index is still loading — one moment.';
      return;
    }
    const { corpus, bySlug } = this._data;
    this._render(synthesize(query, corpus, bySlug), query);
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
