/**
 * Type declarations for `env-core.js` — the CORE required env vars and the per-env suffix
 * promotion that config.js and the pre-flight core (env-facts.ts) share. See env-core.js.
 */

/** CORE — must exist for any suite to run (config.js exits 1 when one is missing). */
export declare const CORE_REQUIRED_VARS: readonly string[];

/** Promote every `<KEY>_<TEST_ENV upper-cased>` in process.env to `<KEY>`. */
export declare function promoteEnvSuffix(testEnv: string): void;

/** What config.js would leave in process.env for `testEnv`, computed without touching process.env. */
export declare function layeredEnv(
  testEnv: string,
  options?: { root?: string; ambient?: Record<string, string | undefined> },
): Record<string, string | undefined>;
