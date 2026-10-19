// scripts/lib/env-core.js — the env facts config.js and the pre-flight core must agree on.
// One list, one layering: config.js used to own both inline, and a second reader
// (scripts/lib/env-facts.ts) would otherwise have had to transcribe them.

import { layered } from './env-layers.mjs';
import { USER_ROLES } from './user-roles.mjs';

/** CORE — must exist for any suite to run (config.js exits 1 when one is missing). */
export const CORE_REQUIRED_VARS = Object.freeze([
  // URLs (both surfaces)
  'FRONT_URL',
  'BACK_URL',
  // Credentials (both surfaces)
  'ADMIN',
  'ADMIN_PASSWORD',
  'USER_EMAIL',
  'USER_PASSWORD',
  // Store context
  'STORE_ID',
]);

/** The role registry's password names: on a master stand they take the master password with the ones the tests name. */
export const ROLE_PASSWORD_NAMES = Object.freeze([...new Set(USER_ROLES.map((r) => r.passwordVar))]);

/**
 * What config.js would leave in process.env for `testEnv`, computed WITHOUT touching process.env, so
 * one process can hold several envs at once (`secrets:sync --all`, the enforce-secret-token hook). The
 * order is scripts/lib/env-layers.mjs `layered` — the one every loader applies.
 *
 * @param {string} testEnv
 * @param {{ root?: string, ambient?: Record<string, string | undefined>, ticket?: string | null }} [options] files are
 *   read from `root` (default: the cwd, as config.js does); `ambient` is the environment before any loading; `ticket`
 *   fills QA_ENV_PATH's `<ticket>` (default: the run's ticket; null: none)
 * @returns {Record<string, string | undefined>}
 */
export function layeredEnv(testEnv, { root = process.cwd(), ambient = process.env, ticket } = {}) {
  return layered(testEnv, { root, ambient, ticket, passwordNames: ROLE_PASSWORD_NAMES }).env;
}
