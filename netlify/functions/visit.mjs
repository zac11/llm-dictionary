// First-party distinct-visitor counter.
//
// A page load posts here once. The first request from a browser gets an
// HttpOnly cookie with a random ID; later requests are recognised as the same
// visitor and only read the total. Bots, prefetches and cross-site calls are
// ignored so the number stays a count of readers rather than requests.
//
// Storage lives in Netlify Blobs:
//   stats/total       { count }                 all-time distinct visitors
//   visitors/<id>     { firstSeen }             one record per visitor (audit)
//   ip/<hash>         { date, count }           daily new-visitor cap per IP
//
// Environment (Netlify UI):
//   VISITOR_HASH_SALT             recommended — salt for the IP hash
//   VISITOR_MAX_NEW_PER_IP_DAY    optional — default 5
//
// Deploy previews and branch deploys read the total but never write to it.

import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'visitor-count';
const COOKIE_NAME = 'aid_visitor';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2;
const TOTAL_KEY = 'stats/total';
const VISITOR_PREFIX = 'visitors/';
const DEFAULT_MAX_NEW_PER_IP_DAY = 5;
const WRITE_RETRIES = 6;

// UUID v4 specifically: randomUUID() emits this shape, so anything else is a
// stale or hand-made cookie and is replaced.
const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// \b keeps normal words such as "Cubot" from matching the bare bot token.
const BOT_UA_RE =
  /\b(?:bot|crawler|spider|slurp|scraper|headlesschrome|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot)\b|googlebot|google-inspectiontool|bingbot|bingpreview|yandexbot|baiduspider|duckduckbot|applebot|facebookexternalhit|embedly|quora\s+link\s+preview|pinterest|vkshare|w3c_validator|redditbot|slackbot|twitterbot|linkedinbot|telegrambot|discordbot|curl\/|wget\/|python-requests|python-urllib|axios\/|node-fetch|go-http-client|java\/\d|okhttp/i;

const PREFETCH_RE = /prefetch|prerender/i;

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function noContent() {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function readCookie(header, name = COOKIE_NAME) {
  for (const part of String(header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function visitorIdFromCookie(header) {
  const value = readCookie(header, COOKIE_NAME);
  return value && VISITOR_ID_RE.test(value) ? value : null;
}

export function isAutomatedRequest(request) {
  const userAgent = String(request.headers.get('user-agent') || '').trim();
  if (!userAgent || BOT_UA_RE.test(userAgent)) return true;
  const purpose = request.headers.get('sec-purpose') || request.headers.get('purpose') || '';
  return PREFETCH_RE.test(purpose);
}

export function isCrossSiteRequest(request) {
  const fetchSite = String(request.headers.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return true;

  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const requestHost = request.headers.get('host') || new URL(request.url).host;
    return new URL(origin).host !== requestHost;
  } catch {
    return true;
  }
}

export function dateKey(now) {
  return now.toISOString().slice(0, 10);
}

export function clientIp(request) {
  const direct = request.headers.get('x-nf-client-connection-ip');
  if (direct) return direct.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : '';
}

export function hashIp(ip, env = {}) {
  const salt = String(env.VISITOR_HASH_SALT || 'theaidictionary-visitors');
  return createHash('sha256')
    .update(`${salt}\u0000${ip}`)
    .digest('hex')
    .slice(0, 32);
}

export async function readCounter(store, key) {
  const entry = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  return Number(entry?.data?.count) || 0;
}

/** Atomic read-modify-write; Blobs rejects the write if another request won. */
export async function bumpCounter(store, key, amount = 1) {
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt += 1) {
    const entry = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const current = Number(entry?.data?.count) || 0;
    const next = { count: current + amount };
    const options = entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true };
    const result = await store.setJSON(key, next, options);
    if (result?.modified) return next.count;
  }
  return null;
}

/**
 * Trailing guard against cookie-clearing inflation: a single IP can add at most
 * N new visitors per UTC day. One key per IP (holding only today's count) keeps
 * storage bounded and leaves no history behind.
 */
export async function allowNewVisitorFromIp(store, { ip, date, env = {} }) {
  if (!ip) return true;
  const configured = Number(env.VISITOR_MAX_NEW_PER_IP_DAY);
  const max = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_NEW_PER_IP_DAY;
  const key = `ip/${hashIp(ip, env)}`;

  for (let attempt = 0; attempt < WRITE_RETRIES; attempt += 1) {
    const entry = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const state = entry?.data;
    const count = state?.date === date ? Number(state.count) || 0 : 0;
    if (count >= max) return false;

    const next = { date, count: count + 1 };
    const options = entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true };
    const result = await store.setJSON(key, next, options);
    if (result?.modified) return true;
  }
  return false;
}

export function visitorCookie(id, secure) {
  const flags = [
    `${COOKIE_NAME}=${id}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

function isSecureRequest(request) {
  try {
    if (new URL(request.url).protocol === 'https:') return true;
  } catch {
    // Fall through to the proxy header.
  }
  return request.headers.get('x-forwarded-proto') === 'https';
}

/**
 * Count only on the production site; preview deploys read the live total so a
 * reviewer still sees the footer, but they never change the number.
 */
export function shouldWrite(env = {}) {
  const context = String(env.CONTEXT || '').trim();
  return !context || context === 'production';
}

export async function handleVisit(request, { store, env = {}, now = new Date() } = {}) {
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  }
  if (isCrossSiteRequest(request)) return json(403, { error: 'forbidden' });
  if (isAutomatedRequest(request)) return noContent();
  if (!store) return json(503, { error: 'storage_unavailable' });

  const total = await readCounter(store, TOTAL_KEY);
  if (!shouldWrite(env)) return json(200, { total });

  const existingId = visitorIdFromCookie(request.headers.get('cookie'));
  if (existingId) return json(200, { total });

  const id = randomUUID();
  const firstSeen = now.toISOString();
  const { modified } = await store.setJSON(
    `${VISITOR_PREFIX}${id}`,
    { firstSeen },
    { onlyIfNew: true }
  );

  let nextTotal = total;
  if (modified) {
    const date = dateKey(now);
    const allowed = await allowNewVisitorFromIp(store, { ip: clientIp(request), date, env });
    if (allowed) {
      const counted = await bumpCounter(store, TOTAL_KEY);
      if (counted !== null) nextTotal = counted;
    }
  }

  return json(200, { total: nextTotal }, { 'Set-Cookie': visitorCookie(id, isSecureRequest(request)) });
}

let store;

export default async function handler(request) {
  try {
    store ??= getStore(STORE_NAME);
    return await handleVisit(request, { store, env: process.env, now: new Date() });
  } catch (error) {
    console.error('visitor count failed', error);
    return json(503, { error: 'storage_unavailable' });
  }
}
