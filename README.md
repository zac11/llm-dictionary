# Tokenary — The AI Engineering Dictionary

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
│   ├── generate-og.mjs    # writes public/og.png (1200×630 preview card)
│   └── prerender-share.mjs# post-build: per-term /term/<slug>/ share pages
├── src/
│   ├── main.js            # app entry / ritual orchestration
│   ├── library.js         # Three.js library room, shelf wall, camera, picking
│   ├── book3d.js          # the openable 3D volume (pull-out → open → return)
│   ├── anim.js            # tiny tween runner + easings
│   ├── textures.js        # canvas-generated spine/cover/page/wood textures
│   ├── terms.js           # loads + indexes every dictionary/*.json
│   ├── ui.js              # reading spread, page-turns, search, A–Z bar
│   ├── palette.js         # shared letter/category colours
│   └── styles.css
├── public/
│   └── og.png             # generated social preview card (npm run og)
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

1. Pick the folder matching the word’s first letter, e.g. `dictionary/g-h/`.
2. Create `my-term.json` with this schema:

```jsonc
{
  "term": "My Term",
  "letter": "M",
  "category": "Architecture",            // any label you like
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
- **Esc** steps back (entry → contents → book returns to its shelf); deep-link
  with `?term=…` / `?volume=…` to share a specific word.

---

## 📚 The seed content

The repo ships with **1,502 terms** covering every letter A–Z, each with a
real citation (attention, BERT, GPT, chain-of-thought, RAG, RLHF, LoRA,
quantization, diffusion models, transformers, and more). Citations point to the
original papers (arXiv, NeurIPS, Nature, journals, etc.) or Wikipedia.

---

## 🛠 Tech

- [Vite](https://vitejs.dev/) — dev server & bundler
- [Three.js](https://threejs.org/) — 3D rendering (`three/addons` OrbitControls)
- Vanilla ES modules — no UI framework required

## 📄 License

See [LICENSE](./LICENSE).

