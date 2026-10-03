# Grand AI Archive Stage 1: Visual Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the redesigned scene hierarchy, adaptive quality profiles, volume hover cards, Search + Ask navigation, Explore menu, and A–B volume rail.

**Architecture:** Keep Three.js responsible for spatial rendering and emit small hover/position events to DOM controllers. Put device-profile selection and volume-card data in pure modules so they are testable without WebGL; preserve `main.js` as the single view-transition authority.

**Tech Stack:** Vanilla ES modules, Three.js 0.169, Vite 5, CSS, Node built-in test runner

**Spec:** `docs/superpowers/specs/2026-09-30-grand-ai-archive-redesign-design.md`

## Global Constraints

- Execute in an isolated worktree based on a commit that includes the current contribution/feedback work; do not overwrite or absorb unrelated working-tree changes.
- Add no runtime dependency and no post-processing framework.
- Keep all meaningful text and controls in HTML, not WebGL textures.
- Use 160 ms volume hover, 200 ms hover-card entrance, and 300 ms menu/panel transitions.
- Preserve Library, Search, Map, Ask, share, contribution, feedback, and deep-link behavior.
- Initial redesign JavaScript growth across all stages must remain below 20 KB gzip, excluding generated data.
- Respect `prefers-reduced-motion` in JavaScript behavior.

## Review Focus

- Missing capability signals (`deviceMemory`, coarse pointer) must select a deterministic safe profile, covered in Task 1.
- Hover events during book animation must hide rather than strand the volume card, covered in Task 3.
- Projected cards near viewport edges must remain visible, covered in Task 3.
- Explore-menu keyboard and Escape behavior must not conflict with existing overlays, covered in Task 4.
- Existing `?term`, `?volume`, `?map`, Ask, contribution, and feedback transitions must remain intact, covered in Task 5.

---

### Task 1: Deterministic Scene Quality Profiles

**Files:**
- Create: `src/scene-quality.js`
- Create: `test/scene-quality.test.mjs`
- Modify: `src/library.js:57-122,455-477,705-728`

**Interfaces:**
- Produces: `selectSceneProfile({ width, coarsePointer, reducedMotion, deviceMemory, devicePixelRatio }) -> { name, maxPixelRatio, dustCount, idleMotion, simplifiedFillers }`
- Produces: `currentSceneEnvironment(window) -> input accepted by selectSceneProfile`
- Consumes later: `Library` stores the returned object as `this.quality`.

- [ ] **Step 1: Write failing profile-selection tests**

Assert:

```js
assert.equal(selectSceneProfile({ width: 390, coarsePointer: true, reducedMotion: false, deviceMemory: 8, devicePixelRatio: 3 }).name, 'mobile');
assert.equal(selectSceneProfile({ width: 1440, coarsePointer: false, reducedMotion: false, deviceMemory: 8, devicePixelRatio: 2 }).name, 'high');
assert.equal(selectSceneProfile({ width: 1024, coarsePointer: false, reducedMotion: false, deviceMemory: undefined, devicePixelRatio: 2 }).name, 'balanced');
assert.equal(selectSceneProfile({ width: 1440, coarsePointer: false, reducedMotion: true, deviceMemory: 8, devicePixelRatio: 2 }).name, 'balanced');
```

