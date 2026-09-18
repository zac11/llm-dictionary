# Neuropaedia — Knowledge Graph & Discovery Features: Revised Implementation Plan

**Repository:** `llm-dictionary` (Neuropaedia — The AI Encyclopaedia)  
**Status:** Phase A0 implemented; co-occurrence quality review required before Phase A1  
**Date:** 2026-09-18  
**Scope:** Shared term normalization, graph validation and generation, Map view, concept trails, offline retrieval, and optional grounded Ask chat

---

## 1. Summary

Build a deterministic, validated term graph over the existing dictionary JSON files and use it to support three independently shippable discovery features:

1. **Map view** — a 2D, accessible constellation of terms with a precomputed layout and level-of-detail rendering.
2. **Concept trails** — weighted paths that explain how terms are connected. These are not described as prerequisite-based learning paths unless genuine prerequisite data is curated later.
3. **Ask** — local ranked retrieval with citations first, followed by optional LLM synthesis through a Netlify Function. The local mode works without an API key.

The graph foundation is split into a data-contract phase and a generator phase. Map and concept trails depend on the graph. Ask depends on a separate generated retrieval corpus in addition to the graph.

---

## 2. Verified repository baseline

- Vite 5, vanilla ES modules, and Three.js; no frontend framework or router.
- `src/terms.js` eagerly loads `dictionary/*/*.json` through `import.meta.glob`, normalizes entries, and exports lookup/search helpers.
- The repository currently contains 1,527 valid term files, 6,099 valid `related` references, 170 aliases, 1,208 entries with citations, and 44 categories.
- All current `related` slugs resolve; there are no duplicate slugs or self-related entries.
- The current production JavaScript is already large because dictionary files are eagerly bundled: approximately 3.18 MB minified and 881 KB gzip at the time of this plan.
- `src/main.js` coordinates asynchronous book animations using `state.folder` and `state.busy`. It parses term and volume deep links only at startup and has no `popstate` navigation handling.
- `src/ui.js` owns the book spread and delegates term navigation to `main.js` unless `openEntry` receives an internal `from` option.
- `src/library.js` starts a permanent animation frame loop. It should be paused or made inactive—not destroyed and recreated—when Map is visible.
- Netlify currently builds and publishes `dist`; no functions directory is configured yet.
- Generated files under `public/` are copied into `dist` by Vite. A fixed `graph.json` URL therefore needs an explicit cache policy or hashed manifest.

### Architectural constraints

- Avoid new runtime dependencies unless measurement shows a hand-written implementation is less reliable or materially slower.
- Dynamically import Map and Ask modules so they do not enter the initial application chunk.
- Do not duplicate term normalization across browser and Node code.
- Do not claim that graph relatedness or centrality represents prerequisite order.
- Do not expose an LLM API key to the browser.

### Phase A0 implementation result

Phase A0 was implemented on 2026-09-18:

- shared normalization and validation now live in `src/term-schema.js` and are used by the browser loader and authoring/import scripts;
- `scripts/audit-graph.mjs` validates dictionary structure, identities, aliases, citations, and related endpoints;
- `scripts/graph-analysis.mjs` provides the deterministic co-occurrence candidate matcher;
- Node built-in tests cover normalization, malformed data, punctuation boundaries, acronym handling, self-match exclusion, scoring, limits, and deterministic tie ordering;
- `npm run graph:audit` runs the source audit and quality spike.

The first full audit found:

- 1,527 valid terms, 6,099 valid related references, and no structural errors;
- two ambiguous aliases requiring later editorial review: `red teaming` and `nearest neighbor search`;
- 3,164 capped co-occurrence candidates, including 309 alias-only candidates;
- dominant incoming hubs for `artificial-intelligence`, `machine-learning`, `natural-language`, and `natural-language-processing`;
- approximately 19 seconds of candidate-generation time on the development machine after matcher optimization.

The 50-edge deterministic sample was broadly plausible, but the dominant generic hubs mean `CO_OCCURS` is not yet approved for Phase A1 output. Before enabling it, Phase A1 must add generic-hub down-weighting or exclusion, establish a minimum useful score, and avoid running the full analysis on every ordinary Vite startup unless generation is cached by source hash.

---

## 3. Goals and non-goals

### Goals

