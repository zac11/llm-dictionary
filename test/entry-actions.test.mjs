import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coverageLinks,
  entryActions,
  entryBreadcrumb,
  entrySecondPage,
  entryTransition,
  hasSecondPage,
  linkIcon,
  profileLinks,
  relatedGroups,
} from '../src/entry-actions.js';

test('entryBreadcrumb joins library, volume, and category with safe defaults', () => {
  assert.deepEqual(entryBreadcrumb({ category: 'Architecture' }, { label: 'A – B' }), {
    volumeLabel: 'A – B',
    category: 'Architecture',
    text: 'Library / A – B / Architecture',
  });
  assert.deepEqual(entryBreadcrumb({}, null), {
    volumeLabel: '',
    category: 'General',
    text: 'Library / General',
  });
  assert.deepEqual(entryBreadcrumb({ category: ' ' }, { label: 'Y – Z' }), {
    volumeLabel: 'Y – Z',
    category: 'General',
    text: 'Library / Y – Z / General',
  });
});

test('entryActions exposes ask, map, share in order with graph gating', () => {
  assert.deepEqual(entryActions({ hasGraph: true, hasAsk: true }).map((a) => a.id), ['ask', 'map', 'share']);
  assert.equal(entryActions({ hasGraph: false }).find((a) => a.id === 'map').enabled, false);
  assert.equal(entryActions({ hasGraph: false }).find((a) => a.id === 'ask').enabled, true);
  assert.equal(entryActions({ hasGraph: false }).find((a) => a.id === 'share').enabled, true);
  assert.equal(entryActions({ hasAsk: false }).find((a) => a.id === 'ask').enabled, false);
});

test('entryTransition picks ritual, short, and instant per policy', () => {
  assert.equal(entryTransition({ spreadOpen: false, mode: 'index', reducedMotion: false }), 'ritual');
  assert.equal(entryTransition({ spreadOpen: true, mode: 'entry', reducedMotion: false }), 'short');
  assert.equal(entryTransition({ spreadOpen: true, mode: 'index', reducedMotion: false }), 'ritual');
  assert.equal(entryTransition({ spreadOpen: true, mode: 'entry', reducedMotion: true }), 'instant');
  assert.equal(entryTransition({ spreadOpen: false, mode: 'index', reducedMotion: true }), 'instant');
});

test('entrySecondPage maps a type to its spread, title, cue, and counter', () => {
  assert.deepEqual(entrySecondPage({ type: 'person', term: 'Sam Altman' }), {
    presentation: 'profile',
    title: 'Profile',
    cue: 'Show the profile',
    counter: 'profile',
  });
  assert.deepEqual(entrySecondPage({ type: 'event' }), {
    presentation: 'coverage',
    title: 'Coverage',
    cue: 'See the coverage',
    counter: 'coverage',
  });
  assert.deepEqual(entrySecondPage({ type: 'concept' }), {
    presentation: 'story',
    title: 'In a story',
    cue: 'Flip to the story',
    counter: 'story',
  });
  assert.equal(entrySecondPage(null).presentation, 'story');
});

test('hasSecondPage only hides the spread when a story is missing', () => {
  assert.equal(hasSecondPage({ type: 'concept', story: 'Once upon a time' }), true);
  assert.equal(hasSecondPage({ type: 'concept', story: '' }), false);
  assert.equal(hasSecondPage({ type: 'person' }), true);
  assert.equal(hasSecondPage({ type: 'event' }), true);
  assert.equal(hasSecondPage(null), false);
});

