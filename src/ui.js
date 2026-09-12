import { allTerms, findTerm, volumeByLetter, rangeTerms } from './terms.js';
import { letterColor, categoryColor } from './palette.js';

const $ = (id) => document.getElementById(id);

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];

// contents spread lists this many entries per page, then paginates
const CONTENTS_PAGE_SIZE = 10;

// below this width the two-page spread collapses to a single stacked page
const STACKED_QUERY = window.matchMedia('(max-width: 860px)');

/** Format a citation into a readable reference string. */
export function formatCitation(c) {
  const bits = [];
  if (c.authors && c.authors.length) {
    const names = c.authors.join(', ');
    bits.push(`${names}${c.year ? ' (' + c.year + ').' : '.'}`);
  } else if (c.year) {
    bits.push(`${c.year}.`);
  }
  if (c.title) bits.push(`${c.title}.`);
  if (c.venue) bits.push(c.venue + '.');
  return bits.join(' ');
}

export class UI {
  constructor({ onPickVolume, onPickTerm, onVolumeClose }) {
    this.onPickVolume = onPickVolume; // (folder, letter) => void
    this.onPickTerm = onPickTerm; // (slug) => void  (main runs the pull-out ritual)
    this.onVolumeClose = onVolumeClose; // () => void (main returns the book to the shelf)

    this._nav = $('letter-nav');
    this._search = $('search');
    this._results = $('results');
    this._spread = $('book-spread');
    this._spreadBook = $('spread-book');
    this._pageLeft = $('page-left');
    this._pageRight = $('page-right');
    this._flipLeaf = $('page-flip');
    this._counter = $('spread-counter');
    this._helpModal = $('help-modal');
    this._shareMenu = $('share-menu');
    this._toastEl = $('toast');
    this._shareAnchor = null;

    this._mode = 'index'; // 'index' | 'entry'
    this._folder = null;
    this._activeTerm = null;
    this._termList = [];
    this._termIndex = -1;
    this._indexPage = 0; // current contents page within the open volume
    this._indexPages = 1;
    this._flipping = false;
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._buildLetterNav();
    this._bind();
    this._syncSearchClear();
  }

  _bind() {
    $('help-btn').addEventListener('click', () => this._helpModal.classList.add('open'));
    $('help-close').addEventListener('click', () => this._helpModal.classList.remove('open'));
    $('help-backdrop').addEventListener('click', () => this._helpModal.classList.remove('open'));

    $('spread-close').addEventListener('click', () => this.closeSpread());
    $('spread-backdrop').addEventListener('click', () => this.closeSpread());
    $('spread-back').addEventListener('click', () => this.backToContents());
    $('spread-prev').addEventListener('click', () =>
      this._mode === 'index' ? this._stepIndex(-1) : this._stepEntry(-1)
    );
    $('spread-next').addEventListener('click', () =>
      this._mode === 'index' ? this._stepIndex(1) : this._stepEntry(1)
    );

    $('search-clear').addEventListener('click', () => {
      this._clearSearch();
      this._search.focus();
    });

    this._search.addEventListener('input', () => {
      this._syncSearchClear();
      this._onSearch();
    });
    this._search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this._moveResultCursor(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this._chooseCursor();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._onEscape();
      if (this.isSpreadOpen() && this._shareMenu.hidden) {
        if (this._mode === 'entry') {
          if (e.key === 'ArrowLeft') this._stepEntry(-1);
          if (e.key === 'ArrowRight') this._stepEntry(1);
        } else if (this._mode === 'index') {
          if (e.key === 'ArrowLeft') this._stepIndex(-1);
          if (e.key === 'ArrowRight') this._stepIndex(1);
          if (e.key === 'PageUp') {
            e.preventDefault();
            this._stepIndex(-1);
          }
          if (e.key === 'PageDown') {
            e.preventDefault();
            this._stepIndex(1);
          }
          if (e.key === 'Home') {
            e.preventDefault();
            this._gotoIndex(0);
          }
          if (e.key === 'End') {
            e.preventDefault();
            this._gotoIndex(this._indexPages - 1);
          }
        }
      }
      if (e.key === '/' && document.activeElement !== this._search) {
        e.preventDefault();
        this._search.focus();
      }
    });

