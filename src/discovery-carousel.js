// Timer/state machine for the discovery carousel. Owns no DOM and no
// animation loop — one timeout at a time, restarted after manual navigation.

export class CarouselState {
  constructor(count, { intervalMs = 9000, reducedMotion = false, clock = globalThis, onChange = () => {} } = {}) {
    this.count = count;
    this.intervalMs = intervalMs;
    this.reducedMotion = reducedMotion;
    this.clock = clock;
    this.onChange = onChange;
    this.index = 0;
    this._pauseReasons = new Set();
    this._timer = null;
  }

  get paused() {
    return this._pauseReasons.size > 0;
  }

  _clearTimer() {
    if (this._timer != null) {
      this.clock.clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _schedule() {
    this._clearTimer();
    if (this.reducedMotion || this.paused || this.count <= 1) return;
    this._timer = this.clock.setTimeout(() => this.next(), this.intervalMs);
  }

  start() {
    this._schedule();
  }

  pause(reason) {
    this._pauseReasons.add(reason);
    this._clearTimer();
  }

  resume(reason) {
    this._pauseReasons.delete(reason);
    this._schedule();
  }

  _go(index) {
    if (this.count <= 0) return;
    this.index = ((index % this.count) + this.count) % this.count;
    this.onChange(this.index);
    this._schedule();
  }

  next() {
    this._go(this.index + 1);
  }

  previous() {
    this._go(this.index - 1);
  }

  select(index) {
    this._go(index);
  }

  /** Live reduced-motion toggle: stop auto-advance, then allow it to resume. */
  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    if (this.reducedMotion) this._clearTimer();
    else this._schedule();
  }

  destroy() {
    this._clearTimer();
    this._pauseReasons.clear();
  }
}
