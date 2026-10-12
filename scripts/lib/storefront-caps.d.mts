/**
 * Type declarations for `storefront-caps.mjs` — the storefront's anonymous InitializeApplication
 * probe as a function. Same pattern as `user-roles.d.mts`: the implementation stays plain ESM JS
 * (the store:caps CLI imports it), this file gives TS consumers (env-facts.ts) real types.
 */

export interface StorefrontModule { moduleId: string; version: string }

export type StorefrontProbe =
  | { ok: true; storeUrl: string; versionsHidden: boolean; modules: StorefrontModule[] }
  | { ok: false; reason: string };

/** A GraphQL fixture body from test-data/graphql/queries without its `#` metadata header. */
export declare function readQueryFixture(root: string, name: string): string;

/** POST {backUrl}/graphql; throws (with `.status`) on an HTTP error or GraphQL `errors`. */
export declare function storefrontGql(backUrl: string, query: string, variables: object): Promise<any>;

/** Never throws: every failure is `{ ok: false, reason }`. */
export declare function probeStorefrontModules(opts: { backUrl: string; domain: string; root: string }): Promise<StorefrontProbe>;
