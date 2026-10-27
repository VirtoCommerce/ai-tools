// plugins/vc-fix/scripts/lib/session-env.mjs — bind THIS Claude Code session to an env (and report it), for
// scripts/env/use-env.mjs and scripts/env/run-folder.mjs. The plugin's own variant of the ai-tools repo's
// scripts/lib/session-env.mjs (the plugin is self-contained): the same binding rules, a report without the
// --secrets file line (this plugin ships no browser-secrets library).
//
// The binding is `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>`, read by resolveTestEnv() between TEST_ENV and
// .env.test-env (scripts/lib/resolve-test-env.js). Files are cwd-relative, as resolveTestEnv's are. An env is what
// ./env-layers.mjs `findEnv` finds: the project's `.env.<env>`, or one in a QA_ENV_PATH folder.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'dotenv';
import { sessionEnvFile, testEnvChoice } from './resolve-test-env.js';
import { loadLayeredEnv } from './load-layered-env.mjs';
import { MASTER_NAME, findEnv, knownEnvs as rootEnvs, lookedIn, usesMaster } from './env-layers.mjs';

/** A refusal the CLI prints and exits 2 on. */
export class BindError extends Error {}

/** A binding untouched this long belongs to a session that has ended. */
const STALE_DAYS = 30;

/** Envs the project root has a `.env.<env>` for (an error lists these). */
export function knownEnvs() {
  return rootEnvs('.');
}

/** Bind this session to `requested`, else to what it resolves without a binding. Null outside a session when
 *  nothing was requested. Throws BindError: unknown env, no session for a requested env, or a beating TEST_ENV.
 *  `ticket` fills QA_ENV_PATH's `<ticket>` (default: QA_TICKET, else the session's bound run). */
export function bindSessionEnv(requested, { reason = requested ? 'argument' : 'default', ticket } = {}) {
  const file = sessionEnvFile();
  if (!file) {
    if (requested) throw new BindError('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID). Outside one: TEST_ENV=<env> for a command, or TEST_ENV=<env> in .env.test-env for the project.');
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
  // No env named: the default can move a session off the stand it was on — say so, never silently.
  if (!requested && before && before !== env) console.log(`⚠ this session was on ${before}; it is now bound to ${env}, the default. Pass an env to stay on ${before}.`);
  return env;
}

export function clearSessionEnv() {
  const file = sessionEnvFile();
  if (!file || !existsSync(file)) return false;
  rmSync(file);
  return true;
}

/** The env this session resolves and what chose it, with its URLs; loads the env into process.env. On a master stand,
 *  the one name a lane types for every password. `ticket`: as bindSessionEnv's. */
export function describeSessionEnv({ ticket } = {}) {
  const { source } = testEnvChoice('vcst');
  const testEnv = loadLayeredEnv('vcst', { ticket });
  const shown = sessionEnvFile()?.replace(/\\/g, '/');
  const why = { TEST_ENV: 'TEST_ENV in the environment', session: `this session's binding (${shown})`, '.env.test-env': '.env.test-env', default: 'the default' }[source];
  const lines = [`TEST_ENV=${testEnv} — ${why}`];
  for (const key of ['BACK_URL', 'FRONT_URL', 'ENV_RISK']) lines.push(`  ${key.padEnd(9)} ${process.env[key] ?? '(unset)'}`);
  if (usesMaster(process.env)) lines.push(`  passwords: type ${MASTER_NAME} in every password field — ${testEnv} uses the master password (PASSWORDS=master)`);
  return { testEnv, lines };
}

export function pruneStale(dir) {
  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try { if (statSync(p).mtimeMs < cutoff) rmSync(p); } catch { /* another session removed it */ }
  }
}
