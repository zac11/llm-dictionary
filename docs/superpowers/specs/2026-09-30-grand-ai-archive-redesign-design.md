# Grand AI Archive Redesign

**Status:** Approved conversational design; awaiting written-spec review  
**Date:** 2026-09-30  
**Product:** TheAIDictionary  
**Scope:** Complete redesign of the existing Three.js library experience

## 1. Purpose

TheAIDictionary already has a distinctive product metaphor: an interactive 3D library where visitors pull alphabetical volumes from a shelf and read entries as an open encyclopaedia. The redesign must preserve that signature experience while making the product's value immediately understandable, improving discovery and learning, and encouraging repeat exploration.

The target experience is a **premium, living AI archive** where visitors can search, browse, ask grounded questions, and explore connected concepts without the interface becoming a conventional dashboard.

### Success criteria

Within a few seconds, a first-time visitor should understand that TheAIDictionary:

1. contains thousands of AI terms;
2. provides cited explanations;
3. supports Search and grounded Ask;
4. offers visual exploration through the library and knowledge Map.

A returning visitor should be able to resume or discover a term in one interaction. The Three.js library must remain the most memorable part of the experience.

## 2. Design direction

The selected direction is **The Grand AI Archive**.

It retains the warm scholarly library and adds a restrained editorial discovery layer. Gold identifies the library and reading experience. Violet and cyan identify connected-intelligence features such as Ask and Map. The result should feel like a premium encyclopaedia and museum archive, not a neon AI dashboard.

### Selected visual compositions

- **Desktop home:** left editorial panel with the shelf visible to its right.
- **Mobile home:** adaptive live 3D shelf header with the volume rail pinned along the bottom, mirroring the desktop composition.
- **Entry reader:** editorial open book with a learning strip.

## 3. Experience architecture

### 3.1 Desktop home

The desktop home remains a full-screen Three.js library with four coordinated layers: the welcome modal, the interactive shelf, the volume rail, and the top navigation.

#### Welcome modal: introduction

A centred dialog over a dimmed library holds a single **editorial welcome panel** — headline “Understand the language of AI”, live term count, cited-encyclopaedia value proposition, a primary search action, and secondary Random Term and Map actions. Nothing is promoted alongside it: the greeting introduces the archive and then gets out of the way.

The visitor reads the introduction, closes it, and then browses the dictionary. It closes via the corner ✕, a click on the dimmed backdrop, or Escape; it also closes on the first meaningful interaction—searching, selecting a volume, opening Random Term, Ask, or Map—and after two idle minutes, with hovering or focusing resetting that idle countdown.

The greeting is shown **once**: it is a first-visit courtesy, not a recurring interruption. The fact that it has been seen is stored locally so later loads open straight to the collapsed state. While the modal is open it is modal in the real sense—the backdrop intercepts pointer events—and once dismissed nothing of it remains, so the shelf underneath is immediately clickable.

"Seen" is remembered durably in `localStorage`, with a `sessionStorage` backstop for browsers that refuse durable storage (private windows, managed profiles). When **neither** store can be written the greeting is suppressed entirely: a greeting that cannot be remembered would reappear on every single reload, which is worse than not greeting at all.

Dismissed, the modal leaves a single **ⓘ** button in the page's bottom-left corner. It opens a deliberately minimal menu with the two "surprise me" picks — **Random Term** and **Term of the Day** — each of which pulls a term off the shelf and opens it; everything else lives in the top-bar Explore menu.

The card is hidden entirely while the knowledge map is open.

#### Interactive shelf

The shelf remains the visual center. Actionable A–B through Y–Z volumes receive stronger shape, light, hover, and focus treatment. Filler books remain atmospheric but become quieter and less text-heavy.

Hovering or focusing a volume shows a DOM information card containing:

- volume number and letter range;
- current term count;
- three representative terms;
- the volume accent color.

The card follows the projected screen position of the volume but stays inside the viewport.

#### Volume rail

Replace the 26 small A–Z buttons with 13 larger controls matching the actual shelf volumes:

```text
A–B  C–D  E–F  G–H  I–J  K–L  M–N  O–P  Q–R  S–T  U–V  W–X  Y–Z
```

Individual-letter filtering remains available inside an open volume.

### 3.2 Top navigation

The primary navigation hierarchy is:

```text
Brand        Search                                Ask     Explore ▾
```

- **Search** is the primary discovery control.
- **Ask** is the primary assisted-learning control.
- **Explore** contains Knowledge Map, Random Term, Term of the Day, Recently Added, and Browse A–Z.
- Contribute, Feedback, and Help remain accessible as tertiary actions without competing with Search and Ask.

On narrow layouts, Brand, Search, Ask, and Explore remain directly accessible. Tertiary actions move into the menu.

### 3.3 Search

Search becomes a command-center interaction rather than a small utility.

The field uses the prompt “What do you want to understand?” and displays the `/` shortcut where space permits. Results include:

- term name;
- category;
- concise definition excerpt;
- Open Entry action;
- optional Show in Map and Ask actions.