- Produce a deterministic and versioned term graph with validated endpoints and relationship provenance.
- Preserve the current library experience when generated artifacts are missing, malformed, or unavailable.
- Keep Map and Ask code out of the initial bundle through dynamic imports.
- Precompute global Map coordinates at build time to avoid an expensive browser-side all-pairs force simulation.
- Provide an accessible DOM-based search/list and selected-term panel alongside the canvas Map.
- Provide useful local Ask results without a network request or API key.
- Ensure optional LLM answers are restricted to retrieved entries and return validated local citations.
- Define automated data-quality, routing, accessibility, failure, and performance checks.

### Non-goals

- LLM-based relationship extraction from dictionary prose.
- Automatically inferring pedagogical prerequisites from co-occurrence or PageRank.
- Rewriting the existing `related` arrays.
- Editing all dictionary files to add graph fields.
- A 3D graph scene.
- User accounts, saved curricula, analytics, or conversation persistence.
- Rendering bibliographic author/venue/work nodes in the first Map release.
- Moving all dictionary content out of the initial Vite bundle in this scope, although that remains a worthwhile later optimization.

---

## 4. Terminology and semantic boundaries

### Term graph

The v1 graph used by Map and concept trails contains **term nodes only**. This avoids premature author, venue, work, category, and alias identity problems.

### Concept trail

A concept trail is a short, weighted route through related terms. It answers “How is this term connected to another concept?” It does not claim “learn these first.”

### Learning path

A true learning path requires curated `PREREQUISITE_FOR` relationships or curated category curricula. It is deferred to a later phase and must not be generated from centrality alone.

### Citation graph

Bibliographic nodes may be added in a later graph schema version. If added, an entry’s citation is represented as `term --CITES--> work`, not `INTRODUCED_BY`, because the source may be a survey, encyclopedia page, or explanatory reference rather than the work that coined the term.

---

## 5. Phase A0 — Shared contracts, audit, and quality spike

Phase A0 must finish before committing to graph UI behavior.

### 5.1 Shared normalization

Create an environment-neutral module, for example `src/term-schema.js`, exporting pure functions:

- `slugifyTerm(value)`
- `normalizeTerm(raw, source)`
- `normalizeGraphLabel(value)`
- `isValidLetter(value)`
- `isValidRangeFolder(value)`
- `validateTerm(term)`

Both `src/terms.js` and `scripts/build-graph.mjs` import these functions. The module must not use Node filesystem APIs or Vite-specific APIs.

Normalization must settle the existing ampersand behavior and be covered by tests. Explicit `raw.slug` remains authoritative for existing entries.

The graph generator must load the same file shape as the browser—exactly one JSON file below a valid `dictionary/<letter-range>/` folder—rather than recursively accepting files the application would ignore.

### 5.2 Source-data validation

Before graph generation, fail with actionable diagnostics for:

- malformed JSON;
- missing or invalid term names;
- duplicate slugs;
- duplicate normalized canonical labels;
- invalid letters or range folders;
- a term stored in a folder inconsistent with its letter;
- related targets that do not exist;
- self-related entries;
- duplicate values in a term’s `related` or `aka` arrays;
- aliases that normalize to multiple canonical terms;
- invalid citation shapes when a citation is present.

Warnings may be used for ambiguous aliases and unusual citation data, but broken graph endpoints must fail the build.

### 5.3 Co-occurrence quality spike

Implement the candidate matcher as a testable function before using its output in the product.

Matching rules:

- escape all regular-expression metacharacters;
- normalize Unicode consistently;
- exclude self-matches;
- process longer names before shorter overlapping names;
- treat short all-uppercase aliases such as `AI`, `ML`, `RL`, and `QA` as case-sensitive tokens;
- ignore aliases shorter than three characters;
- count canonical-name and alias matches only once per target passage location;
- keep definition and details provenance separately;
- do not scan stories in v1;
- deduplicate by `(source, predicate, target)`;
- use deterministic target-slug tie-breaking.

Candidate score:

| Evidence | Score |
|---|---:|
| Canonical phrase in definition | +7 |
| Canonical phrase in details | +5 |
| Alias of at least 4 characters | +3 |
| Short uppercase acronym with matching case | +2 |
| Repeated independent mention | `+log2(1 + count)` |

Retain at most eight generated targets per source after scoring. Store the score and provenance. The exact weights may change after review, but the implemented values must be explicit rather than hidden in control flow.

Quality gate:

- manually sample at least 50 generated edges across common and obscure terms;
- record whether each edge is useful, merely plausible, or wrong;
- do not ship `CO_OCCURS` by default unless at least 80% are useful or plausible and no obvious short-alias hub dominates the graph;
- if the threshold is missed, ship Map with curated `RELATED` edges only and revisit matching later.