    document.addEventListener('pointerdown', (e) => {
      if (this._results.classList.contains('open') && !this._results.contains(e.target) && e.target !== this._search) {
        this._closeResults();
      }
      if (
        !this._shareMenu.hidden &&
        !this._shareMenu.contains(e.target) &&
        !(e.target instanceof Element && e.target.closest('.pg-share'))
      ) {
        this.closeShareMenu();
      }
    });

    // the menu is anchored to a button that can scroll away or move on resize
    window.addEventListener('resize', () => this.closeShareMenu());
    this._spread
      .querySelector('.spread-pages')
      ?.addEventListener('scroll', () => this.closeShareMenu(), { passive: true });
  }

  // ---------- letter nav ----------
  _buildLetterNav() {
    const frag = document.createDocumentFragment();
    LETTERS.forEach((L) => {
      const b = document.createElement('button');
      b.textContent = L;
      b.dataset.letter = L;
      b.title = `Jump to words starting with ${L}`;
      b.addEventListener('click', () => {
        const vol = volumeByLetter(L);
        if (vol) this.onPickVolume(vol.folder, L);
      });
      frag.appendChild(b);
    });
    this._nav.appendChild(frag);
    this._navButtons = [...this._nav.querySelectorAll('button')];
  }

  setActiveVolume(folder, letter) {
    const L = letter || (folder ? folder.split('-')[0].toUpperCase() : '');
    this._navButtons.forEach((b) => {
      b.classList.toggle('active', !!L && b.dataset.letter === L);
    });
  }

  // ---------- reading spread ----------
  isSpreadOpen() {
    return this._spread.classList.contains('open');
  }

  _openSpread() {
    this._spread.classList.add('open');
    this._spread.setAttribute('aria-hidden', 'false');
    document.body.classList.add('reading');
  }

  _setMode(mode) {
    this._mode = mode;
    this._spreadBook.classList.toggle('mode-index', mode === 'index');
    this._spreadBook.classList.toggle('mode-entry', mode === 'entry');
    this.closeShareMenu(); // the share anchor belongs to the page being replaced
    this._syncBackButton();
  }

  /**
   * The "↩ Contents" control only makes sense while reading an entry: it turns
   * the spread back to the word list of the very volume the entry belongs to.
   */
  _syncBackButton() {
    const btn = $('spread-back');
    if (!btn) return;
    const vol = this._folder ? volumeByLetter(this._folder[0]) : null;
    const label = vol ? vol.label : '';
    btn.hidden = this._mode !== 'entry';
    btn.textContent = label ? `↩ ${label} contents` : '↩ Contents';
    const title = label ? `Back to the ${label} glossary` : 'Back to the glossary';
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }

  /** Leave an entry and return to its volume's contents spread (with a page turn). */
  backToContents() {
    if (this._mode !== 'entry' || !this._folder) return;
    this.openSpreadIndex(this._folder, { flip: true });
  }

  /** Open the book on its contents spread for a volume. */
  openSpreadIndex(folder, { flip = false } = {}) {
    const terms = rangeTerms(folder);
    if (!terms.length) return;
    const vol = volumeByLetter(terms[0].letter);
    if (this._folder !== vol.folder) this._indexPage = 0; // fresh volume starts on page 1
    this._folder = vol.folder;
    this._activeTerm = null;
    this._indexPages = Math.max(1, Math.ceil(terms.length / CONTENTS_PAGE_SIZE));
    this._indexPage = Math.min(this._indexPage, this._indexPages - 1);

    const render = () => {
      this._renderIndexPages(vol, terms);
      this._setMode('index');
      this._syncIndexChrome();
    };
    if (flip && this.isSpreadOpen()) {
      this._flip('prev', render);
    } else {
      render();
      this._openSpread();
    }
  }

  _renderIndexPages(vol, terms) {
    const [a, b] = vol.letters;
    const idx = ROMAN[Math.max(0, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(a) >> 1)];
    this._pageLeft.innerHTML = `
      <div class="idx-left">
        <p class="idx-kicker">Tokenary · AI Engineering</p>
        <p class="idx-ornament">✦&nbsp;&nbsp;❦&nbsp;&nbsp;✦</p>
        <h2 class="idx-range">${a} – ${b}</h2>
        <p class="idx-roman">Volume ${idx}</p>
        <div class="idx-chips">
          <span style="--chip:${letterColor(a)}">${a}</span>
          <span style="--chip:${letterColor(b)}">${b}</span>
        </div>
        <p class="idx-count">${terms.length} ${terms.length === 1 ? 'entry' : 'entries'}</p>
        <p class="idx-note">Choose a word from the contents<br />to begin reading.</p>
      </div>`;
    const pageTerms = terms.slice(
      this._indexPage * CONTENTS_PAGE_SIZE,
      (this._indexPage + 1) * CONTENTS_PAGE_SIZE
    );
    this._pageRight.innerHTML = `
      <div class="idx-right">
        <h3 class="contents-title">Contents</h3>
        <p class="contents-sub">${a} – ${b} · ${terms.length} ${terms.length === 1 ? 'entry' : 'entries'}${
      this._indexPages > 1 ? ` · page ${this._indexPage + 1} of ${this._indexPages}` : ''
    }</p>
        <ul class="contents-list"></ul>
      </div>`;
    const list = this._pageRight.querySelector('.contents-list');
    pageTerms.forEach((term) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'contents-row';
      btn.style.setProperty('--letter-color', letterColor(term.letter));
      btn.innerHTML = `
        <span class="c-term">${escapeHtml(term.term)}</span>
        <span class="c-dots" aria-hidden="true"></span>
        <span class="c-cat">${escapeHtml(term.category)}</span>`;
      btn.addEventListener('click', () => this.openEntry(term.slug, { from: 'volume', dir: 'next' }));
      li.appendChild(btn);
      list.appendChild(li);
    });

    // A long volume's contents span several sheets — draw the folio strip
    // (page numbers + turn arrows) on the paper so paging is obvious.
    if (this._indexPages > 1) this._appendIndexPager();
  }

  /** Build the "turn the page" strip printed on the contents sheet. */
  _appendIndexPager() {
    const pager = document.createElement('div');
    pager.className = 'idx-pager';
    pager.setAttribute('role', 'group');
    pager.setAttribute('aria-label', 'Contents pages');

    const mkArrow = (step, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pager-arrow';
      b.setAttribute('aria-label', label);
      b.title = label;
      b.textContent = step > 0 ? '›' : '‹';
      b.disabled = this._indexPage + step < 0 || this._indexPage + step >= this._indexPages;
      b.addEventListener('click', () => this._gotoIndex(this._indexPage + step));
      return b;
    };

    const label = document.createElement('span');
    label.className = 'pager-label';
    label.textContent = 'page';

    const nums = document.createElement('span');
    nums.className = 'pager-nums';
    for (let p = 0; p < this._indexPages; p++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pager-num' + (p === this._indexPage ? ' current' : '');
      b.textContent = p + 1;
      b.setAttribute('aria-label', `Go to contents page ${p + 1}`);
      if (p === this._indexPage) {
        b.disabled = true; // the current-page chip acts as a static marker
        b.setAttribute('aria-current', 'page');
      }
      b.addEventListener('click', () => this._gotoIndex(p));
      nums.appendChild(b);
    }

    pager.append(mkArrow(-1, 'Previous contents page'), label, nums, mkArrow(1, 'Next contents page'));
    this._pageRight.querySelector('.idx-right').appendChild(pager);
  }

  /** Turn a contents page (index mode pagination). */
  _stepIndex(dir) {
    if (this._mode !== 'index' || this._indexPages <= 1) return;
    this._gotoIndex(this._indexPage + dir);
  }

  /** Jump the contents spread to an absolute page (0-based), turning the leaf. */
  _gotoIndex(page) {
    if (this._mode !== 'index' || !this._folder) return;
    if (page < 0 || page >= this._indexPages || page === this._indexPage) return;
    const dir = page > this._indexPage ? 'next' : 'prev';
    this._indexPage = page;
    this._flip(dir, () => {
      const terms = rangeTerms(this._folder);
      if (!terms.length) return;
      const vol = volumeByLetter(terms[0].letter);
      this._renderIndexPages(vol, terms);
      this._syncIndexChrome();
    });
  }

  _syncIndexChrome() {
    this._counter.textContent =
      this._indexPages > 1 ? `Contents · page ${this._indexPage + 1} of ${this._indexPages}` : 'Contents';
    this._syncSpreadNav();
  }

  /** Prev/next buttons: paginate in index mode, wrap through entries in entry mode. */
  _syncSpreadNav() {
    const prev = $('spread-prev');
    const next = $('spread-next');
    const atFirst = this._mode === 'index' && this._indexPage <= 0;
    const atLast = this._mode === 'index' && this._indexPage >= this._indexPages - 1;
    prev.disabled = atFirst;
    next.disabled = atLast;

    // In contents mode these buttons page through the sheets; in entry mode
    // they wrap through individual words instead.
    const prevLabel = this._mode === 'index' ? 'Previous contents page' : 'Previous entry';
    const nextLabel = this._mode === 'index' ? 'Next contents page' : 'Next entry';
    prev.title = prevLabel;
    next.title = nextLabel;
    prev.setAttribute('aria-label', prevLabel);
    next.setAttribute('aria-label', nextLabel);
  }

  /**
   * Open the book on a term's entry spread.
   * Without opts.from this only notifies main (which pulls the book out first);
   * main then calls back with { from: 'ritual' } once the 3D book is open.
   */
  openEntry(slug, opts = {}) {
    const term = findTerm(slug);
    if (!term) return;
    if (!opts.from) {
      if (this.onPickTerm) this.onPickTerm(term.slug);
      return;
    }

    this._activeTerm = term;
    const vol = volumeByLetter(term.letter);
    this._folder = vol.folder;
    this._termList = rangeTerms(vol.folder);
    this._termIndex = this._termList.findIndex((t) => t.slug === slug);

    const render = () => {
      this._renderEntryPages(term, vol);
      this._setMode('entry');
      this._counter.textContent = `${this._termIndex + 1} of ${this._termList.length} · ${vol.label}`;
      this._syncSpreadNav();
    };

    if (!this.isSpreadOpen()) {
      render();
      this._openSpread();
    } else if (this._mode === 'index') {
      this._flip('next', render);
    } else {
      this._flip(opts.dir || 'next', render);
    }
  }

  _renderEntryPages(term, vol) {
    const catCol = categoryColor(term.category);
    const citation = formatCitation(term.citation);
    this._pageLeft.innerHTML = `
      <div class="pg-entry">
        <div class="pg-head">
          <p class="pg-kicker">${escapeHtml(term.category)}</p>
          <button class="pg-share" type="button" aria-haspopup="dialog" aria-expanded="false"
                  title="Share “${escapeHtml(term.term)}”">
            <span aria-hidden="true">↗</span> Share
          </button>
        </div>
        <h2 class="pg-term">${escapeHtml(term.term)}</h2>
        ${term.aka.length ? `<p class="pg-aka">also known as: ${escapeHtml(term.aka.join(', '))}</p>` : ''}
        <p class="pg-rule"></p>
        <p class="pg-def">${escapeHtml(term.definition)}</p>
      </div>`;
    this._pageLeft.querySelector('.pg-share')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleShareMenu(e.currentTarget);
    });
    this._pageRight.innerHTML = `
      <div class="pg-entry">
        <p class="pg-details">${escapeHtml(term.details)}</p>
        ${
          citation || term.citation.url
            ? `<aside class="pg-citation">
                 <h3>❦&nbsp; Citation</h3>
                 <p class="pg-citation-text">${escapeHtml(citation)}</p>
                 ${
                   term.citation.url
                     ? `<a class="pg-citation-link" href="${term.citation.url}" target="_blank" rel="noopener"
                          aria-label="Open source: ${escapeHtml(term.citation.title)}">Read the source&nbsp;↗</a>`
                     : ''
                 }
               </aside>`
            : ''
        }
      </div>`;
  }

  _stepEntry(dir) {
    if (this._mode !== 'entry' || this._termIndex === -1 || !this._termList.length) return;
    const next = (this._termIndex + dir + this._termList.length) % this._termList.length;
    this.openEntry(this._termList[next].slug, { from: 'volume', dir: dir > 0 ? 'next' : 'prev' });
  }

  /** Paper page-turn: the leaf covers the right page, content swaps mid-flip. */
  _flip(dir, swap) {
    const leaf = this._flipLeaf;
    // the turning leaf needs the two-page spread; stacked layouts swap instantly
    const instant = this._reducedMotion || STACKED_QUERY.matches;
    if (instant || this._flipping) {
      swap();
      return;
    }
    this._flipping = true;
    leaf.classList.remove('hidden');
    leaf.style.transition = 'none';
    leaf.style.transform = dir === 'prev' ? 'rotateY(-179deg)' : 'rotateY(0deg)';
    leaf.getBoundingClientRect(); // force reflow so the start pose sticks
    requestAnimationFrame(() => {
      leaf.style.transition = '';
      leaf.style.transform = dir === 'prev' ? 'rotateY(0deg)' : 'rotateY(-179deg)';
      setTimeout(swap, 240);
      setTimeout(() => {
        leaf.classList.add('hidden');
        leaf.style.transition = 'none';
        leaf.style.transform = 'rotateY(0deg)';
        this._flipping = false;
      }, 580);
    });
  }

  closeSpread({ silent = false } = {}) {
    if (!this.isSpreadOpen()) return;
    this.closeShareMenu();
    this._spread.classList.remove('open');
    this._spread.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('reading');
    this._activeTerm = null;
    this._termIndex = -1;
    this.setActiveVolume(null);
    if (!silent && this.onVolumeClose) this.onVolumeClose();
  }

  // ---------- share ----------
  /** Canonical deep link that reopens this entry. */
  _shareUrl() {
    const slug = this._activeTerm ? this._activeTerm.slug : null;
    if (!slug) return location.href;
    return `${location.origin}${location.pathname}?term=${encodeURIComponent(slug)}`;
  }

  /** A ready-to-paste blurb: term, definition, link and source. */
  _shareBlurb() {
    const t = this._activeTerm;
    if (!t) return this._shareUrl();
    const lines = [`${t.term} — ${t.definition}`, '', `Read it in Tokenary: ${this._shareUrl()}`];
    const cite = formatCitation(t.citation);
    if (cite) lines.push('', `Source: ${cite}`);
    return lines.join('\n');
  }

  toggleShareMenu(anchor) {
    if (!this._shareMenu.hidden && this._shareAnchor === anchor) return this.closeShareMenu();
    this.openShareMenu(anchor);
  }

  openShareMenu(anchor) {
    if (!this._activeTerm) return;
    this._shareAnchor = anchor;
    this._buildShareMenu();
    this._shareMenu.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    this._positionShareMenu(anchor);
    this._shareMenu.querySelector('.share-item')?.focus({ preventScroll: true });
  }

  closeShareMenu({ restoreFocus = false } = {}) {
    if (this._shareMenu.hidden) return;
    this._shareMenu.hidden = true;
    this._shareMenu.innerHTML = '';
    const anchor = this._shareAnchor;
    this._shareAnchor = null;
    if (anchor) {
      anchor.setAttribute('aria-expanded', 'false');
      if (restoreFocus && document.contains(anchor)) anchor.focus({ preventScroll: true });
    }
  }

  _positionShareMenu(anchor) {
    const menu = this._shareMenu;
    const a = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const pad = 10;
    // right-align under the button, then keep it inside the viewport
    const left = Math.min(Math.max(pad, a.right - mw), window.innerWidth - mw - pad);
    let top = a.bottom + 8;
    if (top + mh > window.innerHeight - pad) top = Math.max(pad, a.top - mh - 8);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  _buildShareMenu() {
    const menu = this._shareMenu;
    const t = this._activeTerm;
    menu.innerHTML = '';
    if (!t) return;

    const url = this._shareUrl();
    const title = `${t.term} — The AI Engineering Dictionary`;
    const blurb = this._shareBlurb();

    const heading = document.createElement('p');
    heading.className = 'share-menu-title';
    heading.textContent = `Share “${t.term}”`;
    menu.appendChild(heading);

    const addItem = (icon, label, sub, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'share-item';
      b.setAttribute('role', 'menuitem');
      b.innerHTML = `<span class="si-icon" aria-hidden="true">${icon}</span>
        <span><span class="si-label">${escapeHtml(label)}</span>${
          sub ? `<span class="si-sub">${escapeHtml(sub)}</span>` : ''
        }</span>`;
      b.addEventListener('click', onClick);
      menu.appendChild(b);
      return b;
    };

    // Native share sheet first where the platform supports it (mostly mobile).
    if (navigator.share) {
      addItem('⤴', 'Share…', "Use your device's share sheet", async () => {
        this.closeShareMenu();
        try {
          await navigator.share({ title, text: `${t.term} — ${t.definition}`, url });
        } catch {
          /* the user dismissed the sheet */
        }
      });
    }

    addItem('⧉', 'Copy link', 'Paste it anywhere', async (e) => {
      const btn = e.currentTarget;
      if (!(await this._copyText(url))) {
        this._toast('Copying was blocked — use the address bar to copy the link');
        return;
      }
      btn.classList.add('copied');
      btn.querySelector('.si-label').textContent = 'Link copied';
      btn.querySelector('.si-sub').textContent = 'Ready to paste';
      setTimeout(() => this.closeShareMenu(), 900);
    });

    addItem('in', 'LinkedIn', 'Share as a post', () => {
      this.closeShareMenu();
      this._openWindow(
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
      );
    });

    addItem('X', 'X', 'Post to X', () => {
      this.closeShareMenu();
      this._openWindow(
        `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`
      );
    });

    addItem('M', 'Medium', 'Copies the entry & opens the editor', async () => {
      await this._copyText(blurb);
      this.closeShareMenu();
      this._toast('Entry copied — paste it into your Medium story');
      this._openWindow('https://medium.com/new-story');
    });

    addItem('✉', 'Email', 'Send the entry to someone', () => {
      this.closeShareMenu();
      location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(blurb)}`;
    });
  }

  async _copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through to the legacy path */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  _openWindow(url) {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) w.opener = null;
  }

  _toast(message) {
    const el = this._toastEl;
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ---------- search ----------
  _onSearch() {
    const q = this._search.value;
    if (!q) return this._closeResults();
    const results = this._searchResults(q).slice(0, 8);
    this._renderResults(results);
  }

  _searchResults(q) {
    const s = q.toLowerCase();
    return allTerms.filter(
      (t) =>
        t.term.toLowerCase().includes(s) ||
        t.category.toLowerCase().includes(s) ||
        t.aka.some((a) => a.toLowerCase().includes(s)) ||
        (t.citation.title || '').toLowerCase().includes(s) ||
        t.citation.authors.some((a) => a.toLowerCase().includes(s))
    );
  }

  _renderResults(results) {
    this._results.innerHTML = '';
    if (results.length === 0) {
      const d = document.createElement('div');
      d.className = 'results-empty';
      d.textContent = 'No matches — try “transformer”, “quantization”…';
      this._results.appendChild(d);
      this._resultItems = [];
    } else {
      this._resultItems = results.map((term) => {
        const b = document.createElement('button');
        b.className = 'result-item';
        const col = letterColor(term.letter);
        b.style.setProperty('--letter-color', col);
        b.innerHTML = `<span class="ri-letter">${term.letter}</span>
          <span>
            <span class="ri-term">${escapeHtml(term.term)}</span><br />
            <span class="ri-meta">${escapeHtml(term.category)} · ${escapeHtml(
          (term.citation.title || '').slice(0, 60)
        )}</span>
          </span>`;
        b.addEventListener('click', () => {
          this._closeResults();
          this._search.blur();
          this.openEntry(term.slug);
        });
        this._results.appendChild(b);
        return b;
      });
    }
    this._results.classList.add('open');
    this._resultCursor = -1;
  }

  _moveResultCursor(dir) {
    if (!this._resultItems || !this._resultItems.length) return;
    const n = this._resultItems.length;
    this._resultCursor = (this._resultCursor + dir + n) % n;
    this._resultItems.forEach((b, i) => {
      b.style.background = i === this._resultCursor ? 'rgba(255,255,255,0.1)' : '';
    });
  }

  _chooseCursor() {
    const items = this._resultItems;
    const pick = (items && items[this._resultCursor]) || (items && items[0]);
    if (pick) pick.click();
  }

  _closeResults() {
    this._results.classList.remove('open');
    this._resultItems = [];
  }

  /** Show the ✕ only when there is something to clear (never overlaps a hint). */
  _syncSearchClear() {
    const btn = $('search-clear');
    if (btn) btn.hidden = this._search.value.length === 0;
  }

  _clearSearch() {
    this._search.value = '';
    this._syncSearchClear();
    this._closeResults();
  }

  _onEscape() {
    if (!this._shareMenu.hidden) return this.closeShareMenu({ restoreFocus: true });
    if (this._helpModal.classList.contains('open')) return this._helpModal.classList.remove('open');
    // Esc inside a filled search box clears it first
    if (this._search === document.activeElement && this._search.value) {
      return this._clearSearch();
    }
    if (this._results.classList.contains('open')) return this._closeResults();
    if (this.isSpreadOpen()) {
      if (this._mode === 'entry' && this._folder) {
        // first Esc returns to the book's contents page
        return this.backToContents();
      }
      return this.closeSpread();
    }
    if (this._search === document.activeElement) this._search.blur();
  }

  clearAll() {
    this._closeResults();
    this.closeSpread();
  }
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
