// Explore menu. One action list feeds the top-bar Explore panel: a grouped
// dropdown on wide screens and a slide-in drawer on phones (CSS decides).
import { icon } from './icons.js';

const ACTIONS = [
  ['map', 'Knowledge Map', 'openMap', 'discover', 'network', 'See how every term connects'],
  ['random', 'Random Term', 'openRandomTerm', 'discover', 'shuffle', 'Pull a surprise volume'],
  ['daily', 'Term of the Day', 'openTermOfDay', 'discover', 'sun', "Today's featured entry"],
  ['recent', 'Recently Added', 'openRecentlyAdded', 'discover', 'clock', 'The newest entry on the shelf'],
  ['browse', 'Browse A–Z', 'focusVolumeRail', 'discover', 'library', 'Jump to a volume'],
  ['contribute', 'Contribute', 'openContribute', 'community', 'plus-circle', 'Suggest a new term'],
  ['feedback', 'Feedback', 'openFeedback', 'community', 'message-square', 'Report a bug or idea'],
  ['help', 'Help', 'openHelp', 'community', 'circle-help', 'How the 3D library works'],
];

const GROUP_LABELS = { discover: 'Discover', community: 'Get involved' };

// The top-bar dropdown keeps these ids: other modules look them up by name.
const LEGACY_IDS = {
  map: 'view-toggle',
  contribute: 'contribute-toggle',
  feedback: 'feedback-toggle',
  help: 'help-btn',
};

export function exploreActions(callbacks = {}) {
  return ACTIONS.map(([id, label, callbackName, group, iconName, description]) => {
    const callback = callbacks[callbackName];
    return {
      id,
      label,
      group,
      icon: iconName,
      description,
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
   *   additional triggers; each may narrow the shared action list
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
    // Drawer header: only visible in the phone layout, where the menu is a sheet.
    const head = document.createElement('div');
    head.className = 'explore-menu-head';
    head.innerHTML = `<span>Explore</span><button type="button" class="explore-menu-close" aria-label="Close menu">${icon('x')}</button>`;
    head.querySelector('button').addEventListener('click', () => this.closeMenu(entry, { restoreFocus: true }));
    menu.appendChild(head);
    let group = null;
    for (const action of actions ?? this.actions) {
      if (action.group && action.group !== group) {
        group = action.group;
        const heading = document.createElement('p');
        heading.className = 'explore-menu-group';
        heading.setAttribute('role', 'presentation');
        heading.textContent = GROUP_LABELS[group] || group;
        menu.appendChild(heading);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'explore-menu-item';
      button.id = (legacyIds && LEGACY_IDS[action.id]) || `${idPrefix}-${action.id}`;
      button.dataset.action = action.id;
      button.setAttribute('role', 'menuitem');
      button.innerHTML = `<span class="explore-menu-icon">${icon(action.icon)}</span>
        <span class="explore-menu-text"><span class="explore-menu-label"></span><span class="explore-menu-desc"></span></span>`;
      button.querySelector('.explore-menu-label').textContent = action.label;
      button.querySelector('.explore-menu-desc').textContent = action.description || '';
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
    document.body.classList.add('explore-open');
    entry.buttons[0]?.focus();
  }

  closeMenu(entry, { restoreFocus = false } = {}) {
    entry.menu.hidden = true;
    entry.toggle.setAttribute('aria-expanded', 'false');
    if (this._menus.every(({ menu }) => menu.hidden)) document.body.classList.remove('explore-open');
    if (restoreFocus) entry.toggle.focus();
  }

  closeAll(options) {
    this._menus.forEach((entry) => this.closeMenu(entry, options));
  }

  destroy() {
    document.removeEventListener('pointerdown', this._onDocumentPointer);
  }
}
