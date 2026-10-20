import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  allowNewVisitorFromIp,
  bumpCounter,
  handleVisit,
  hashIp,
  isAutomatedRequest,
  isCrossSiteRequest,
  readCounter,
  shouldWrite,
  visitorIdFromCookie,
} from '../netlify/functions/visit.mjs';
import { applyVisitorCount, formatVisitorCount, recordVisit } from '../src/visits.js';

const NOW = new Date('2026-10-20T07:00:00.000Z');
const ENV = { VISITOR_HASH_SALT: 'test-salt' };
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SITE = 'https://theaidictionary.test';
const COOKIE = 'aid_visitor';

/** In-memory stand-in for the Blobs store, including ETag preconditions. */
class MemoryStore {
  constructor(seed = {}) {
    this.entries = new Map();
    this.sequence = 0;
    for (const [key, value] of Object.entries(seed)) this.put(key, value);
  }

  put(key, value) {
    this.sequence += 1;
    const etag = `etag-${this.sequence}`;
    this.entries.set(key, { value: structuredClone(value), etag });
    return etag;
  }

  async getWithMetadata(key, options = {}) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    return {
      data: options.type === 'json' ? structuredClone(entry.value) : JSON.stringify(entry.value),
      etag: entry.etag,
      metadata: {},
    };
  }

  async setJSON(key, value, options = {}) {
    const entry = this.entries.get(key);
    if (options.onlyIfNew && entry) return { modified: false };
    if (options.onlyIfMatch && (!entry || entry.etag !== options.onlyIfMatch)) {
      return { modified: false };
    }
    const etag = this.put(key, value);
    return { modified: true, etag };
  }

  keys() {
    return [...this.entries.keys()];
  }
}

function visitRequest(headers = {}, method = 'POST') {
  return new Request(`${SITE}/api/visit`, {
    method,
    headers: {
      'user-agent': UA,
      origin: SITE,
      'sec-fetch-site': 'same-origin',
      'x-nf-client-connection-ip': '203.0.113.7',
      ...headers,
    },
  });
}

function call(store, { headers = {}, env = ENV, now = NOW, method = 'POST' } = {}) {
  return handleVisit(visitRequest(headers, method), { store, env, now });
}

function totalOf(store) {
  return store.entries.get('stats/total')?.value?.count ?? 0;
}

test('first visit counts once, issues a secure HttpOnly cookie, and records the visitor', async () => {
  const store = new MemoryStore();
  const response = await call(store);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { total: 1 });
  assert.equal(totalOf(store), 1);

  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^aid_visitor=[0-9a-f-]{36};/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=63072000/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);

  const markers = store.keys().filter((key) => key.startsWith('visitors/'));
  assert.equal(markers.length, 1);
  assert.equal(store.entries.get(markers[0]).value.firstSeen, NOW.toISOString());
});

test('returning visitor is not counted again and gets no new cookie', async () => {
  const store = new MemoryStore({ 'stats/total': { count: 41 } });
  const response = await call(store, { headers: { cookie: `${COOKIE}=${randomUUID()}` } });

  assert.deepEqual(await response.json(), { total: 41 });
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(totalOf(store), 41);
});

test('a malformed cookie is replaced and counts as a new visitor', async () => {
  const store = new MemoryStore({ 'stats/total': { count: 10 } });
  const response = await call(store, { headers: { cookie: `${COOKIE}=not-a-uuid` } });

  assert.deepEqual(await response.json(), { total: 11 });
  assert.match(response.headers.get('set-cookie'), /^aid_visitor=/);
});

