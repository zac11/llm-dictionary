// Tiny tween runner + easing helpers, ticked from the render loop.
// Every tween returns a Promise so rituals can be sequenced with async/await.

export const easeInOutCubic = (k) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

export const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);

export const easeOutBack = (k, s = 1.70158) =>
  1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);

export const lerp = (a, b, k) => a + (b - a) * k;

export class TweenRunner {
  constructor() {
    this._tweens = [];
  }

  /** Run `update(easedK)` over `dur` seconds. Resolves when done. */
  add(dur, update, ease = easeInOutCubic) {
    if (dur <= 0) {
      update(ease(1));
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._tweens.push({ t: 0, dur, update, ease, resolve });
    });
  }

  delay(sec) {
    return this.add(sec, () => {});
  }

  tick(dt) {
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const tw = this._tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.update(tw.ease(k));
      if (k >= 1) {
        this._tweens.splice(i, 1);
        tw.resolve();
      }
    }
  }

  /** Instantly complete every running tween (used when the user interrupts). */
  finishAll() {
    const list = this._tweens.splice(0);
    for (const tw of list) {
      tw.update(tw.ease(1));
      tw.resolve();
    }
  }

  get busy() {
    return this._tweens.length > 0;
  }
}
