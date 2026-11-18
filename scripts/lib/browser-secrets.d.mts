/**
 * Type declarations for `browser-secrets.mjs` — the login-password names the browser lanes type, what a lane holds,
 * and whether a running lane still holds what the test-account store says. Same pattern as `user-roles.d.mts`: the
 * implementation stays plain ESM JS (the lane launcher imports it), this file gives TS consumers (preflight.ts) types.
 */

/** Where a running lane leaves its manifest (`.vc-fix/lanes`). */
export declare const LANES_DIR: string;

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

/** `{ env, name }` of an env-qualified name, by the longest env suffix; null when none matches. */
export declare function splitQualifiedName(qualified: string, envs: Iterable<string>): { env: string; name: string } | null;

export declare function combinedEnvCandidates(
  root: string,
  ambient?: Record<string, string | undefined>,
): { envs: string[]; excluded: { env: string; reason: string }[]; tickets: Map<string, (string | null)[]> };

/** Values, keyed `NAME_<ENV>` — for the lane launcher only. */
export declare function combinedSecretValues(
  root: string,
  names: Iterable<string>,
  options?: { ambient?: Record<string, string | undefined> },
): {
  entries: Map<string, { env: string; name: string; value: string }>;
  envs: { env: string; written: number; missing: string[] }[];
  excluded: { env: string; reason: string }[];
  master: { env: string; tickets: (string | null)[] }[];
  conflicts: { env: string; name: string; tickets: (string | null)[] }[];
};

/** What a lane holds. `secrets` carries values — for the launcher and the fingerprint checks only. */
export declare function laneSecrets(
  root: string,
  options?: { ambient?: Record<string, string | undefined> },
): {
  secrets: Map<string, string>;
  envs: string[];
  master: { env: string; tickets: (string | null)[] }[];
  conflicts: { env: string; name: string; tickets: (string | null)[] }[];
  excluded: { env: string; reason: string }[];
  missing: Map<string, string[]>;
};

export interface LaneManifest { lane: string; pid: number; startedAt: string; envs: string[]; salt: string; names: Record<string, string> }

/** A salted fingerprint of one value. */
export declare function fingerprint(salt: string, value: string): string;
export declare function writeLaneManifest(root: string, lane: string, secrets: Map<string, string>, options?: { pid?: number; envs?: string[] }): string;
export declare function removeLaneManifest(root: string, lane: string, pid?: number): void;
/** Manifests of running lanes (`lane` given: that lane's only), newest first. */
export declare function readLaneManifests(root: string, lane?: string | null, options?: { isAlive?: (pid: number) => boolean }): LaneManifest[];
/** How a running lane differs from the store now. */
export declare function laneDrift(manifest: LaneManifest, current: Map<string, string>): { stale: string[]; absent: string[]; gone: string[] };
