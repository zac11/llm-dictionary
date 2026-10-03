---
name: Submit a term
about: Suggest one or more new terms for TheAIDictionary
title: "Add term: "
labels: term-contribution
---

<!--
The easiest way to submit is the in-app **Contribute** button — it validates
your terms and prefills this issue with ready-to-commit JSON files.
-->

## Files to create

Paste the JSON for each term. Each file lives at
`dictionary/<letter-range>/<slug>.json` (e.g. `dictionary/m-n/my-term.json`).

```json
{
  "term": "My Term",
  "letter": "M",
  "category": "General",
  "definition": "One-sentence definition.",
  "details": "Longer explanation of the term and why it matters.",
  "citation": {
    "title": "Title of the paper / article",
    "authors": ["Author, A."],
    "year": 2020,
    "venue": "Conference or Journal",
    "url": "https://doi.org/…"
  },
  "slug": "my-term"
}
```

## Maintainer checklist

- [ ] `npm run graph:check` passes (slugs, letter folders, related targets)
- [ ] Category and citation look right
- [ ] Optionally generate a story (`npm run stories`)
