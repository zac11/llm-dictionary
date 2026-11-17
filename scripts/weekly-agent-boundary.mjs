// Module boundary between the weekly agent and its evals. When
// `generate-weekly-terms.mjs` exists and exports a unit, the evals test the
// agent's own implementation; any unit it does not export falls back to
// `weekly-terms-core.mjs`, so `npm test` runs either way. The agent must guard
// its CLI entry point (only run main() when executed directly).

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as core from './weekly-terms-core.mjs';

export const UNITS = ['buildExclusionList', 'parseCandidates', 'filterCandidates'];
const AGENT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'generate-weekly-terms.mjs');

export async function loadWeeklyAgent({ agentPath = AGENT_PATH } = {}) {
  let agent = {};
  if (existsSync(agentPath)) agent = await import(pathToFileURL(agentPath).href);
  const units = {};
  const source = {};
  for (const name of UNITS) {
    const own = typeof agent[name] === 'function';
    units[name] = own ? agent[name] : core[name];
    source[name] = own ? 'generate-weekly-terms.mjs' : 'weekly-terms-core.mjs';
  }
  return { ...units, source };
}
