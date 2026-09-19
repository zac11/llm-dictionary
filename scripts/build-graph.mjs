import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildGraph, buildRetrievalCorpus, GRAPH_SCHEMA_VERSION } from './graph-builder.mjs';
import { loadDictionarySource, normalizedSourceHash, printDiagnostics } from './graph-source.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const root = join(dirname(scriptPath), '..');
const outputDirectory = join(root, 'public', 'generated');
const manifestPath = join(outputDirectory, 'manifest.json');
const checkOnly = process.argv.includes('--check');
const includeCoOccurs = !process.argv.includes('--related-only');
const started = performance.now();
const { terms, diagnostics } = loadDictionarySource(join(root, 'dictionary'));

console.log('Neuropaedia graph build');
console.log(`terms: ${terms.length}`);
const { errors } = printDiagnostics(diagnostics);
if (errors.length) process.exit(1);

const sourceHash = normalizedSourceHash(terms);
const implementationFiles = [
  scriptPath,
  join(root, 'scripts', 'graph-builder.mjs'),
  join(root, 'scripts', 'graph-analysis.mjs'),
  join(root, 'scripts', 'graph-source.mjs'),
  join(root, 'src', 'term-schema.js'),
];
const generatorHashState = createHash('sha256');
for (const path of implementationFiles) generatorHashState.update(readFileSync(path));
const generatorHash = generatorHashState.digest('hex');

if (!checkOnly && existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const cachedFilename = basename(manifest.graphUrl || '');
    const cachedGraphPath = join(outputDirectory, cachedFilename);
    const filenameHash = cachedFilename.match(/^graph\.([a-f0-9]{16})\.json$/)?.[1];
    const cachedContent = filenameHash && existsSync(cachedGraphPath) ? readFileSync(cachedGraphPath, 'utf8') : '';
    const contentHash = cachedContent
      ? createHash('sha256').update(cachedContent).digest('hex').slice(0, 16)
      : '';
    const cachedRetrievalFilename = basename(manifest.retrievalUrl || '');
    const cachedRetrievalPath = join(outputDirectory, cachedRetrievalFilename);
    const retrievalFilenameHash = cachedRetrievalFilename.match(/^retrieval\.([a-f0-9]{16})\.json$/)?.[1];
    const cachedRetrievalContent = retrievalFilenameHash && existsSync(cachedRetrievalPath) ? readFileSync(cachedRetrievalPath, 'utf8') : '';
    const retrievalContentHash = cachedRetrievalContent
      ? createHash('sha256').update(cachedRetrievalContent).digest('hex').slice(0, 16)
      : '';
    if (
      manifest.schemaVersion === GRAPH_SCHEMA_VERSION &&
      manifest.sourceHash === sourceHash &&
      manifest.generatorHash === generatorHash &&
      manifest.coOccurrenceEnabled === includeCoOccurs &&
      filenameHash === contentHash &&
      retrievalFilenameHash === retrievalContentHash &&
      manifest.retrievalUrl === `/generated/${cachedRetrievalFilename}`
    ) {
      console.log(`graph: ${manifest.graphUrl} (up to date)`);
      console.log(`retrieval: ${manifest.retrievalUrl} (up to date)`);
      console.log(`source hash: ${sourceHash.slice(0, 16)}`);
      console.log(`completed in ${((performance.now() - started) / 1000).toFixed(2)}s`);
      process.exit(0);
    }
  } catch {
  }
}

const graph = buildGraph(terms, { sourceHash, includeCoOccurs });
graph.meta.generatorHash = generatorHash;
const graphContent = `${JSON.stringify(graph, null, 2)}\n`;
const artifactHash = createHash('sha256').update(graphContent).digest('hex').slice(0, 16);
const graphFilename = `graph.${artifactHash}.json`;
const graphPath = join(outputDirectory, graphFilename);
const graphUrl = `/generated/${graphFilename}`;

const corpus = buildRetrievalCorpus(terms, graph);
const corpusContent = `${JSON.stringify(corpus, null, 2)}\n`;
const corpusHash = createHash('sha256').update(corpusContent).digest('hex').slice(0, 16);
const retrievalFilename = `retrieval.${corpusHash}.json`;
const retrievalPath = join(outputDirectory, retrievalFilename);
const retrievalUrl = `/generated/${retrievalFilename}`;

if (checkOnly) {
  const failures = [];
  if (!existsSync(graphPath) || readFileSync(graphPath, 'utf8') !== graphContent) {
    failures.push(`${graphFilename} is missing or stale`);
  }
  if (!existsSync(retrievalPath) || readFileSync(retrievalPath, 'utf8') !== corpusContent) {
    failures.push(`${retrievalFilename} is missing or stale`);
  }
  if (!existsSync(manifestPath)) {
    failures.push('manifest.json is missing');
  } else {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (
        manifest.schemaVersion !== graph.schemaVersion ||
        manifest.sourceHash !== sourceHash ||
        manifest.generatorHash !== generatorHash ||
        manifest.graphUrl !== graphUrl ||
        manifest.retrievalUrl !== retrievalUrl ||
        manifest.coOccurrenceEnabled !== includeCoOccurs
      ) {
        failures.push('manifest.json does not point to the expected artifacts');
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
  if (!existsSync(retrievalPath) || readFileSync(retrievalPath, 'utf8') !== corpusContent) {
    writeFileSync(retrievalPath, corpusContent);
  }
  const manifest = {
    schemaVersion: graph.schemaVersion,
    sourceHash,
    generatorHash,
    graphUrl,
    retrievalUrl,
    coOccurrenceEnabled: includeCoOccurs,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const elapsed = performance.now() - started;
const bytes = Buffer.byteLength(graphContent);
const gzipBytes = gzipSync(graphContent).length;
const corpusBytes = Buffer.byteLength(corpusContent);
const corpusGzipBytes = gzipSync(corpusContent).length;
const communitySizes = Object.values(graph.communities).sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
const singletons = communitySizes.filter((community) => community.size === 1).length;
const largestCommunities = communitySizes
  .slice(0, 5)
  .map((community) => `${community.label} (${community.size})`)
  .join(', ');
console.log(`${checkOnly ? 'verified' : 'graph'}: ${graphUrl}`);
console.log(`source hash: ${sourceHash.slice(0, 16)}`);
console.log(`edges: ${graph.meta.counts.edges} (${graph.meta.counts.relatedEdges} related, ${graph.meta.counts.coOccurrenceEdges} co-occurrence)`);
console.log(`related quality gate: ${graph.meta.related.acceptedEdges}/${graph.meta.related.inputEdges} accepted; excluded hubs: ${graph.meta.related.excludedHubs.join(', ') || 'none'}`);
console.log(`communities: ${graph.meta.counts.communities}; isolated terms: ${graph.meta.counts.isolatedTerms}; singleton communities: ${singletons}`);
console.log(`largest communities: ${largestCommunities || 'none'}`);
console.log(`PageRank: ${graph.meta.analytics.pageRankIterations} iterations, converged=${graph.meta.analytics.pageRankConverged}`);
console.log(`size: ${(bytes / 1024).toFixed(1)} KiB (${(gzipBytes / 1024).toFixed(1)} KiB gzip)`);
console.log(`retrieval corpus: ${corpus.terms.length} terms · ${(corpusBytes / 1024).toFixed(1)} KiB (${(corpusGzipBytes / 1024).toFixed(1)} KiB gzip)`);
console.log(`completed in ${(elapsed / 1000).toFixed(2)}s`);
