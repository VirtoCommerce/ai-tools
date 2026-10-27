/**
 * Type declarations for `env-core.js` — the CORE required env vars and the layered env that config.js
 * and the pre-flight core (env-facts.ts) share. See env-core.js.
 */

/** CORE — must exist for any suite to run (config.js exits 1 when one is missing). */
export declare const CORE_REQUIRED_VARS: readonly string[];

/** The role registry's password names (scripts/lib/user-roles.mjs), which a master stand gives the master password. */
export declare const ROLE_PASSWORD_NAMES: readonly string[];

/** What config.js would leave in process.env for `testEnv`, computed without touching process.env. */
export declare function layeredEnv(
  testEnv: string,
  options?: { root?: string; ambient?: Record<string, string | undefined>; ticket?: string | null },
): Record<string, string | undefined>;
