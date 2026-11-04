#!/usr/bin/env node
// SessionStart: install the plugin's runtime dependencies when the install has none.
//
// A marketplace install copies the plugin into the plugin cache without node_modules, so every
// script that imports a package from package.json (dotenv, used by scripts/lib/load-layered-env.mjs and
// the $VC_RUN bridge) fails with ERR_MODULE_NOT_FOUND until someone runs npm install by hand
// — and again after every /plugin update, which creates a fresh cache folder.
//
// Fail-soft: never blocks the session. A failed install prints the manual command and exits 0.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.CLAUDE_PLUGIN_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');

let deps = [];
try {
  deps = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies || {});
} catch {
  process.exit(0);
}
const missing = deps.filter((d) => !existsSync(join(root, 'node_modules', d, 'package.json')));
if (missing.length === 0) process.exit(0);

const args = ['install', '--omit=dev', '--no-audit', '--no-fund', '--prefix', root];
const res = spawnSync('npm', args, { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32', timeout: 120_000 });
if (res.status === 0) {
  process.stderr.write(`[vc-init] installed plugin dependencies (${missing.join(', ')})\n`);
} else {
  process.stderr.write(`[vc-init] could not install plugin dependencies (${missing.join(', ')}). Run: npm install --omit=dev --prefix "${root}"\n`);
}
process.exit(0);
