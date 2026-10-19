import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTestEnv } from './resolve-test-env.js';
import { applyLayered } from './env-layers.mjs';
import { ROLE_PASSWORD_NAMES } from './env-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The layered env contract, for scripts that must not import config.js:
 *
 *   .env.defaults → .env.${TEST_ENV} → .env.local   (later wins; the last two also beat the shell)
 *   then every `KEY_<ENV>` is promoted over `KEY`  (so a pin in .env.${TEST_ENV} beats .env.local)
 *   then the env's files in the QA_ENV_PATH folders (dedicated beats the root, key by key)
 *   then, on a PASSWORDS=master stand, the master password for every test account
 *
 * The order itself is scripts/lib/env-layers.mjs `layered`, the one every loader applies — config.js too. Same
 * precedence as config.js, without its validation: config.js exits when a CORE variable (ADMIN_PASSWORD,
 * USER_EMAIL, …) is missing, and a script that needs only BACK_URL has to keep working on a fresh clone and in CI.
 * Scripts that avoided config.js for that reason hand-rolled the load, and two of them left the promotion out —
 * refresh-graphql-schema.mjs and validate-graphql-fixtures.ts introspected `.env.local`'s localhost on
 * TEST_ENV=vcptcore_dev despite its BACK_URL_VCPTCORE_DEV pin. Call this instead of copying the loop again.
 *
 * TEST_ENV comes from resolveTestEnv() (process.env > the session's binding > .env.test-env > fallback). The
 * layers are read from the repo root. Never exits; warns once when no file defines the env.
 *
 * `ambientWins` is for runners that CI drives with `-e` (ci/run-regression.ts, ci/run-monitor.ts): what
 * the process environment already held beats every file and every file's pin, and the files only fill
 * the gaps — config.js's documented intent for CI ("process.env wins"), which its overrides do not do.
 *
 * @param {{ fallback?: string, ambientWins?: boolean, root?: string, ticket?: string | null }} [options] `fallback`:
 *   TEST_ENV to use when nothing selects one; `ticket`: the run's ticket for QA_ENV_PATH's `<ticket>` (default: QA_TICKET,
 *   else the session's bound run)
 * @returns {{ testEnv: string, promoted: Set<string>, sourceOf: (key: string) => string, ticket: string | null,
 *   dedicated: string[], master: null | { file: string, found: boolean, names: string[] } }}
 *   `promoted` holds the base keys that took this env's own value (a `KEY_<ENV>` pin, a dedicated file, the master
 *   password); `sourceOf(key)` names what supplied a key's current value, e.g. 'BACK_URL from .env.local' or
 *   'BACK_URL_VCPTCORE_DEV from .env.vcptcore_dev' — print it next to any target you act on.
 */
export function loadEnv({ fallback = 'vcst', ambientWins = false, root = ROOT, ticket } = {}) {
  return loadEnvFor(resolveTestEnv(fallback), { ambientWins, root, ticket });
}

/** loadEnv for a named env (the caller resolved it): the same layers, written into process.env. */
export function loadEnvFor(testEnv, { ambientWins = false, root = ROOT, ticket } = {}) {
  const r = applyLayered(testEnv, { root, ticket, ambientWins, passwordNames: ROLE_PASSWORD_NAMES });
  return { testEnv, promoted: r.perEnv, sourceOf: r.sourceOf, ticket: r.ticket, dedicated: r.dedicated, master: r.master };
}
