// In-app "Contribute" flow: build valid dictionary entries in the browser and
// hand them to the maintainer as a prefilled GitHub issue — no backend needed.
import {
  normalizeTerm,
  rangeFolderForLetter,
  slugifyTerm,
  validateTerm,
} from './term-schema.js';

export const REPO = 'zac11/llm-dictionary';
export const MAX_TERMS_PER_SUBMISSION = 5;
export const MAX_ISSUE_URL_LENGTH = 7500;

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** Turn one form row into a normalized term plus its validation issues. */
export function formRowToTerm(row) {
  const raw = {
    term: String(row.term || '').trim(),
    category: String(row.category || '').trim() || 'General',
    definition: String(row.definition || '').trim(),
    details: String(row.details || '').trim(),
  };
  const aka = splitList(row.aka);
  if (aka.length) raw.aka = aka;
  const related = splitList(row.related).map((value) => slugifyTerm(value));
  if (related.length) raw.related = related;

  const citation = {
    title: String(row.citeTitle || '').trim(),
    authors: splitList(row.citeAuthors),
    year: String(row.citeYear || '').trim(),
    venue: String(row.citeVenue || '').trim(),
    url: String(row.citeUrl || '').trim(),
  };
  if (citation.title || citation.authors.length || citation.year || citation.venue || citation.url) {
    raw.citation = citation;
  }

  const term = normalizeTerm(raw);
  const issues = validateTerm(term, { raw });
  return { term, issues: issues.filter((issue) => issue.level === 'error') };
}

/** Cross-term checks: duplicates inside the batch, collisions with the live
 * corpus, and related slugs that exist neither in the corpus nor the batch. */
export function collectBatchIssues(entries, { knownSlugs = null } = {}) {
  const issues = [];
  const batchSlugs = new Set();
  for (const { term } of entries) {
    if (!term) continue;
    if (batchSlugs.has(term.slug)) {
      issues.push(`“${term.term}” is submitted twice (slug ${term.slug}).`);
    }
    batchSlugs.add(term.slug);
  }
  if (knownSlugs) {
    for (const { term } of entries) {
      if (term && knownSlugs.has(term.slug)) {
        issues.push(`“${term.term}” already exists in the dictionary (slug ${term.slug}).`);
      }
    }
  }
  for (const { term } of entries) {
    if (!term) continue;
    for (const related of term.related) {
      if (batchSlugs.has(related)) continue;
      if (knownSlugs && !knownSlugs.has(related)) {
        issues.push(`“${term.term}” relates to unknown slug “${related}”.`);
      }
    }
  }
  return issues;
}

/** The repo path a term's JSON file should be created at. */
export function termFilePath(term) {
  return `dictionary/${rangeFolderForLetter(term.letter)}/${term.slug}.json`;
}