test('known bots, empty user agents and prefetches are ignored', async () => {
  const cases = [
    { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    { 'user-agent': 'curl/8.7.1' },
    { 'user-agent': '' },
    { 'sec-purpose': 'prefetch' },
    { purpose: 'prerender' },
  ];

  for (const headers of cases) {
    const store = new MemoryStore({ 'stats/total': { count: 5 } });
    const response = await call(store, { headers });
    assert.equal(response.status, 204, JSON.stringify(headers));
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(totalOf(store), 5);
  }
});

test('cross-site requests are rejected without touching storage', async () => {
  const store = new MemoryStore({ 'stats/total': { count: 9 } });

  const crossOrigin = await call(store, { headers: { origin: 'https://evil.example' } });
  assert.equal(crossOrigin.status, 403);

  const crossSite = await call(store, { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(crossSite.status, 403);

  assert.equal(totalOf(store), 9);
});

test('only POST is accepted', async () => {
  const store = new MemoryStore();
  const response = await call(store, { method: 'GET' });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
});

test('missing storage fails closed', async () => {
  const response = await handleVisit(visitRequest(), { store: null, env: ENV, now: NOW });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('the per-IP daily cap stops cookie-clearing inflation', async () => {
  const store = new MemoryStore();
  const env = { ...ENV, VISITOR_MAX_NEW_PER_IP_DAY: '2' };

  assert.deepEqual(await (await call(store, { env })).json(), { total: 1 });
  assert.deepEqual(await (await call(store, { env })).json(), { total: 2 });
  assert.deepEqual(await (await call(store, { env })).json(), { total: 2 });
});

test('a different IP gets its own daily allowance', async () => {
  const store = new MemoryStore();
  const env = { ...ENV, VISITOR_MAX_NEW_PER_IP_DAY: '1' };

  await call(store, { env });
  const other = await call(store, {
    env,
    headers: { 'x-nf-client-connection-ip': '198.51.100.9' },
  });

  assert.deepEqual(await other.json(), { total: 2 });
});

test('preview and branch deploys read the total but never write', async () => {
  for (const CONTEXT of ['deploy-preview', 'branch-deploy']) {
    const store = new MemoryStore({ 'stats/total': { count: 7 } });
    const response = await call(store, { env: { ...ENV, CONTEXT } });

    assert.deepEqual(await response.json(), { total: 7 });
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(store.keys(), ['stats/total']);
  }
});

test('counter writes retry when another request wins the ETag race', async () => {
  class RacingStore extends MemoryStore {
    constructor() {
      super();
      this.conflicted = false;
    }

    async setJSON(key, value, options = {}) {
      if (key === 'stats/total' && !this.conflicted) {
        this.conflicted = true;
        this.put(key, { count: 5 });
        return { modified: false };
      }
      return super.setJSON(key, value, options);
    }
  }

  const store = new RacingStore();
  const total = await bumpCounter(store, 'stats/total');

  assert.equal(total, 6);
  assert.equal(await readCounter(store, 'stats/total'), 6);
});

test('cookie parsing accepts only UUID v4 values', () => {
  const id = randomUUID();
  assert.equal(visitorIdFromCookie(`${COOKIE}=${id}`), id);
  assert.equal(visitorIdFromCookie(`${COOKIE}=not-a-uuid`), null);
  assert.equal(visitorIdFromCookie('other=1'), null);
  assert.equal(visitorIdFromCookie(''), null);
});

test('IP hashes are salted and the gate allows an empty IP', async () => {
  assert.equal(
    hashIp('203.0.113.7', ENV),
    hashIp('203.0.113.7', ENV),
    'the same IP hashes consistently so its daily count can be found'
  );
  assert.notEqual(
    hashIp('203.0.113.7', ENV),
    hashIp('203.0.113.7', { VISITOR_HASH_SALT: 'other' }),
    'a different salt produces an unlinkable hash'
  );

  const store = new MemoryStore();
  const allowed = await allowNewVisitorFromIp(store, { ip: '', date: '2026-10-20', env: ENV });
  assert.equal(allowed, true);
  assert.deepEqual(store.keys(), []);
});

test('the IP gate resets when the UTC day changes', async () => {
  const store = new MemoryStore();
  const env = { ...ENV, VISITOR_MAX_NEW_PER_IP_DAY: '1' };
  const ip = '203.0.113.7';

  assert.equal(await allowNewVisitorFromIp(store, { ip, date: '2026-10-20', env }), true);
  assert.equal(await allowNewVisitorFromIp(store, { ip, date: '2026-10-20', env }), false);
  assert.equal(await allowNewVisitorFromIp(store, { ip, date: '2026-10-21', env }), true);
});

test('requests are classified before storage is touched', () => {
  assert.equal(isAutomatedRequest(visitRequest()), false);
  assert.equal(isAutomatedRequest(visitRequest({ 'user-agent': 'Googlebot' })), true);
  assert.equal(isAutomatedRequest(visitRequest({ 'user-agent': 'Slackbot-LinkExpanding 1.0' })), true);
  assert.equal(isAutomatedRequest(visitRequest({ purpose: 'prefetch' })), true);
  assert.equal(isCrossSiteRequest(visitRequest()), false);
  assert.equal(isCrossSiteRequest(visitRequest({ 'sec-fetch-site': 'same-site' })), true);
  assert.equal(isCrossSiteRequest(visitRequest({ origin: 'https://evil.example' })), true);
});

test('in-app browsers are people, not crawlers', () => {
  const whatsapp =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.12.76';
  const instagram =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 335.0.0.32.98';

  assert.equal(isAutomatedRequest(visitRequest({ 'user-agent': whatsapp })), false);
  assert.equal(isAutomatedRequest(visitRequest({ 'user-agent': instagram })), false);
});

test('only the production context writes', () => {
  assert.equal(shouldWrite({}), true);
  assert.equal(shouldWrite({ CONTEXT: 'production' }), true);
  assert.equal(shouldWrite({ CONTEXT: 'deploy-preview' }), false);
  assert.equal(shouldWrite({ CONTEXT: 'branch-deploy' }), false);
});

test('formatVisitorCount handles real numbers only', () => {
  assert.equal(formatVisitorCount(0), '0');
  assert.equal(formatVisitorCount(1), '1');
  assert.equal(formatVisitorCount(1234), '1,234');
  assert.equal(formatVisitorCount(1234567), '1,234,567');
  assert.equal(formatVisitorCount(-1), '');
  assert.equal(formatVisitorCount('nope'), '');
  assert.equal(formatVisitorCount(undefined), '');
});

test('applyVisitorCount reveals the footer with singular and plural labels', () => {
  const makeRoot = () => {
    const footer = { hidden: true };
    const count = { textContent: '' };
    const root = {
      querySelector: (selector) =>
        selector === '[data-visitor-footer]' ? footer : selector === '[data-visitor-count]' ? count : null,
    };
    return { root, footer, count };
  };

  const one = makeRoot();
  assert.equal(applyVisitorCount(one.root, 1), true);
  assert.equal(one.count.textContent, '1 distinct reader');
  assert.equal(one.footer.hidden, false);

  const many = makeRoot();
  assert.equal(applyVisitorCount(many.root, 1234), true);
  assert.equal(many.count.textContent, '1,234 distinct readers');

  const empty = makeRoot();
  empty.footer.hidden = false;
  assert.equal(applyVisitorCount(empty.root, 0), false);
  assert.equal(empty.footer.hidden, true);
});

test('recordVisit posts once and updates the footer, failing silently otherwise', async () => {
  const makeRoot = () => {
    const footer = { hidden: true };
    const count = { textContent: '' };
    return {
      root: {
        querySelector: (selector) =>
          selector === '[data-visitor-footer]'
            ? footer
            : selector === '[data-visitor-count]'
              ? count
              : null,
      },
      footer,
      count,
    };
  };

  const ok = makeRoot();
  let request;
  const total = await recordVisit({
    root: ok.root,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, json: async () => ({ total: 321 }) };
    },
  });

  assert.equal(total, 321);
  assert.equal(request.url, '/api/visit');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.credentials, 'same-origin');
  assert.equal(ok.count.textContent, '321 distinct readers');
  assert.equal(ok.footer.hidden, false);

  const failed = makeRoot();
  const missing = await recordVisit({
    root: failed.root,
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
  });
  assert.equal(missing, null);
  assert.equal(failed.footer.hidden, true);

  const offline = await recordVisit({
    root: failed.root,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(offline, null);
  assert.equal(failed.footer.hidden, true);

  const ignored = await recordVisit({
    root: failed.root,
    fetchImpl: async () => ({ ok: true, status: 204, json: async () => ({}) }),
  });
  assert.equal(ignored, null);
  assert.equal(failed.footer.hidden, true);
});
