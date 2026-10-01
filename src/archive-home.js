// Archive home controller: the editorial welcome panel, About tab, and the
// discovery surface that sits on top of the library scene. Owns DOM and state;
// all selection/persistence rules live in archive-discovery.js.

import {
  createRecentHistory,
  readWelcomeState,
  writeWelcomeState,
} from './archive-discovery.js';

function safeStorage() {
  try {
    const storage = window.localStorage;
    const probe = '__theaidictionary_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export class ArchiveHome {
  constructor(
    root,
    { terms = [], onSearch, onRandomTerm, onOpenMap, onOpenTerm, reducedMotion = false } = {}
  ) {
    this.root = root;
    this.terms = terms;
    this.onSearch = onSearch;
    this.onRandomTerm = onRandomTerm;
    this.onOpenMap = onOpenMap;
    this.onOpenTerm = onOpenTerm;
    this.reducedMotion = reducedMotion;
    this.storage = safeStorage();
    this.history = createRecentHistory({ storage: this.storage });

    this.welcome = root.querySelector('.archive-welcome');
    this.aboutTab = root.querySelector('.archive-about-tab');
    this.countEl = root.querySelector('#archive-term-count');
    this.searchBtn = root.querySelector('.archive-search');
    this.randomBtn = root.querySelector('.archive-random');
    this.mapBtn = root.querySelector('.archive-map');

    this._renderCount();
    this._bind();

    if (readWelcomeState(this.storage).collapsed) this.collapseWelcome({ persist: false });
    else this.openWelcome();
  }

  _renderCount() {
    if (!this.countEl) return;
    const count = this.terms.length.toLocaleString('en-US');
    this.countEl.textContent = `${count} cited terms on the shelf`;
  }

  _bind() {
    this._onSearchClick = () => {
      this.collapseWelcome();
      this.onSearch?.();
    };
    this._onRandomClick = () => {
      this.collapseWelcome();
      this.onRandomTerm?.();
    };
    this._onMapClick = () => {
      this.collapseWelcome();
      this.onOpenMap?.();
    };
    this._onAboutClick = () => this.openWelcome();

    this.searchBtn?.addEventListener('click', this._onSearchClick);
    this.randomBtn?.addEventListener('click', this._onRandomClick);
    this.mapBtn?.addEventListener('click', this._onMapClick);
    this.aboutTab?.addEventListener('click', this._onAboutClick);
  }

  /** Reveal the editorial panel without changing the persisted default. */
  openWelcome() {
    this.root.classList.remove('collapsed');
    if (this.aboutTab) this.aboutTab.hidden = true;
  }

  /** Collapse to the About tab; optionally persist the collapsed default. */
  collapseWelcome({ persist = true } = {}) {
    this.root.classList.add('collapsed');
    if (this.aboutTab) this.aboutTab.hidden = false;
    if (persist) writeWelcomeState(this.storage, { collapsed: true });
  }

  /** Record a successful entry open for Continue Exploring. */
  recordTerm(slug) {
    this.history.record(slug);
  }

  destroy() {
    this.searchBtn?.removeEventListener('click', this._onSearchClick);
    this.randomBtn?.removeEventListener('click', this._onRandomClick);
    this.mapBtn?.removeEventListener('click', this._onMapClick);
    this.aboutTab?.removeEventListener('click', this._onAboutClick);
  }
}
