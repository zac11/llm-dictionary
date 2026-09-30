# Grand AI Archive Stage 3: Entry Learning Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the open-book entry into the approved editorial hierarchy with breadcrumb, Ask, Map, source block, and a restrained Continue Learning strip.

**Architecture:** Extend the existing `UI` reader rather than creating a second reader. Add explicit callbacks from `UI` to `main.js` for Ask and Map; reuse the existing asynchronous concept-trail loader for learning suggestions while changing its presentation and semantics.

**Tech Stack:** Vanilla ES modules, existing UI/graph modules, CSS, Node built-in test runner

**Spec:** `docs/superpowers/specs/2026-09-30-grand-ai-archive-redesign-design.md`

## Global Constraints

- Execute after Stage 2 in the same isolated redesign worktree; do not overwrite or absorb unrelated working-tree changes.
- Preserve the physical pull-out/open-book ritual, story page, sharing, contents navigation, and deep links.
- Do not label graph-derived links as prerequisites.
- Keep citations and entry text accessible HTML.
- Ask and Map actions must use existing view controllers, not duplicate routing.
- Repeated entry transition may be shorter; first opening remains cinematic.

## Review Focus

- Ask from an entry while Map or another overlay is open must resolve to one active overlay, covered in Task 1.
- Missing graph data must hide Map/learning affordances without harming reading, covered in Task 2.
- Long term names, aliases, citations, and details must not overflow desktop or mobile spreads, covered in Task 4.
- Async trail results for a previously viewed term must never render into the current entry, covered in Task 3.
- Terms without citation, story, aliases, or related nodes must retain a balanced layout, covered in Task 4.

---

### Task 1: Explicit Entry Action Interfaces

**Files:**
- Create: `src/entry-actions.js`
- Create: `test/entry-actions.test.mjs`
- Modify: `src/ui.js:30-64,415-490`
- Modify: `src/main.js:125-160,236-306`

**Interfaces:**
- Produces: `entryBreadcrumb(term, volume) -> { volumeLabel, category, text }`.
- Produces: `entryActions({ hasGraph, hasAsk = true }) -> [{ id, label, enabled }]` with IDs `ask`, `map`, `share`.
- Extends `UI` constructor hooks with `onAskTerm(slug)` and `onMapTerm(slug)`.

- [ ] **Step 1: Write failing breadcrumb/action tests**

Assert exact breadcrumb text, action order, Map disabled when graph is unavailable, and safe defaults for missing category/volume.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test test/entry-actions.test.mjs`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure models**

Keep presentation strings centralized and independent from DOM.

- [ ] **Step 4: Add UI hooks and main callbacks**

Ask opens existing `AskChat` with the entry term prefilled through a new `AskChat.open({ query })` optional argument. Map closes the reader/returns the book safely, then opens Map focused on the slug. Share stays in `UI`.

- [ ] **Step 5: Add/extend Ask tests**

In `test/retrieval.test.mjs`, assert prefilled query does not auto-submit and preserves existing open behavior without an argument.

- [ ] **Step 6: Run focused tests**

Run: `node --test test/entry-actions.test.mjs test/retrieval.test.mjs`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/entry-actions.js src/ui.js src/main.js src/ask.js test/entry-actions.test.mjs test/retrieval.test.mjs
git commit -m "Add entry learning action interfaces"
```

### Task 2: Editorial Entry Markup and Citation Block

**Files:**
- Modify: `src/ui.js:447-490`
- Modify: `src/styles.css` entry/page sections
- Modify: `index.html:142-173`

**Interfaces:**
- Consumes: `entryBreadcrumb` and `entryActions` from Task 1.
- Preserves: `formatCitation(citation)`, `_renderConceptTrail(term)`, share-menu anchoring, story flip.

- [ ] **Step 1: Recompose `_renderEntrySpread`**

Left page order: breadcrumb, category, share, term, aliases, definition, Ask and Map actions. Right page order: details, source block, story action, Continue Learning container.

- [ ] **Step 2: Update source semantics and empty states**

