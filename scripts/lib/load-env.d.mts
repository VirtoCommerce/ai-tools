/**
 * Type declarations for load-env.mjs — the layered env contract (`.env.defaults` → `.env.${TEST_ENV}` →
 * `.env.local`, `KEY_<ENV>` promotion, the QA_ENV_PATH folders, the master password) for scripts that must not
 * import config.js. See load-env.mjs and env-layers.mjs for the full docs.
 */
export interface LoadedEnv {
  /** The resolved TEST_ENV (also written back to process.env.TEST_ENV). */
  testEnv: string;
  /** Base keys that took this env's own value: a `KEY_<ENV>` pin, a dedicated file, the master password. */
  promoted: Set<string>;
  /** What supplied a key's current value, e.g. "BACK_URL_VCPTCORE_DEV from .env.vcptcore_dev". */
  sourceOf(key: string): string;
  /** The run's ticket the QA_ENV_PATH `<ticket>` folders were filled with, or null. */
  ticket: string | null;
  /** The dedicated files that applied, lowest priority first. */
  dedicated: string[];
  /** Set when the env says PASSWORDS=master: whether the master password was found, and the names it went to. */
  master: { file: string; found: boolean; names: string[] } | null;
}

export interface LoadEnvOptions {
  /** For runners CI drives with `-e`: values already in the process environment beat every file and file pin. */
  ambientWins?: boolean;
  /** Where the root env files are (default: the repo root). */
  root?: string;
  /** The run's ticket for QA_ENV_PATH's `<ticket>` (default: QA_TICKET, else the session's bound run; null: none). */
  ticket?: string | null;
}

export declare function loadEnv(options?: LoadEnvOptions & { fallback?: string }): LoadedEnv;

/** The TEST_ENV resolveTestEnv() picks, written to process.env, without exposing `.env.playwright.<env>` — for a
 *  caller that loads the layers next. */
export declare function selectTestEnv(fallback?: string): string;

/** loadEnv for a named env the caller already resolved. */
export declare function loadEnvFor(testEnv: string, options?: LoadEnvOptions): LoadedEnv;