---

## 6. Phase A1 — Versioned graph generator

Create `scripts/build-graph.mjs` using Node ESM and no new dependency.

### 6.1 V1 graph model

#### Node

```json
{
  "id": "term:attention",
  "type": "term",
  "slug": "attention",
  "label": "Attention",
  "letter": "A",
  "category": "Architecture",
  "community": "community:3",
  "centrality": 0.012345,
  "x": 0.42,
  "y": -0.18
}
```

#### Edge

```json
{
  "source": "term:attention",
  "predicate": "RELATED",
  "target": "term:transformer",
  "weight": 10,
  "derived": false,
  "evidence": null
}
```

Generated co-occurrence edges use `predicate: "CO_OCCURS"`, `derived: true`, their calculated weight, and compact evidence metadata such as `definition`, `details`, and mention count.

#### Output

```json
{
  "schemaVersion": 1,
  "nodes": {},
  "edges": [],
  "communities": {},
  "meta": {
    "sourceHash": "...",
    "generatedAt": "...",
    "counts": {
      "terms": 0,
      "edges": 0,
      "relatedEdges": 0,
      "coOccurrenceEdges": 0,
      "communities": 0,
      "isolatedTerms": 0
    }
  }
}
```

`nodes` is keyed by namespaced node ID. Namespace IDs from the beginning so later schema versions can add `work:`, `author:`, or `venue:` nodes safely.

### 6.2 Edge semantics

| Predicate | Directed in source | Traversal behavior | Analytics weight |
|---|---:|---:|---:|
| `RELATED` | yes | symmetrized for Map/path traversal | 10 |
| `CO_OCCURS` | yes | traversable in both directions with confidence cost | derived score |

Retain source direction in stored edges. Build an undirected derived adjacency index at load time for Map and concept trails. PageRank must document whether it uses source direction or symmetrized adjacency; v1 should use symmetrized weighted adjacency because the current `related` arrays are recommendations rather than a reliable directed ontology.

Category and future bibliographic edges must be excluded from term centrality, communities, and trails unless a later schema explicitly changes that rule.

### 6.3 Analytics

- Weighted PageRank with dangling-node handling.
- Convergence tolerance plus a maximum iteration count rather than exactly 50 iterations.
- Deterministic label propagation over sorted slugs with deterministic tie-breaking.
- Community display label chosen from the highest weighted-degree term, breaking ties by slug.
- Round serialized floating-point values to a fixed precision.

### 6.4 Precomputed Map layout

Compute deterministic `(x, y)` coordinates in the generator:

1. Place communities around a stable radial arrangement sorted by community label/ID.
2. Place terms within each community from a seeded initial arrangement.
3. Apply a bounded layout pass using weighted springs, community attraction, and spatial bucketing or another sub-quadratic repulsion approximation.
4. Normalize coordinates into a documented coordinate range.
5. Persist coordinates in nodes.

The browser may apply a very small optional relaxation in a Web Worker, but the first render must not depend on a main-thread global force simulation.

### 6.5 Determinism

- Sort input paths, nodes, aliases, related values, and output edges.
- Use a fixed seed.
- Resolve all ties by stable IDs.
- Round analytics and coordinates.
- Compute `sourceHash` from normalized source content.
- `generatedAt` may change, but two unchanged runs must otherwise be byte-identical. A determinism test compares output while ignoring `generatedAt`.

### 6.6 Artifact naming and caching

Preferred output:

```text
public/generated/graph.<sourceHash>.json
public/generated/manifest.json
```

`manifest.json` contains the current graph URL, schema version, source hash, and optional retrieval-corpus version. Fetch the manifest with `Cache-Control: no-cache`; hashed artifacts may be cached immutably.

If fixed `/graph.json` is retained instead, configure it with `Cache-Control: no-cache` and validate `schemaVersion` and `sourceHash` on load.

### 6.7 Build scripts and development freshness

Add scripts similar to:

```json
{
  "graph": "node scripts/build-graph.mjs",
  "graph:check": "node scripts/build-graph.mjs --check",
  "dev": "node scripts/build-graph.mjs && vite",
  "build": "node scripts/build-graph.mjs && node scripts/generate-og.mjs && vite build && node scripts/prerender-share.mjs"
}
```

`--check` validates and verifies that generated output matches source without silently rewriting it.

A pre-dev generation step alone does not observe dictionary edits. Choose one before implementation:

