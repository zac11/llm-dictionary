# 📖 The Dictionary Folder

Every word in LexLLM lives here as its **own JSON file**, grouped into
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
