import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCoOccurrenceCandidates } from './graph-analysis.mjs';
import { loadDictionarySource, printDiagnostics } from './graph-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sampleArg = process.argv.find((arg) => arg.startsWith('--sample='));
const sampleSize = sampleArg ? Math.max(0, Number.parseInt(sampleArg.split('=')[1], 10) || 0) : 50;
const { terms, diagnostics } = loadDictionarySource(join(root, 'dictionary'));

console.log('Neuropaedia graph source audit');
console.log(`terms: ${terms.length}`);
console.log(`related references: ${terms.reduce((sum, term) => sum + term.related.length, 0)}`);
console.log(`aliases: ${terms.reduce((sum, term) => sum + term.aka.length, 0)}`);
const { errors } = printDiagnostics(diagnostics);
if (errors.length) process.exit(1);

const relatedIncoming = new Map();
for (const term of terms) {
  for (const target of term.related) relatedIncoming.set(target, (relatedIncoming.get(target) || 0) + 1);
}
const relatedHubs = [...relatedIncoming]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 10);
const relatedHubThreshold = Math.ceil(terms.length * 0.05);
const dominantRelatedHubs = relatedHubs.filter(([, count]) => count > relatedHubThreshold);
console.log(`largest raw related hubs: ${relatedHubs.map(([slug, count]) => `${slug} (${count})`).join(', ') || 'none'}`);
console.log(
  dominantRelatedHubs.length
    ? `related quality gate: REVIEW — ${dominantRelatedHubs.map(([slug]) => slug).join(', ')} exceed 5% incoming-hub threshold`
    : 'related quality gate: no dominant incoming hub detected'
);

const started = performance.now();
const candidates = buildCoOccurrenceCandidates(terms);
const elapsed = performance.now() - started;
const incoming = new Map();
for (const edge of candidates) incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
const hubs = [...incoming].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
const aliasOnly = candidates.filter((edge) => edge.evidence.alias && !edge.evidence.canonical).length;
const dominantHubThreshold = Math.ceil(terms.length * 0.05);
const dominantHubs = hubs.filter(([, count]) => count > dominantHubThreshold);

console.log(`co-occurrence candidates: ${candidates.length}`);
console.log(`alias-only candidates: ${aliasOnly}`);
console.log(`candidate generation: ${(elapsed / 1000).toFixed(2)}s`);
console.log(`largest incoming candidate hubs: ${hubs.map(([slug, count]) => `${slug} (${count})`).join(', ') || 'none'}`);
console.log(
  dominantHubs.length
    ? `quality gate: REVIEW — ${dominantHubs.map(([slug]) => slug).join(', ')} exceed 5% incoming-hub threshold`
    : 'quality gate: no dominant incoming hub detected; manual edge review is still required'
);

if (sampleSize && candidates.length) {
  console.log(`sample (${Math.min(sampleSize, candidates.length)} edges):`);
  const count = Math.min(sampleSize, candidates.length);
  for (let index = 0; index < count; index++) {
    const edgeIndex = count === 1 ? 0 : Math.round((index * (candidates.length - 1)) / (count - 1));
    const edge = candidates[edgeIndex];
    const fields = [edge.evidence.definition && 'definition', edge.evidence.details && 'details', edge.evidence.alias && 'alias']
      .filter(Boolean)
      .join('+');
    console.log(`  ${edge.source} -> ${edge.target} | ${edge.score.toFixed(4)} | ${fields} | mentions=${edge.evidence.mentions}`);
  }
}
