// scripts/lib/env-core.js — the env facts config.js and the pre-flight core must agree on.
// One list, one promotion rule: config.js used to own both inline, and a second reader
// (scripts/lib/env-facts.ts) would otherwise have had to transcribe them.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';

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

/**
 * Per-env override promotion: any key ending in `_${TEST_ENV.toUpperCase()}` is promoted to its
 * base name, so `.env.local` can carry per-env variants (USER_PASSWORD_VIRTOSTART) without leaking
 * them into committed files.
 */
export function promoteEnvSuffix(testEnv) {
  const suffix = `_${String(testEnv).toUpperCase()}`;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith(suffix) && value) process.env[key.slice(0, -suffix.length)] = value;
  }
}

/**
 * What config.js would leave in process.env for `testEnv`, computed WITHOUT touching process.env, so
 * one process can hold several envs at once (`secrets:sync --all`, the enforce-secret-token hook). The
 * same order as config.js: `.env.playwright.<env>` exposed as `KEY_<ENV>` where unset (resolveTestEnv),
 * `.env.defaults` filling gaps, `.env.<env>` then `.env.local` overriding, then `promoteEnvSuffix`.
 * A change to config.js's order must be made here too.
 *
 * @param {string} testEnv
 * @param {{ root?: string, ambient?: Record<string, string | undefined> }} [options] files are read from
 *   `root` (default: the cwd, as config.js does); `ambient` is the environment before any loading
 * @returns {Record<string, string | undefined>}
 */
export function layeredEnv(testEnv, { root = process.cwd(), ambient = process.env } = {}) {
  const read = (file) => (existsSync(join(root, file)) ? parse(readFileSync(join(root, file))) : {});
  const suffix = `_${String(testEnv).toUpperCase()}`;
  const env = { ...ambient, TEST_ENV: testEnv };
  for (const [key, value] of Object.entries(read(`.env.playwright.${testEnv}`))) {
    if (value && env[key + suffix] === undefined) env[key + suffix] = value;
  }
  for (const [key, value] of Object.entries(read('.env.defaults'))) if (!(key in env)) env[key] = value;
  Object.assign(env, read(`.env.${testEnv}`), read('.env.local'));
  for (const [key, value] of Object.entries(env)) {
    if (key.endsWith(suffix) && value) env[key.slice(0, -suffix.length)] = value;
  }
  return env;
}
