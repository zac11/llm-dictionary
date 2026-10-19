// Wikipedia grounding for the explainer generator: the article text (facts the
// writer may use) and the lead image with the credit its license requires.
// Responses are cached under data/wikipedia/ (gitignored) so re-runs are free.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://en.wikipedia.org/w/api.php';
const REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'TheAIDictionary/1.0 (https://theaidictionary.com; explainer generator)';
const MAX_EXTRACT = 9000;

/** Article title from a Wikipedia citation URL, else the term itself. */
export function wikipediaTitle(entry) {
  const url = String((entry.citation && entry.citation.url) || '');
  const match = url.match(/^https?:\/\/en\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i);
  if (match) return decodeURIComponent(match[1]).replace(/_/g, ' ');
  return String(entry.term || '').trim();
}

/** True when the entry cites a specific Wikipedia article. */
export function citesWikipedia(entry) {
  return /^https?:\/\/en\.(?:m\.)?wikipedia\.org\/wiki\//i.test(String((entry.citation && entry.citation.url) || ''));
}

/**
 * Titles to try, most specific first. A bare term ("Transformer") often lands
 * on a non-AI article, so AI-qualified titles come first.
 */
export function candidateTitles(entry) {
  const title = wikipediaTitle(entry);
  if (!title) return [];
  if (citesWikipedia(entry)) return [title];
  return [`${title} (deep learning)`, `${title} (machine learning)`, `${title} (artificial intelligence)`, title];
}

// Without a Wikipedia citation, only accept an article that is about AI/computing.
const ON_TOPIC = /\b(?:artificial intelligence|machine learning|deep learning|neural|language model|computer|computing|algorithm|statistic|data|software|robot|AI)\b/;

export function onTopic(summary) {
  return ON_TOPIC.test(`${summary.description || ''} ${String(summary.extract || '').slice(0, 600)}`);
}

/** "<a href=…>Jane Doe</a>" -> "Jane Doe"; collapses whitespace. */
export function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drops reference lists and trailing boilerplate sections from an extract. */
export function trimExtract(text, max = MAX_EXTRACT) {
  const cut = String(text || '').split(/\n+(?:See also|References|External links|Further reading|Notes|Bibliography)\n/)[0];
  const clean = cut.replace(/\n{3,}/g, '\n\n').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

// Logos, icons and flags make poor figures for a reader page.
const POOR_IMAGE = /(?:^|[\W_])(?:logo|icon|flag|symbol|wordmark|signature|commons-logo|question_book|ambox|edit-clear)(?=$|[\W_])/i;

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.json();
}

/** License and author for a Commons/enwiki file, or null when it cannot be credited. */
export async function imageCredit(fileTitle, { fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: fileTitle,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '640',
    origin: '*',
  });
  for (const base of [COMMONS, API]) {
    const data = await getJson(`${base}?${params}`, fetchImpl);
    const page = Object.values((data.query && data.query.pages) || {})[0];
    const info = page && page.imageinfo && page.imageinfo[0];
    if (!info) continue;
    const meta = info.extmetadata || {};
    const license = stripHtml(meta.LicenseShortName && meta.LicenseShortName.value);
    if (!license) return null;
    const nonFree = /fair use|non-free/i.test(`${license} ${stripHtml(meta.UsageTerms && meta.UsageTerms.value)}`);
    if (nonFree) return null;
    return {
      src: String(info.thumburl || info.url || '').replace(/\?utm_[^#]*$/, ''),
      width: info.thumbwidth || info.width || 0,
      height: info.thumbheight || info.height || 0,
      credit: stripHtml(meta.Artist && meta.Artist.value) || stripHtml(meta.Credit && meta.Credit.value) || 'Wikimedia Commons',
      license,
      licenseUrl: stripHtml(meta.LicenseUrl && meta.LicenseUrl.value),
      page: info.descriptionurl || '',
    };
  }
  return null;
}

/**
 * `{ title, url, description, extract, image }` for an entry, or null when
 * Wikipedia has no article (or only a disambiguation page) for it.
 */
export async function fetchWikipedia(entry, { fetchImpl = fetch } = {}) {
  const strict = !citesWikipedia(entry);
  let summary = null;
  for (const title of candidateTitles(entry)) {
    let found;
    try {
      found = await getJson(`${REST}${encodeURIComponent(title.replace(/ /g, '_'))}`, fetchImpl);
    } catch {
      continue;
    }
    if (!found || found.type === 'disambiguation' || !found.title) continue;
    if (strict && !onTopic(found)) continue;
    summary = found;
    break;
  }
  if (!summary) return null;

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'extracts|pageimages',
    explaintext: '1',
    exsectionformat: 'plain',
    piprop: 'name',
    redirects: '1',
    titles: summary.title,
    origin: '*',
  });
  const data = await getJson(`${API}?${params}`, fetchImpl);
  const page = Object.values((data.query && data.query.pages) || {})[0] || {};

  let image = null;
  if (page.pageimage && !POOR_IMAGE.test(page.pageimage)) {
    try {
      image = await imageCredit(`File:${page.pageimage}`, { fetchImpl });
    } catch {
      image = null;
    }
    if (image) image.alt = stripHtml(summary.description) ? `${summary.title} — ${stripHtml(summary.description)}` : summary.title;
  }

  return {
    title: summary.title,
    url: (summary.content_urls && summary.content_urls.desktop && summary.content_urls.desktop.page) || '',
    description: stripHtml(summary.description),
    extract: trimExtract(page.extract || summary.extract || ''),
    image,
  };
}

/** `fetchWikipedia` with an on-disk cache keyed by slug. */
export async function cachedWikipedia(entry, cacheDir, options = {}) {
  const path = join(cacheDir, `${entry.slug}.json`);
  if (!options.refresh && existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')).page;
  const page = await fetchWikipedia(entry, options);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(path, `${JSON.stringify({ fetchedAt: new Date().toISOString(), page }, null, 2)}\n`);
  return page;
}
