// scripts/lib/env-core.js — the env facts config.js and the pre-flight core must agree on.
// One list, one promotion rule: config.js used to own both inline, and a second reader
// (scripts/lib/env-facts.ts) would otherwise have had to transcribe them.

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
