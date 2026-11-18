/** Type declarations for env-check.mjs — what a loaded env must hold, and checkEnv, the one judgement of it. */

/** CORE — must exist for any suite to run (config.js exits 1 when one is missing). */
export declare const CORE_REQUIRED_VARS: readonly string[];
/** The admin-write guard's levels (ENV_RISK). */
export declare const ENV_RISKS: readonly string[];

/** Variables a feature needs; missing ⇒ that feature is skipped with a warning. */
export declare const FEATURE_GATED_VARS: Readonly<Record<string, { vars: string[]; gates: string; processor?: string }>>;

/** What a loaded env lacks: `errors` fail config.js, `warnings` only disable a feature. Changes nothing. */
export declare function checkEnv(env?: Record<string, string | undefined>): {
  envRisk: string;
  errors: string[];
  missingCore: string[];
  warnings: string[];
};

/** config.js's verdict on the loaded env: prints it; false on an error (the caller exits). */
export declare function enforceEnv(testEnv: string, source: string): boolean;

/** `npm run env:check`'s report on the loaded env (names and sources, never a value); returns the exit code.
 *  `sourceOf`: the load's own (the one that filled process.env); `fileKeys`: the names the env's files set. */
export declare function reportEnv(testEnv: string, sourceLabel: string, sourceOf: (key: string) => string, fileKeys: Iterable<string>): number;
