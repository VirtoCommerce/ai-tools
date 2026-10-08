#!/usr/bin/env node
// Build `.env.playwright.all`: every env's Playwright login passwords in ONE `--secrets` file, each key
// renamed KEY_<ENV> (ORG_USER_PASSWORD_VCST_QA), so the Playwright MCP lanes serve every env without a
// restart. Why and how: scripts/lib/playwright-secrets.mjs; usage: browser-lanes.md §Browser login secrets.
//
//   npm run secrets:playwright              write the file when a source changed (restart the lanes after)
//   npm run secrets:playwright -- --check   exit 1 when it is missing or older than its sources; writes nothing
//   --root=<dir>                            read and write another directory (default: the repo root)
//
// Prints key NAMES and counts only, never a value.

import '../lib/sync-stdio.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCombinedSecrets, COMBINED_SECRETS_FILE, rawEntries } from '../lib/playwright-secrets.mjs';

const args = process.argv.slice(2);
const root = resolve(args.find((a) => a.startsWith('--root='))?.slice(7) || fileURLToPath(new URL('../..', import.meta.url)));
const check = args.includes('--check');
const out = resolve(root, COMBINED_SECRETS_FILE);

let built;
try {
  built = buildCombinedSecrets(root);
} catch (e) {
  console.error(`[secrets:playwright] ${e.message}`);
  process.exit(2);
}
for (const { env, keys, empty } of built.envs) {
  console.log(`  ${env.padEnd(24)} ${keys} keys${empty.length ? `; skipped empty: ${empty.join(', ')}` : ''}`);
}
for (const { env, reason } of built.excluded) console.log(`  ${env.padEnd(24)} left out: ${reason}`);
if (!built.envs.length) {
  console.error('[secrets:playwright] no .env.playwright.<env> with a matching .env.<env>: nothing to combine.');
  process.exit(2);
}

const current = existsSync(out) ? readFileSync(out, 'utf8') : null;
if (current === built.text) {
  console.log(`${COMBINED_SECRETS_FILE} is up to date.`);
  process.exit(0);
}
if (check) {
  if (current === null) console.error(`${COMBINED_SECRETS_FILE} does not exist.`);
  else {
    const was = rawEntries(current);
    const changed = [...built.entries].filter(([n, e]) => was.has(n) && was.get(n) !== e.raw).map(([n]) => n);
    const added = [...built.entries.keys()].filter((n) => !was.has(n));
    const removed = [...was.keys()].filter((n) => !built.entries.has(n));
    console.error(`${COMBINED_SECRETS_FILE} is older than its sources.`);
    for (const [label, list] of [['changed', changed], ['new', added], ['gone', removed]]) {
      if (list.length) console.error(`  ${label}: ${list.join(', ')}`);
    }
  }
  console.error('Run `npm run secrets:playwright`, then restart the Playwright MCP servers.');
  process.exit(1);
}
writeFileSync(out, built.text);
console.log(`Wrote ${out}.`);
console.log('Restart the Playwright MCP servers: they read their --secrets file once, at start.');
if (current === null) console.log(`First time: point every Playwright server's --secrets in .mcp.json at ${out}.`);
