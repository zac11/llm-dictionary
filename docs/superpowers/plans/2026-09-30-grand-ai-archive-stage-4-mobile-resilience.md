# Grand AI Archive Stage 4: Mobile and Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the selected mobile immersive-header/discovery-sheet composition, adaptive rendering, WebGL fallback, reduced-motion behavior, and cross-device verification.

**Architecture:** Reuse Stage 1 quality profiles and Stage 2/3 DOM components. Add a pure capability decision and a static shelf poster fallback before constructing `Library`; CSS rearranges existing semantic components rather than duplicating mobile markup.

**Tech Stack:** Vanilla ES modules, Three.js, CSS media queries, static WebP asset, Node built-in test runner

**Spec:** `docs/superpowers/specs/2026-09-30-grand-ai-archive-redesign-design.md`

## Global Constraints

- Execute after Stage 3 in the same isolated redesign worktree; do not overwrite or absorb unrelated working-tree changes.
- Keep adaptive live 3D on supported mobile devices.
- Static fallback image is `public/library-fallback.webp`, optimized below 200 KB.
- Mobile/low profile caps pixel ratio at 1.25, dust at 100, and disables idle motion.
- Search, Ask, Explore, carousel, and A–B rail remain functional without WebGL.
- Reduced motion disables carousel auto-advance, intro dolly, page turn, and idle movement.
- Add no dependency or permanent animation loop.

## Review Focus

- WebGL constructor failure after a positive capability probe must still show fallback, covered in Task 1.
- Orientation/resize changes must not initialize a second renderer or lose current view, covered in Task 2.
- Touch scrolling on the discovery sheet must not orbit/zoom the canvas underneath, covered in Task 3.
- Reduced-motion changes during a session must update active behavior, covered in Task 4.
- Hidden/paused views must not continue expensive rendering, covered in Task 5.

---

### Task 1: WebGL Capability and Static Fallback

**Files:**
- Create: `src/render-capability.js`
- Create: `test/render-capability.test.mjs`
- Create: `public/library-fallback.webp`
- Modify: `src/main.js:1-23`
- Modify: `index.html:42-80`
- Modify: `src/styles.css:39-54`

**Interfaces:**
- Produces: `canCreateWebGL({ document, WebGLRenderingContext }) -> boolean`.
- Produces: `renderMode({ webglAvailable, constructionFailed }) -> 'webgl' | 'fallback'`.
- Produces: `createLibraryFacade(library) -> { pullOutBook, returnBook, pause, resume, screenPointOf, overview }`; the fallback facade returns resolved promises/no-op values.
- `main.js` exposes one initialization path that either constructs `Library` or activates `.library-fallback`.

- [ ] **Step 1: Write failing capability tests**