Use heading “Source” rather than decorative citation wording, retain external URL safety, omit empty blocks, and keep title/authors/year/venue formatting.

- [ ] **Step 3: Apply editorial hierarchy styles**

Use Fraunces for term/definition, Inter for metadata/details, stronger whitespace, and existing paper colors. Ensure action controls meet 40 px practical target size where space permits.

- [ ] **Step 4: Build and inspect representative entries**

Run: `npm run build`  
Expected: PASS.

Manual fixtures: long name (`a-logical-calculus-of-the-ideas-immanent-in-nervous-activity`), aliases (`attention`), no story, no citation, and a detailed cited entry.

- [ ] **Step 5: Commit**

```bash
git add src/ui.js src/styles.css index.html
git commit -m "Redesign the editorial entry spread"
```

### Task 3: Continue Learning Strip

**Files:**
- Create: `test/entry-learning.test.mjs`
- Modify: `src/entry-actions.js`
- Modify: `src/ui.js:492-545,594-622`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `learningItems({ trail, neighbors, currentSlug, limit = 4 }) -> [{ slug, label, relation }]`.
- Produces: `isCurrentEntry(activeSlug, requestedSlug) -> boolean` for guarding async graph results.
- Relation labels are `connected` or `related`; never `prerequisite`.
- Consumes existing `loadGraph`, `nearestTrail`, `FOUNDATION_SLUGS`, and `neighbors` exports.

- [ ] **Step 1: Write failing selection tests**

Assert trail order wins when available, current term is excluded, duplicates are removed, neighbor fallback is deterministic, limit four, empty input returns `[]`, and `isCurrentEntry` rejects a delayed result after the active slug changes.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test test/entry-learning.test.mjs`  
Expected: FAIL because `learningItems` does not exist.

- [ ] **Step 3: Implement the pure selector**

Keep graph weighting/pathfinding in `graph.js`; this helper only converts graph output into display items.

- [ ] **Step 4: Replace concept-trail presentation with Continue Learning**

Retain the active-slug stale-render guard. Render up to four buttons in the lower strip and label the section “Continue learning” with supporting copy “Connected concepts,” not a pedagogical prerequisite claim.

- [ ] **Step 5: Run focused and graph tests**

Run: `node --test test/entry-learning.test.mjs test/graph-client.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/entry-actions.js src/ui.js src/styles.css test/entry-learning.test.mjs
git commit -m "Add the Continue Learning entry strip"
```

### Task 4: Repeated Navigation Motion and Reader Regression

**Files:**
- Modify: `src/ui.js:415-444,628-673`
- Modify: `src/styles.css` responsive reader sections
- Modify: `test/entry-actions.test.mjs`

**Interfaces:**
- `UI.openEntry(slug, opts)` accepts `opts.transition` as `'first' | 'repeat'`, defaulting from current spread state.
- Reduced-motion remains instant.

- [ ] **Step 1: Add transition-policy tests**

Extract and test `entryTransition({ spreadOpen, mode, reducedMotion }) -> 'ritual' | 'short' | 'instant'` in `entry-actions.js`. Assert first closed spread uses ritual, open entry uses short, and reduced motion always uses instant.

- [ ] **Step 2: Implement shorter repeated transitions**

Keep the first page/open ritual unchanged. Reduce repeat content-swap/page animation duration without breaking `_flipping` protection or footer navigation.

- [ ] **Step 3: Complete responsive reader styles**

Desktop remains two-page. Mobile becomes a focused full-screen reader with breadcrumb/actions before content and Continue Learning after details; no squeezed two-column simulation.

- [ ] **Step 4: Run complete regression verification**

Run: `npm test && npm run build`  
Expected: PASS.

Manual: previous/next, story flip/back, contents, Escape, share, Ask, Map, mobile scroll, long content, Back/Forward and direct `/term/<slug>/`.

- [ ] **Step 5: Commit**

```bash
git add src/entry-actions.js src/ui.js src/styles.css test/entry-actions.test.mjs
git commit -m "Refine entry transitions and responsive reading"
```
