import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSceneEnvironment, selectSceneProfile } from '../src/scene-quality.js';

const environment = (overrides = {}) => ({
  width: 1024,
  coarsePointer: false,
  reducedMotion: false,
  deviceMemory: undefined,
  devicePixelRatio: 2,
  ...overrides,
});

test('selectSceneProfile chooses mobile for narrow, coarse, or low-memory devices', () => {
  assert.equal(selectSceneProfile(environment({ width: 390, deviceMemory: 8 })).name, 'mobile');
  assert.equal(selectSceneProfile(environment({ width: 1440, coarsePointer: true, deviceMemory: 8 })).name, 'mobile');
  assert.equal(selectSceneProfile(environment({ width: 1440, deviceMemory: 4 })).name, 'mobile');
});

test('selectSceneProfile chooses high only for capable fine-pointer desktops', () => {
  assert.equal(selectSceneProfile(environment({ width: 1440, deviceMemory: 8 })).name, 'high');
  assert.equal(selectSceneProfile(environment({ width: 1440, deviceMemory: 8, reducedMotion: true })).name, 'balanced');
  assert.equal(selectSceneProfile(environment({ width: 1024, deviceMemory: 8 })).name, 'balanced');
  assert.equal(selectSceneProfile(environment({ width: 1440 })).name, 'balanced');
});

test('selectSceneProfile returns exact rendering budgets', () => {
  assert.deepEqual(selectSceneProfile(environment({ width: 1440, deviceMemory: 8 })), {
    name: 'high',
    maxPixelRatio: 2,
    dustCount: 700,
    idleMotion: true,
    simplifiedFillers: false,
  });
  assert.deepEqual(selectSceneProfile(environment()), {
    name: 'balanced',
    maxPixelRatio: 1.5,
    dustCount: 300,
    idleMotion: true,
    simplifiedFillers: false,
  });
  assert.deepEqual(selectSceneProfile(environment({ width: 390, coarsePointer: true, deviceMemory: 8 })), {
    name: 'mobile',
    maxPixelRatio: 1.25,
    dustCount: 100,
    idleMotion: false,
    simplifiedFillers: true,
  });
});

test('currentSceneEnvironment reads browser capability signals safely', () => {
  const queries = {
    '(pointer: coarse)': { matches: true },
    '(prefers-reduced-motion: reduce)': { matches: false },
  };
  const windowLike = {
    innerWidth: 430,
    devicePixelRatio: 3,
    navigator: { deviceMemory: 6 },
    matchMedia: (query) => queries[query],
  };
  assert.deepEqual(currentSceneEnvironment(windowLike), {
    width: 430,
    coarsePointer: true,
    reducedMotion: false,
    deviceMemory: 6,
    devicePixelRatio: 3,
  });
  assert.deepEqual(currentSceneEnvironment({ innerWidth: 1200 }), {
    width: 1200,
    coarsePointer: false,
    reducedMotion: false,
    deviceMemory: undefined,
    devicePixelRatio: 1,
  });
});
