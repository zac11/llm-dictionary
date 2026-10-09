import test from 'node:test';
import assert from 'node:assert/strict';
import { exploreActions, menuKeyAction } from '../src/archive-nav.js';

test('exploreActions exposes the approved order without Search or Ask', () => {
  const actions = exploreActions({});
  assert.deepEqual(actions.map(({ id, label, enabled }) => ({ id, label, enabled })), [
    { id: 'map', label: 'Knowledge Map', enabled: false },
    { id: 'random', label: 'Random Term', enabled: false },
    { id: 'daily', label: 'Term of the Day', enabled: false },
    { id: 'recent', label: 'Recently Added', enabled: false },
    { id: 'browse', label: 'Browse A–Z', enabled: false },
    { id: 'contribute', label: 'Contribute', enabled: false },
    { id: 'feedback', label: 'Feedback', enabled: false },
    { id: 'help', label: 'Help', enabled: false },
  ]);
  assert.equal(actions.some(({ id }) => id === 'search' || id === 'ask'), false);
});

test('exploreActions dispatches supplied callbacks and safely ignores missing ones', () => {
  const called = [];
  const actions = exploreActions({
    openMap: () => called.push('map'),
    openContribute: () => called.push('contribute'),
  });
  assert.equal(actions.find(({ id }) => id === 'map').enabled, true);
  assert.equal(actions.find(({ id }) => id === 'contribute').enabled, true);
  assert.equal(actions.find(({ id }) => id === 'recent').enabled, false);
  actions.find(({ id }) => id === 'map').invoke();
  actions.find(({ id }) => id === 'recent').invoke();
  actions.find(({ id }) => id === 'contribute').invoke();
  assert.deepEqual(called, ['map', 'contribute']);
});

test('menuKeyAction handles wrapping, boundaries, Escape, and unrelated keys', () => {
  assert.deepEqual(menuKeyAction({ key: 'ArrowDown', index: 6, count: 7 }), { action: 'move', index: 0 });
  assert.deepEqual(menuKeyAction({ key: 'ArrowUp', index: 0, count: 7 }), { action: 'move', index: 6 });
  assert.deepEqual(menuKeyAction({ key: 'Home', index: 4, count: 7 }), { action: 'move', index: 0 });
  assert.deepEqual(menuKeyAction({ key: 'End', index: 2, count: 7 }), { action: 'move', index: 6 });
  assert.deepEqual(menuKeyAction({ key: 'Escape', index: 2, count: 7 }), { action: 'close', index: 2 });
  assert.deepEqual(menuKeyAction({ key: 'Enter', index: 2, count: 7 }), { action: 'none', index: 2 });
  assert.deepEqual(menuKeyAction({ key: 'ArrowDown', index: -1, count: 0 }), { action: 'none', index: -1 });
});

test('exploreActions carry a group, icon and description for the grouped menu', () => {
  const actions = exploreActions({});
  for (const action of actions) {
    assert.ok(['discover', 'community'].includes(action.group), action.id);
    assert.equal(typeof action.icon, 'string');
    assert.ok(action.description.length > 0, action.id);
  }
  assert.deepEqual(
    actions.filter(({ group }) => group === 'community').map(({ id }) => id),
    ['contribute', 'feedback', 'help']
  );
});