test('profileLinks lists curated links first, then searches, without duplicates', () => {
  const links = profileLinks({
    term: 'Sam Altman',
    profile: {
      links: [
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/samaltman' },
        { label: 'OpenAI', url: 'https://openai.com/' },
      ],
    },
    citation: { url: 'https://en.wikipedia.org/wiki/Sam_Altman' },
  });

  assert.deepEqual(
    links.map((link) => link.label),
    ['LinkedIn', 'OpenAI', 'Wikipedia', 'Google Scholar', 'X']
  );
  // curated entries lead; the citation's own Wikipedia page counts as curated
  assert.deepEqual(links.slice(0, 3).map((link) => link.curated), [true, true, true]);
  assert.deepEqual(links.slice(3).map((link) => link.curated), [false, false]);
  assert.equal(
    links.find((link) => link.label === 'X').url,
    'https://x.com/search?q=Sam%20Altman'
  );
  assert.equal(new Set(links.map((link) => link.url)).size, links.length);
  // every chip carries a mark, and search chips say so in their tooltip
  assert.deepEqual(
    links.map((link) => link.icon),
    ['briefcase', 'link', 'globe', 'graduation-cap', 'x']
  );
  assert.deepEqual(
    links.map((link) => link.description),
    ['LinkedIn', 'OpenAI', 'Wikipedia', 'Search Google Scholar', 'Search X']
  );
});

test('linkIcon picks a recognisable mark and falls back to a plain link', () => {
  assert.equal(linkIcon('LinkedIn'), 'briefcase');
  assert.equal(linkIcon('google scholar'), 'graduation-cap');
  assert.equal(linkIcon('Wikipedia'), 'globe');
  assert.equal(linkIcon('X'), 'x');
  assert.equal(linkIcon('Twitter'), 'x');
  assert.equal(linkIcon('Google News'), 'newspaper');
  assert.equal(linkIcon('Personal site'), 'link');
  assert.equal(linkIcon(''), 'link');
  assert.equal(linkIcon(undefined), 'link');
});

test('profileLinks searches Wikipedia when the entry is not sourced from it', () => {
  const links = profileLinks({ term: 'Andrej Karpathy', citation: { url: 'https://example.com/a' } });
  assert.equal(
    links.find((link) => link.label === 'Wikipedia').url,
    'https://en.wikipedia.org/w/index.php?search=Andrej%20Karpathy'
  );
  assert.deepEqual(profileLinks(null), []);
});

test('coverageLinks offers news and reference searches for events', () => {
  const links = coverageLinks({ term: 'Removal of Sam Altman from OpenAI' });
  assert.deepEqual(links.map((link) => link.label), ['Google News', 'Wikipedia']);
  assert.equal(
    links[0].url,
    'https://news.google.com/search?q=Removal%20of%20Sam%20Altman%20from%20OpenAI'
  );
  assert.equal(links[0].curated, false);
  assert.deepEqual(
    links.map((link) => link.icon),
    ['newspaper', 'globe']
  );
  assert.equal(links[0].description, 'Search Google News');
  assert.deepEqual(coverageLinks(null), []);
});

test('coverageLinks prefers a Wikipedia-sourced entry over a search', () => {
  const links = coverageLinks({
    term: 'Removal of Sam Altman from OpenAI',
    citation: { url: 'https://en.wikipedia.org/wiki/Removal_of_Sam_Altman_from_OpenAI' },
  });
  assert.equal(
    links[1].url,
    'https://en.wikipedia.org/wiki/Removal_of_Sam_Altman_from_OpenAI'
  );
  assert.equal(links[1].curated, true);
});

test('relatedGroups buckets related entries by type and drops empty groups', () => {
  const groups = relatedGroups([
    { slug: 'sam-altman', type: 'person' },
    { slug: 'openai', type: 'organization' },
    { slug: 'removal-of-sam-altman-from-openai', type: 'event' },
    { slug: 'moe', type: 'concept' },
    { slug: 'samy-bengio', type: 'person' },
    { slug: 'bogus' },
  ]);

  assert.deepEqual(
    groups.map((group) => [group.label, group.items.map((item) => item.slug)]),
    [
      ['People', ['sam-altman', 'samy-bengio']],
      ['Organizations', ['openai']],
      ['Events', ['removal-of-sam-altman-from-openai']],
      ['Related terms', ['moe', 'bogus']],
    ]
  );
  assert.deepEqual(relatedGroups([]), []);
  assert.deepEqual(
    relatedGroups([{ slug: 'a', type: 'person' }, { slug: 'b', type: 'person' }], { perGroup: 1 })
      .map((group) => group.items.length),
    [1]
  );
});
