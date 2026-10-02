// Pure URL and volume-rail models for the archive shell.
// Kept free of DOM and free of the dictionary data modules so they are
// testable under the Node runner and reusable across entry points.

/**
 * Build the A–B through Y–Z rail items from the 13 exported `RANGES`.
 * Empty ranges stay present but disabled — the rail always shows every shelf
 * slot so its position never jumps between data sets.
 */
export function volumeRailItems(ranges) {
  return ranges.map((range) => ({
    folder: range.folder,
    label: range.label,
    count: range.terms.length,
    letters: [...range.letters],
    disabled: range.terms.length === 0,
  }));
}

/**
 * Interpret a startup/popstate location into a single route intent.
 * Precedence: Map (?map=… then ?view=map), term (?term=… then /term/<slug>/),
 * volume (?volume=…), and finally the library.
 */
export function parseAppLocation({ pathname = '/', search = '' } = {}) {
  const params = new URLSearchParams(search);

  const mapTerm = params.get('map');
  if (mapTerm) return { view: 'map', slug: mapTerm, folder: null };
  if (params.get('view') === 'map') return { view: 'map', slug: null, folder: null };

  const pathMatch = pathname.match(/\/term\/([^/]+)\/?$/i);
  const pathTerm = pathMatch ? safeDecode(pathMatch[1]) : null;
  const term = params.get('term') || pathTerm;
  if (term) return { view: 'term', slug: term, folder: null };

  const folder = params.get('volume');
  if (folder) return { view: 'volume', slug: null, folder };

  return { view: 'library', slug: null, folder: null };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