/** File body for one term, in the key order existing dictionary files use. */
export function termFileJson(term) {
  const out = {
    term: term.term,
    letter: term.letter,
    category: term.category,
  };
  if (term.aka.length) out.aka = term.aka;
  out.definition = term.definition;
  out.details = term.details;
  if (term.related.length) out.related = term.related;
  const citation = term.citation;
  if (citation.title) {
    out.citation = {
      title: citation.title,
      ...(citation.authors.length ? { authors: citation.authors } : {}),
      ...(citation.year ? { year: /^\d+$/.test(String(citation.year)) ? Number(citation.year) : citation.year } : {}),
      ...(citation.venue ? { venue: citation.venue } : {}),
      ...(citation.url ? { url: citation.url } : {}),
    };
  }
  out.slug = term.slug;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** Markdown body for the prefilled GitHub issue. */
export function buildIssueBody(terms) {
  const blocks = terms
    .map((term) => [`#### \`${termFilePath(term)}\``, '', '```json', termFileJson(term).trimEnd(), '```'].join('\n'))
    .join('\n\n');
  return [
    '## New term submission',
    '',
    'Submitted through the in-app Contribute form.',
    '',
    '### Files to create',
    '',
    blocks,
    '',
    '### Maintainer checklist',
    '',
    '- [ ] `npm run graph:check` passes (slugs, letter folders, related targets)',
    '- [ ] Category and citation look right',
    '- [ ] Optionally generate a story (`npm run stories`)',
  ].join('\n');
}

/** Prefilled https://github.com/<repo>/issues/new URL for these terms. */
export function buildIssueUrl(terms) {
  const names = terms.map((term) => term.term);
  const title =
    terms.length === 1
      ? `Add term: ${names[0]}`
      : `Add ${terms.length} terms: ${names.slice(0, 3).join(', ')}${terms.length > 3 ? ', …' : ''}`;
  const params = new URLSearchParams({
    title,
    labels: 'term-contribution',
    body: buildIssueBody(terms),
  });
  return `https://github.com/${REPO}/issues/new?${params.toString()}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const FIELDS = [
  { name: 'term', label: 'Term name', required: true, placeholder: 'e.g. Mixture of Experts' },
  { name: 'category', label: 'Category', placeholder: 'General' },
  { name: 'aka', label: 'Also known as (comma-separated)', placeholder: 'MoE' },
  { name: 'definition', label: 'Definition (one sentence)', required: true, textarea: true, rows: 2 },
  { name: 'details', label: 'Details (why it matters)', required: true, textarea: true, rows: 3 },
  { name: 'related', label: 'Related terms (comma-separated)', placeholder: 'e.g. transformers, attention' },
];

const CITATION_FIELDS = [
  { name: 'citeTitle', label: 'Citation title' },
  { name: 'citeAuthors', label: 'Citation authors (comma-separated)' },
  { name: 'citeYear', label: 'Citation year' },
  { name: 'citeVenue', label: 'Citation venue' },
  { name: 'citeUrl', label: 'Citation URL', type: 'url' },
];

export class ContributeForm {
  constructor(root) {
    this.root = root;
    this.terms = root.querySelector('#contribute-terms');
    this.form = root.querySelector('#contribute-form');
    this.addButton = root.querySelector('#contribute-add');
    this.status = root.querySelector('#contribute-status');
    this.review = root.querySelector('#contribute-review');
    this._slugs = null; // null = corpus not loaded (checks skipped)
    this._corpusPromise = null;
    this._bind();
  }

  _bind() {
    this.addButton.addEventListener('click', () => this._addRow());
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this._submit();
    });
  }

  async open() {
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    if (!this.terms.children.length) this._addRow();
    this._loadSlugs();
    this.form.querySelector('input[name="term"]')?.focus();
  }

  close() {
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
  }

  /** Fetch the public retrieval corpus to learn which slugs already exist. */
  _loadSlugs() {
    if (this._corpusPromise) return this._corpusPromise;
    this._corpusPromise = (async () => {
      const manifestResponse = await fetch('/generated/manifest.json', { cache: 'no-cache' });
      if (!manifestResponse.ok) throw new Error('manifest');
      const manifest = await manifestResponse.json();
      const response = await fetch(manifest.retrievalUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error('corpus');
      const corpus = await response.json();
      this._slugs = new Map(corpus.terms.map((entry) => [entry.slug, entry.term]));
    })().catch(() => {
      this._slugs = null; // offline: skip existence checks, maintainer review still guards
    });
    return this._corpusPromise;
  }

  _addRow() {
    if (this.terms.children.length >= MAX_TERMS_PER_SUBMISSION) {
      this.status.textContent = `Up to ${MAX_TERMS_PER_SUBMISSION} terms per submission — submit these first.`;
      return;
    }
    this.status.textContent = '';
    const index = this.terms.children.length;
    const fieldset = el('fieldset', 'contribute-term');
    const legend = el('legend', 'contribute-term-title', `Term ${index + 1}`);
    fieldset.append(legend);
    const remove = el('button', 'contribute-remove', 'Remove');
    remove.type = 'button';
    remove.hidden = index === 0;
    remove.addEventListener('click', () => {
      fieldset.remove();
      this._renumber();
    });
    fieldset.append(remove);

    for (const field of FIELDS) {
      fieldset.append(this._field(field));
    }
    const details = el('details', 'contribute-citation');
    details.append(el('summary', '', 'Add a citation (optional)'));
    for (const field of CITATION_FIELDS) {
      details.append(this._field(field));
    }
    fieldset.append(details);
    this.terms.append(fieldset);
    this._renumber();
    fieldset.querySelector('input[name="term"]')?.focus();
  }

  _field({ name, label, required = false, placeholder = '', textarea = false, rows = 2, type = 'text' }) {
    const wrapper = el('label', 'contribute-label');
    wrapper.append(el('span', '', required ? `${label} *` : label));
    const input = textarea ? el('textarea') : el('input');
    input.name = name;
    if (!textarea) input.type = type;
    if (textarea) input.rows = rows;
    if (required) input.required = true;
    if (placeholder) input.placeholder = placeholder;
    wrapper.append(input);
    return wrapper;
  }

  _renumber() {
    [...this.terms.children].forEach((fieldset, index) => {
      fieldset.querySelector('.contribute-term-title').textContent = `Term ${index + 1}`;
      fieldset.querySelector('.contribute-remove').hidden = this.terms.children.length === 1;
    });
    this.addButton.disabled = this.terms.children.length >= MAX_TERMS_PER_SUBMISSION;
  }

  _readRows() {
    return [...this.terms.children].map((fieldset) => {
      const row = {};
      for (const input of fieldset.querySelectorAll('input, textarea')) {
        row[input.name] = input.value;
      }
      return row;
    });
  }

  async _submit() {
    this.status.textContent = '';
    this.review.replaceChildren();
    this.review.hidden = true;

    const entries = this._readRows().map((row) => formRowToTerm(row));
    const problems = [];
    entries.forEach(({ term, issues }, index) => {
      for (const issue of issues) {
        problems.push(`Term ${index + 1}: ${issue.message}`);
      }
      if (!term) problems.push(`Term ${index + 1}: a term name is required.`);
    });

    await this._corpusPromise; // best-effort; resolves to slugs or null
    const validTerms = entries.map(({ term }) => term).filter(Boolean);
    problems.push(...collectBatchIssues(entries, { knownSlugs: this._slugs }));

    if (problems.length) {
      this.status.textContent = problems[0];
      this._renderProblems(problems);
      return;
    }

    const url = buildIssueUrl(validTerms);
    this._renderReview(validTerms, url);
  }

  _renderProblems(problems) {
    const list = el('ul', 'contribute-problems');
    for (const problem of problems) list.append(el('li', '', problem));
    this.review.replaceChildren(list);
    this.review.hidden = false;
  }

  _renderReview(terms, url) {
    const box = this.review;
    box.replaceChildren();
    box.append(el('h3', 'contribute-review-title', 'Review and submit'));
    box.append(
      el(
        'p',
        'contribute-review-note',
        'A prefilled GitHub issue opens in a new tab — press “Create” there to send it. You can also copy each file and add it manually.'
      )
    );
    for (const term of terms) {
      const card = el('section', 'contribute-file');
      const head = el('div', 'contribute-file-head');
      head.append(el('code', 'contribute-file-path', termFilePath(term)));
      const copy = el('button', 'contribute-copy', 'Copy JSON');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        const ok = await this._copy(termFileJson(term));
        copy.textContent = ok ? 'Copied!' : 'Copy failed';
        setTimeout(() => (copy.textContent = 'Copy JSON'), 1800);
      });
      head.append(copy);
      card.append(head);
      card.append(el('pre', 'contribute-json', termFileJson(term)));
      box.append(card);
    }

    if (url.length <= MAX_ISSUE_URL_LENGTH) {
      this.status.textContent = 'Opening a prefilled GitHub issue in a new tab…';
      window.open(url, '_blank', 'noopener');
    } else {
      const link = el('a', 'contribute-blank-issue', 'Open a blank issue instead');
      link.href = `https://github.com/${REPO}/issues/new`;
      link.target = '_blank';
      link.rel = 'noopener';
      box.append(link);
      this.status.textContent = 'Too much text for a prefilled link — copy each JSON file above and paste it into the issue.';
    }
    box.hidden = false;
  }

  async _copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = el('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    }
  }
}