Search remains usable before Three.js finishes its introduction.

### 3.4 Entry reader

The physical pull-out and open-book ritual remains. The entry spread uses the selected **Editorial book + learning strip** composition.

#### Left page

- breadcrumb: Library / volume / category;
- term name;
- aliases;
- concise definition;
- Ask about this action;
- View in Map action;
- Share action.

#### Right page

- detailed explanation;
- polished source/citation block;
- story action when a story is available.

#### Learning strip

A restrained strip across the lower spread provides **Continue learning** terms. It must not claim prerequisite relationships unless supported by explicit prerequisite data. Current graph-derived links are described as connected or related concepts.

Repeated entry navigation may use shorter page transitions than the first opening ritual.

### 3.5 Mobile home

Mobile mirrors the desktop composition.

- The live Three.js shelf occupies a compact header band (36vh). A full-height portrait viewport would need roughly a 110° field of view to fit the shelf, which the camera caps at 68°, so a landscape-ish band is what frames correctly; it feathers into the page background rather than ending on a hard line.
- The welcome introduction is the same centred modal as desktop, sized to the viewport.
- The volume rail is pinned along the bottom, where a thumb reaches, and scrolls horizontally.
- The **ⓘ** button sits just above the rail on the left, clear of it.
- Entry reading becomes a focused full-screen reader.
- Map and tertiary actions remain accessible from Explore.

Mobile does not attempt to fit the entire desktop room and all floating controls into one viewport.

## 4. Visual system

### 4.1 Color

- Warm gold remains the primary archive accent.
- Deep black backgrounds shift toward warm brown-black to retain shadow detail.
- Violet and cyan identify Map, Ask, and connected-concept actions.
- Volume colors remain the strongest chromatic elements.
- Filler materials use lower-contrast leather and cloth colors.

No information may depend on color alone.

### 4.2 Typography

Retain the existing type families:

- **Fraunces:** brand, editorial headlines, term names, book-like moments;
- **Inter:** controls, search, metadata, citations, menus, and supporting text.

Hierarchy, in descending priority:

1. editorial headline;
2. term title;
3. definition;
4. detailed explanation;
5. citation and metadata;
6. controls.

Meaningful text remains HTML and is not rendered into WebGL textures.

### 4.3 Three.js scene

The shelf becomes the brightest and sharpest region.

- Raise ambient and hemisphere contribution enough to reveal materials.
- Add warm shelf-edge separation.
- Strengthen actionable-volume lighting and emissive response.
- Increase violet rim separation subtly.
- Reduce extreme darkness around the scene edges.
- Reduce dust prominence.
- Use the desk to frame discovery content.
- Shorten the intro dolly and permit immediate interaction to finish or skip it.

The redesign adds no bloom or third-party post-processing dependency. Premium quality comes from composition, light, materials, and hierarchy.

### 4.4 Motion

- Volume hover response: 160 ms.
- Hover card entrance: 200 ms.
- Welcome-panel collapse: 300 ms.
- Initial pull-out ritual remains cinematic.
- Repeated entry transitions are shorter.
- Continuous animation is limited to restrained particles, light variation, and idle camera movement.

## 5. Component boundaries

### 5.1 Three.js `Library`

Responsibilities:

- room, shelf, desk, books, lighting, particles, and camera;
- adaptive quality profile;
- volume hover/select events;
- projected volume position for DOM cards;
- pause/resume lifecycle;
- WebGL capability reporting.

It does not own explanatory text, navigation menus, or search UI.

### 5.2 Archive home controller

A focused controller owns:

- welcome/collapsed state;
- the ⓘ options button;
- Random Term and Term of the Day;
- safe local persistence.

This logic should be independently testable without Three.js.

### 5.3 Existing reader/UI controller

The existing UI controller continues to own the book spread. It gains focused rendering helpers for breadcrumb, entry actions, citation, and learning strip rather than introducing another reader system.

The spread footer owns the per-mode actions, so nothing floats inside the pages: an entry shows **Ask about this** and **View in Map** there, and a story shows **Flip back to the entry**. "Flip to the story" stays on the page as the in-page cue.

### 5.4 Navigation controller

The existing view state remains authoritative for Library, Map, Ask, and entries. The redesign adds Explore-menu actions without creating a second routing system.

## 6. Data design

### 6.1 Recently Added

Add optional ISO date metadata to term normalization and generated retrieval data:

```json
{
  "addedAt": "2026-09-30"
}
```

Valid dates sort newest first with slug as the deterministic tie-breaker. Terms without valid `addedAt` remain fully supported and do not appear in Recently Added. The initial rollout adds dates only to a small, editorially verified set of genuinely recent terms; dates must not be inferred or fabricated. Recently added terms are surfaced only through the Explore menu's **Recently Added** action, which pulls the newest entry off the shelf; nothing is promoted on load.

### 6.2 Welcome state

Persist a versioned `seen` flag alongside the dismissed state. A visitor without stored state is greeted once; after that the modal stays away and only the ⓘ button remains.

### 6.3 Volume cards

