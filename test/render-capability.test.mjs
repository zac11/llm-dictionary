import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateWebGL, createLibraryFacade, renderMode } from '../src/render-capability.js';

function fakeContext(version = 'WebGL 1.0') {
  return {
    VERSION: 0x1f02,
    getParameter(pname) {
      return pname === 0x1f02 ? version : null;
    },
  };
}

function documentWith(getContextImpl) {
  return {
    createElement(tag) {
      return { tag, width: 0, height: 0, getContext: getContextImpl };
    },
  };
}

test('canCreateWebGL is false for missing globals and a null context', () => {
  assert.equal(canCreateWebGL({ document: null, WebGLRenderingContext: null }), false);
  assert.equal(canCreateWebGL({ document: {}, WebGLRenderingContext: null }), false);
  assert.equal(
    canCreateWebGL({ document: documentWith(() => null), WebGLRenderingContext: function WebGLRenderingContext() {} }),
    false
  );
});

test('canCreateWebGL is false when context creation throws', () => {
  const document = documentWith(() => {
    throw new Error('blocked');
  });
  assert.equal(canCreateWebGL({ document, WebGLRenderingContext: function WebGLRenderingContext() {} }), false);
});

test('canCreateWebGL is true only for a valid context', () => {
  const document = documentWith(() => fakeContext());
  assert.equal(canCreateWebGL({ document, WebGLRenderingContext: function WebGLRenderingContext() {} }), true);
  const nullVersion = documentWith(() => ({ VERSION: 0x1f02, getParameter: () => null }));
  assert.equal(canCreateWebGL({ document: nullVersion, WebGLRenderingContext: function WebGLRenderingContext() {} }), false);
});

test('renderMode falls back when WebGL is missing and stays fallback after construction failure', () => {
  assert.equal(renderMode({ webglAvailable: false, constructionFailed: false }), 'fallback');
  assert.equal(renderMode({ webglAvailable: true, constructionFailed: true }), 'fallback');
  assert.equal(renderMode({ webglAvailable: true, constructionFailed: false }), 'webgl');
});

test('createLibraryFacade null fallback exposes safe methods and resolving asyncs', async () => {
  const facade = createLibraryFacade(null);
  assert.equal(facade.screenPointOf('a-b'), null);
  facade.pause();
  facade.resume();
  facade.overview();
  await facade.pullOutBook('a-b');
  await facade.returnBook();
});

test('createLibraryFacade delegates to a real library', async () => {
  const calls = [];
  const library = {
    pullOutBook: (folder) => calls.push(['pullOutBook', folder]),
    returnBook: () => calls.push(['returnBook']),
    pause: () => calls.push(['pause']),
    resume: () => calls.push(['resume']),
    screenPointOf: (folder) => ({ folder }),
    overview: () => calls.push(['overview']),
  };
  const facade = createLibraryFacade(library);
  facade.pullOutBook('a-b');
  facade.returnBook();
  facade.pause();
  facade.resume();
  facade.overview();
  assert.deepEqual(facade.screenPointOf('y-z'), { folder: 'y-z' });
  assert.deepEqual(calls, [
    ['pullOutBook', 'a-b'],
    ['returnBook'],
    ['pause'],
    ['resume'],
    ['overview'],
  ]);
});
