import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionPreference } from '../src/motion-preference.js';

function fakeMQL(initial = false) {
  const listeners = new Set();
  return {
    matches: initial,
    addEventListener(type, fn) {
      if (type === 'change') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'change') listeners.delete(fn);
    },
    addListener(fn) {
      listeners.add(fn);
    },
    removeListener(fn) {
      listeners.delete(fn);
    },
    fire(matches) {
      this.matches = matches;
      for (const fn of [...listeners]) fn({ matches });
    },
    _listenerCount: () => listeners.size,
  };
}

test('MotionPreference reads the initial value and notifies on change', () => {
  const mql = fakeMQL(false);
  const pref = new MotionPreference(mql);
  assert.equal(pref.reduced, false);

  const seen = [];
  pref.subscribe((reduced) => seen.push(reduced));
  mql.fire(true);
  assert.equal(pref.reduced, true);
  assert.deepEqual(seen, [true]);
  mql.fire(false);
  assert.deepEqual(seen, [true, false]);
});

test('MotionPreference unsubscribe stops notifications', () => {
  const mql = fakeMQL(true);
  const pref = new MotionPreference(mql);
  const seen = [];
  const unsubscribe = pref.subscribe((reduced) => seen.push(reduced));
  unsubscribe();
  mql.fire(false);
  assert.deepEqual(seen, []);
});

test('MotionPreference destroy removes the media-query listener', () => {
  const mql = fakeMQL(false);
  const pref = new MotionPreference(mql);
  const seen = [];
  pref.subscribe((reduced) => seen.push(reduced));
  assert.equal(mql._listenerCount(), 1);
  pref.destroy();
  assert.equal(mql._listenerCount(), 0);
  mql.fire(true); // nothing to receive it
  assert.deepEqual(seen, []);
});

test('MotionPreference supports legacy addListener without duplicate callbacks', () => {
  const mql = {
    matches: false,
    addEventListener: undefined,
    removeEventListener: undefined,
    addListener(fn) {
      this._fn = fn;
    },
    removeListener() {
      this._fn = null;
    },
    fire(matches) {
      this._fn && this._fn({ matches });
    },
  };
  const pref = new MotionPreference(mql);
  const seen = [];
  pref.subscribe((reduced) => seen.push(reduced));
  mql.fire(true);
  assert.equal(pref.reduced, true);
  assert.deepEqual(seen, [true]);
  pref.destroy();
  mql.fire(false);
  assert.deepEqual(seen, [true]); // listener detached
});
