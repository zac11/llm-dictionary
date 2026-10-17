# 📖 The Dictionary Folder

Every word in TheAIDictionary lives here as its **own JSON file**, grouped into
letter-range volumes:

```
a-b/   c-d/   e-f/   g-h/   i-j/   k-l/   m-n/
o-p/   q-r/   s-t/   u-v/   w-x/   y-z/
```

The web app reads these files at runtime — no rebuild or code change needed
when you add, edit or remove a word.

---

## Schema for a term file (`<your-term>.json`)

```jsonc
{
  "term": "My Term",              // display name (required)
  "letter": "M",                  // A–Z, drives folder + book + colours (required)
  "slug": "my-term",              // optional; auto-derived from term if absent
  "category": "Architecture",     // free-form label shown as a tag (required)
  "aka": ["Alias", "Also known as"], // optional aliases
  "definition": "A one-sentence definition shown in gold.",          // required
  "details": "A longer explanation of the term and its context.",    // required
  "citation": {                   // optional but encouraged
    "title": "Title of the paper, book or article",
    "authors": ["Author, A.", "Author, B."],
    "year": 2020,
    "venue": "Conference / Journal / Publisher",
    "url": "https://doi.org/…"
  }
}
```

> 💡 All fields except `letter`, `term`, `definition` and `details` are
> optional — but a **citation** makes each entry genuinely useful.

---

## How to add a word

1. Choose the folder matching the word's **first letter**.
2. Add a file named after the word, e.g. `dictionary/g-h/gradient-descent.json`.
3. Paste the schema above, fill it in, save.
4. Refresh the app → it appears in the **G–H** 3D book, in **search**, and under
   the matching letters in the **A–Z bar**.

### Renaming or removing

- **Rename:** rename the file and update `"term"` (and optionally `"slug"`).
- **Remove:** delete the file. The volume count and books update automatically.

---

## Notes

- Keep filenames unique and URL-friendly (`kebab-case`), since they become slugs.
- **Every letter A–Z should have at least one word** so the alphabet bar and the
  13 volumes stay complete. To add the first word for a currently empty folder
  (e.g. only `A` has entries in `a-b/`), just drop a `B…` file in and the volume
  picks it up.
- The `scripts/generate-terms.mjs` file was a one-time **bootstrap** for the
  seed terms. The JSON files here are the source of truth going forward.

---

## Types — what kind of thing an entry is

`category` says **which topic** an entry belongs to (`Architecture`,
`Machine learning`). `type` says **what kind of thing it is**, and that decides
how the reader presents it:

| Type | Reads as | Second spread shows |
|---|---|---|
| `concept` *(default)* | 📖 story | The story vignette |
| `model`, `dataset`, `benchmark`, `tool` | 📖 story | The story vignette |
| `person` | 👤 profile | What they did, where to find them |
| `organization` | 👤 profile | What they did, where to find them |
| `event` | 🗞️ coverage | Dated references, who was involved |
| `paper`, `venue`, `policy`, `award` | 🗞️ coverage | Dated references, who was involved |

A person never gets a story: the vignette template ("…and that idea is Sam
Altman") only makes sense for a concept. Drop the `story` field for a
profile/coverage entry — the app does not read it.

### Person and organization entries

```jsonc
{
  "term": "Sam Altman",
  "letter": "S",
  "category": "Artificial intelligence",
  "type": "person",
  "definition": "American entrepreneur, chief executive officer of OpenAI since 2019.",
  "details": "…",
  "profile": {
    // What they did — one role, milestone or achievement per string.
    "highlights": [
      "Co-founded OpenAI (2015)",
      "Chief executive officer of OpenAI (2019–present)"
    ],
    // Where to find them. Any label works: LinkedIn, Google Scholar, X, a
    // personal site. http(s) URLs only.
    "links": [
      { "label": "LinkedIn", "url": "https://www.linkedin.com/in/samaltman" },
      { "label": "Google Scholar", "url": "https://scholar.google.com/citations?user=…" }
    ]
  },
  "related": ["removal-of-sam-altman-from-openai", "openai"],
  "citation": { "title": "Sam Altman", "url": "https://en.wikipedia.org/wiki/Sam_Altman" }
}
```

Until `profile.links` is filled in, the profile page links out to Wikipedia,
LinkedIn, Google Scholar and X **searches** for the name, so an entry is useful
the moment it is added. Every link is a chip with a mark for the service; a
generated search is drawn dashed with a magnifier, a curated link is solid, and
both carry a tooltip ("Search LinkedIn"). Links are laid out side by side.

### Event, policy, venue and award entries

```jsonc
{
  "term": "Removal of Sam Altman from OpenAI",
  "letter": "R",
  "category": "Artificial intelligence",
  "type": "event",
  "definition": "On November 17, 2023, OpenAI's board of directors ousted Sam Altman.",
  "details": "…",
  "coverage": [
    {
      "title": "OpenAI board fires Sam Altman",
      "url": "https://www.reuters.com/…",
      "source": "Reuters",        // optional publisher
      "date": "2023-11-17"        // optional, YYYY-MM-DD; sorts the list
    }
  ],
  "related": ["sam-altman", "openai"]
}
```

`details` holds the account of what happened; `coverage` holds the dated
references that back it. Without `coverage`, the page offers news and reference
searches instead.

### Related entries

Both spreads group `related` entries by what they are — **People**,
**Organizations**, **Events**, **Related terms** — so linking a person to the
events they were part of is enough to build their timeline. Use existing slugs.

### Classifying and reclassifying

```bash
npm run types             # assign a type to every entry (idempotent)
npm run types -- --dry-run   # report only, nothing written
```

The classifier reads how a definition opens — "… (born 1965) is a Canadian
computer scientist", "… is an American research institute", "On November 17,
2023, …" — and defaults anything it is not confident about to `concept`, which
keeps the story reading. It also drops stories from entries that no longer read
as one. Correct any entry it gets wrong by editing `"type"` by hand.

`npm run graph:check` warns about mismatches: an unknown `type`, a `type` that
does not match the data present, or a missing `type`.