Also assert exact profile values: high `{ maxPixelRatio: 2, dustCount: 700, idleMotion: true, simplifiedFillers: false }`, balanced `{ 1.5, 300, true, false }`, mobile `{ 1.25, 100, false, true }`.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/scene-quality.test.mjs`  
Expected: FAIL because `src/scene-quality.js` does not exist.

- [ ] **Step 3: Implement the pure profile API**

Implement the signatures above using the spec thresholds: mobile for coarse pointer, width below 860, or memory at most 4 GB; high for width at least 1100, fine pointer, no reduced motion, and memory at least 8 GB when reported; balanced otherwise.

- [ ] **Step 4: Integrate the profile into `Library`**

Use `maxPixelRatio` at renderer initialization, `dustCount` in `_buildDust`, and `idleMotion` in `_animate`. Keep existing constructor callers valid.

- [ ] **Step 5: Run focused and regression tests**

Run: `node --test test/scene-quality.test.mjs test/graph-client.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scene-quality.js src/library.js test/scene-quality.test.mjs
git commit -m "Add adaptive library quality profiles"
```

### Task 2: Shelf Lighting and Actionable-Volume Hierarchy

**Files:**
- Modify: `src/library.js:125-215,330-497,731-789`
- Modify: `src/textures.js`
- Modify: `src/styles.css:1-326`

**Interfaces:**
- Consumes: `this.quality` from Task 1.
- Produces: visually distinct actionable volumes while preserving current folder IDs and selection hooks.

- [ ] **Step 1: Capture baseline verification values**

Record current renderer exposure, light intensities, dust count, and production bundle sizes in the task notes. Run `npm run build` and retain the output for comparison.

- [ ] **Step 2: Apply the approved scene hierarchy**

Adjust existing lights/materials only: reveal warm-brown shadow detail, strengthen shelf-edge and actionable-volume separation, slightly raise violet rim contribution, reduce dust prominence through the profile, and lower filler-title contrast. Do not add another render loop or post-processing pass.

- [ ] **Step 3: Add reduced-motion intro interruption**

Ensure first user pointer/wheel interaction safely completes or skips the intro dolly instead of blocking interaction. Preserve current stale-animation cancellation semantics.

- [ ] **Step 4: Build and inspect the scene**

Run: `npm run build`  
Expected: PASS with no new dependency and no extra main-loop owner.

Manual checks: desktop shelf readable at both edges; actionable volumes remain the brightest chromatic objects; fillers read as texture; immediate interaction does not leave controls disabled.

- [ ] **Step 5: Commit**

```bash
git add src/library.js src/textures.js src/styles.css
git commit -m "Refine the archive scene hierarchy"
```

### Task 3: Volume Hover Projection and DOM Card

**Files:**
- Create: `src/volume-card.js`
- Create: `test/volume-card.test.mjs`
- Modify: `src/library.js:500-556,690-703,731-789`
- Modify: `src/main.js:6-23`
- Modify: `index.html:42-140`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `volumeCardData(volume, terms) -> { folder, label, count, samples, color }`
- Produces: `clampCardPosition(point, cardSize, viewport, margin = 12) -> { left, top }`
- Produces: `nextVolumeCardState({ folder, animating, pulled, paused }) -> 'show' | 'hide'`.
- Produces: `VolumeCard` with `show(data, point)`, `move(point)`, and `hide()`.
- Extends `Library` hook: `onHoverVolume({ folder, point } | null)`.

- [ ] **Step 1: Write failing pure-data and clamping tests**

Assert deterministic sample terms, exact term count, clamping at all four viewport edges, and `nextVolumeCardState` returning `hide` for animation, pulled-book, paused, and missing-folder states. Include a missing-point case that returns `null` rather than invalid coordinates.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/volume-card.test.mjs`  
Expected: FAIL because exports do not exist.

- [ ] **Step 3: Implement pure helpers and `VolumeCard`**

Render card text with DOM APIs. The class owns only its element, positioning, visibility, and `aria-hidden` state.

- [ ] **Step 4: Emit hover events from `Library`**

Call `onHoverVolume` when hover changes, update projected position while the hovered volume/camera moves, and emit `null` during animations, pull-out, pause, pointer leave, and disposal.

- [ ] **Step 5: Wire the card in `main.js` and add markup/styles**

Build data from existing `volumes` and range terms. Card entrance duration is 200 ms; pointer events remain disabled so it cannot block canvas interaction.

- [ ] **Step 6: Verify tests and browser behavior**

Run: `node --test test/volume-card.test.mjs && npm run build`  
Expected: PASS.

Manual checks: A–B and Y–Z cards remain on-screen; dragging, selecting, and returning a book never strand a card.

- [ ] **Step 7: Commit**

```bash
git add src/volume-card.js src/library.js src/main.js index.html src/styles.css test/volume-card.test.mjs
git commit -m "Add accessible volume preview cards"
```

### Task 4: Search + Ask Navigation and Explore Menu

**Files:**
- Create: `src/archive-nav.js`
- Create: `test/archive-nav.test.mjs`
- Modify: `index.html:80-140`
- Modify: `src/main.js:25-234`
- Modify: `src/ui.js:30-176,897-938`
- Modify: `src/styles.css:65-326,1525-1873,2168-2400`

