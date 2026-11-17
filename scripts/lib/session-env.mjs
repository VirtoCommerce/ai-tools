// scripts/lib/session-env.mjs — bind THIS Claude Code session to an env (and report it), for
// `npm run env:use` (scripts/env/use-env.mjs) and `npm run run:use` (scripts/env/run-folder.mjs).
//
// The binding is `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>`, read by resolveTestEnv() between TEST_ENV and
// .env.test-env (scripts/lib/resolve-test-env.js). Files are cwd-relative, as resolveTestEnv's are. An env is what
// scripts/lib/env-layers.mjs `findEnv` finds: the project root's `.env.<env>`, or one in a QA_ENV_PATH folder (a
// ticket's folder is filled with the run's ticket).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'dotenv';
import { envSuffix, sessionEnvFile, testEnvChoice } from './resolve-test-env.js';
import { loadEnv } from './load-env.mjs';
import { laneDrift, laneSecrets, readLaneManifests } from './browser-secrets.mjs';
import { MASTER_NAME, findEnv, knownEnvs as rootEnvs, lookedIn } from './env-layers.mjs';
import { STORE_FILE } from './test-accounts.mjs';

/** A refusal the CLI prints and exits 2 on. */
export class BindError extends Error {}

/** A binding untouched this long belongs to a session that has ended. */
const STALE_DAYS = 30;

/** Envs the project root has a `.env.<env>` for (an error lists these; a QA_ENV_PATH folder's are not listed). */
export function knownEnvs() {
  return rootEnvs('.');
}

/**
 * Bind this session to `requested`, or (no `requested`) to what it resolves without a binding: TEST_ENV,
 * .env.test-env, vcst. Returns the env bound, or null outside a Claude Code session when no env was
 * requested. Throws BindError: an unknown env, no session for a requested env, or a TEST_ENV in the session's
 * environment that would beat the binding. `ticket` fills QA_ENV_PATH's `<ticket>` (run:use passes its own;
 * default: QA_TICKET, else the session's bound run).
 */
export function bindSessionEnv(requested, { reason = requested ? 'argument' : 'default', ticket } = {}) {
  const file = sessionEnvFile();
  if (!file) {
    if (requested) throw new BindError('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID). Outside one: TEST_ENV=<env> for a command, or TEST_ENV=<env> in .env.test-env for the checkout.');
    return null;
  }
  const shell = process.env.TEST_ENV?.trim();
  const checkout = existsSync('.env.test-env') ? parse(readFileSync('.env.test-env')).TEST_ENV?.trim() : undefined;
  const env = requested ?? (shell || checkout || 'vcst');
  if (!findEnv(env, { ticket })) throw new BindError(`unknown env "${env}" — there is no .env.${env} in ${lookedIn(env, { ticket })}. Known: ${knownEnvs().join(', ')}`);
  if (shell && shell !== env) {
    throw new BindError(`this session's environment sets TEST_ENV=${shell}, which beats a session binding: the run would still use ${shell}. ` +
      'Start Claude Code from a shell without TEST_ENV, or run this on that env.');
  }
  const before = existsSync(file) ? parse(readFileSync(file)).TEST_ENV?.trim() : undefined;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `# This Claude Code session's env: ${reason}, ${new Date().toISOString()}\nTEST_ENV=${env}\n`);
  pruneStale(dirname(file));
  // No env named: the default can move a session off the stand it was on (a ticket's own stand to a shared one) —
  // say so, so the run never lands on another stand silently.
  if (!requested && before && before !== env) console.log(`⚠ this session was on ${before}; it is now bound to ${env}, the default. Pass an env to stay on ${before}.`);
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
 * env into process.env as a side effect. `ticket`: as bindSessionEnv's.
 */
export function describeSessionEnv({ ticket } = {}) {
  const { source } = testEnvChoice('vcst');
  const { testEnv, sourceOf, dedicated, master } = loadEnv({ fallback: 'vcst', ticket });
  const shown = sessionEnvFile()?.replace(/\\/g, '/');
  const why = { TEST_ENV: 'TEST_ENV in the environment', session: `this session's binding (${shown})`, '.env.test-env': '.env.test-env', default: 'the default' }[source];
  const lines = [`TEST_ENV=${testEnv} — ${why}`];
  for (const key of ['BACK_URL', 'FRONT_URL', 'ENV_RISK']) lines.push(`  ${key.padEnd(9)} ${process.env[key] ?? '(unset)'}  (${sourceOf(key)})`);
  if (dedicated.length) lines.push(`  dedicated files (they beat the project root's): ${dedicated.map((f) => f.replace(/\\/g, '/')).join(', ')}`);

  // The lanes hold every env's passwords from the store as NAME_<ENV> (scripts/lanes/playwright-lane.mjs); a running
  // lane started before the store changed for this env types old values — say so.
  const reconnect = 'reconnect playwright-* in /mcp (not while browser suites run)';
  if (master && !master.found) lines.push(`  ⚠ passwords: ${testEnv} says PASSWORDS=master, but ${STORE_FILE} has no "master" — add it, then ${reconnect}`);
  else if (master) lines.push(`  passwords: type ${MASTER_NAME} in every password field — ${testEnv} uses the master password (PASSWORDS=master)`);
  else lines.push(`  passwords: type NAME${envSuffix(testEnv)} — the lanes hold ${STORE_FILE}'s values for every env`);
  const manifests = readLaneManifests('.');
  if (!manifests.length) {
    lines.push('  ⚠ lanes: no playwright-* lane started by scripts/lanes/playwright-lane.mjs is running — npm run creds:migrate, then restart Claude Code');
  } else {
    const current = laneSecrets('.').secrets;
    const mine = (n) => (master ? n === MASTER_NAME : n.endsWith(envSuffix(testEnv)));
    const behind = [...new Set(manifests.filter((m) => { const d = laneDrift(m, current); return [...d.stale, ...d.absent].some(mine); }).map((m) => m.lane))];
    if (behind.length) lines.push(`  ⚠ lanes: ${behind.join(', ')} started before ${STORE_FILE} changed for ${testEnv} — ${reconnect}`);
    else if (!master && !manifests.some((m) => (m.envs ?? []).includes(testEnv))) lines.push(`  ⚠ lanes: the running lanes hold no ${testEnv} password — add its accounts to ${STORE_FILE}, then ${reconnect}`);
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
