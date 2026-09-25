// The write token, and why this file exists instead of `import './config.js'`.
//
// PLAN §6.4 says to resolve the token "through the layered loader … via `process.env` after
// importing `config.js`, never off a single layer". The RULE is right and is obeyed here: a
// variable's value can come from any of `.env.defaults`, `.env.${TEST_ENV}` or `.env.local`, so
// reading one layer and concluding is how a working credential gets reported as absent. THE
// MECHANISM IS NOT USABLE FROM THIS TOOL, and the reason is not stylistic:
//
//   * `config.js` writes `[config] TEST_ENV=… ENV_RISK=…` to STDOUT at import. `kb push --json`
//     would then emit a line before its JSON — and session 4's MCP server, whose stdout IS the
//     JSON-RPC channel, would have its protocol corrupted by the import itself.
//   * `config.js` calls `process.exit(1)` when CORE env vars are missing. A knowledge base must not
//     die because an unrelated variable for a different subsystem is unset; reading is free and
//     tokenless by design (PLAN §6.4), and a tool that exits before answering has broken that.
//   * it resolves `.env.defaults` and friends relative to `process.cwd()`, and `kb` is invoked from
//     wherever the agent happens to be.
//
// So the LAYER ORDER is reproduced here, exactly as `config.js` applies it, against the repo root
// resolved from this module's own location. Same precedence, no stdout, no exit, no cwd.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repo root, from this file's location — never `process.cwd()`. */
export const repoRoot = (env = process.env) => env.VC_ENV_ROOT
  || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** `KEY=value` out of one env file, quotes stripped. No interpolation: none of these values use it. */
export function parseEnvFile(text) {
  const out = new Map();
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const e = l.indexOf('=');
    if (e < 1) continue;
    let v = l.slice(e + 1).trim();
    const q = v.charAt(0);
    if ((q === '"' || q === "'") && v.endsWith(q) && v.length > 1) v = v.slice(1, -1);
    out.set(l.slice(0, e).trim(), v);
  }
  return out;
}

const readMap = (file) => {
  try { return parseEnvFile(readFileSync(file, 'utf8')); } catch { return new Map(); }
};

/**
 * One variable, resolved across the layers in the repo's documented order.
 *
 * `.env.defaults` and the legacy `.env` do NOT override what is already in the environment;
 * `.env.${TEST_ENV}` and `.env.local` do. That is `config.js`'s precedence, reproduced rather than
 * reinvented — if the two ever disagree, a credential that works for every other tool in the repo
 * would appear broken here alone, which is the most expensive way to be wrong about a token.
 */
export function resolveVar(name, env = process.env) {
  const root = repoRoot(env);
  const testEnv = env.TEST_ENV || 'vcst';
  let value = env[name] ?? null;
  for (const [file, override] of [
    [join(root, '.env.defaults'), false],
    [join(root, `.env.${testEnv}`), true],
    [join(root, '.env.local'), true],
    [join(root, '.env'), false],
  ]) {
    const v = readMap(file).get(name);
    if (v == null || v === '') continue;
    if (override || value == null || value === '') value = v;
  }
  return value && String(value).trim() ? String(value).trim() : null;
}

/**
 * The token the push uses.
 *
 * `KB_GITHUB_TOKEN` first, so an operator can point the knowledge base at a least-privilege token
 * scoped to one public repository without touching the shared `GITHUB_TOKEN` every other tool here
 * depends on. ABSENT IS NOT AN ERROR (PLAN §6.4): reading works without it, the queue is durable,
 * and the first later session with a token pushes what this one queued.
 */
export function writeToken(env = process.env) {
  for (const name of ['KB_GITHUB_TOKEN', 'GITHUB_TOKEN']) {
    const v = resolveVar(name, env);
    if (v) return { token: v, from: name };
  }
  return { token: null, from: null };
}
