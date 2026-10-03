// Explore menus. One action list feeds the top-bar dropdown and the compact
// options overlay behind the archive card's ⓘ button; each menu may narrow
// that list, so the shared actions can never drift apart.

const ACTIONS = [
  ['map', 'Knowledge Map', 'openMap'],
  ['random', 'Random Term', 'openRandomTerm'],
  ['daily', 'Term of the Day', 'openTermOfDay'],
  ['recent', 'Recently Added', 'openRecentlyAdded'],
  ['browse', 'Browse A–Z', 'focusVolumeRail'],
  ['contribute', 'Contribute', 'openContribute'],
  ['feedback', 'Feedback', 'openFeedback'],
  ['help', 'Help', 'openHelp'],
];

// The top-bar dropdown keeps these ids: other modules look them up by name.
const LEGACY_IDS = {
  map: 'view-toggle',
  contribute: 'contribute-toggle',
  feedback: 'feedback-toggle',
  help: 'help-btn',
};

export function exploreActions(callbacks = {}) {
  return ACTIONS.map(([id, label, callbackName]) => {
    const callback = callbacks[callbackName];
    return {
      id,
      label,
      enabled: typeof callback === 'function',
      invoke: () => {
        if (typeof callback === 'function') callback();
      },
    };
  });
}

export function menuKeyAction({ key, index, count }) {
  if (!count) return { action: 'none', index: -1 };
  if (key === 'ArrowDown') return { action: 'move', index: (index + 1 + count) % count };
  if (key === 'ArrowUp') return { action: 'move', index: (index - 1 + count) % count };
  if (key === 'Home') return { action: 'move', index: 0 };
  if (key === 'End') return { action: 'move', index: count - 1 };
  if (key === 'Escape') return { action: 'close', index };
  return { action: 'none', index };
}

export class ArchiveNav {
  /**
   * @param {object} options
   * @param {HTMLElement} options.toggle top-bar "Explore" button
   * @param {HTMLElement} options.menu matching dropdown
   * @param {Array} options.actions entries from exploreActions()
   * @param {Array<{toggle: HTMLElement, menu: HTMLElement, actions?: Array}>} [options.extraMenus]
   *   additional triggers; each may narrow the shared action list (the compact
   *   archive options overlay shows only a couple of entries)
   */
  constructor({ toggle, menu, actions, extraMenus = [] }) {
    this.actions = actions;
    this._menus = [];
    this._registerMenu({ toggle, menu, idPrefix: 'explore', legacyIds: true });
    for (const spec of extraMenus) {
      this._registerMenu({ idPrefix: 'archive-options', legacyIds: false, ...spec });
    }
    this._onDocumentPointer = (event) => {
      const inside = this._menus.some(
        (entry) => entry.menu.contains(event.target) || entry.toggle.contains(event.target)
      );
      if (!inside) this.closeAll();
    };
    document.addEventListener('pointerdown', this._onDocumentPointer);
  }

  /** The top-bar toggle; other modules restore focus here after a menu action. */
  get toggle() {
    return this._menus[0]?.toggle;
  }

  _registerMenu({ toggle, menu, idPrefix, legacyIds, actions }) {
    if (!toggle || !menu) return;
    const entry = { toggle, menu, buttons: [] };
    menu.replaceChildren();
    for (const action of actions ?? this.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'explore-menu-item';
      button.id = (legacyIds && LEGACY_IDS[action.id]) || `${idPrefix}-${action.id}`;
      button.dataset.action = action.id;
      button.setAttribute('role', 'menuitem');
      button.textContent = action.label;
      button.disabled = !action.enabled;
      button.tabIndex = -1;
      if (['contribute', 'feedback'].includes(action.id)) {
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
      }
      if (action.id === 'map') button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (!action.enabled) return;
        this.closeAll({ restoreFocus: false });
        action.invoke();
      });
      menu.appendChild(button);
      if (action.enabled) entry.buttons.push(button);
    }

    toggle.addEventListener('click', () => {
      if (menu.hidden) this.openMenu(entry);
      else this.closeMenu(entry, { restoreFocus: true });
    });
    menu.addEventListener('keydown', (event) => {
      const index = entry.buttons.indexOf(document.activeElement);
      const result = menuKeyAction({ key: event.key, index: Math.max(0, index), count: entry.buttons.length });
      if (result.action === 'move') {
        event.preventDefault();
        entry.buttons[result.index]?.focus();
      } else if (result.action === 'close') {
        event.preventDefault();
        this.closeMenu(entry, { restoreFocus: true });
      }
    });

    this._menus.push(entry);
  }

  openMenu(entry) {
    this.closeAll({ restoreFocus: false });
    entry.menu.hidden = false;
    entry.toggle.setAttribute('aria-expanded', 'true');
    entry.buttons[0]?.focus();
  }

  closeMenu(entry, { restoreFocus = false } = {}) {
    entry.menu.hidden = true;
    entry.toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) entry.toggle.focus();
  }

  closeAll(options) {
    this._menus.forEach((entry) => this.closeMenu(entry, options));
  }

  destroy() {
    document.removeEventListener('pointerdown', this._onDocumentPointer);
  }
}