- add a small Vite development plugin that rebuilds on dictionary JSON changes; or
- document that dictionary edits require `npm run graph` or a Vite restart and display a source-hash mismatch warning in development.

Do not introduce a complex concurrent process manager solely for this watcher.

---

## 7. Phase A2 — Client graph loader

Create `src/graph.js` with:

- `loadGraph()`
- `neighbors(slug, options)`
- `shortestConceptTrail(from, to, options)`
- `communityMembers(communityId)`
- `centralTerms(options)`
- `getNode(slug)`

Loader requirements:

- load the manifest and graph lazily;
- deduplicate concurrent requests;
- cache successful validated data;
- do not permanently cache transient network failures;
- reject unsupported schema versions;
- verify that every edge endpoint exists;
- create indexes only after validation;
- support an `AbortSignal` where useful;
- return a typed/structured unavailable result rather than generating unhandled rejections.

Path behavior:

- use weighted Dijkstra, not unweighted BFS;
- curated `RELATED` edges should be cheaper/preferred over generated co-occurrence edges;
- support relation filters;
- traverse the derived undirected adjacency index;
- use deterministic tie-breaking;
- return no path cleanly for disconnected components;
- cap path length and search work to avoid nonsensical long trails.

---

## 8. Phase B — Map view

### 8.1 Loading and first-paint isolation

Do not statically import `src/map.js` from `main.js`. Load it on first use:

```js
const { GraphMap } = await import('./map.js');
```

The graph itself is loaded only after Map is requested. Measure both module and graph payload impact.

### 8.2 DOM structure

Add:

- a Library/Map toggle with text and an accessible pressed/current state;
- a hidden `#graph-view` overlay;
- a canvas drawing surface;
- a DOM search/list fallback;
- a selected-term detail panel containing label, category, community, related terms, and an “Open entry” action;
- a live-region status message for loading and errors.

Canvas is not the only way to select a term. The list/search and selected-term panel must be keyboard accessible.

### 8.3 Rendering strategy

- Use precomputed coordinates.
- Cap device pixel ratio to control canvas memory.
- Default zoom renders community labels and high-centrality terms.
- Reveal lower-centrality nodes progressively while zooming.
- Do not render every edge by default.
- Render selected/hovered-node edges and optionally high-confidence curated edges at closer zoom levels.
- Use a spatial grid or quadtree-like index for hit testing.
- Cache static drawing layers where beneficial.
- Stop animation frames after transitions settle.

### 8.4 Visual design

- Use the violet-to-cyan neural accent for communities, but ensure neighboring communities remain distinguishable.
- Use gold for selection.
- Do not rely on color alone: selected state, node size, outlines, labels, and the DOM panel also communicate state.
- Scale radius from a clamped/log-transformed centrality value so one hub does not dwarf all other nodes.
- Ensure text and tooltip contrast meets accessibility expectations.

### 8.5 Interaction

- Mouse/touch pan and zoom.
- Hover tooltip on pointer devices.
- Tap selects rather than depending on hover.
- Keyboard selection through the DOM list/search.
- Escape clears selection first, then exits Map according to the global overlay policy.
- Clicking “Open entry” transitions to Library and invokes the existing term-opening controller.
- Resize retains the current center and zoom where possible.
- Respect `prefers-reduced-motion` by eliminating layout/zoom flights.

### 8.6 Library lifecycle while Map is open

Add explicit `pause()`/`resume()` behavior to `Library`, or make its animation loop skip simulation and rendering while inactive. Disable OrbitControls and canvas pointer events in Map mode. Do not dispose and recreate the Three.js library during normal view switching.

### 8.7 URL and navigation behavior

Replace startup-only deep-link handling with a small navigation controller and pure route parser.

Supported states:

- `/term/<slug>/`
- `?term=<slug>`
- `?volume=<folder>`
- `?view=map`
- `?map=<slug>`

Rules:

- `map=<slug>` implies Map and selects the slug.
- An invalid map slug opens Map without a selection and announces the issue non-disruptively.
- Define precedence for conflicting parameters; canonical navigation should not generate conflicts.
- Use `pushState` for user navigation and `replaceState` for canonicalization.
- Handle `popstate`.
- Preserve share URLs for term entries.
- Do not transition while a book animation is halfway complete; queue or safely complete/cancel the current transition.

Suggested controller modes:

```text
library-idle
library-animating
book-index
book-entry
map
ask
```

Help and Ask may be modeled as overlays over a base mode, but their Escape and focus behavior must be centralized.

