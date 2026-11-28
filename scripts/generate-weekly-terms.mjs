import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTerm, rangeFolderForLetter } from '../src/term-schema.js';
import {
  buildExclusionList,
  buildWeeklyMessages,
  filterCandidates,
  loadDictionaryTerms,
  parseCandidates,
  pickProvider,
  requestCandidates,
} from './weekly-terms-core.mjs';

export { buildExclusionList, filterCandidates, parseCandidates };

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');

function writeOutput(root, path, content) {
  const file = resolve(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export async function generateWeeklyTerms({ root = ROOT, env = process.env } = {}) {
  const provider = pickProvider(env);
  if (!provider) throw new Error('Weekly term generation needs DEEPSEEK_API_KEY or GEMINI_API_KEY.');

  const existing = loadDictionaryTerms(root, { trackedOnly: false });
  const messages = buildWeeklyMessages(buildExclusionList(existing));
  const { reply } = await requestCandidates(provider, messages);
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new Error('The weekly term provider returned an empty reply.');
  }
  if (env.WEEKLY_REPLY_PATH) writeOutput(root, env.WEEKLY_REPLY_PATH, reply);

  const parsed = parseCandidates(reply);
  if (!parsed.candidates.length && parsed.malformed.length) {
    throw new Error('The weekly term provider returned no parseable candidates.');
  }
  const { accepted, rejected } = filterCandidates(parsed, loadDictionaryTerms(root, { trackedOnly: false }));
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

  const summary = `Weekly term generation added ${paths.length} entries and rejected ${rejected.length} candidates.`;
  if (env.WEEKLY_PR_BODY_PATH) {
    const lines = [summary, '', ...paths.map((path) => `- \`${path}\``)];
    writeOutput(root, env.WEEKLY_PR_BODY_PATH, `${lines.join('\n')}\n`);
  }
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  generateWeeklyTerms().then(console.log).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