Assert false for missing WebGL, null context, thrown context creation, and construction failure; true only for a valid context. Assert fallback mode is sticky after constructor failure and every fallback-facade method is safe to call, with async methods resolving.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test test/render-capability.test.mjs`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement capability helpers**

Probe with an ephemeral canvas and catch all failures. Do not retain a test context.

- [ ] **Step 4: Create and validate the poster asset**

Create a 1600×900 WebP from an approved current-scene capture, without private browser chrome or overlays. Optimize below 200 KB and verify legibility behind the discovery UI.

- [ ] **Step 5: Guard Library construction and activate fallback markup**

All DOM discovery controls remain active. Volume-rail actions open contents/entries directly when no renderer exists. Library calls in `main.js` use a small adapter/no-op boundary rather than repeated null checks.

- [ ] **Step 6: Run tests/build**

Run: `node --test test/render-capability.test.mjs && npm run build`  
Expected: PASS; built fallback asset remains below 200 KB.

- [ ] **Step 7: Commit**

```bash
git add src/render-capability.js src/main.js index.html src/styles.css public/library-fallback.webp test/render-capability.test.mjs
git commit -m "Add resilient WebGL fallback mode"
```

### Task 2: Adaptive Mobile Three.js Header

**Files:**
- Modify: `src/library.js:57-122,158-497,705-813`
- Modify: `src/scene-quality.js`
- Modify: `test/scene-quality.test.mjs`
- Modify: `src/styles.css` mobile scene sections

**Interfaces:**
- Consumes Stage 1 `selectSceneProfile`.
- Adds `Library.applyViewportProfile(environment)` that updates pixel ratio and non-structural quality settings without creating another renderer.
- Adds `Library.setInteractiveRegion(rect | null)` to constrain pointer handling to the mobile header canvas; `null` restores the full canvas region.

- [ ] **Step 1: Extend tests for resize/profile transitions**

Assert width/coarse-pointer transitions high→mobile and mobile→balanced are deterministic, reduced motion never selects high, and absent memory remains balanced on mid-sized screens.

- [ ] **Step 2: Implement live non-structural profile updates**

Update renderer pixel ratio, dust visibility/count range, and idle motion on viewport/media changes. Do not rebuild geometry or renderer during orientation changes.

- [ ] **Step 3: Simplify filler construction for initial mobile profile**

When initial profile has `simplifiedFillers`, reduce filler geometry/material detail during construction while preserving all 13 actionable volumes.

- [ ] **Step 4: Define mobile header framing**

Use a mobile overview pose that frames the shelf rather than the full room/desk. Keep volume selection and touch orbit within conservative bounds.

- [ ] **Step 5: Verify resize and orientation**

Run: `node --test test/scene-quality.test.mjs && npm run build`  
Expected: PASS.

Manual: portrait→landscape→portrait retains one canvas, current selection, and functional controls.

- [ ] **Step 6: Commit**

```bash
git add src/library.js src/scene-quality.js src/styles.css test/scene-quality.test.mjs
git commit -m "Adapt the live archive scene for mobile"
```

### Task 3: Mobile Discovery Sheet Composition

**Files:**
- Modify: `index.html` archive-home/topbar/rail sections
- Modify: `src/styles.css` responsive sections
- Modify: `src/archive-home.js`
- Modify: `src/archive-nav.js`

**Interfaces:**
- Reuses one semantic welcome/search/action/rail/carousel DOM tree across desktop and mobile.
- Produces no separate mobile controller.

- [ ] **Step 1: Implement selected responsive composition**

Below 860 px: fixed/compact Three.js header, native discovery sheet in normal flow, Search and Ask visible, Explore menu reachable, horizontal A–B rail, carousel below primary actions.

- [ ] **Step 2: Separate touch regions**

Canvas handles gestures only inside the header. Discovery-sheet scrolling and horizontal rail movement must not reach OrbitControls. Use CSS `touch-action` and event boundaries rather than global preventDefault.

- [ ] **Step 3: Complete narrow entry and overlay geometry**

Ensure Ask, Map, Explore, contribution, feedback, and reader fit viewport/safe areas without overlapping the header or each other.

- [ ] **Step 4: Build and test target widths**

Run: `npm run build`  
Expected: PASS.

Manual widths: 390×844, 430×932, 768×1024, 1024×768. Verify zoomed text at 200% and landscape orientation.

- [ ] **Step 5: Commit**

```bash
git add index.html src/styles.css src/archive-home.js src/archive-nav.js
git commit -m "Compose the mobile archive discovery experience"
```

### Task 4: Dynamic Reduced-Motion Coordination

**Files:**
- Create: `src/motion-preference.js`
- Create: `test/motion-preference.test.mjs`
- Modify: `src/main.js`
- Modify: `src/library.js`
- Modify: `src/ui.js`
- Modify: `src/archive-home.js`
- Modify: `src/discovery-carousel.js`

**Interfaces:**
- Produces: `MotionPreference(mediaQuery)` with `reduced`, `subscribe(listener) -> unsubscribe`, and `destroy()`.
- Consumers expose `setReducedMotion(boolean)` methods: `Library`, `UI`, `ArchiveHome`, `CarouselState`.

- [ ] **Step 1: Write failing subscription/lifecycle tests**

Use a fake MediaQueryList. Assert initial value, change notification, unsubscribe, and destroy cleanup.

- [ ] **Step 2: Run focused test and verify failure**

Run: `node --test test/motion-preference.test.mjs`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the preference observer**

Support modern `addEventListener('change')` and legacy `addListener` without duplicate callbacks.

- [ ] **Step 4: Add consumer setters**

When reduction turns on: finish active tweens safely, disable intro/idle/page-turn, and pause carousel auto-advance. Turning it off restores eligible future animation but does not replay intro.

- [ ] **Step 5: Wire one observer in `main.js`**

Avoid separate media-query listeners in each component. Dispose subscriptions where component lifecycle supports it.

- [ ] **Step 6: Run tests/build**

Run: `node --test test/motion-preference.test.mjs test/discovery-carousel.test.mjs test/scene-quality.test.mjs && npm run build`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/motion-preference.js src/main.js src/library.js src/ui.js src/archive-home.js src/discovery-carousel.js test/motion-preference.test.mjs
git commit -m "Coordinate reduced motion across the archive"
```

### Task 5: Whole-Redesign Verification and Budget Gate

**Files:**
- Modify only files required by defects found during verification.
- Update: `README.md` only if user-facing controls or development verification commands changed.

**Interfaces:**
- No new product interface; this task validates all prior contracts.

- [ ] **Step 1: Run complete automated verification**

Run: `npm test && npm run graph:check && npm run build`  
Expected: PASS. The live Kimi test remains opt-in and is not required for visual redesign completion.

- [ ] **Step 2: Run route and feature regression matrix**

Verify Library, Search, entry, story, share, Map, Ask, contribution, feedback, `?term`, `/term/<slug>/`, `?volume`, `?map`, `?view=map`, browser Back/Forward, and Escape priority.

- [ ] **Step 3: Run accessibility matrix**

Keyboard-only pass, focus restoration for every overlay/menu, 200% zoom, screen-reader labels for range/card/carousel, reduced-motion live change, and no color-only status.

- [ ] **Step 4: Run performance matrix**

Measure desktop high and mobile/low FPS, verify no new permanent RAF, confirm hidden views pause work, record initial gzip delta from Stage 1 baseline, and enforce cumulative increase below 20 KB.

- [ ] **Step 5: Inspect fallback and failure states**

Disable WebGL; block graph/retrieval requests; deny storage; remove eligible `addedAt` in a fixture; emulate slow resources. Expected: core Search/Ask/entry navigation remains usable and errors are non-blocking.

- [ ] **Step 6: Request whole-branch code review**

Use `superpowers:requesting-code-review` with the spec and all four plans. Resolve only verified findings, using `superpowers:receiving-code-review` for feedback.

- [ ] **Step 7: Commit final verified corrections**

From the clean isolated execution worktree, inspect `git diff --name-only`, then stage all tracked corrections with `git add -u`; add any new verification fixture explicitly from `test/` or `public/`. Confirm `git diff --cached --stat` contains only verification corrections before committing.

```bash
git commit -m "Complete Grand AI Archive redesign verification"
```
