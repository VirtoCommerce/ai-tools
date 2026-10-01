#!/usr/bin/env node
// Archive a batch of A/B runs into the repo, scrubbed, and park the raw transcripts locally.
//
//   node scripts/kb/bench/agent-ab/archive.mjs <date> <series>=<run-dir> [<series>=<run-dir> ...]
//
// The repo is PUBLIC. What goes in: per-run rows (metrics, grade, final answer), the prompts, the
// summaries and the run logs -- with every credential VALUE and every test-account identifier
// from the env layer replaced by its {{VAR}} token, JWTs and bearer tokens redacted, and the home
// directory folded to `~`. What stays out: the raw stream-json transcripts. They hold the
// environment's own responses (orders, names, tokens) and are moved to the gitignored
// `results/kb-ab/<date>/`, where the per-run rows can still be traced back to them.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
await import(pathToFileURL(join(REPO, 'config.js')).href);

const [date, ...pairs] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !pairs.length) {
  console.error('usage: archive.mjs <YYYY-MM-DD> <series>=<run-dir> ...'); process.exit(2);
}

// Values to replace, longest first so a value that contains another is replaced whole.
const IDENTITY = /^(ADMIN|ADMIN_EMAIL|USER_EMAIL|USER2_EMAIL|ORG_USER_EMAIL|LOCKOUT_TEST_EMAIL|MULTI_ORG_USER_EMAIL|EUR_USER_EMAIL|TEST_USER_ID)$/;
const SECRET = /password|passwd|token|secret|api[_-]?key|access[_-]?key/i;
const values = Object.entries(process.env)
  .filter(([k, v]) => v && v.length >= 4 && (IDENTITY.test(k) || SECRET.test(k)))
  .sort((a, b) => b[1].length - a[1].length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const home = homedir();
function scrub(text) {
  let t = text;
  for (const [k, v] of values) t = t.replace(new RegExp(escape(v), 'g'), `{{${k}}}`);
  // Any address the env layer does not name -- an agent quotes contacts it found on the deployment.
  t = t.replace(/[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g, '{{EMAIL}}');
  t = t.replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '{{REDACTED_JWT}}');
  t = t.replace(/(Bearer\s+)[\w.-]{16,}/gi, '$1{{REDACTED}}');
  t = t.replace(/("(?:access|refresh|id)_token"\s*:\s*")[^"]+/g, '$1{{REDACTED}}');
  for (const h of [home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')]) t = t.split(h).join('~');
  return t;
}

const dest = join(HERE, 'runs', date);
const raw = join(REPO, 'results', 'kb-ab', date);
let kept = 0; let parked = 0;
function copyTree(src, to, rawTo) {
  mkdirSync(to, { recursive: true });
  for (const n of readdirSync(src)) {
    const p = join(src, n);
    if (statSync(p).isDirectory()) { copyTree(p, join(to, n), join(rawTo, n)); continue; }
    if (n.endsWith('.jsonl')) { mkdirSync(rawTo, { recursive: true }); copyFileSync(p, join(rawTo, n)); parked += 1; continue; }
    writeFileSync(join(to, n), scrub(readFileSync(p, 'utf8'))); kept += 1;
  }
}
for (const pair of pairs) {
  const [series, dir] = pair.split('=');
  copyTree(resolve(dir), join(dest, series), join(raw, series));
  const log = `${resolve(dir)}.log`;
  try { writeFileSync(join(dest, series, 'run.log'), scrub(readFileSync(log, 'utf8'))); kept += 1; } catch { /* no log for this series */ }
}
console.log(`archived ${kept} file(s) to ${dest}`);
console.log(`parked ${parked} raw transcript(s) in ${raw} (gitignored)`);
