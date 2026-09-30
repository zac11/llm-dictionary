# Grand AI Archive Stage 2: Homepage Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the editorial welcome panel, About tab, deterministic daily term, recent history, explicit recently-added data, Random Term, and the 9-second desk carousel.

**Architecture:** Put all selection, date, and persistence rules in `archive-discovery.js`; let `ArchiveHome` own DOM, timers, and accessibility. `main.js` supplies navigation callbacks and records successful entry opens, while generated term/retrieval data carries optional `addedAt`.

**Tech Stack:** Vanilla ES modules, existing generated term/retrieval data, localStorage, CSS, Node built-in test runner

**Spec:** `docs/superpowers/specs/2026-09-30-grand-ai-archive-redesign-design.md`

## Global Constraints

- Execute after Stage 1 in the same isolated redesign worktree; do not overwrite or absorb unrelated working-tree changes.
- Add no runtime dependency or backend.
- Carousel interval is exactly 9,000 ms and crossfade is 300 ms.
- Persist versioned welcome state and at most eight recent slugs.
- Never infer or fabricate `addedAt`; seed only dates verified from Git history.
- Omit unavailable discovery slides rather than rendering empty controls.
- Preserve Stage 1 navigation and all existing routes.

## Review Focus

- Invalid dates and equal dates must sort predictably, covered in Task 1.
- localStorage denial/corruption must fall back to session memory, covered in Task 2.
- Empty term lists and removed recent slugs must not throw, covered in Task 2.
- Carousel timers must pause for focus, hover, hidden pages, reduced motion, and manual pause, covered in Task 4.
- Rapid Random Term/entry actions must respect existing `state.busy`, covered in Task 5.

---

### Task 1: `addedAt` Data Pipeline

**Files:**
- Modify: `src/term-schema.js:123-149,151-220`
- Modify: `scripts/graph-builder.mjs:401-442`
- Modify: `test/term-schema.test.mjs`
- Modify: `test/graph-builder.test.mjs`
- Modify: six editorially selected dictionary JSON files introduced by commit `0553810`

**Interfaces:**
- Extends normalized term with `addedAt: string` using `YYYY-MM-DD` or `''`.
- Extends retrieval entries with `addedAt`.
- Produces: `isIsoDate(value) -> boolean` from `src/term-schema.js`.

- [ ] **Step 1: Write failing normalization and retrieval tests**

Assert valid `2026-09-19` is preserved, invalid dates produce a validation error, absent dates normalize to `''`, and `buildRetrievalCorpus` includes the value.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test test/term-schema.test.mjs test/graph-builder.test.mjs`  
Expected: FAIL because `addedAt` is absent.

- [ ] **Step 3: Implement date normalization/validation and corpus propagation**

Use strict calendar-date validation, not only a regular expression. Keep the graph node schema unchanged.

- [ ] **Step 4: Seed verified recent metadata**

Add the verified first-addition dates: `agent2agent`, `agentic-commerce`, `ai-action-summit-2025`, and `adaptive-ml` use `2026-09-19`; `mixture-of-recursions` uses `2026-09-12`; `test-time-compute` uses `2026-09-09`. These dates were verified with `git log --diff-filter=A -1 --format=%cs -- <exact path>` during planning.

- [ ] **Step 5: Run tests and graph generation**

Run: `node --test test/term-schema.test.mjs test/graph-builder.test.mjs && npm run graph && npm run graph:check`  
Expected: PASS and retrieval artifact hash changes.

- [ ] **Step 6: Commit**

```bash
git add src/term-schema.js scripts/graph-builder.mjs test/term-schema.test.mjs test/graph-builder.test.mjs dictionary
git commit -m "Add explicit recently-added term metadata"
```

### Task 2: Discovery Selection and Persistence Model

**Files:**
- Create: `src/archive-discovery.js`
- Create: `test/archive-discovery.test.mjs`

**Interfaces:**
- Produces: `termOfDay(terms, date) -> term | null`.
- Produces: `recentlyAdded(terms, { limit = 8 }) -> term[]`.
- Produces: `createRecentHistory({ storage, limit = 8, key = 'theaidictionary:recent:v1' }) -> { read(validSlugs), record(slug), clear() }`.
- Produces: `randomTerm(terms, random = Math.random) -> term | null`.
- Produces: `discoveryTarget({ busy, terms, random }) -> term | null`, returning `null` while navigation is busy.
- Produces: `WELCOME_KEY = 'theaidictionary:welcome:v1'` and safe `readWelcomeState` / `writeWelcomeState`.

- [ ] **Step 1: Write failing deterministic-selection tests**

Assert identical UTC dates return identical terms regardless of input ordering; adjacent dates rotate; empty terms return `null`; random values 0 and near 1 select valid bounds; `discoveryTarget` returns `null` while busy and delegates to deterministic random selection while idle.

- [ ] **Step 2: Write failing recency and persistence tests**

Assert valid date sorting, slug tie-breaks, limit eight, duplicate recents move to front, stale slugs are removed, malformed JSON recovers, and throwing storage falls back to memory.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `node --test test/archive-discovery.test.mjs`  
Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement the pure APIs**

Use UTC date strings for daily selection and an internal memory adapter when storage operations throw. Do not access `window` at module import time.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/archive-discovery.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/archive-discovery.js test/archive-discovery.test.mjs
git commit -m "Add archive discovery and recent-history models"
```

