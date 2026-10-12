/**
 * Type declarations for `refresh-release-ledger.mjs`, limited to what TypeScript consumers import
 * (the pre-flight core: scripts/lib/env-facts.ts, scripts/preflight/policy.ts). Declare another
 * export here when a .ts file starts importing it — the .mjs stays the implementation.
 */

/** Numeric compare of dotted/dashed versions: < 0 when a < b, 0 when equal, > 0 when a > b. */
export declare function cmpSemver(a: string, b: string): number;
