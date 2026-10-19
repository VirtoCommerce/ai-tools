import { existsSync, readFileSync } from 'node:fs';
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
export function resolveTestEnv(fallback = 'vcst') {
  let testEnv = process.env.TEST_ENV?.trim();
  if (!testEnv && existsSync('.env.test-env')) {
    testEnv = parse(readFileSync('.env.test-env')).TEST_ENV?.trim();
  }
  testEnv = testEnv || fallback;
  process.env.TEST_ENV = testEnv; // normalize for all downstream readers
  return testEnv;
}
