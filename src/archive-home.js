// Archive home controller: the welcome modal that introduces the archive on a
// first visit. Owns DOM and state; all persistence rules live in
// archive-discovery.js.

import {
  markWelcomeShown,
  recentlyAdded,
  shouldShowWelcome,
  termOfDay,
  writeWelcomeState,
} from './archive-discovery.js';

/** Probe a Web Storage object; private modes and managed profiles can throw. */
function safeStore(name) {
  try {
    const store = window[name];
    const probe = '__theaidictionary_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Retire the archive card to its single collapsed tab after two idle minutes.
const AUTO_COLLAPSE_MS = 120_000;

export class ArchiveHome {
  constructor(
    root,
    { terms = [], onSearch, onRandomTerm, onOpenMap, onOpenTerm } = {}
  ) {
    this.root = root;
    this.terms = terms;
    this.onSearch = onSearch;
    this.onRandomTerm = onRandomTerm;
    this.onOpenMap = onOpenMap;
    this.onOpenTerm = onOpenTerm;
    this.storage = safeStore('localStorage');
    // Session fallback: keeps the greeting to once per session when durable
    // storage is refused, instead of it reopening on every page load.
    this.session = safeStore('sessionStorage');
    this.card = root.querySelector('.archive-card');
    this._idleTimer = null;

    this.welcome = root.querySelector('.archive-welcome');
    this.countEl = root.querySelector('#archive-term-count');
    this.closeBtn = root.querySelector('#archive-close');
    this.backdrop = root.querySelector('.archive-backdrop');
    this.searchBtn = root.querySelector('.archive-search');
    this.randomBtn = root.querySelector('.archive-random');
    this.mapBtn = root.querySelector('.archive-map');

    this._renderCount();
    this._bind();

    // The welcome card is a first-visit greeting: show it once, then remember
    // that it has been seen so later loads go straight to the library.
    const welcome = { storage: this.storage, session: this.session };
    if (shouldShowWelcome(welcome)) {
      this.openWelcome();
      markWelcomeShown(welcome);
    } else {
      this.collapseWelcome({ persist: false });
    }
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
    this._onCloseClick = () => this.collapseWelcome();

    this.searchBtn?.addEventListener('click', this._onSearchClick);
    this.randomBtn?.addEventListener('click', this._onRandomClick);
    this.mapBtn?.addEventListener('click', this._onMapClick);
    this.closeBtn?.addEventListener('click', this._onCloseClick);
    // Clicking the dimmed library is the other obvious way out of a dialog.
    this.backdrop?.addEventListener('click', this._onCloseClick);

    // Any sign of use restarts the idle countdown before the auto-collapse.
    this._onCardActivity = () => this._scheduleIdleCollapse();
    this.card?.addEventListener('pointerenter', this._onCardActivity);
    this.card?.addEventListener('pointerdown', this._onCardActivity);
    this.card?.addEventListener('keydown', this._onCardActivity);

    // The modal is the topmost layer on a fresh visit, so Escape closes it
    // before anything underneath reacts.
    this._onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (this.root.classList.contains('collapsed')) return;
      event.stopPropagation();
      this.collapseWelcome();
    };
    document.addEventListener('keydown', this._onKeyDown, true);
  }

  /** Reveal the welcome panel without changing the persisted default. */
  openWelcome() {
    this.root.classList.remove('collapsed');
    this._scheduleIdleCollapse();
  }

  /** Dismiss the welcome card; optionally persist the collapsed default. */
  collapseWelcome({ persist = true } = {}) {
    this.root.classList.add('collapsed');
    if (persist) writeWelcomeState(this.storage, { collapsed: true });
    this._clearIdleCollapse();
  }

  _clearIdleCollapse() {
    if (this._idleTimer != null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  /** Collapse the whole card once it has sat unattended. */
  _scheduleIdleCollapse() {
    this._clearIdleCollapse();
    if (this.root.classList.contains('collapsed')) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      // Reading or tabbing through the card counts as use, not idleness.
      if (this._cardInUse()) {
        this._scheduleIdleCollapse();
        return;
      }
      this.collapseWelcome();
    }, AUTO_COLLAPSE_MS);
  }

  _cardInUse() {
    if (!this.card) return false;
    if (this.card.contains(document.activeElement)) return true;
    const hoverCapable = window.matchMedia?.('(hover: hover)').matches ?? false;
    return hoverCapable && this.card.matches(':hover');
  }

  /** Pull today's featured entry off the shelf and open it. */
  openTermOfDay() {
    const daily = termOfDay(this.terms, new Date());
    if (daily) this.onOpenTerm?.(daily.slug);
  }

  /** Pull the newest entry off the shelf and open it. */
  openRecentlyAdded() {
    const [newest] = recentlyAdded(this.terms);
    if (newest) this.onOpenTerm?.(newest.slug);
  }

  destroy() {
    this.searchBtn?.removeEventListener('click', this._onSearchClick);
    this.randomBtn?.removeEventListener('click', this._onRandomClick);
    this.mapBtn?.removeEventListener('click', this._onMapClick);
    this.closeBtn?.removeEventListener('click', this._onCloseClick);
    this.backdrop?.removeEventListener('click', this._onCloseClick);
    document.removeEventListener('keydown', this._onKeyDown, true);
    this.card?.removeEventListener('pointerenter', this._onCardActivity);
    this.card?.removeEventListener('pointerdown', this._onCardActivity);
    this.card?.removeEventListener('keydown', this._onCardActivity);
    this._clearIdleCollapse();
  }
}
