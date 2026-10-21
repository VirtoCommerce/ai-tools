import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';

/**
 * Resolve the active TEST_ENV. Precedence (highest first):
 *   1. process.env.TEST_ENV         — explicit shell / CI override (e.g. `$env:TEST_ENV='vcptcore'`)
 *   2. .env.test-env (gitignored)   — team / per-developer default, set once per checkout
 *   3. the `fallback` arg ('vcst')  — repo default
 *
 * `.env.test-env` is a dotenv-format file containing a single line, e.g.:
 *     TEST_ENV=vcptcore
 *
 * It is read with fs (NOT dotenv's config()) because the env *selector* must be
 * resolved BEFORE any `.env.*` file is layered in — config.js uses the return
 * value to pick which `.env.${TEST_ENV}` to load.
 *
 * Side effect: writes the resolved value back to process.env.TEST_ENV so every
 * consumer (config.js, ci/run-regression.ts, scripts) agrees on the same value
 * regardless of which entry point ran first.
 *
 * @param {string} [fallback='vcst'] repo default when nothing else is set
 * @returns {string} the resolved TEST_ENV
 */
/**
 * Where the env files are read from: the working directory — except under the $VC_RUN bridge
 * (VC_BRIDGE=1), whose inner side pins VC_FIX_HOME to the project whose vc-secrets declarations were
 * trusted. There the caller's cwd must not choose the stand URLs a token or a password is sent to.
 */
export function envDir() {
  return process.env.VC_BRIDGE === '1' && process.env.VC_FIX_HOME ? process.env.VC_FIX_HOME : '.';
}

export function resolveTestEnv(fallback = 'vcst') {
  let testEnv = process.env.TEST_ENV?.trim();
  const selector = join(envDir(), '.env.test-env');
  if (!testEnv && existsSync(selector)) {
    testEnv = parse(readFileSync(selector)).TEST_ENV?.trim();
  }
  testEnv = testEnv || fallback;
  process.env.TEST_ENV = testEnv; // normalize for all downstream readers
  return testEnv;
}