### 8.8 Map failure behavior

If the graph is missing, malformed, stale beyond compatibility, or cannot be fetched:

- keep Library functional;
- show a concise Map-unavailable message;
- offer Retry;
- do not permanently cache a transient failure;
- restore focus to the view toggle on close.

---

## 9. Phase C — Concept trails

### 9.1 V1 behavior

Rename the originally proposed Learning Paths feature to **Concept trails**.

A trail can be shown in an entry as:

- a short route from one selected/central concept to the current term; or
- a “Connected through” route between two terms chosen in Map/Ask.

If automatically choosing a starting point, choose from a small documented set of curated foundation terms per broad subject—not simply the globally highest PageRank nodes. If no reasonable path exists within the maximum length, render direct related terms instead.

Trail constraints:

- prefer curated `RELATED` edges;
- penalize generated `CO_OCCURS` edges;
- maximum of five displayed nodes by default;
- never repeat a node;
- hide single-node trails;
- explain generated links as related connections, not prerequisites;
- render nothing when the graph is unavailable.

### 9.2 UI integration

Graph loading is asynchronous while `_renderEntrySpread` is synchronous. Implement a placeholder/container and populate it after `loadGraph()` resolves only if the same term is still active. Use a render token or active-slug check to prevent stale results from appearing after rapid navigation.

Trail chips use the existing external term-opening path so the correct volume ritual and state transition occur. They must not call an internal render path that bypasses controller state.

### 9.3 Future genuine learning paths

A later phase may add a source-controlled prerequisite artifact:

```json
{
  "attention": ["vector", "dot-product", "softmax"],
  "transformer": ["attention", "positional-encoding"]
}
```

That artifact must live in a tracked location, not under an ignored `data/*` path unless `.gitignore` is adjusted deliberately. Prerequisite edges require editorial review. Only after that exists may the UI use “Learn these first” or “Learning path.”

---

## 10. Phase D0 — Generated retrieval corpus and local Ask

Ask requires entry text, while the term graph intentionally excludes definitions/details. Extend `scripts/build-graph.mjs` or add a closely related generator output for retrieval.

### 10.1 Retrieval corpus

Generate a compact corpus containing:

- slug;
- term;
- aliases;
- category;
- definition;
- details;
- citation metadata;
- curated and high-confidence neighbor slugs;
- normalized search tokens.

Produce a hashed browser artifact for local retrieval and a copy explicitly included in the Netlify Function bundle. Verify inclusion in a production function build rather than assuming the function can access repository files.

### 10.2 Ranked retrieval

Do not use the current unranked `searchTerms()` ordering as top-k relevance.

Implement and test a deterministic weighted scorer:

| Match | Relative priority |
|---|---:|
| Exact slug or canonical term | highest |
| Exact alias | very high |
| Canonical term prefix | high |
| Canonical term token overlap | medium-high |
| Category match | medium |
| Definition/details token overlap | medium |
| Neighbor expansion | applied after initial ranking |

Limit query length and token count. Return a score explanation in development mode for tuning.

### 10.3 Offline Ask behavior

The local mode handles all queries, not only comparisons:

- definition questions return the best entry excerpts;
- “X vs Y” and “difference between X and Y” produce a structured comparison;
- broad queries return several ranked term summaries;
- no-match queries suggest reformulations or nearby search terms;
- every answer contains local source chips.

Comparison output includes:

- each term’s definition;
- shared high-confidence neighbors;
- distinct high-confidence neighbors;
- citations to both term pages.

The local response uses DOM APIs or escaped text. It must not insert unsanitized query text, dictionary content, or model output through `innerHTML`.

### 10.4 Ask UI

Dynamically import `src/ask.js` on first use. Add:

- query input and submit button;
- loading, empty, timeout, and error states;
- transcript or current-answer region;
- source chips;
- cancel action for active requests;
- keyboard and focus management;
- clear labeling that answers are grounded in Neuropaedia entries.

Define how Ask coexists with Map, Help, and the book spread. Avoid multiple modal surfaces competing for Escape or focus.

---

## 11. Phase D1 — Optional LLM synthesis

### 11.1 Netlify Function

Create `netlify/functions/ask.mjs` and configure the functions directory in `netlify.toml`.

Environment:

- `LLM_BASE_URL`, defaulting to `https://api.openai.com/v1`;
- `LLM_API_KEY`, required for remote synthesis;
- `LLM_MODEL`, required when remote synthesis is enabled.

