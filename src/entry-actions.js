// Pure presentation models for the entry reader: breadcrumb text, the
// Ask/Map/Share action set, learning-strip selection, and transition policy.
// No DOM here — the UI reader renders these strings.

import { entryPresentation } from './term-schema.js';

const SECOND_PAGE = {
  story: { title: 'In a story', cue: 'Flip to the story', counter: 'story' },
  profile: { title: 'Profile', cue: 'Show the profile', counter: 'profile' },
  coverage: { title: 'Coverage', cue: 'See the coverage', counter: 'coverage' },
};

/**
 * The second spread an entry carries, plus its copy. A concept keeps its story;
 * a person shows a profile; an event shows coverage.
 */
export function entrySecondPage(term) {
  const presentation = entryPresentation(term && term.type);
  return { presentation, ...SECOND_PAGE[presentation] };
}

/** True when the entry has something to put on a second spread. */
export function hasSecondPage(term) {
  if (!term) return false;
  const { presentation } = entrySecondPage(term);
  return presentation === 'story' ? Boolean(term.story) : true;
}

const searchUrl = (base, term) => `${base}${encodeURIComponent(String(term || '').trim())}`;

const LINK_ICONS = [
  [/linkedin/i, 'briefcase'],
  [/scholar|researchgate|semantic ?scholar/i, 'graduation-cap'],
  [/wikipedia|wikidata/i, 'globe'],
  [/^(?:x|twitter)\b/i, 'x'],
  [/news/i, 'newspaper'],
  [/google/i, 'search'],
  [/github/i, 'link'],
];

/** Icon key for a link label, so the chips read at a glance. */
export function linkIcon(label) {
  const name = String(label || '').trim();
  for (const [pattern, icon] of LINK_ICONS) {
    if (pattern.test(name)) return icon;
  }
  return 'link';
}

/**
 * Where to find a person or an organization. Curated `profile.links` come
 * first; the rest are searches, so the entry stays useful before anyone has
 * filled them in. A curated link also suppresses the search with the same
 * label, and repeated URLs are dropped.
 */
export function profileLinks(term) {
  if (!term) return [];
  const links = [];
  const seenUrls = new Set();
  const seenLabels = new Set();
  const add = (label, url, curated = false) => {
    const value = String(url || '').trim();
    const name = String(label || '').trim() || value;
    const key = name.toLowerCase();
    if (!value || seenUrls.has(value) || seenLabels.has(key)) return;
    seenUrls.add(value);
    seenLabels.add(key);
    links.push({
      label: name,
      url: value,
      curated,
      icon: linkIcon(name),
      // "search" links only find the person; curated ones go somewhere exact.
      description: curated ? name : `Search ${name}`,
    });
  };

  // A LinkedIn profile (or a search for one) is meaningless once someone has
  // died, so a deceased person gets none at all.
  const allowLinkedIn = !term.deceased;
  const isLinkedIn = (label) => /linkedin/i.test(String(label || ''));
  for (const link of term.profile?.links || []) {
    if (!allowLinkedIn && isLinkedIn(link.label)) continue;
    add(link.label, link.url, true);
  }

  const citationUrl = String(term.citation?.url || '');
  const sourcedFromWikipedia = /wikipedia\.org/i.test(citationUrl);
  add(
    'Wikipedia',
    sourcedFromWikipedia ? citationUrl : searchUrl('https://en.wikipedia.org/w/index.php?search=', term.term),
    sourcedFromWikipedia
  );
  if (allowLinkedIn) {
    add('LinkedIn', searchUrl('https://www.linkedin.com/search/results/all/?keywords=', term.term));
  }
  add('Google Scholar', searchUrl('https://scholar.google.com/scholar?q=', term.term));
  add('X', searchUrl('https://x.com/search?q=', term.term));
  return links;
}

/** Searches that help a reader find reporting about an event or policy. */
export function coverageLinks(term) {
  if (!term) return [];
  const citationUrl = String(term.citation?.url || '');
  const sourcedFromWikipedia = /wikipedia\.org/i.test(citationUrl);
  const news = {
    label: 'Google News',
    url: searchUrl('https://news.google.com/search?q=', term.term),
    curated: false,
    icon: 'newspaper',
    description: 'Search Google News',
  };
  return [
    news,
    {
      label: 'Wikipedia',
      url: sourcedFromWikipedia ? citationUrl : searchUrl('https://en.wikipedia.org/w/index.php?search=', term.term),
      curated: sourcedFromWikipedia,
      icon: 'globe',
      description: sourcedFromWikipedia ? 'Wikipedia' : 'Search Wikipedia',
    },
  ];
}

const RELATED_GROUPS = [
  { key: 'person', label: 'People' },
  { key: 'organization', label: 'Organizations' },
  { key: 'event', label: 'Events' },
  { key: 'concept', label: 'Related terms' },
];

/**
 * Related entries bucketed by what they are, so a profile can list the people
 * and organizations around it and an event can list who was involved.
 */
export function relatedGroups(terms, { perGroup = 4 } = {}) {
  const buckets = new Map(RELATED_GROUPS.map((group) => [group.key, []]));
  for (const entry of terms || []) {
    if (!entry || !entry.slug) continue;
    const key = buckets.has(entry.type) ? entry.type : 'concept';
    const bucket = buckets.get(key);
    if (bucket.length < perGroup) bucket.push(entry);
  }
  return RELATED_GROUPS.map((group) => ({ ...group, items: buckets.get(group.key) })).filter(
    (group) => group.items.length > 0
  );
}

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
