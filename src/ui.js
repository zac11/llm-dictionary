import {
  allTerms,
  findTerm,
  volumeByLetter,
  rangeTerms,
} from './terms.js';
import { letterColor, categoryColor } from './palette.js';

const $ = (id) => document.getElementById(id);

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

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
    this.onPickTerm = onPickTerm; // (slug) => void  (lets main focus the 3D volume)
    this.onVolumeClose = onVolumeClose; // () => void (lets main clear 3D selection)

    this._nav = $('letter-nav');
    this._search = $('search');
    this._results = $('results');
    this._volumePanel = $('volume-panel');
    this._volumeTerms = $('volume-terms');
    this._volumeTitle = $('volume-title');
    this._volumeCount = $('volume-count');
    this._volumeKicker = $('volume-kicker');
    this._entryModal = $('entry-modal');
    this._entryCard = $('entry-card');
    this._helpModal = $('help-modal');

    this._activeVolume = null;
    this._activeTerm = null;
    this._termList = [];
    this._termIndex = -1;

    this._buildLetterNav();
    this._bind();
  }

  _bind() {
    $('help-btn').addEventListener('click', () => this._helpModal.classList.add('open'));
    $('help-close').addEventListener('click', () => this._helpModal.classList.remove('open'));
    $('help-backdrop').addEventListener('click', () => this._helpModal.classList.remove('open'));

    $('volume-close').addEventListener('click', () => this.closeVolume());
    $('modal-backdrop').addEventListener('click', () => this.closeEntry());
    $('entry-close').addEventListener('click', () => this.closeEntry());
    $('entry-prev').addEventListener('click', () => this._stepEntry(-1));
    $('entry-next').addEventListener('click', () => this._stepEntry(1));

    this._search.addEventListener('input', () => this._onSearch());
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
      if (e.key === 'ArrowLeft' && this._entryModal.classList.contains('open')) this._stepEntry(-1);
      if (e.key === 'ArrowRight' && this._entryModal.classList.contains('open')) this._stepEntry(1);
      if (e.key === '/' && document.activeElement !== this._search) {
        e.preventDefault();
        this._search.focus();
      }
    });

    document.addEventListener('pointerdown', (e) => {
      if (this._results.classList.contains('open') && !this._results.contains(e.target) && e.target !== this._search) {
        this._closeResults();
      }
    });
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
    this._activeVolume = folder;
    const L = letter || (folder ? folder.split('-')[0].toUpperCase() : '');
    this._navButtons.forEach((b) => {
      b.classList.toggle('active', !!L && b.dataset.letter === L);
    });
  }

  // ---------- volume panel ----------
  openVolume(folder) {
    const terms = rangeTerms(folder);
    if (!terms.length) return;
    const vol = volumeByLetter(terms[0].letter);
    this._volumeTitle.textContent = vol.label;
    this._volumeCount.textContent = `${terms.length} ${
      terms.length === 1 ? 'entry' : 'entries'
    } in this volume`;
    this._volumeTerms.innerHTML = '';
    terms.forEach((term, i) => {
      const li = document.createElement('li');
      li.style.animationDelay = `${i * 0.03}s`;
      const btn = document.createElement('button');
      btn.className = 'term-row';
      const col = letterColor(term.letter);
      btn.style.setProperty('--letter-color', col);
      btn.innerHTML = `
        <span class="t-letter">${term.letter}</span>
        <span class="t-main">
          <span class="t-term">${escapeHtml(term.term)}</span><br />
          <span class="t-cat">${escapeHtml(term.category)}</span>
        </span>
        <span style="margin-left:auto;color:var(--ink-faint)">›</span>`;
      btn.addEventListener('click', () => this.openEntry(term.slug, { from: 'volume' }));
      li.appendChild(btn);
      this._volumeTerms.appendChild(li);
    });
    this._volumePanel.classList.add('open');
  }

  closeVolume() {
    this._volumePanel.classList.remove('open');
    this._activeVolume = null;
    this.setActiveVolume(null);
    if (this.onVolumeClose) this.onVolumeClose();
  }

  isVolumeOpen() {
    return this._volumePanel.classList.contains('open');
  }

  // ---------- entry ----------
  openEntry(slug, opts = {}) {
    const term = findTerm(slug);
    if (!term) return;
    this._activeTerm = term;
    const vol = volumeByLetter(term.letter);
    this._termList = rangeTerms(vol.folder);
    this._termIndex = this._termList.findIndex((t) => t.slug === slug);

    const col = letterColor(term.letter);
    const catCol = categoryColor(term.category);

    $('entry-letter').style.setProperty('--letter-color', col);
    $('entry-letter').textContent = term.letter;
    $('entry-kicker').textContent = term.category;
    $('entry-kicker').style.color = catCol;
    $('entry-term').textContent = term.term;
    $('entry-aka').textContent = term.aka.length ? `also known as: ${term.aka.join(', ')}` : '';
    $('entry-definition').textContent = term.definition;
    $('entry-details').textContent = term.details;
    $('entry-citation').textContent = formatCitation(term.citation);
    const link = $('entry-citation-link');
    if (term.citation.url) {
      link.href = term.citation.url;
      link.style.display = '';
      link.setAttribute('aria-label', `Open source: ${term.citation.title}`);
    } else {
      link.style.display = 'none';
    }
    $('entry-counter').textContent = `${this._termIndex + 1} of ${this._termList.length} · ${vol.label}`;

    this._entryModal.classList.add('open');
    this._entryCard.scrollTop = 0;
    // re-focus to enable arrow-key nav but avoid showing focus ring
    this._entryCard.focus({ preventScroll: true });

    if (opts.from !== 'volume' && this.onPickTerm) {
      this.onPickTerm(term.slug);
    }
  }

  _stepEntry(dir) {
    if (this._termIndex === -1 || !this._termList.length) return;
    const next = (this._termIndex + dir + this._termList.length) % this._termList.length;
    this.openEntry(this._termList[next].slug, { from: 'volume' });
  }

  closeEntry() {
    this._entryModal.classList.remove('open');
    this._activeTerm = null;
  }

  isEntryOpen() {
    return this._entryModal.classList.contains('open');
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
    const wasOpen = this._results.classList.contains('open');
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
          this.openEntry(term.slug);
        });
        this._results.appendChild(b);
        return b;
      });
    }
    if (!wasOpen && results.length === 0) {
      // keep it visible only if there is content or a message
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
    if (this._resultItems && this._resultItems[this._resultCursor]) {
      this._resultItems[this._resultCursor].click();
    }
  }

  _closeResults() {
    this._results.classList.remove('open');
    this._resultItems = [];
  }

  _onEscape() {
    if (this._entryModal.classList.contains('open')) return this.closeEntry();
    if (this._results.classList.contains('open')) return this._closeResults();
    if (this._volumePanel.classList.contains('open')) return this.closeVolume();
    if (this._helpModal.classList.contains('open')) return this._helpModal.classList.remove('open');
    if (this._search === document.activeElement) this._search.blur();
  }

  clearAll() {
    this._closeResults();
    this.closeEntry();
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
