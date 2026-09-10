// -----------------------------------------------------------------------------
//  Bulk importer for the term collections in /data
//
//  Run:  node scripts/import-data.mjs
//
//  Merges the source file(s) below into /dictionary/<a-b..y-z>/*.json,
//  deduplicating on three levels:
//    1. between the source files themselves (same slug → the earlier source
//       wins; aka lists are union-merged)
//    2. against the curated entries already in /dictionary (matched by term
//       name OR any "aka" alias → skipped, curated entry kept)
//    3. concept aliases the slug/alias pass cannot catch (explicit lists below)
//  Re-running is safe: every imported record is then "already in the
//  dictionary" and gets skipped.
// -----------------------------------------------------------------------------

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  // earlier = preferred when both files carry the same slug
  { file: 'data/ai_terms_1500.json', tag: 'ai-terms' },
];

// Slugs that name the same concept as a curated entry, without any
// string/alias overlap the automatic pass can see.
const COVERED_BY_EXISTING = {
  'chain-of-thought-prompting': 'chain-of-thought',
  'temperature-sampling': 'temperature',
  jailbreaking: 'jailbreak',
  agent: 'ai-agent',
  'multi-head-attention': 'attention',
};

// Near-duplicate pairs inside the imported data itself: drop the key,
// keep the value (the better-defined record), merging the dropped term
// name in as an alias so search still finds it.
const MERGE_INTO_IMPORT = {
  'tool-use': 'function-calling',
  'rotary-positional-embedding': 'rotary-position-embedding',
  'graph-engineering': 'graphrag',
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const folderFor = (letter) => {
  const i = LETTERS.indexOf(letter);
  if (i === -1) return null;
  const a = LETTERS[Math.floor(i / 2) * 2];
  const b = LETTERS[Math.floor(i / 2) * 2 + 1];
  return `${a.toLowerCase()}-${b.toLowerCase()}`;
};

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const norm = slugify;

// ---------------------------------------------------------------- existing --
const dictDir = join(ROOT, 'dictionary');
const existingAlias = new Map(); // norm(name|aka) -> curated slug
for (const folder of readdirSync(dictDir)) {
  if (!/^[a-z]-[a-z]$/.test(folder)) continue;
  for (const file of readdirSync(join(dictDir, folder))) {
    if (!file.endsWith('.json')) continue;
    const raw = JSON.parse(readFileSync(join(dictDir, folder, file), 'utf8'));
    const slug = raw.slug || slugify(raw.term || file.replace(/\.json$/, ''));
    existingAlias.set(norm(slug), slug);
    if (raw.term) existingAlias.set(norm(raw.term), slug);
    for (const aka of raw.aka || []) existingAlias.set(norm(aka), slug);
  }
}

// ------------------------------------------------------------------ gather --
const pool = new Map(); // slug -> { record, tag }
const report = { fileOverlap: [], skippedExisting: [], skippedConcept: [], merged: [] };

for (const { file, tag } of SOURCES) {
  const rows = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
  for (const raw of rows) {
    const slug = slugify(raw.term || '');
    if (!slug) continue;
    const prev = pool.get(slug);
    if (prev) {
      report.fileOverlap.push({ slug, kept: prev.tag, dropped: tag });
      const aka = new Set([...(prev.record.aka || []), ...(raw.aka || [])]);
      prev.record.aka = [...aka];
      continue;
    }
    pool.set(slug, { record: raw, tag });
  }
}

// -------------------------------------------------- merge near-duplicates --
for (const [drop, keep] of Object.entries(MERGE_INTO_IMPORT)) {
  const dropped = pool.get(drop);
  const kept = pool.get(keep);
  pool.delete(drop);
  if (dropped && kept) {
    const aka = new Set([...(kept.record.aka || []), dropped.record.term]);
    kept.record.aka = [...aka];
    report.merged.push({ dropped: drop, into: keep });
  } else if (dropped) {
    report.merged.push({ dropped: drop, into: '(nothing — target absent)' });
  }
}

// ------------------------------------------------------------------ filter --
const out = [];
for (const [slug, { record: raw, tag }] of pool) {
  const names = [raw.term, ...(raw.aka || [])].map(norm);
  const hit = names.find((n) => existingAlias.has(n));
  if (hit || existingAlias.has(slug)) {
    report.skippedExisting.push({ slug, matched: existingAlias.get(hit || slug) });
    continue;
  }
  if (COVERED_BY_EXISTING[slug]) {
    report.skippedConcept.push({ slug, coveredBy: COVERED_BY_EXISTING[slug] });
    continue;
  }

  const letter = LETTERS.includes((raw.letter || '')[0])
    ? raw.letter[0].toUpperCase()
    : (raw.term[0] || '').toUpperCase();
  const folder = folderFor(letter);
  if (!folder || !raw.definition || !raw.details) {
    console.warn(`! skipping malformed record: ${raw.term}`);
    continue;
  }

  const entry = {
    term: String(raw.term).trim(),
    letter,
    category: raw.category || 'General',
    ...(raw.aka && raw.aka.length ? { aka: raw.aka } : {}),
    definition: raw.definition,
    details: raw.details,
    ...(raw.citation && raw.citation.title
      ? {
          citation: {
            title: raw.citation.title || '',
            authors: Array.isArray(raw.citation.authors) ? raw.citation.authors : [],
            year: raw.citation.year || '',
            venue: raw.citation.venue || '',
            url: raw.citation.url || '',
          },
        }
      : {}),
    slug,
  };
  out.push({ folder, slug, entry });
}

// ------------------------------------------------------------------- write --
out.sort((a, b) => a.folder.localeCompare(b.folder) || a.slug.localeCompare(b.slug));
const perFolder = {};
for (const { folder, slug, entry } of out) {
  const dir = join(dictDir, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${slug}.json`), JSON.stringify(entry, null, 2) + '\n');
  perFolder[folder] = (perFolder[folder] || 0) + 1;
}

// ------------------------------------------------------------------ report --
console.log('\n=== import report ===');
console.log(`sources: ${SOURCES.map((s) => s.file).join(', ')}`);
console.log(`overlap between the two files (kept preferred source): ${report.fileOverlap.length}`);
for (const o of report.fileOverlap) console.log(`   · ${o.slug} (kept ${o.kept})`);
console.log(`near-duplicates merged within imports: ${report.merged.length}`);
for (const m of report.merged) console.log(`   · ${m.dropped} → ${m.into}`);
console.log(`already covered by curated dictionary (name/aka): ${report.skippedExisting.length}`);
console.log(`already covered by curated dictionary (concept alias): ${report.skippedConcept.length}`);
for (const s of report.skippedConcept) console.log(`   · ${s.slug} → ${s.coveredBy}`);
console.log(`\nwritten: ${out.length} new term files`);
for (const [folder, n] of Object.entries(perFolder)) console.log(`   ${folder}: ${n}`);
