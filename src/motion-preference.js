// Observe prefers-reduced-motion once and fan changes out to every consumer,
// instead of each component attaching its own media-query listener.

export class MotionPreference {
  constructor(mediaQuery) {
    this.mql = mediaQuery || null;
    this.reduced = Boolean(this.mql && this.mql.matches);
    this._listeners = new Set();

    this._onChange = (event) => {
      this.reduced = Boolean(event.matches);
      for (const listener of this._listeners) listener(this.reduced);
    };

    if (this.mql) {
      if (typeof this.mql.addEventListener === 'function') {
        this.mql.addEventListener('change', this._onChange);
      } else if (typeof this.mql.addListener === 'function') {
        this.mql.addListener(this._onChange);
      }
    }
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  destroy() {
    this._listeners.clear();
    if (!this.mql) return;
    if (typeof this.mql.removeEventListener === 'function') {
      this.mql.removeEventListener('change', this._onChange);
    } else if (typeof this.mql.removeListener === 'function') {
      this.mql.removeListener(this._onChange);
    }
  }
}