Describe the integration as a configurable OpenAI chat-completions-compatible endpoint, not universally provider-agnostic.

### 11.2 Request contract

Request:

```json
{ "query": "What is the difference between RAG and fine-tuning?" }
```

Response:

```json
{
  "answer": "... [retrieval-augmented-generation] ...",
  "mode": "llm",
  "sources": [
    {
      "slug": "retrieval-augmented-generation",
      "term": "Retrieval-Augmented Generation",
      "url": "/term/retrieval-augmented-generation/"
    }
  ]
}
```

The server performs authoritative retrieval from the generated function corpus. It must not trust client-supplied passages or source URLs.

### 11.3 Grounding and citation validation

- Delimit user input and retrieved documents as untrusted content.
- Instruct the model to answer only from supplied entries and to cite `[slug]` markers.
- Build an allowlist from retrieved slugs.
- Extract citations server-side and discard unknown or non-retrieved slugs.
- Construct source labels and URLs from the server corpus, never from model output.
- If the answer contains no valid citations, return the local extractive response instead.
- Bound retrieved context and model output tokens.

### 11.4 Endpoint safeguards

- Accept POST only.
- Validate `Content-Type`.
- Limit request-body and query sizes.
- Add an upstream timeout with `AbortController`.
- Handle malformed upstream responses.
- Return generic errors without exposing keys, headers, prompts, or provider internals.
- Do not log API keys or full prompt context.
- Add rate limiting or Netlify abuse controls before public launch.
- Bound response size and output tokens.
- Configure same-origin behavior; do not enable broad CORS without a need.

### 11.5 Fallback conditions

Fall back to local retrieval for:

- missing API key/model;
- plain Vite development endpoint 404;
- network failure;
- timeout or cancellation;
- HTTP 429;
- upstream 5xx;
- malformed response;
- answer without valid citations.

A remote error must never leave the Ask panel in an indefinite loading state.

### 11.6 Local development

- `vite dev` supports local Ask only.
- `netlify dev` is used for end-to-end function testing.
- The UI detects endpoint unavailability and uses local mode without showing a disruptive error.
- Document environment variable names without placing real secrets in repository files.

---

## 12. Files expected to change

| File | Change |
|---|---|
| `src/term-schema.js` | New shared normalization and validation helpers |
| `src/terms.js` | Use shared normalization |
| `scripts/build-graph.mjs` | New validation, graph, layout, manifest, and retrieval generator |
| `public/generated/manifest.json` | Generated manifest, cache-revalidated |
| `public/generated/graph.<hash>.json` | Generated versioned graph |
| `public/generated/retrieval.<hash>.json` | Generated local retrieval corpus |
| Function-bundled retrieval artifact | Generated authoritative server corpus |
| `package.json` | Graph scripts and build/dev integration |
| `.gitignore` | Ignore generated artifacts using precise paths |
| `src/graph.js` | Lazy graph loader, indexes, weighted path helpers |
| `src/map.js` | Dynamically loaded `GraphMap` |
| `src/ask.js` | Dynamically loaded local/remote Ask UI |
| `src/navigation.js` | Pure route parsing and centralized view transitions, if separation remains small and useful |
| `netlify/functions/ask.mjs` | Optional grounded LLM synthesis endpoint |
| `netlify.toml` | Functions directory and cache headers |
| `index.html` | View toggle, Map surface, accessible Map list/panel, Ask panel |
| `src/styles.css` | Map, trail, Ask, responsive, focus, and reduced-motion styles |
| `src/main.js` | Navigation state, dynamic imports, lifecycle and click routing |
| `src/library.js` | Pause/resume or inactive rendering support |
| `src/ui.js` | Asynchronous concept-trail container and stale-render protection |
| Relevant test files | Generator, graph helpers, routes, retrieval, and browser behavior |

Avoid adding separate modules when a file would contain only trivial wrappers. The exact file split may follow existing project style after implementation starts.

---

## 13. Automated verification and quality gates

### 13.1 Generator tests

- Browser and Node normalization parity.
- Ampersand, punctuation, Unicode, and explicit-slug cases.
- Invalid folder and letter rejection.
- Duplicate slug and broken-edge failure.
- Regex escaping and self-match exclusion.
- Short acronym case behavior.
- Overlapping canonical/alias matching.
- Edge deduplication and deterministic tie-breaking.
- PageRank handles dangling and disconnected nodes.
- Centrality mass is approximately normalized.
- Label propagation is stable across repeated runs.
- Every output edge endpoint exists.
- Two unchanged runs are identical except `generatedAt`.
- Manifest points to existing artifacts.