### Task 3: Editorial Welcome Panel and About Tab

**Files:**
- Create: `src/archive-home.js`
- Modify: `index.html:42-140`
- Modify: `src/main.js:1-45,236-306`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `ArchiveHome(root, { terms, onSearch, onRandomTerm, onOpenMap, onOpenTerm, reducedMotion })`.
- Methods: `openWelcome()`, `collapseWelcome({ persist = true })`, `recordTerm(slug)`, `destroy()`.
- Consumes discovery helpers from Task 2.

- [ ] **Step 1: Add approved semantic markup**

Add `#archive-home`, welcome headline/value copy, term-count slot, primary search button, Random Term, Map, and `#archive-about-tab`. Keep it usable before canvas initialization.

- [ ] **Step 2: Implement `ArchiveHome` welcome state**

Default open without stored state; collapse on search, volume selection, Random Term, Ask, or Map; persist collapsed default; About reopens without changing future default.

- [ ] **Step 3: Wire existing actions through callbacks**

Focus existing search for the primary action, use `openTermRitual` for Random Term, and existing `openMap` for Map. Do not duplicate route logic.

- [ ] **Step 4: Add desktop/mobile welcome styling**

Desktop uses the approved left editorial composition and 300 ms collapse. Mobile content participates in the discovery sheet that Stage 4 finalizes.

- [ ] **Step 5: Build and manually verify persistence**

Run: `npm run build`  
Expected: PASS.

Manual: fresh storage opens panel; interaction collapses it; reload shows tab; About reopens; reset storage restores first-visit state.

- [ ] **Step 6: Commit**

```bash
git add src/archive-home.js src/main.js index.html src/styles.css
git commit -m "Add the archive welcome experience"
```

### Task 4: Accessible Discovery Carousel

**Files:**
- Create: `src/discovery-carousel.js`
- Create: `test/discovery-carousel.test.mjs`
- Modify: `src/archive-home.js`
- Modify: `index.html`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `CarouselState(count, { intervalMs = 9000, reducedMotion = false, clock = globalThis })`.
- Methods: `start()`, `pause(reason)`, `resume(reason)`, `next()`, `previous()`, `select(index)`, `destroy()`.
- Emits `onChange(index)` supplied in options.
- `ArchiveHome` builds slides with IDs `daily`, `recent`, and `added` only when content exists.

- [ ] **Step 1: Write failing fake-clock tests**

Assert 9,000 ms advance, wraparound, previous/select, independent pause reasons, no reduced-motion auto-start, visibility pause, and timer cleanup on destroy.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test test/discovery-carousel.test.mjs`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the timer/state class**

The class owns no DOM. Use one timeout at a time and restart the interval after manual navigation.

- [ ] **Step 4: Render and wire carousel DOM in `ArchiveHome`**

Use DOM APIs for term content, three labeled pagination controls, previous/next, pause/play, `aria-live="polite"`, and pause on hover/focus/document visibility. Crossfade is 300 ms.

- [ ] **Step 5: Run tests and build**

Run: `node --test test/discovery-carousel.test.mjs test/archive-discovery.test.mjs && npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/discovery-carousel.js src/archive-home.js index.html src/styles.css test/discovery-carousel.test.mjs
git commit -m "Add the archive discovery carousel"
```

### Task 5: Main-Flow Integration and Stage Regression

**Files:**
- Modify: `src/main.js:236-306`
- Modify: `src/archive-home.js`
- Modify: `src/archive-nav.js`
- Modify: `test/archive-discovery.test.mjs`

**Interfaces:**
- `openTermRitual(slug)` records history only after a valid term is accepted for opening.
- Explore actions consume `openRandomTerm`, `showRecentlyAdded`, and `focusVolumeRail`.

- [ ] **Step 1: Add tests for rapid and empty discovery actions**

Assert Random Term returns `null` on empty input and cannot produce an out-of-range slug. Assert recent recording is idempotent for repeated entry opens.

- [ ] **Step 2: Wire successful entry opens to `ArchiveHome.recordTerm`**

Do not record invalid slugs or blocked transitions. Update Continue Exploring immediately after a successful open.

- [ ] **Step 3: Wire Explore actions**

Random Term uses current terms, Recently Added selects its carousel slide, and Browse A–Z focuses the rail. Preserve Map/Ask/overlay state transitions.

- [ ] **Step 4: Full verification**

Run: `npm test && npm run build`  
Expected: PASS.

Manual: first visit, returning visit, no storage, carousel pause modes, Random Term during idle, and all existing deep links.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/archive-home.js src/archive-nav.js test/archive-discovery.test.mjs
git commit -m "Integrate homepage discovery flows"
```
