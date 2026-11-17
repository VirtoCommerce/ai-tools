#!/usr/bin/env node
/**
 * scripts/maintenance/creds-check.mjs — `npm run creds:check [-- <env>]`
 *
 * The state of the test-account credentials, names and counts only (never a value):
 *   - the store (test-accounts.local.json): readable, its envs and how many names each holds;
 *   - leftovers: a credential still in a .env file (the store is the one place — `npm run creds:migrate`);
 *   - per env: the password names the suites, test-data and roles need that the env has no value for;
 *   - the running playwright-* lanes: a name added to or changed in the store after a lane started (reconnect it).
 * With an env argument, only that env. Exit 1 when something needs doing.
 */
import '../lib/sync-stdio.mjs';
import { STORE_FILE, StoreError, readStore, storeValues } from '../lib/test-accounts.mjs';
import { combinedEnvCandidates, deriveSecretNames, laneDrift, laneSecrets, readLaneManifests } from '../lib/browser-secrets.mjs';
import { layered, usesMaster } from '../lib/env-layers.mjs';
import { ROLE_PASSWORD_NAMES } from '../lib/env-core.js';

const root = process.cwd();
const only = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
let problems = 0;
const list = (names, max = 10) => `${names.slice(0, max).join(', ')}${names.length > max ? `, … (${names.length})` : ''}`;

let store;
try { store = readStore(root); } catch (e) {
  console.log(`✗ ${e instanceof StoreError ? e.message : String(e)}`);
  process.exit(1);
}
if (!store.exists) { console.log(`✗ no ${STORE_FILE} — npm run creds:migrate builds it from the .env files (or get it from the team's secret store)`); problems++; }
else {
  const envs = Object.entries(store.envs).map(([e, s]) => `${e} ${Object.values(s).filter(Boolean).length}`);
  console.log(`${STORE_FILE}: ${Object.keys(store.defaults).length} shared name(s); ${envs.join(', ') || 'no env section'}${store.master ? '; master password' : ''}`);
  const accounts = Object.entries(store.accounts).map(([e, a]) => `${e} ${Object.keys(a).length}`);
  console.log(`  accounts (login + its password): ${accounts.join(', ') || 'none yet — a seed records each account it creates'}`);
}

const { envs: candidates, excluded } = combinedEnvCandidates(root);
const envs = only ? [only] : candidates;
const needed = [...deriveSecretNames(root).keys()].sort();
const leftovers = new Map();
for (const env of envs) {
  const r = layered(env, { root, ambient: {}, passwordNames: ROLE_PASSWORD_NAMES });
  for (const l of r.leftovers) { if (!leftovers.has(l.file)) leftovers.set(l.file, new Set()); leftovers.get(l.file).add(l.key); }
  if (usesMaster(r.env)) {
    if (!r.master?.found) { console.log(`✗ ${env}: a master stand (PASSWORDS=master) and ${STORE_FILE} has no "master"`); problems++; }
    continue;
  }
  const missing = needed.filter((n) => !r.env[n]);
  const own = storeValues(store, env).own.size;
  console.log(`${missing.length ? '⚠' : '✓'} ${env}: ${needed.length - missing.length}/${needed.length} password name(s) have a value (${own} set for ${env} itself)${missing.length ? ` — none for ${list(missing)}` : ''}`);
}
for (const e of only ? [] : excluded) console.log(`  ${e.env}: left out of the lanes (${e.reason})`);
for (const [file, keys] of leftovers) { console.log(`✗ ${file} still holds ${keys.size} credential(s): ${list([...keys])} — npm run creds:migrate`); problems++; }

const manifests = readLaneManifests(root);
if (!manifests.length) console.log('lanes: none running from scripts/lanes/playwright-lane.mjs (start Claude Code, or npm run creds:migrate to point .mcp.json at the launcher)');
else {
  const current = laneSecrets(root).secrets;
  for (const m of manifests) {
    const d = laneDrift(m, current);
    const behind = [...d.stale, ...d.absent];
    if (behind.length) { console.log(`✗ lane ${m.lane} (started ${m.startedAt}): ${d.stale.length} changed, ${d.absent.length} added since — reconnect it in /mcp: ${list(behind)}`); problems++; }
    else console.log(`✓ lane ${m.lane} (started ${m.startedAt}) holds what ${STORE_FILE} says`);
  }
}
process.exit(problems ? 1 : 0);