### 13.2 Graph quality report

`npm run graph` prints:

- term and edge counts by predicate;
- isolated-term count and percentage;
- degree percentiles and maximum degree;
- community count and size distribution;
- top central terms;
- top co-occurrence hubs;
- generated file sizes and source hash;
- generation time.

CI uses broad expected bounds rather than brittle exact analytics counts, while structural invariants are exact.

### 13.3 Client tests

- Missing, malformed, and unsupported graph responses.
- Concurrent graph loads share one request.
- A failed graph request can be retried.
- Weighted trails prefer curated edges.
- Disconnected terms return no path.
- Stale asynchronous trail results do not render after term navigation.
- Invalid Map slugs do not break the application.
- Browser Back/Forward restores the correct view.
- Rapid view toggles and node clicks do not corrupt book state.
- Search behavior is defined in Library and Map.
- Map selection works through keyboard and touch.
- Focus returns to the launching control when overlays close.
- Reduced-motion mode avoids animated camera/layout transitions.

### 13.4 Ask tests

- Exact term and alias ranking.
- Comparison query parsing with punctuation and alternate phrasing.
- General offline queries return cited local excerpts.
- No-match behavior.
- POST/content-type/body/query validation.
- Missing key/model fallback.
- Timeout, 429, 5xx, malformed provider response, and invalid-citation fallback.
- Model-provided unknown slugs are discarded.
- User/model text is rendered without script or HTML injection.

### 13.5 Build and deployment tests

From a clean checkout:

1. `npm run graph:check` validates source data.
2. `npm run build` generates graph/retrieval artifacts before Vite and prerender steps.
3. `dist/generated/manifest.json` and referenced artifacts exist.
4. Term share pages still exist under `dist/term/<slug>/index.html`.
5. The deployed function contains the retrieval corpus.
6. Netlify SPA fallback does not shadow real generated assets or function routes.
7. Existing `?term`, `?volume`, and `/term/<slug>/` routes still work.
8. New `?view=map` and `?map=<slug>` routes work through direct load and Back/Forward navigation.

### 13.6 Performance budgets

Record the current baseline before changes and enforce agreed budgets. Initial proposed budgets:

- Map and Ask feature modules add no code to the initial chunk except small dynamic-import/controller hooks.
- Initial JS gzip increase is no more than 15 KB unless explicitly accepted after measurement.
- Graph gzip size and local retrieval corpus gzip size are reported on every build.
- First Map open should avoid a main-thread task longer than 100 ms on a representative mid-range laptop.
- Panning/zooming should remain responsive with a target of 50–60 fps on desktop and at least 30 fps on a representative mobile device.
- Default view does not draw all graph edges.
- Canvas device pixel ratio is capped, initially at 2.

Budgets may be adjusted after the Phase A0 spike, but they must remain explicit.

### 13.7 Regression checklist

- Bookshelf render and controls.
- Intro and pull-out/return animations.
- Letter navigation.
- Search and search keyboard controls.
- Contents pagination.
- Entry navigation and page turns.
- Story spread and suggested terms.
- Share menu and canonical term URLs.
- Help modal and Escape behavior.
- Mobile stacked spread.
- Existing prerendered social metadata.

---

## 14. Rollout and feature flags

Each feature must be independently disableable during development, either through a small build-time configuration object or by omitting its visible control when initialization is unavailable.

Recommended rollout:

```text
Phase A0  Shared normalization, validation, co-occurrence quality spike
   ↓
Phase A1  Term graph, analytics, precomputed layout, manifest
   ↓
Phase A2  Client loader and weighted traversal
   ├── Phase B   Map MVP
   └── Phase C   Concept trails

Phase D0  Retrieval corpus, ranked local Ask, offline comparisons
   ↓
Phase D1  Optional Netlify LLM synthesis
```

Map may initially ship with curated `RELATED` edges only. `CO_OCCURS` can be enabled after its quality gate without changing the public schema.

