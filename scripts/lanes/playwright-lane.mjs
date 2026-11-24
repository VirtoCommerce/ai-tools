#!/usr/bin/env node
// scripts/lanes/playwright-lane.mjs — a Playwright MCP lane whose login passwords come from the test-account store
// (test-accounts.local.json, scripts/lib/test-accounts.mjs) and never touch a file.
//
// .mcp.json starts each lane as
//
//   npx -y -p @playwright/mcp@<pin> node scripts/lanes/playwright-lane.mjs <lane> @playwright/mcp@<pin> --config <cfg> …
//
// npx installs the pinned package and puts it on PATH; this reads every non-production env's passwords as NAME_<ENV>
// (plus MASTER_PASSWORD) from the store through the loader (scripts/lib/browser-secrets.mjs `laneSecrets`), and runs
// the package's own CLI in this process with them as `config.secrets` — the mechanism of the vc-init bridge
// (plugins/vc-init/bridge/playwright-mcp.mjs `startPlaywrightMcp`), which also keeps the lane's HAR scrubbed of them.
// An agent types a NAME (`browser_type(text="ORG_USER_PASSWORD_VCST")`); the lane types the value and masks it.
//
// At start the lane leaves a manifest, `.vc-fix/lanes/<lane>-<pid>.json` (names + salted fingerprints, no value), so
// the secret-token hook, the pre-flight and env:use can tell when the store changed under it: then reconnect the lane
// in /mcp — never while a run has browser suites in flight. Prints names and counts only, never a value.
import { join } from 'node:path';
import { findPackage, pinnedVersion, refusal, startPlaywrightMcp, takePasswords } from '../../plugins/vc-init/bridge/playwright-mcp.mjs';
import { laneSecrets, removeLaneManifest, writeLaneManifest } from '../lib/browser-secrets.mjs';
import { STORE_FILE } from '../lib/test-accounts.mjs';

const say = (m) => process.stderr.write(`playwright-lane: ${m}\n`);
const root = process.cwd();

async function main() {
  const [lane, spec, ...args] = process.argv.slice(2);
  if (!/^playwright-[a-z0-9-]+$/.test(lane ?? '')) { say(`the first argument must be the lane's server name (playwright-<name>), got ${JSON.stringify(lane)}`); return 64; }
  const version = pinnedVersion(spec);
  if (!version) { say(`the second argument must be the pinned package (@playwright/mcp@x.y.z), got ${JSON.stringify(spec)}`); return 64; }
  const why = refusal(args);
  if (why) { say(`refused — ${why.replace('the passwords come from vc-secrets here', `the passwords come from ${STORE_FILE} here`)}`); return 64; }
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const pkg = findPackage(process.env[pathKey], version);
  if (!pkg) { say(`@playwright/mcp@${version} is not on PATH — start this through npx -y -p @playwright/mcp@${version} node ${join('scripts', 'lanes', 'playwright-lane.mjs')} …`); return 69; }

  // No password stays in the environment the browser inherits; the env layering below starts from what is left.
  const { env: clean, dropped } = takePasswords(process.env);
  for (const k of dropped) delete process.env[k];
  let lanes;
  try { lanes = laneSecrets(root, { ambient: clean }); } catch (e) { say(`cannot read the test-account credentials: ${String(e?.message ?? e)}`); return 78; }
  const { secrets, envs, conflicts, excluded, master } = lanes;
  say(`${secrets.size} password name(s) for ${envs.length} env(s): ${envs.join(', ') || 'none'}${secrets.has('MASTER_PASSWORD') ? ', MASTER_PASSWORD' : ''}`);
  for (const c of conflicts) say(`not registered: ${c.name} on ${c.env} — its run tickets disagree on it (${c.tickets.map((t) => t ?? 'shared').join(' vs ')})`);
  for (const e of excluded) say(`left out: ${e.env} (${e.reason})`);
  for (const m of master) say(`${m.env} is a master stand: type MASTER_PASSWORD there`);
  if (!secrets.size) say(`started without a password — the agent cannot sign in on this lane: fill ${STORE_FILE} (npm run creds:check)`);

  writeLaneManifest(root, lane, secrets, { envs });
  // A lane killed outright leaves its manifest behind; readers drop a manifest whose process is gone.
  process.on('exit', () => { try { removeLaneManifest(root, lane); } catch { /* best effort */ } });

  await startPlaywrightMcp({ pkg, version, args, secrets: Object.fromEntries(secrets), say });
  return undefined;
}

const code = await main();
if (code !== undefined) process.exit(code);
