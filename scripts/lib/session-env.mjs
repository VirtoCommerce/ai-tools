// scripts/lib/session-env.mjs — bind THIS Claude Code session to an env (and report it), for
// `npm run env:use` (scripts/env/use-env.mjs) and `npm run run:use` (scripts/env/run-folder.mjs).
//
// The binding is `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>`, read by resolveTestEnv() between TEST_ENV and
// .env.test-env (scripts/lib/resolve-test-env.js). Files are cwd-relative, as resolveTestEnv's are.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse } from 'dotenv';
import { TEST_ENV_PATTERN, envSuffix, sessionEnvFile, testEnvChoice } from './resolve-test-env.js';
import { loadEnv } from './load-env.mjs';
import { declaredSecretsFile, readSecretsFile } from './browser-secrets.mjs';

/** A refusal the CLI prints and exits 2 on. */
export class BindError extends Error {}

/** A binding untouched this long belongs to a session that has ended. */
const STALE_DAYS = 30;

/** Envs this checkout has a `.env.<env>` for. */
export function knownEnvs() {
  return readdirSync('.').map((f) => /^\.env\.([a-z0-9_]+)$/.exec(f)?.[1])
    .filter((n) => n && !['local', 'defaults', 'backup'].includes(n)).sort();
}

/**
 * Bind this session to `requested`, or (no `requested`) to what it resolves without a binding: TEST_ENV,
 * .env.test-env, vcst. Returns the env bound, or null outside a Claude Code session when no env was
 * requested. Throws BindError: an unknown env, no session for a requested env, or a TEST_ENV in the session's
 * environment that would beat the binding.
 */
export function bindSessionEnv(requested, { reason = requested ? 'argument' : 'default' } = {}) {
  const file = sessionEnvFile();
  if (!file) {
    if (requested) throw new BindError('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID). Outside one: TEST_ENV=<env> for a command, or TEST_ENV=<env> in .env.test-env for the checkout.');
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

/** Remove this session's env binding; true when there was one. */
export function clearSessionEnv() {
  const file = sessionEnvFile();
  if (!file || !existsSync(file)) return false;
  rmSync(file);
  return true;
}

/**
 * What this session resolves now, as the lines a dispatch brief needs: the env and what chose it, its URLs with
 * their source, and how the lanes type its passwords (a ⚠ line when they would type another env's). Loads the
 * env into process.env as a side effect.
 */
export function describeSessionEnv() {
  const { source } = testEnvChoice('vcst');
  const { testEnv, sourceOf } = loadEnv({ fallback: 'vcst' });
  const shown = sessionEnvFile()?.replace(/\\/g, '/');
  const why = { TEST_ENV: 'TEST_ENV in the environment', session: `this session's binding (${shown})`, '.env.test-env': '.env.test-env', default: 'the default' }[source];
  const lines = [`TEST_ENV=${testEnv} — ${why}`];
  for (const key of ['BACK_URL', 'FRONT_URL', 'ENV_RISK']) lines.push(`  ${key.padEnd(9)} ${process.env[key] ?? '(unset)'}  (${sourceOf(key)})`);

  const declared = declaredSecretsFile('.');
  const secrets = declared ? readSecretsFile('.', declared) : readSecretsFile('.');
  const lanes = basename(secrets.path);
  if (!secrets.exists) lines.push(`  passwords: the lanes' --secrets file ${lanes} does not exist — npm run secrets:sync (one env) or secrets:sync:all (every env)`);
  else if (secrets.envs) {
    lines.push(secrets.envs.includes(testEnv)
      ? `  passwords: type NAME${envSuffix(testEnv)} — the lanes read ${lanes}`
      : `  ⚠ passwords: the lanes' ${lanes} has no ${testEnv} (it covers ${secrets.envs.join(', ') || 'none'}) — npm run secrets:sync:all, then reconnect playwright-* in /mcp`);
  } else {
    lines.push(secrets.env === testEnv
      ? `  passwords: type the bare NAME — the lanes read ${lanes}, generated for ${testEnv}`
      : `  ⚠ passwords: the lanes read ${lanes}, generated for ${secrets.env ?? 'an unstamped env'} — a sign-in on ${testEnv} would type that env's passwords. ` +
        'For sessions on several envs: npm run secrets:sync:all, and point --secrets at .env.playwright.all');
  }
  return { testEnv, sourceOf, lines };
}

/** Delete bindings no session has written for STALE_DAYS (sessions end; their files would pile up). */
export function pruneStale(dir) {
  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try { if (statSync(p).mtimeMs < cutoff) rmSync(p); } catch { /* another session removed it */ }
  }
}
