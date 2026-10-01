import test from 'node:test';
import assert from 'node:assert/strict';
import { CarouselState } from '../src/discovery-carousel.js';

function fakeClock() {
  const timers = new Map();
  let nextId = 0;
  return {
    setTimeout(fn, ms) {
      const id = ++nextId;
      timers.set(id, { fn, ms, cleared: false });
      return id;
    },
    clearTimeout(id) {
      const timer = timers.get(id);
      if (timer) timer.cleared = true;
    },
    advance(ms) {
      // Fire timers in insertion order; a fired timer schedules a fresh one.
      for (const timer of [...timers.values()]) {
        if (timer.cleared) continue;
        timer.ms -= ms;
        if (timer.ms <= 0) {
          timer.cleared = true;
          timer.fn();
        }
      }
    },
    pending() {
      return [...timers.values()].filter((timer) => !timer.cleared).length;
    },
  };
}

test('carousel advances every 9,000 ms and wraps around', () => {
  const clock = fakeClock();
  const seen = [];
  const carousel = new CarouselState(3, { clock, onChange: (i) => seen.push(i) });
  carousel.start();
  assert.equal(carousel.index, 0);
  clock.advance(9000);
  assert.deepEqual(seen, [1]);
  clock.advance(9000);
  clock.advance(9000);
  assert.deepEqual(seen, [1, 2, 0]);
});

test('carousel previous and select move with wraparound', () => {
  const clock = fakeClock();
  const seen = [];
  const carousel = new CarouselState(3, { clock, onChange: (i) => seen.push(i) });
  carousel.start();
  carousel.previous();
  assert.equal(carousel.index, 2);
  carousel.select(1);
  assert.equal(carousel.index, 1);
  carousel.select(5); // out of range wraps
  assert.equal(carousel.index, 2);
  assert.deepEqual(seen, [2, 1, 2]);
});

test('independent pause reasons must all be resumed before auto-advance', () => {
  const clock = fakeClock();
  const seen = [];
  const carousel = new CarouselState(3, { clock, onChange: (i) => seen.push(i) });
  carousel.start();
  carousel.pause('hover');
  carousel.pause('focus');
  clock.advance(9000);
  assert.deepEqual(seen, []);
  carousel.resume('hover');
  clock.advance(9000);
  assert.deepEqual(seen, []); // still paused for focus
  carousel.resume('focus');
  clock.advance(9000);
  assert.deepEqual(seen, [1]);
});

test('carousel does not auto-advance under reduced motion', () => {
  const clock = fakeClock();
  const seen = [];
  const carousel = new CarouselState(3, { clock, reducedMotion: true, onChange: (i) => seen.push(i) });
  carousel.start();
  clock.advance(27000);
  assert.deepEqual(seen, []);
  carousel.next(); // manual navigation still works
  assert.equal(carousel.index, 1);
});

test('carousel pauses for visibility and cleans up its timer on destroy', () => {
  const clock = fakeClock();
  const seen = [];
  const carousel = new CarouselState(3, { clock, onChange: (i) => seen.push(i) });
  carousel.start();
  carousel.pause('visibility');
  clock.advance(9000);
  assert.deepEqual(seen, []);
  carousel.resume('visibility');
  carousel.destroy();
  assert.equal(clock.pending(), 0);
  clock.advance(9000);
  assert.deepEqual(seen, []);
});

test('carousel with a single slide never schedules auto-advance', () => {
  const clock = fakeClock();
  const seen = [];
  const carousel = new CarouselState(1, { clock, onChange: (i) => seen.push(i) });
  carousel.start();
  clock.advance(9000);
  assert.deepEqual(seen, []);
  assert.equal(clock.pending(), 0);
});