Concept trails and Map are independently revertible. Ask is independently revertible and must not be required for core dictionary navigation.

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Noisy co-occurrence edges | Explicit scoring, acronym rules, provenance, quality sample, feature gate |
| Hairball Map | Precomputed layout, level of detail, community overview, selected edges only |
| Main-thread stalls | No browser global force pass, spatial hit testing, bounded drawing, settled render loop |
| Misleading pedagogy | Use “Concept trails”; require curated prerequisites for future learning paths |
| Centrality dominated by generic terms | Weighted curated edges, log/clamped sizing, inspect top hubs, exclude category/bibliographic edges |
| Giant `Artificial Intelligence` category | Do not use category nodes in term analytics; use detected communities |
| Unstable output | Sorted inputs, fixed seed, stable ties, rounded values, determinism test |
| Stale generated data in dev | Watch integration or documented regeneration plus source-hash warning |
| Stale CDN graph | Hashed artifacts with a revalidated manifest |
| Graph load failure | Retryable loader and unchanged Library fallback |
| View-state races | Central transition controller and tests for rapid switching |
| Canvas accessibility | DOM search/list and selected-term panel, keyboard and focus support |
| Ask retrieval is irrelevant | Ranked exact/alias/token scoring with test queries and development diagnostics |
| Function cannot access entries | Explicit generated function corpus and deployment packaging test |
| LLM hallucinated citations | Retrieved-slug allowlist, server-built source metadata, local fallback |
| Public endpoint cost/abuse | Query limits, timeout, output limits, rate/abuse controls |
| Provider incompatibility | Support and document one OpenAI chat-completions-compatible contract first |
| Initial bundle growth | Dynamic imports and measured bundle budget |

---

## 16. Decisions settled by this revision

| Decision | Rationale |
|---|---|
| Term-only graph in v1 | Directly supports Map/trails and avoids premature bibliographic identity work |
| `CITES`, not `INTRODUCED_BY` | Existing citations do not reliably identify the introducing work |
| Concept trails, not generated learning paths | Relatedness and PageRank do not encode prerequisites |
| Shared normalization module | Prevents browser/generator drift |
| Scored and gated `CO_OCCURS` | A fixed cap alone does not control semantic noise |
| Precomputed coordinates | Avoids an O(n²) main-thread layout over 1,527 nodes |
| Dynamic Map/Ask imports | Lazy instantiation alone does not protect initial bundle size |
| Hashed generated artifacts | Avoids stale fixed-URL CDN/browser caches |
| Ranked local retrieval first | Gives useful no-key behavior and validates grounding before adding an LLM |
| Separate retrieval corpus | Graph nodes intentionally do not contain enough text for Q&A |
| Server-side authoritative retrieval | Prevents trusting arbitrary client context and source URLs |
| Validated citation allowlist | Model instructions alone do not guarantee valid grounding |
| Explicit navigation controller | Current startup-only parsing is insufficient for multiple interactive views |
| Accessibility in acceptance criteria | Canvas cannot be the only interaction surface |

---

## 17. Open decisions before implementation

1. **Co-occurrence release gate:** ship curated `RELATED` only initially, or enable `CO_OCCURS` if the Phase A0 sample passes?
2. **Development freshness:** add a small Vite watcher plugin or require explicit graph regeneration after dictionary edits?
3. **Map default:** community overview first or high-centrality term overview first?
4. **Concept trail roots:** which small set of foundation terms should be curated per subject?
5. **Ask presentation:** side panel, bottom sheet, or modal? It must coexist cleanly with the book and Map.
6. **Rate limiting:** Netlify-native control or an application-level store/service suitable for the deployment tier?
7. **Remote model:** which tested OpenAI-compatible provider/model and output-token limit will be the supported initial configuration?
8. **Test tooling:** use the smallest existing-compatible setup for Node unit tests and browser checks; adding a test dependency is acceptable if it materially reduces risk and follows package-age policy.

These decisions should be resolved at the start of their respective phases; they do not block Phase A0 normalization and validation.

---

## 18. Completion criteria

The project is complete when:

- graph generation is deterministic, validated, versioned, and reproducible from a clean checkout;
- no graph edge references a missing node;
- co-occurrence edges have passed the documented quality gate or remain disabled;
- Map opens through a dynamic import, remains responsive, supports keyboard/touch selection, and does not leave the Three.js scene consuming unnecessary work;
- URL navigation and Back/Forward behavior work across Library, terms, volumes, and Map;
- entries show correctly labeled concept trails without implying prerequisites;
- local Ask provides ranked, cited answers without a key;
- optional remote synthesis uses authoritative server retrieval, validates citations, and falls back safely;
- generated assets are cache-safe and packaged in both the site and function where required;
- build, data-quality, route, failure, accessibility, security, and regression checks pass;
- initial-load and Map performance remain within the recorded budgets.
