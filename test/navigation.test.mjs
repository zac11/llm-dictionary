import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppLocation } from '../src/navigation.js';

test('parseAppLocation maps deep-link and query forms to their views', () => {
  assert.deepEqual(parseAppLocation({ pathname: '/term/attention/', search: '' }), {
    view: 'term', slug: 'attention', folder: null,
  });
  assert.deepEqual(parseAppLocation({ pathname: '/', search: '?term=attention' }), {
    view: 'term', slug: 'attention', folder: null,
  });
  assert.deepEqual(parseAppLocation({ pathname: '/', search: '?volume=a-b' }), {
    view: 'volume', slug: null, folder: 'a-b',
  });
  assert.deepEqual(parseAppLocation({ pathname: '/', search: '?view=map' }), {
    view: 'map', slug: null, folder: null,
  });
  assert.deepEqual(parseAppLocation({ pathname: '/', search: '?map=attention' }), {
    view: 'map', slug: 'attention', folder: null,
  });
  assert.deepEqual(parseAppLocation({ pathname: '/', search: '' }), {
    view: 'library', slug: null, folder: null,
  });
  assert.deepEqual(parseAppLocation({ pathname: '/unknown/path', search: '' }), {
    view: 'library', slug: null, folder: null,
  });
});

test('parseAppLocation decodes URL-encoded slugs and query terms', () => {
  assert.deepEqual(
    parseAppLocation({ pathname: '/term/attention%20is%20all%20you%20need/', search: '' }),
    { view: 'term', slug: 'attention is all you need', folder: null }
  );
  assert.deepEqual(parseAppLocation({ pathname: '/', search: '?term=backpropagation%20through%20time' }), {
    view: 'term', slug: 'backpropagation through time', folder: null,
  });
});

test('parseAppLocation resolves Map precedence for conflicting parameters', () => {
  assert.deepEqual(
    parseAppLocation({ pathname: '/', search: '?map=attention&term=quantization&volume=a-b' }),
    { view: 'map', slug: 'attention', folder: null }
  );
  assert.deepEqual(parseAppLocation({ pathname: '/', search: '?view=map&term=attention' }), {
    view: 'map', slug: null, folder: null,
  });
});

test('parseAppLocation prefers the term query over a term path', () => {
  assert.deepEqual(parseAppLocation({ pathname: '/term/attention/', search: '?term=quantization' }), {
    view: 'term', slug: 'quantization', folder: null,
  });
});