**Interfaces:**
- Produces: `exploreActions(callbacks) -> [{ id, label, enabled, invoke }]` with IDs `map`, `random`, `recent`, `browse`, `contribute`, `feedback`, `help`; actions with no callback are disabled until a later stage wires them.
- Produces: `menuKeyAction({ key, index, count }) -> { action: 'move' | 'close' | 'none', index }` for deterministic keyboard behavior.
- Produces: `ArchiveNav` with `openExplore()`, `closeExplore({ restoreFocus })`, and `destroy()`.
- Consumes callbacks: `openMap`, `openRandomTerm`, `showRecentlyAdded`, `focusVolumeRail`, `openContribute`, `openFeedback`, `openHelp`.

- [ ] **Step 1: Write failing action-order and callback tests**

Assert the exact action order, enabled state, callback dispatch, missing optional callback safety, ArrowUp/ArrowDown wraparound, Home/End movement, Escape close, and that Search/Ask are absent from the Explore list.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/archive-nav.test.mjs`  
Expected: FAIL because `src/archive-nav.js` does not exist.

- [ ] **Step 3: Implement action creation and menu controller**

Use DOM APIs, roving focus for arrow keys, Escape close, outside-pointer close, and focus restoration. The controller does not own route state.

- [ ] **Step 4: Replace equal-weight topbar controls**

Keep Brand, Search, Ask, and Explore visible. Move Map, Contribute, Feedback, and Help into Explore without deleting their existing modal/view callbacks. Change the search placeholder to “What do you want to understand?” and retain `/` focus behavior.

- [ ] **Step 5: Enrich search-result rows**

Add a concise definition excerpt and explicit Open Entry action while preserving current ranking and keyboard cursor behavior. Map/Ask secondary actions may appear only where they do not interfere with Enter-to-open.

- [ ] **Step 6: Run tests and build**

Run: `node --test test/archive-nav.test.mjs test/term-schema.test.mjs && npm run build`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/archive-nav.js src/main.js src/ui.js index.html src/styles.css test/archive-nav.test.mjs
git commit -m "Simplify archive navigation and search"
```

### Task 5: A–B Volume Rail and Stage Regression

**Files:**
- Create: `src/navigation.js`
- Create: `test/navigation.test.mjs`
- Create: `test/volume-rail.test.mjs`
- Modify: `src/ui.js:1-176`
- Modify: `src/main.js:287-306`
- Modify: `src/styles.css:287-326,2168-2400`
- Modify: `index.html:133-140`

**Interfaces:**
- Produces: `volumeRailItems(ranges) -> [{ folder, label, count, letters, disabled }]`, consuming all 13 exported `RANGES` rather than the non-empty-only `volumes` list.
- Produces: `parseAppLocation({ pathname, search }) -> { view: 'library' | 'map' | 'term' | 'volume', slug: string | null, folder: string | null }` with precedence Map, term path/query, volume, library.
- Existing `UI.setActiveVolume(folder, letter)` remains callable; active state moves to the range button.

- [ ] **Step 1: Write failing rail-model tests**

Assert 13 items, labels A–B through Y–Z, folder IDs, counts, and deterministic ordering. Include a volume with zero terms and assert it is disabled rather than removed. In `navigation.test.mjs`, assert `/term/attention/`, `?term=attention`, `?volume=a-b`, `?view=map`, `?map=attention`, unknown paths, URL decoding, and Map precedence for conflicting parameters.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/volume-rail.test.mjs test/navigation.test.mjs`  
Expected: FAIL because `volumeRailItems` and `parseAppLocation` do not exist.

- [ ] **Step 3: Implement the rail model and replace letter buttons**

Each range button invokes `onPickVolume(folder)` and exposes range/count via its accessible name. Preserve internal letter filtering inside volume contents.

- [ ] **Step 4: Implement and adopt `parseAppLocation`**

Move startup/popstate URL interpretation from `main.js` into the pure parser without changing route precedence or history-writing behavior.

- [ ] **Step 5: Run the full verification set**

Run: `npm test && npm run build`  
Expected: all tests and build PASS.

Manual routes: `?term=attention`, `?volume=a-b`, `?view=map`, Ask, Contribute, Feedback, Escape priority, and Back/Forward.

- [ ] **Step 6: Measure the stage budget**

Compare gzip output to Task 2 baseline. Record total initial-JS increase; it must remain compatible with the cumulative 20 KB budget.

- [ ] **Step 7: Commit**

```bash
git add src/navigation.js src/main.js src/ui.js src/styles.css index.html test/navigation.test.mjs test/volume-rail.test.mjs
git commit -m "Replace alphabet buttons with volume navigation"
```
