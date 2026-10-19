// plugins/vc-fix/scripts/lib/session-env.mjs — bind THIS Claude Code session to an env (and report it), for
// scripts/env/use-env.mjs and scripts/env/run-folder.mjs. The plugin's own variant of the ai-tools repo's
// scripts/lib/session-env.mjs (the plugin is self-contained): the same binding rules, a report without the
// --secrets file line (this plugin ships no browser-secrets library).
//
// The binding is `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>`, read by resolveTestEnv() between TEST_ENV and
// .env.test-env (scripts/lib/resolve-test-env.js). Files are cwd-relative, as resolveTestEnv's are.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'dotenv';
import { TEST_ENV_PATTERN, sessionEnvFile, testEnvChoice } from './resolve-test-env.js';
import { loadLayeredEnv } from './load-layered-env.mjs';

/** A refusal the CLI prints and exits 2 on. */
export class BindError extends Error {}

/** A binding untouched this long belongs to a session that has ended. */
const STALE_DAYS = 30;

export function knownEnvs() {
  return readdirSync('.').map((f) => /^\.env\.([a-z0-9_]+)$/.exec(f)?.[1])
    .filter((n) => n && !['local', 'defaults', 'backup'].includes(n)).sort();
}

/** Bind this session to `requested`, else to what it resolves without a binding. Null outside a session when
 *  nothing was requested. Throws BindError: unknown env, no session for a requested env, or a beating TEST_ENV. */
export function bindSessionEnv(requested, { reason = requested ? 'argument' : 'default' } = {}) {
  const file = sessionEnvFile();
  if (!file) {
    if (requested) throw new BindError('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID). Outside one: TEST_ENV=<env> for a command, or TEST_ENV=<env> in .env.test-env for the project.');
    return null;
  }
  const shell = process.env.TEST_ENV?.trim();
  const checkout = existsSync('.env.test-env') ? parse(readFileSync('.env.test-env')).TEST_ENV?.trim() : undefined;
  const env = requested ?? (shell || checkout || 'vcst');
  if (!TEST_ENV_PATTERN.test(env) || !existsSync(`.env.${env}`)) throw new BindError(`unknown env "${env}" — there is no .env.${env}. Known: ${knownEnvs().join(', ')}`);
  if (shell && shell !== env) {
    throw new BindError(`this session's environment sets TEST_ENV=${shell}, which beats a session binding: the run would still use ${shell}. ` +
      'Start Claude Code from a shell without TEST_ENV, or run this on that env.');
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `# This Claude Code session's env: ${reason}, ${new Date().toISOString()}\nTEST_ENV=${env}\n`);
  pruneStale(dirname(file));
  return env;
}

export function clearSessionEnv() {
  const file = sessionEnvFile();
  if (!file || !existsSync(file)) return false;
  rmSync(file);
  return true;
}

/** The env this session resolves and what chose it, with its URLs; loads the env into process.env. */
export function describeSessionEnv() {
  const { source } = testEnvChoice('vcst');
  const testEnv = loadLayeredEnv('vcst');
  const shown = sessionEnvFile()?.replace(/\\/g, '/');
  const why = { TEST_ENV: 'TEST_ENV in the environment', session: `this session's binding (${shown})`, '.env.test-env': '.env.test-env', default: 'the default' }[source];
  const lines = [`TEST_ENV=${testEnv} — ${why}`];
  for (const key of ['BACK_URL', 'FRONT_URL', 'ENV_RISK']) lines.push(`  ${key.padEnd(9)} ${process.env[key] ?? '(unset)'}`);
  return { testEnv, lines };
}

export function pruneStale(dir) {
  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try { if (statSync(p).mtimeMs < cutoff) rmSync(p); } catch { /* another session removed it */ }
  }
}
