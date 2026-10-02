// Pure WebGL capability and fallback decisions for the archive shell.

/** Probe WebGL with an ephemeral canvas; catch every failure mode. */
export function canCreateWebGL({ document, WebGLRenderingContext }) {
  if (!document || !WebGLRenderingContext) return false;
  let canvas;
  try {
    canvas = document.createElement('canvas');
    const context =
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext('experimental-webgl');
    if (!context || typeof context.getParameter !== 'function') return false;
    return typeof context.getParameter(context.VERSION) === 'string';
  } catch {
    return false;
  } finally {
    // Best-effort release of the probe context.
    if (canvas) {
      try {
        canvas.width = 1;
        canvas.height = 1;
      } catch {
        // ignore
      }
    }
  }
}

/** Decide the renderer path. Fallback is sticky once construction has failed. */
export function renderMode({ webglAvailable, constructionFailed }) {
  if (!webglAvailable) return 'fallback';
  if (constructionFailed) return 'fallback';
  return 'webgl';
}

/**
 * Uniform Library boundary used by main.js. When no renderer exists, every
 * method is a safe no-op (async ones resolve) so callers need no null checks.
 */
export function createLibraryFacade(library) {
  if (!library) {
    return {
      pullOutBook: async () => {},
      returnBook: async () => {},
      pause: () => {},
      resume: () => {},
      screenPointOf: () => null,
      overview: () => {},
    };
  }
  return {
    pullOutBook: (folder, options) => library.pullOutBook(folder, options),
    returnBook: () => library.returnBook(),
    pause: () => library.pause(),
    resume: () => library.resume(),
    screenPointOf: (folder) => library.screenPointOf(folder),
    overview: () => library.overview(),
  };
}
