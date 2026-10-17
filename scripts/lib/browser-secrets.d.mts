/**
 * Type declarations for `browser-secrets.mjs` — the login-password names the browser lanes type and
 * their state in `.env.playwright.local`. Same pattern as `user-roles.d.mts`: the implementation stays
 * plain ESM JS (the secrets:sync CLI imports it), this file gives TS consumers (preflight.ts) real types.
 */

export declare const SECRETS_FILE: string;
/** The header line that stamps which TEST_ENV the values were resolved for. */
export declare const ENV_STAMP: RegExp;

/** A login password NAME: `X_PASSWORD`, never a token/key-shaped one. */
export declare function isLoginSecretName(n: string): boolean;

/** Every login-password name a text mentions, `{{X_PASSWORD}}` or bare. */
export declare function namesInText(text: string): string[];

export interface SuiteSecretCases { cases: number; byName: Record<string, string[]> }

/** Per suite id: case count and, per login-password name, the case ids whose row types it. */
export declare function suiteSecretCases(root: string, ids?: Iterable<string> | null): Record<string, SuiteSecretCases>;

/** Per suite id: the login-password names its CSV makes a browser type. */
export declare function suiteSecretNames(root: string, ids?: Iterable<string> | null): Record<string, string[]>;

/** name → sources ("suite:089", "test-data", "role:ADMIN"). */
export declare function deriveSecretNames(root: string): Map<string, Set<string>>;

/** The combined `--secrets` file (`npm run secrets:sync:all`): every env's passwords as `NAME_<ENV>`. */
export declare const COMBINED_SECRETS_FILE: string;

/** `envs` is the combined file's env list, null for a single-env file. */
export interface SecretsFile { path: string; exists: boolean; env: string | null; envs: string[] | null; values: Map<string, string> }

export declare function readSecretsFile(root: string, path?: string): SecretsFile;

/** The env list of a combined file's `# envs:` line, or null for a single-env file. */
export declare function combinedEnvs(text: string): string[] | null;

/** `{ env, name }` of an env-qualified name, by the longest env suffix; null when none matches. */
export declare function splitQualifiedName(qualified: string, envs: Iterable<string>): { env: string; name: string } | null;

/** The `--secrets` path in the nearest `.mcp.json` from `root` upwards (`${VAR}` expanded), or null. */
export declare function declaredSecretsFile(root: string): string | null;

export declare function combinedEnvCandidates(
  root: string,
  ambient?: Record<string, string | undefined>,
): { envs: string[]; excluded: { env: string; reason: string }[] };

/** Values, keyed `NAME_<ENV>` — for the writer of the combined file only. */
export declare function combinedSecretValues(
  root: string,
  names: Iterable<string>,
  options?: { ambient?: Record<string, string | undefined> },
): {
  entries: Map<string, { env: string; name: string; value: string }>;
  envs: { env: string; written: number; missing: string[] }[];
  excluded: { env: string; reason: string }[];
};

export interface SecretClassification { ok: string[]; unsynced: string[]; undeclared: string[] }

/** Values are compared, never returned. */
export declare function classifySecretNames(
  names: Iterable<string>,
  file: { values: Map<string, string> },
  env?: Record<string, string | undefined>,
): SecretClassification;
