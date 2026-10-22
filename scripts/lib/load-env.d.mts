/**
 * Type declarations for load-env.mjs — the layered env contract (`.env.defaults` →
 * `.env.${TEST_ENV}` → `.env.local`, then `KEY_<ENV>` promotion) for scripts that must not
 * import config.js. See load-env.mjs for the full docs.
 */
export interface LoadedEnv {
  /** The resolved TEST_ENV (also written back to process.env.TEST_ENV). */
  testEnv: string;
  /** Base keys that took a `KEY_<ENV>` value this run. */
  promoted: Set<string>;
  /** What supplied a key's current value, e.g. "BACK_URL_VCPTCORE_DEV from .env.vcptcore_dev". */
  sourceOf(key: string): string;
}

export declare function loadEnv(options?: {
  fallback?: string;
  /** For runners CI drives with `-e`: values already in the process environment beat every file and file pin. */
  ambientWins?: boolean;
}): LoadedEnv;
