# LexLLM — The 3D Dictionary of LLM & Machine-Learning Terms

> Couldn't find a dictionary for LLM terms. So I created one — in **3D**.

An interactive, alphabetized dictionary of **LLM and machine-learning terms (A–Z)**.
Every word lives as its own JSON file inside letter-range folders
(`a-b`, `c-d`, … `y-z`), and a **Three.js** web app renders each range as a
gilded 3D book on a shelf. Click a book → pick a word → read its definition,
details **and citation**, then jump to the original paper or source.

---

## ✨ Features

- **3D bookshelf (Three.js)** — 13 dictionary volumes (`A–B` … `Y–Z`) rendered
  as tomes with canvas-texture covers, entrance animation, dust, hover
  highlighting and camera fly-to on selection.
- **Word browser** — pick a volume in 3D, use the A–Z letter bar, or search any
  term / category / citation.
- **Rich entries** — each term has a short definition, a longer explanation,
  "also known as", a category tag, and previous/next navigation within its volume.
- **Citations** — every entry includes a formatted reference (authors, year,
  title, venue) with a link to the source paper or article.
- **Content is just data** — drop a new JSON file into the right letter folder
  and it appears in the app automatically; no code changes needed.

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
│   └── generate-terms.mjs # optional bootstrap generator (npm run terms)
├── src/
│   ├── main.js            # app entry / wiring
│   ├── bookshelf.js       # Three.js 3D shelf & books
│   ├── terms.js           # loads + indexes every dictionary/*.json
│   ├── ui.js              # volume panel, entry modal, search, A–Z bar
│   ├── palette.js         # shared letter/category colours
│   └── styles.css
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

- **Drag** to rotate the scene, **scroll** to zoom.
- **Click a 3D book** to open its words, **click again** (or ✕ / Esc) to close.
- Use the **A–Z bar** or the **search box** to jump straight to a term.
- Every entry card shows a **📚 Citation** block with a **Read the source ↗**
  link to the underlying paper.

---

## 📚 The seed content

The repo ships with **54 curated terms** covering every letter A–Z, each with a
real citation (attention, BERT, GPT, chain-of-thought, RAG, RLHF, LoRA,
quantization, diffusion models, transformers, and more). Citations point to the
original papers (arXiv, NeurIPS, Nature, journals, etc.).

---

## 🛠 Tech

- [Vite](https://vitejs.dev/) — dev server & bundler
- [Three.js](https://threejs.org/) — 3D rendering (`three/addons` OrbitControls)
- Vanilla ES modules — no UI framework required

## 📄 License

See [LICENSE](./LICENSE).

