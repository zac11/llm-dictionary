const PROFILES = {
  high: {
    name: 'high',
    maxPixelRatio: 2,
    dustCount: 700,
    idleMotion: true,
    simplifiedFillers: false,
  },
  balanced: {
    name: 'balanced',
    maxPixelRatio: 1.5,
    dustCount: 300,
    idleMotion: true,
    simplifiedFillers: false,
  },
  mobile: {
    name: 'mobile',
    maxPixelRatio: 1.25,
    dustCount: 100,
    idleMotion: false,
    simplifiedFillers: true,
  },
};

export function selectSceneProfile({
  width,
  coarsePointer = false,
  reducedMotion = false,
  deviceMemory,
} = {}) {
  const viewportWidth = Number.isFinite(width) ? width : 0;
  const memory = Number.isFinite(deviceMemory) ? deviceMemory : undefined;
  if (coarsePointer || viewportWidth < 860 || (memory !== undefined && memory <= 4)) {
    return { ...PROFILES.mobile };
  }
  if (viewportWidth >= 1100 && !reducedMotion && memory !== undefined && memory >= 8) {
    return { ...PROFILES.high };
  }
  return { ...PROFILES.balanced };
}

export function currentSceneEnvironment(windowLike = globalThis.window) {
  const match = (query) => {
    try {
      return Boolean(windowLike?.matchMedia?.(query)?.matches);
    } catch {
      return false;
    }
  };
  return {
    width: Number(windowLike?.innerWidth) || 0,
    coarsePointer: match('(pointer: coarse)'),
    reducedMotion: match('(prefers-reduced-motion: reduce)'),
    deviceMemory: Number.isFinite(windowLike?.navigator?.deviceMemory)
      ? windowLike.navigator.deviceMemory
      : undefined,
    devicePixelRatio: Number(windowLike?.devicePixelRatio) || 1,
  };
}
