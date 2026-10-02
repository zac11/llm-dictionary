const ACTIONS = [
  ['map', 'Knowledge Map', 'openMap'],
  ['random', 'Random Term', 'openRandomTerm'],
  ['recent', 'Recently Added', 'showRecentlyAdded'],
  ['browse', 'Browse A–Z', 'focusVolumeRail'],
  ['contribute', 'Contribute', 'openContribute'],
  ['feedback', 'Feedback', 'openFeedback'],
  ['help', 'Help', 'openHelp'],
];

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
  constructor({ toggle, menu, actions }) {
    this.toggle = toggle;
    this.menu = menu;
    this.actions = actions;
    this.buttons = [];
    this._render();
    this._bind();
  }

  _render() {
    this.menu.replaceChildren();
    for (const action of this.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'explore-menu-item';
      button.id = {
        map: 'view-toggle',
        contribute: 'contribute-toggle',
        feedback: 'feedback-toggle',
        help: 'help-btn',
      }[action.id] || `explore-${action.id}`;
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
        this.closeExplore({ restoreFocus: false });
        action.invoke();
      });
      this.menu.appendChild(button);
      if (action.enabled) this.buttons.push(button);
    }
  }

  _bind() {
    this._onToggle = () => {
      if (this.menu.hidden) this.openExplore();
      else this.closeExplore({ restoreFocus: true });
    };
    this._onKeyDown = (event) => {
      const index = this.buttons.indexOf(document.activeElement);
      const result = menuKeyAction({ key: event.key, index: Math.max(0, index), count: this.buttons.length });
      if (result.action === 'move') {
        event.preventDefault();
        this.buttons[result.index]?.focus();
      } else if (result.action === 'close') {
        event.preventDefault();
        this.closeExplore({ restoreFocus: true });
      }
    };
    this._onDocumentPointer = (event) => {
      if (this.menu.hidden || this.menu.contains(event.target) || this.toggle.contains(event.target)) return;
      this.closeExplore({ restoreFocus: false });
    };
    this.toggle.addEventListener('click', this._onToggle);
    this.menu.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('pointerdown', this._onDocumentPointer);
  }

  openExplore() {
    this.menu.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.buttons[0]?.focus();
  }

  closeExplore({ restoreFocus = false } = {}) {
    this.menu.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.toggle.focus();
  }

  destroy() {
    this.toggle.removeEventListener('click', this._onToggle);
    this.menu.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('pointerdown', this._onDocumentPointer);
  }
}
