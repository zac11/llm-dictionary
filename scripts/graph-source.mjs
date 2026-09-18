import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  isValidRangeFolder,
  normalizeGraphLabel,
  normalizeTerm,
  validateTerm,
} from '../src/term-schema.js';

const addDiagnostic = (diagnostics, level, code, source, message) =>
  diagnostics.push({ level, code, source, message });

export function loadDictionarySource(dictionary) {
  const diagnostics = [];
  const terms = [];

  for (const folderEntry of readdirSync(dictionary, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!folderEntry.isDirectory()) continue;
    if (!isValidRangeFolder(folderEntry.name)) {
      addDiagnostic(diagnostics, 'warning', 'ignored-folder', folderEntry.name, 'Folder is not a dictionary letter range.');
      continue;
    }
    const folderPath = join(dictionary, folderEntry.name);
    for (const filename of readdirSync(folderPath).filter((name) => name.endsWith('.json')).sort()) {
      const source = `${folderEntry.name}/${filename}`;
      let raw;
      try {
        raw = JSON.parse(readFileSync(join(folderPath, filename), 'utf8'));
      } catch (error) {
        addDiagnostic(diagnostics, 'error', 'malformed-json', source, error.message);
        continue;
      }
      const term = normalizeTerm(raw, source);
      for (const issue of validateTerm(term, { raw, folder: folderEntry.name, filename })) {
        addDiagnostic(diagnostics, issue.level, issue.code, source, issue.message);
      }
      if (term) terms.push(term);
    }
  }

  const bySlug = new Map();
  const byLabel = new Map();
  const aliasOwners = new Map();
  for (const term of terms) {
    if (bySlug.has(term.slug)) {
      addDiagnostic(diagnostics, 'error', 'duplicate-slug', term._src, `Slug also belongs to ${bySlug.get(term.slug)._src}.`);
    } else {
      bySlug.set(term.slug, term);
    }
    const label = normalizeGraphLabel(term.term);
    if (byLabel.has(label)) {
      addDiagnostic(diagnostics, 'error', 'duplicate-label', term._src, `Canonical label also belongs to ${byLabel.get(label)._src}.`);
    } else {
      byLabel.set(label, term);
    }
    for (const alias of term.aka) {
      const key = normalizeGraphLabel(alias);
      if (!aliasOwners.has(key)) aliasOwners.set(key, []);
      aliasOwners.get(key).push(term);
    }
  }

  for (const [alias, owners] of aliasOwners) {
    const uniqueOwners = [...new Map(owners.map((term) => [term.slug, term])).values()];
    const canonicalOwner = byLabel.get(alias);
    if (uniqueOwners.length > 1 || (canonicalOwner && !uniqueOwners.some((term) => term.slug === canonicalOwner.slug))) {
      const ownerNames = uniqueOwners.map((term) => term.slug);
      if (canonicalOwner) ownerNames.push(canonicalOwner.slug);
      addDiagnostic(
        diagnostics,
        'warning',
        'ambiguous-alias',
        uniqueOwners[0]._src,
        `Normalized alias “${alias}” maps to ${[...new Set(ownerNames)].join(', ')}.`
      );
    }
  }

  for (const term of terms) {
    for (const related of term.related) {
      if (related === term.slug) {
        addDiagnostic(diagnostics, 'error', 'self-related', term._src, `Term relates to itself through “${related}”.`);
      } else if (!bySlug.has(related)) {
        addDiagnostic(diagnostics, 'error', 'missing-related-target', term._src, `Related slug “${related}” does not exist.`);
      }
    }
  }

  diagnostics.sort(
    (a, b) =>
      a.level.localeCompare(b.level) ||
      a.code.localeCompare(b.code) ||
      a.source.localeCompare(b.source) ||
      a.message.localeCompare(b.message)
  );
  terms.sort((a, b) => a.slug.localeCompare(b.slug));
  return { terms, diagnostics };
}

export function normalizedSourceHash(terms) {
  const source = terms.map(({ _src, ...term }) => ({ ...term, aka: [...term.aka].sort(), related: [...term.related].sort() }));
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

export function printDiagnostics(diagnostics, { limit = 30 } = {}) {
  const errors = diagnostics.filter((item) => item.level === 'error');
  const warnings = diagnostics.filter((item) => item.level === 'warning');
  console.log(`errors: ${errors.length}`);
  console.log(`warnings: ${warnings.length}`);
  for (const item of diagnostics.slice(0, limit)) {
    console.log(`  ${item.level.toUpperCase()} [${item.code}] ${item.source}: ${item.message}`);
  }
  if (diagnostics.length > limit) console.log(`  … ${diagnostics.length - limit} more diagnostics`);
  return { errors, warnings };
}
