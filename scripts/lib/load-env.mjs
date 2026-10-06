import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTestEnv } from './resolve-test-env.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The layered env contract, for scripts that must not import config.js:
 *
 *   .env.defaults → .env.${TEST_ENV} → .env.local   (later wins; the last two also beat the shell)
 *   then every `KEY_<ENV>` is promoted over `KEY`  (so a pin in .env.${TEST_ENV} beats .env.local)
 *
 * Same precedence as config.js, without its validation: config.js exits when a CORE variable
 * (ADMIN_PASSWORD, USER_EMAIL, …) is missing, and a script that needs only BACK_URL has to keep
 * working on a fresh clone and in CI. Scripts that avoided config.js for that reason hand-rolled
 * the load, and two of them left the promotion out — refresh-graphql-schema.mjs and
 * validate-graphql-fixtures.ts introspected `.env.local`'s localhost on TEST_ENV=vcptcore_dev
 * despite its BACK_URL_VCPTCORE_DEV pin. Call this instead of copying the loop again.
 *
 * TEST_ENV comes from resolveTestEnv() (process.env > .env.test-env > fallback), which also
 * exposes `.env.playwright.${TEST_ENV}` as `KEY_<ENV>` and warns about an un-pinned `.env.local`
 * override. It reads its files from the cwd; the three layers here are read from the repo root.
 * Never exits.
 *
 * @param {{ fallback?: string }} [options] TEST_ENV to use when nothing selects one
 * @returns {{ testEnv: string, promoted: Set<string>, sourceOf: (key: string) => string }}
 *   `promoted` holds the base keys that took a `KEY_<ENV>` value; `sourceOf(key)` names what
 *   supplied a key's current value, e.g. 'BACK_URL from .env.local' or
 *   'BACK_URL_VCPTCORE_DEV from .env.vcptcore_dev' — print it next to any target you act on.
 */
export function loadEnv({ fallback = 'vcst' } = {}) {
  const testEnv = resolveTestEnv(fallback);
  const layers = [];
  for (const [file, override] of [['.env.defaults', false], [`.env.${testEnv}`, true], ['.env.local', true]]) {
    const { parsed } = config({ path: resolve(ROOT, file), override, quiet: true });
    layers.push({ file, parsed: parsed ?? {} });
  }

  const suffix = `_${testEnv.toUpperCase()}`;
  const promoted = new Set();
  for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith(suffix) && value) {
      const base = key.slice(0, -suffix.length);
      process.env[base] = value;
      promoted.add(base);
    }
  }

  // The last layer holding the live value is the one that set it: each later layer overrides.
  const origin = (key) =>
    layers.findLast(({ parsed }) => parsed[key] !== undefined && parsed[key] === process.env[key])?.file
    ?? 'the process environment';
  const sourceOf = (key) => {
    if (promoted.has(key)) return `${key}${suffix} from ${origin(key + suffix)}`;
    return process.env[key] === undefined ? `${key} is unset` : `${key} from ${origin(key)}`;
  };

  return { testEnv, promoted, sourceOf };
}
