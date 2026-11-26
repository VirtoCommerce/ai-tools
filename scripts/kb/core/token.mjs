// The write token: from the environment (vc-secrets puts it there), else from `.env.local`.
//
// WHY NOT `import './config.js'`, and the reason is not stylistic:
//
//   * `config.js` writes `[config] TEST_ENV=… ENV_RISK=…` to STDOUT at import. `kb push --json`
//     would then emit a line before its JSON — and the MCP server, whose stdout IS the JSON-RPC
//     channel, would have its protocol corrupted by the import itself.
//   * `config.js` calls `process.exit(1)` when CORE env vars are missing. A knowledge base must not
//     die because an unrelated variable for a different subsystem is unset; reading is free and
//     tokenless by design (PLAN §6.4), and a tool that exits before answering has broken that.
//   * it resolves `.env.local` relative to `process.cwd()`, and `kb` is invoked from wherever the
//     agent happens to be — so the file is found from this module's own location instead.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
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

/** The names the push accepts, scoped one first: a token for one public repository beats the shared one. */
const TOKEN_NAMES = ['KB_GITHUB_TOKEN', 'GITHUB_TOKEN'];

const clean = (v) => (v && String(v).trim() ? String(v).trim() : null);

/**
 * The token the push uses. TWO sources — the process environment (where vc-secrets puts it:
 * `vc-secrets run kb`, `... task kb-push`, plugins/vc-secrets/README.md; and where CI passes one),
 * then `.env.local`, the fallback for a machine without vc-secrets.
 *
 * THE NAME DECIDES FIRST, THEN THE SOURCE: `KB_GITHUB_TOKEN` from either source beats `GITHUB_TOKEN`
 * from either. Source-first would let a shell's shared `GITHUB_TOKEN` (every `gh` user has one, so
 * does CI) silently override a token kept for the base in `.env.local` — and push with a token that
 * may have no write on `vc-knowledge`. Within one name the environment wins, so a token moved into
 * vc-secrets is used even while an old copy is still in `.env.local`.
 *
 * No other `.env.*` layer is read: a token belongs in neither the committed per-env files nor the
 * legacy `.env`. ABSENT IS NOT AN ERROR (PLAN §6.4): reading works without it, the queue is durable,
 * and the first later session with a token pushes what this one queued.
 */
export function writeToken(env = process.env) {
  let local = null;
  for (const name of TOKEN_NAMES) {
    const v = clean(env[name]);
    if (v) return { token: v, from: `env:${name}` };
    local ??= readMap(join(repoRoot(env), '.env.local'));
    const f = clean(local.get(name));
    if (f) return { token: f, from: `.env.local:${name}` };
  }
  return { token: null, from: null };
}

/**
 * Does a vc-secrets declaration name this `servers` / `tasks` entry? Then the token reaches the kb
 * through the launcher (`node $VC_SECRETS run kb`, `... task kb-push`), not through a file — the
 * repo's rule for every token (CLAUDE.md §Project Overview, `plugins/vc-secrets/README.md`).
 * Existence only: the launcher, not this, validates the declaration and resolves the secret.
 */
export function vcSecretsDeclares(kind, name, env = process.env) {
  const home = env.HOME || env.USERPROFILE || homedir();
  for (const file of [
    join(repoRoot(env), '.claude', 'vc-secrets.local.json'),
    join(repoRoot(env), '.claude', 'vc-secrets.json'),
    join(home, '.claude', 'vc-secrets.json'),
  ]) {
    try { if (JSON.parse(readFileSync(file, 'utf8'))?.[kind]?.[name]) return true; } catch { /* absent or unreadable */ }
  }
  return false;
}