Volume-card content is derived from the existing volume/range term index. Representative terms are deterministic and should favor recognizable or central terms when graph centrality is available; otherwise use stable alphabetical examples.

## 7. Adaptive rendering and resilience

### 7.1 Quality profiles

| Profile | Pixel ratio | Particles | Idle motion | Fillers |
|---|---:|---:|---|---|
| High | up to 2 | Full | Full | Existing detail |
| Balanced | up to 1.5 | Reduced | Reduced | Existing geometry |
| Mobile/low | up to 1.25 | Minimal | Off or subtle | Simplified detail |

Profile selection is deterministic. Mobile/low is selected for a coarse primary pointer, viewport width below 860 CSS pixels, or reported device memory of 4 GB or less. High requires a viewport at least 1100 CSS pixels wide, a fine primary pointer, no reduced-motion preference, and at least 8 GB of reported device memory when that signal exists. Balanced is the default for all other cases. Users receive identical content and core interactions at every level.

### 7.2 Fallbacks

- **No WebGL:** an optimized static `public/library-fallback.webp` shelf poster, kept below 200 KB, with functional Search, Ask, Explore, and volume navigation.
- **No local storage:** in-memory state for the current session.
- **No graph:** disable View in Map while preserving entry reading.
- **Hover projection failure:** keep volume selection functional without the card.
- **Reduced motion:** disable intro dolly, page turn, and idle camera movement.

## 8. Accessibility

- Every Three.js volume action has an equivalent A–B DOM control.
- Welcome panel, menus, search results, and entry actions follow logical tab order.
- Explore supports Escape and arrow-key navigation.
- Text contrast meets WCAG AA.
- Focus rings use gold in the archive and violet/cyan for connected-intelligence actions.
- Volume controls expose letter range and term count to assistive technology.
- Touch targets meet a minimum practical size of 40–44 CSS pixels on mobile.
- Reduced motion changes JavaScript animation behavior, not only CSS transitions.

## 9. Performance requirements

- No new runtime dependency.
- Initial redesign JavaScript increase stays under 20 KB gzip, excluding generated dictionary data.
- No new permanent animation loop.
- Desktop high profile targets 50–60 FPS.
- Mobile/low profile targets at least 30 FPS on representative hardware.
- Pixel ratio remains capped by quality profile.
- Search and HTML controls become usable before the Three.js intro or optional discovery data completes.
- The welcome card does not wait for scene initialization.
- Hidden Map, Ask, reader, and library views continue to pause unnecessary rendering work.

## 10. Delivery stages

### Stage 1 — Visual foundation

- scene quality profiles;
- lighting and material rebalance;
- simplified top navigation;
- stronger search;
- A–B volume rail;
- volume hover/focus states and cards.

### Stage 2 — Homepage discovery

- the archive card: the welcome panel, retired to a single ⓘ button;
- the collapsed ⓘ archive-options button;
- `addedAt` and Recently Added;
- Random Term and the deterministic Term of the Day pick.

### Stage 3 — Entry learning experience

- breadcrumb and hierarchy;
- Ask about this;
- View in Map;
- revised citation block;
- Continue Learning strip;
- faster repeated transitions.

### Stage 4 — Mobile and resilience

- mobile shelf header and bottom-pinned volume rail;
- adaptive rendering profiles;
- WebGL fallback;
- touch, keyboard, and responsive reader refinements;
- reduced-motion completion pass.

Every stage must leave Library, Search, Map, Ask, sharing, contribution, feedback, and deep links functional.

## 11. Verification

### Automated tests

Add coverage for:

- recent-history insertion, deduplication, limits, and stale-slug filtering;
- Recently Added validation and sorting;
- quality-profile selection;
- welcome-state persistence;
- navigation route preservation;
- volume-card content;
- entry action routing;
- fallback-state selection.

Existing graph, retrieval, Ask, search, sharing, contribution, and term-schema tests remain regression coverage.

### Browser matrix

Verify:

- wide desktop;
- 1024px landscape tablet;
- portrait tablet;
- common mobile portrait dimensions;
- keyboard-only navigation;
- reduced motion;
- WebGL-disabled fallback;
- direct term, Map, Ask, and volume routes;
- slow graph/retrieval requests;
- empty local history;
- absent `addedAt` data.

### Visual acceptance

- First-visit value proposition is readable without covering most of the shelf.
- Actionable volumes are distinguishable before reading instructions.
- Search is the strongest control and Ask is the strongest secondary control.
- The welcome modal reads as an editorial introduction, not a dashboard widget.
- Entry reader still feels like an open encyclopaedia.
- Mobile preserves the library identity without forcing the desktop composition into a small viewport.

## 12. Non-goals

- Replacing Three.js or the library metaphor.
- Adding user accounts, cloud history, or analytics.
- Adding a post-processing framework.
- Embedding a knowledge graph inside every entry.
- Claiming prerequisites from generic graph relationships.
- Reworking dictionary editorial content beyond optional `addedAt` metadata.
- Building a content-management backend for discovery cards.
