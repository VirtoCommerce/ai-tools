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
 * Second side effect: the env's own secrets file, `.env.playwright.${TEST_ENV}`
 * (gitignored), is exposed as `KEY_${TEST_ENV.toUpperCase()}`. Every loader already
 * promotes that suffix over `.env.local`, so the file acts exactly like hand-written
 * `KEY_<ENV>=` lines in `.env.local` — and it is the same file the Playwright MCP
 * servers take as `--secrets`. A `KEY_<ENV>` that is already set is left alone.
 *
 * It also warns, once per run (child processes inherit the mark), about the two
 * silent ways an env goes wrong: no `.env.${TEST_ENV}` at all (a typo), and a
 * `.env.local` value overriding the env's own URL or risk class — `.env.local`
 * loads last for EVERY env, so a localhost BACK_URL there sends every env to localhost.
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
  exposeEnvSecrets(testEnv);
  warnOnce(testEnv);
  return testEnv;
}

function exposeEnvSecrets(testEnv) {
  const file = `.env.playwright.${testEnv}`;
  if (!existsSync(file)) return;
  const suffix = `_${testEnv.toUpperCase()}`;
  for (const [key, value] of Object.entries(parse(readFileSync(file)))) {
    if (value && process.env[key + suffix] === undefined) process.env[key + suffix] = value;
  }
}

/** Keys whose `.env.local` override of the env's own value is almost always a mistake. */
const ENV_OWNED = ['BACK_URL', 'FRONT_URL', 'ENV_RISK'];

function warnOnce(testEnv) {
  if (process.env.TEST_ENV_CHECKED === testEnv) return;
  process.env.TEST_ENV_CHECKED = testEnv;
  const envFile = `.env.${testEnv}`;
  if (!existsSync(envFile)) {
    console.warn(`[env] TEST_ENV=${testEnv} but ${envFile} does not exist — only .env.defaults and .env.local apply. Typo?`);
    return;
  }
  if (!existsSync('.env.local')) return;
  const own = parse(readFileSync(envFile));
  const local = parse(readFileSync('.env.local'));
  const suffix = `_${testEnv.toUpperCase()}`;
  for (const key of ENV_OWNED) {
    // A `KEY_<ENV>` anywhere is promoted over .env.local, so the override never takes effect.
    const pinned = own[key + suffix] || local[key + suffix] || process.env[key + suffix];
    if (!pinned && own[key] && local[key] && own[key] !== local[key]) {
      console.warn(`[env] .env.local sets ${key}=${local[key]}, overriding ${envFile} (${own[key]}) — .env.local loads last for every TEST_ENV. Move it out, or pin ${key}${suffix}= in ${envFile}.`);
    }
  }
}
