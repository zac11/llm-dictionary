import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryPresentation, normalizeTerm, rangeFolderForLetter } from '../src/term-schema.js';
import {
  buildExclusionList,
  filterCandidates,
  loadDictionaryTerms,
  parseCandidates,
  pickProvider,
  proposeWeeklyTerms,
  splitRequested,
} from './weekly-terms-core.mjs';

export { buildExclusionList, filterCandidates, parseCandidates };

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');

function writeOutput(root, path, content) {
  const file = resolve(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Runs `generate-explainers.mjs --compact` on the new slugs with the weekly provider; returns its output. */
export function writeExplainers(root, provider, slugs) {
  return execFileSync(process.execPath, [join(root, 'scripts', 'generate-explainers.mjs'), '--compact', '--only', slugs.join(',')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LLM_API_KEY: provider.apiKey, LLM_BASE_URL: provider.baseUrl, LLM_MODEL: provider.model },
  });
}

export async function generateWeeklyTerms({ root = ROOT, env = process.env, explainers = writeExplainers } = {}) {
  const provider = pickProvider(env);
  if (!provider) throw new Error('Weekly term generation needs DEEPSEEK_API_KEY or GEMINI_API_KEY.');

  const existing = loadDictionaryTerms(root, { trackedOnly: false });
  const { names, proposed, reply, usage } = await proposeWeeklyTerms(provider, existing);
  if (!proposed) throw new Error('The weekly term provider returned no parseable names.');
  if (names.length && (typeof reply !== 'string' || !reply.trim())) {
    throw new Error('The weekly term provider returned an empty reply.');
  }
  if (env.WEEKLY_REPLY_PATH && reply) writeOutput(root, env.WEEKLY_REPLY_PATH, reply);

  const parsed = parseCandidates(reply);
  if (names.length && !parsed.candidates.length && parsed.malformed.length) {
    throw new Error('The weekly term provider returned no parseable candidates.');
  }
  const filtered = names.length ? filterCandidates(parsed, existing) : { accepted: [], rejected: [] };
  const { requested: accepted, unrequested } = splitRequested(filtered.accepted, names);
  const rejected = [...filtered.rejected, ...unrequested.map((item) => ({ ...item, reason: 'not-requested' }))];
  const addedAt = new Date().toISOString().slice(0, 10);
  const paths = [];

  for (const { entry, slug } of accepted) {
    const { letter } = normalizeTerm(entry);
    const folder = join('dictionary', rangeFolderForLetter(letter));
    const path = join(folder, `${slug}.json`);
    mkdirSync(join(root, folder), { recursive: true });
    writeFileSync(join(root, path), `${JSON.stringify({ ...entry, letter, addedAt }, null, 2)}\n`, { flag: 'wx' });
    paths.push(path);
  }

  const lines = [
    `Weekly term generation added ${paths.length} entries and rejected ${rejected.length} candidates.`,
    `Tokens: ${usage.prompt} in + ${usage.completion} out over ${usage.calls} calls.`,
  ];
  // People, organizations and events keep their profile / coverage spread; a
  // compact explainer would replace it without the highlights.
  const explain = accepted.filter(({ entry }) => entryPresentation(normalizeTerm(entry).type) === 'story').map(({ slug }) => slug);
  if (explain.length) {
    try {
      const log = String(explainers(root, provider, explain));
      const written = log.match(/written: \d+, failed: \d+/);
      lines.push(`Explainers: ${written ? written[0] : 'see the workflow log'}.`);
      console.log(log);
    } catch (error) {
      lines.push(`Explainers: not written (${String(error.message).split('\n')[0]}).`);
    }
  }
  const summary = lines.join('\n');
  if (env.WEEKLY_PR_BODY_PATH) {
    writeOutput(root, env.WEEKLY_PR_BODY_PATH, `${[...lines, '', ...paths.map((path) => `- \`${path}\``)].join('\n')}\n`);
  }
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  generateWeeklyTerms().then(console.log).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
