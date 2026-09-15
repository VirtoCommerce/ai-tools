// Env resolution. There is no config.js here, so the layering is implemented rather than
// imported — and it is implemented to the same contract the deployments already use:
//
//   .env.defaults  ->  .env.${TEST_ENV}  ->  .env.local     (later wins)
//
// plus the suffix promotion: with TEST_ENV=localhost, ADMIN_PASSWORD_LOCALHOST becomes
// ADMIN_PASSWORD. That promotion is not decoration -- an identity and its secret routinely
// live in different layers, so reading one file gives half an answer.
//
// A kebab-case TEST_ENV silently breaks the promotion (the suffix cannot be formed), so it
// is rejected loudly instead.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function parse(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

export function loadEnv({ root = process.cwd(), testEnv = process.env.TEST_ENV } = {}) {
  if (!testEnv) {
    throw new Error(
      'TEST_ENV is not set and there is no .env.test-env in this workbench. ' +
      'Pass --env <name> or set TEST_ENV explicitly; guessing an environment is how a run ' +
      'reports facts from a deployment nobody named.'
    );
  }
  if (!/^[a-z0-9_]+$/.test(testEnv)) {
    throw new Error(
      `TEST_ENV="${testEnv}" is not [a-z0-9_]+. A kebab-case value breaks the ` +
      `KEY_<ENV_UPPER> promotion silently, which is worse than failing here.`
    );
  }

  const layers = ['.env.defaults', `.env.${testEnv}`, '.env.local'];
  const merged = {};
  const seen = [];
  for (const name of layers) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    seen.push(name);
    Object.assign(merged, parse(readFileSync(p, 'utf8')));
  }
  if (seen.length === 0) throw new Error(`no env layer found under ${root}`);

  // suffix promotion, applied after the merge so a promoted value beats every layer
  const suffix = '_' + testEnv.toUpperCase();
  const promoted = [];
  for (const [k, v] of Object.entries(merged)) {
    if (k.endsWith(suffix) && k.length > suffix.length) {
      merged[k.slice(0, -suffix.length)] = v;
      promoted.push(k);
    }
  }

  // process.env wins over every file: an explicit shell override is always the operator speaking
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) merged[k] = v;

  return { env: merged, testEnv, layers: seen, promoted: promoted.sort() };
}

// Read a key and say so when it is absent. `merged[k] ?? ''` is the shape that turns a missing
// deployment URL into a request against the empty string, which fails somewhere else entirely.
export function require_(env, key, why) {
  const v = env[key];
  if (v === undefined || v === '') throw new Error(`${key} is not set in any env layer (needed: ${why})`);
  return v;
}
