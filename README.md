# TheAIDictionary — The AI Encyclopaedia

> Decode the language of LLMs, GenAI & AI Engineering.
>
> Couldn't find a dictionary for LLM terms. So I created one — in **3D**.

An interactive, alphabetized dictionary of **LLM and machine-learning terms (A–Z)**.
Every word lives as its own JSON file inside letter-range folders
(`a-b`, `c-d`, … `y-z`), and a **Three.js** web app renders the collection as a
cozy 3D library. Click a volume → it slides off the shelf onto the reading desk
and its cover swings open → pick a word from the contents page → read it on a
two-page paper spread, just like a real dictionary — then jump to the original
paper or source.

---

## 🗂 Project structure

```
llm-dictionary/
├── dictionary/            # ← the actual dictionary (source of truth)
│   ├── a-b/               #    terms starting with A or B
│   │   ├── attention.json
│   │   ├── bert.json
│   │   └── …
│   ├── c-d/
│   ├── …                  #    e-f, g-h, i-j, k-l, m-n,
│   ├── …                  #    o-p, q-r, s-t, u-v, w-x, y-z
│   └── README.md          #    schema + how to add terms
├── scripts/
│   ├── generate-terms.mjs # optional bootstrap generator (npm run terms)
│   ├── classify-types.mjs # entity types: person, event, concept… (npm run types)
│   ├── import-people.mjs  # bulk-add people from JSON lists (npm run import:people)
│   ├── mark-deceased.mjs  # flags deceased people so LinkedIn is hidden (npm run deceased)
│   ├── generate-stories.mjs# story vignettes for conceptual entries (npm run stories)
│   ├── generate-og.mjs    # writes public/og.png (1200×630 preview card)
│   └── prerender-share.mjs# post-build: per-term /term/<slug>/ share pages
├── src/
│   ├── main.js            # app entry / ritual orchestration
│   ├── visits.js          # first-party reader count (footer)
│   ├── library.js         # Three.js library room, shelf wall, camera, picking
│   ├── book3d.js          # the openable 3D volume (pull-out → open → return)
│   ├── anim.js            # tiny tween runner + easings
│   ├── textures.js        # canvas-generated spine/cover/page/wood textures
│   ├── term-schema.js     # validation, search ranking, type vocabulary
│   ├── entry-actions.js   # pure presentation models for the entry reader
│   ├── terms.js           # loads + indexes every dictionary/*.json
│   ├── ui.js              # reading spread, page-turns, search, A–Z bar
│   ├── palette.js         # shared letter/category colours
│   └── styles.css
├── public/
│   └── og.png             # generated social preview card (npm run og)
├── netlify/functions/
│   ├── ask.mjs            # grounded Q&A proxy
│   └── visit.mjs          # distinct-reader counter (POST /api/visit)
└── index.html
```

---

## 🚀 Getting started

```bash
npm install        # install Vite + Three.js
npm run dev        # start the dev server (http://localhost:5173)
```

Build for production:

