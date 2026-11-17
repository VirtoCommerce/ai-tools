import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';

/** Valid TEST_ENV names: lowercase letters, digits and underscores, so `KEY${envSuffix(env)}` is a valid variable name. */
export const TEST_ENV_PATTERN = /^[a-z0-9_]+$/;

/** The suffix that marks a key as one env's own, `_<ENV>` (vcst_qa → `_VCST_QA`), which every loader promotes over `.env.local`. */
export function envSuffix(testEnv) {
  return `_${testEnv.toUpperCase()}`;
}

/**
 * Where the env files are read from: the working directory — except under the $VC_RUN bridge
 * (VC_BRIDGE=1), whose inner side pins VC_FIX_HOME to the project whose vc-secrets declarations were
 * trusted. There the caller's cwd must not choose the stand URLs a token or a password is sent to, so
 * every file below (the selectors, the env's passwords) is read from here, and the loader takes its root from here.
 */
export function envDir() {
  return process.env.VC_BRIDGE === '1' && process.env.VC_FIX_HOME ? process.env.VC_FIX_HOME : '.';
}

/** This Claude Code session's env binding, `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>` (gitignored),
 *  written by `npm run env:use`. Null outside a Claude Code session. Subagents share the session id, so
 *  their shells read the same binding. */
export function sessionEnvFile(sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  return sessionId && /^[A-Za-z0-9-]+$/.test(sessionId) ? join(envDir(), '.vc-fix', 'session-env', sessionId) : null;
}

const readSelector = (file) => (existsSync(file) ? parse(readFileSync(file)).TEST_ENV?.trim() : undefined);

/**
 * The TEST_ENV resolveTestEnv() would pick and what picked it, without side effects:
 * `{ env, source }`, source one of 'TEST_ENV' (the environment), 'session' (this session's binding),
 * '.env.test-env' or 'default'. A TEST_ENV that resolveTestEnv() itself wrote back keeps the source it
 * was resolved from (TEST_ENV_SOURCE), so a child process reports it too.
 */
export function testEnvChoice(fallback = 'vcst') {
  const fromEnv = process.env.TEST_ENV?.trim();
  if (fromEnv) {
    const [env, source] = (process.env.TEST_ENV_SOURCE ?? '').split('|');
    return { env: fromEnv, source: env === fromEnv && source ? source : 'TEST_ENV' };
  }
  const session = sessionEnvFile();
  const bound = session ? readSelector(session) : undefined;
  if (bound) return { env: bound, source: 'session' };
  const checkout = readSelector(join(envDir(), '.env.test-env'));
  if (checkout) return { env: checkout, source: '.env.test-env' };
  return { env: fallback, source: 'default' };
}

/**
 * Resolve the active TEST_ENV. Precedence (highest first):
 *   1. process.env.TEST_ENV         — explicit shell / CI override (e.g. `$env:TEST_ENV='vcptcore'`)
 *   2. this session's binding       — `.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>`, written by
 *                                     `npm run env:use` (a command's env argument): per session, so two
 *                                     sessions in one checkout run two envs and no shared file is edited
 *   3. .env.test-env (gitignored)   — team / per-developer default, set once per checkout
 *   4. the `fallback` arg ('vcst')  — repo default
 *
 * `.env.test-env` (and a binding) is a dotenv-format file containing a single line, e.g.:
 *     TEST_ENV=vcptcore
 *
 * It is read with fs (NOT dotenv's config()) because the env *selector* must be
 * resolved BEFORE any `.env.*` file is layered in — config.js uses the return
 * value to pick which `.env.${TEST_ENV}` to load.
 *
 * Side effect: writes the resolved value back to process.env.TEST_ENV (and what chose it to
 * TEST_ENV_SOURCE) so every consumer (config.js, ci/run-regression.ts, scripts, child processes)
 * agrees on the same value regardless of which entry point ran first.
 *
 * The env's test-account credentials are in the store (./test-accounts.mjs) — on a project that has not
 * migrated, in the legacy `.env.local` / `.env.playwright.<env>` files — and the loader layers both
 * (./env-layers.mjs `layered`); nothing here reads a password.
 *
 * The env's FILES are the loader's business (scripts/lib/env-layers.mjs `applyLayered`): they may live in
 * the project root or in a QA_ENV_PATH folder, and the loader is what warns when none defines the env.
 *
 * @param {string} [fallback='vcst'] repo default when nothing else is set
 * @returns {string} the resolved TEST_ENV
 */
export function resolveTestEnv(fallback = 'vcst') {
  const { env: testEnv, source } = testEnvChoice(fallback);
  process.env.TEST_ENV = testEnv; // normalize for all downstream readers
  process.env.TEST_ENV_SOURCE = `${testEnv}|${source}`;
  return testEnv;
}
