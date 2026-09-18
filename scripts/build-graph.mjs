import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildGraph } from './graph-builder.mjs';
import { loadDictionarySource, normalizedSourceHash, printDiagnostics } from './graph-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'public', 'generated');
const manifestPath = join(outputDirectory, 'manifest.json');
const checkOnly = process.argv.includes('--check');
const includeCoOccurs = process.argv.includes('--include-co-occurs');
const started = performance.now();
const { terms, diagnostics } = loadDictionarySource(join(root, 'dictionary'));

console.log('Neuropaedia graph build');
console.log(`terms: ${terms.length}`);
const { errors } = printDiagnostics(diagnostics);
if (errors.length) process.exit(1);

const sourceHash = normalizedSourceHash(terms);
const graph = buildGraph(terms, { sourceHash, includeCoOccurs });
const graphContent = `${JSON.stringify(graph, null, 2)}\n`;
const artifactHash = createHash('sha256').update(graphContent).digest('hex').slice(0, 16);
const graphFilename = `graph.${artifactHash}.json`;
const graphPath = join(outputDirectory, graphFilename);
const graphUrl = `/generated/${graphFilename}`;

if (checkOnly) {
  const failures = [];
  if (!existsSync(graphPath) || readFileSync(graphPath, 'utf8') !== graphContent) {
    failures.push(`${graphFilename} is missing or stale`);
  }
  if (!existsSync(manifestPath)) {
    failures.push('manifest.json is missing');
  } else {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (
        manifest.schemaVersion !== graph.schemaVersion ||
        manifest.sourceHash !== sourceHash ||
        manifest.graphUrl !== graphUrl ||
        manifest.coOccurrenceEnabled !== includeCoOccurs
      ) {
        failures.push('manifest.json does not point to the expected graph');
      }
    } catch {
      failures.push('manifest.json is malformed');
    }
  }
  if (failures.length) {
    for (const failure of failures) console.error(`ERROR ${failure}`);
    process.exit(1);
  }
} else {
  mkdirSync(outputDirectory, { recursive: true });
  if (!existsSync(graphPath) || readFileSync(graphPath, 'utf8') !== graphContent) {
    writeFileSync(graphPath, graphContent);
  }
  const manifest = {
    schemaVersion: graph.schemaVersion,
    sourceHash,
    graphUrl,
    coOccurrenceEnabled: includeCoOccurs,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const elapsed = performance.now() - started;
const bytes = Buffer.byteLength(graphContent);
const gzipBytes = gzipSync(graphContent).length;
console.log(`${checkOnly ? 'verified' : 'graph'}: ${graphUrl}`);
console.log(`source hash: ${sourceHash.slice(0, 16)}`);
console.log(`edges: ${graph.meta.counts.edges} (${graph.meta.counts.relatedEdges} related, ${graph.meta.counts.coOccurrenceEdges} co-occurrence)`);
console.log(`communities: ${graph.meta.counts.communities}; isolated terms: ${graph.meta.counts.isolatedTerms}`);
console.log(`PageRank: ${graph.meta.analytics.pageRankIterations} iterations, converged=${graph.meta.analytics.pageRankConverged}`);
console.log(`size: ${(bytes / 1024).toFixed(1)} KiB (${(gzipBytes / 1024).toFixed(1)} KiB gzip)`);
console.log(`completed in ${(elapsed / 1000).toFixed(2)}s`);