```bash
npm run build      # outputs to dist/

`npm run build` runs three steps: it draws the social preview card
(`scripts/generate-og.mjs` → `public/og.png`), runs Vite, then prerenders one
HTML page per word at `dist/term/<slug>/index.html`
(`scripts/prerender-share.mjs`). Those pages carry the term's own `<title>`,
description and Open Graph tags, which is what makes a shared link show a real
preview on LinkedIn, X or Medium — crawlers don't run JavaScript, so the
single-page app alone can't describe an individual word.

Set `SITE_URL` when building somewhere other than Netlify (Netlify supplies
`URL` automatically) so `og:image` and `og:url` come out absolute:

```bash
SITE_URL=https://your-site.example npm run build
```

> **Sharing links:** each entry has a `↗ Share` button producing
> `https://your-site/term/<slug>/`. Localhost links can't be fetched by
> LinkedIn, so previews stay blank until the site is deployed. LinkedIn also
> caches previews — after deploying, run the URL through the
> [Post Inspector](https://www.linkedin.com/post-inspector/) once to refresh it.
npm run preview    # preview the production build
```

> The seeded terms were created with `node scripts/generate-terms.mjs`
> (`npm run terms`). After that, **edit the JSON files directly** — the app
> reads the `dictionary/` folder live. The generator only needs re-running if
> you want to re-seed from the script’s data.

---

## ➕ Adding a word (no code required)

**Easiest path — the in-app Contribute button.** Click **Contribute** in the
top bar, fill in one term (or several with “+ Add another term”), and press
**Review & submit**. The form validates everything against the dictionary
schema, shows you the exact JSON files it generated, and opens a prefilled
GitHub issue. The maintainer reviews, merges, and the terms go live on the
next deploy.

**Manual path — edit the repo directly:**

1. Pick the folder matching the word’s first letter, e.g. `dictionary/g-h/`.
2. Create `my-term.json` with this schema:

```jsonc
{
  "term": "My Term",
  "letter": "M",
  "category": "Architecture",            // any label you like
  "type": "concept",                     // what kind of thing it is (see below)
  "aka": ["Alias", "Other name"],        // optional
  "definition": "One-sentence definition.",
  "details": "Longer explanation of the term and why it matters.",
  "citation": {
    "title": "Title of the paper / article",
    "authors": ["Author, A.", "Author, B."],
    "year": 2020,
    "venue": "Conference or Journal",
    "url": "https://doi.org/…"
  }
}
```

3. Save it. Refresh the browser — the word appears in the matching 3D volume,
   in search, and in the A–Z bar. That’s it.

**Rules:** `letter` must be A–Z; keep the filename unique (it becomes the
`slug`); every letter needs at least one entry for the A–Z bar to be complete.

### What kind of thing is it? (`type`)

`category` is the topic; `type` is the kind of thing, and it decides how the
entry reads:

| Type | Second spread |
|---|---|
| `concept` (default), `model`, `dataset`, `benchmark`, `tool` | 📖 the **story** vignette |
| `person`, `organization` | 👤 a **profile**: what they did, where to find them (LinkedIn, Google Scholar, X…) |
| `event`, `paper`, `venue`, `policy`, `award` | 🗞️ **coverage**: dated references plus who was involved |

A person never gets a story — the vignette template only lands for a concept.
People and organizations can carry `profile.highlights` and `profile.links`,
events and policies can carry `coverage` entries; `related` entries are grouped
by type on both spreads, so linking a person to their events builds a timeline.
Full field reference: [dictionary/README.md](dictionary/README.md).

Prefer not to classify by hand? `npm run types` assigns a type to every entry,
leaving anything uncertain as `concept`.

---

## 🕹 Using the app

- **Drag** to look around the library, **scroll** to zoom.
- **Click a book** on the shelf (hovered books peek out) — it slides off the
  shelf onto the reading desk and opens to its contents page.
- **Click a word** in the contents to turn to its entry; use **← / →** or the
  Prev/Next buttons to flip pages within the volume.
- Use the **A–Z bar** or the **search box** (press Enter) — the right volume is
  pulled out and opened straight to that word.
- Every entry page shows a **❦ Citation** block with a **Read the source ↗**
  link to the underlying paper.
- **Flip to the story / show the profile / see the coverage** turns to an
  entry’s second spread — a story for a concept, a profile for a person, dated
  coverage for an event.
- **Esc** steps back (entry → contents → book returns to its shelf); deep-link
  with `?term=…` / `?volume=…` to share a specific word.

---

## 📚 The seed content

The repo ships with **4,667 entries** covering every letter A–Z — concepts
(attention, BERT, GPT, chain-of-thought, RAG, RLHF, LoRA, quantization,
diffusion models, transformers…), plus **703 people** (from Turing and Minsky to
the teams behind today's models), ~80 organizations, and the conferences,
policies and incidents of the field. Citations point to the original papers
(arXiv, NeurIPS, Nature, journals, etc.) or Wikipedia.

Bulk-adding people? `npm run import:people <file.json>` reads a list of names
with `famous_for` / `contribution` fields, matches people already in the
dictionary, and writes typed `person` entries — see
[dictionary/README.md](dictionary/README.md).

Most entries are typed already (`npm run types`); `type` decides whether an
entry gets a story, a profile or coverage.

---

## 🛠 Tech

- [Vite](https://vitejs.dev/) — dev server & bundler
- [Three.js](https://threejs.org/) — 3D rendering (`three/addons` OrbitControls)
- Vanilla ES modules — no UI framework required

## Testing

Run the offline unit and integration tests:

```sh
npm test
```

The live Kimi test makes one real, low-token chat-completions request and is excluded
from the normal suite unless explicitly enabled. Add the same provider settings used by
Netlify to the gitignored `.env` file, then run:

```dotenv
LLM_API_KEY=your-provider-key
LLM_BASE_URL=https://api.moonshot.ai/v1
LLM_MODEL=kimi-k2.5
```

```sh
npm run test:kimi
```

The test fails on authentication errors, non-JSON responses, missing completion content,
an unexpected response, or latency beyond the function's 18-second upstream budget.
Never commit provider credentials or place them in tracked files.

## 📈 Distinct visitor count

The footer shows an all-time count of distinct readers. It is measured
first-party, with no third-party analytics:

- `POST /api/visit` (`netlify/functions/visit.mjs`) is called once per page load.
- The first visit gets an `HttpOnly`, `SameSite=Lax` cookie with a random UUID.
  A valid cookie means "returning" — the function only reads the total.
- New visitors are recorded in a Netlify Blobs store (`visitor-count`) and the
  `stats/total` counter is bumped atomically.
- Crawlers, automation user agents, prefetches, and cross-site calls are ignored.
- To stop cookie-clearing from inflating the number, one IP can add at most five
  new visitors per UTC day. The gate stores a salted hash of the IP and only
  today's count — raw IPs and per-day history are never stored.
- Deploy previews and branch deploys read the total but never write to it.

The count starts at zero on the deploy that ships this feature; traffic before it
was never recorded. To read the raw number outside the footer, open the
`visitor-count` store → `stats/total` in Netlify Blobs.

Set the salt in Netlify (Site configuration → Environment variables):

```dotenv
VISITOR_HASH_SALT=<random string>
# optional, default 5
VISITOR_MAX_NEW_PER_IP_DAY=5
```

The count needs Netlify Functions and Blobs, so plain `npm run dev` (Vite only)
leaves the footer hidden. Use `netlify dev` to exercise the endpoint locally.

Privacy: the cookie holds only a random ID and is never used for cross-site
tracking. It is still an analytics cookie; if your jurisdiction requires consent
for analytics, gate `recordVisit()` behind your consent banner.

**Limitation:** the count is distinct browsers, not verified humans. A person who
clears cookies or uses several devices may be counted more than once, while
privacy tools that strip the user agent may not be counted at all.

## 📄 License

See [LICENSE](./LICENSE).

