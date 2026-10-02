// Pure presentation models for the entry reader: breadcrumb text, the
// Ask/Map/Share action set, learning-strip selection, and transition policy.
// No DOM here — the UI reader renders these strings.

export function entryBreadcrumb(term, volume) {
  const category = String(term && term.category ? term.category : 'General').trim() || 'General';
  const volumeLabel = volume && volume.label ? volume.label : '';
  const text = ['Library', volumeLabel, category].filter(Boolean).join(' / ');
  return { volumeLabel, category, text };
}

export function entryActions({ hasGraph = false, hasAsk = true } = {}) {
  return [
    { id: 'ask', label: 'Ask about this', enabled: hasAsk },
    { id: 'map', label: 'View in Map', enabled: hasGraph },
    { id: 'share', label: 'Share', enabled: true },
  ];
}

/** Convert graph output into Continue Learning display items. */
export function learningItems({ trail, neighbors, currentSlug, limit = 4, labelOf = (slug) => slug }) {
  const items = [];
  const seen = new Set([currentSlug]);

  if (trail && Array.isArray(trail.path)) {
    for (const slug of trail.path) {
      if (!slug || slug === currentSlug || seen.has(slug)) continue;
      seen.add(slug);
      items.push({ slug, label: labelOf(slug), relation: 'connected' });
      if (items.length >= limit) return items;
    }
  }

  for (const entry of neighbors || []) {
    const node = entry && entry.node;
    if (!node || !node.slug) continue;
    if (node.slug === currentSlug || seen.has(node.slug)) continue;
    seen.add(node.slug);
    items.push({ slug: node.slug, label: node.label, relation: 'related' });
    if (items.length >= limit) return items;
  }

  return items;
}

/** Guard for async graph results: only render if the requested slug is still open. */
export function isCurrentEntry(activeSlug, requestedSlug) {
  return activeSlug != null && activeSlug === requestedSlug;
}

/** Pick the entry transition: cinematic first open, short repeat, instant under reduced motion. */
export function entryTransition({ spreadOpen, mode, reducedMotion }) {
  if (reducedMotion) return 'instant';
  if (!spreadOpen) return 'ritual';
  if (mode !== 'entry') return 'ritual';
  return 'short';
}
