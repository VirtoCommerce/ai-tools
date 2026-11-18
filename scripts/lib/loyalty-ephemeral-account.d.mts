/**
 * Type declarations for `loyalty-ephemeral-account.mjs` — mint, delete and sweep a disposable
 * contact + Approved storefront account. Same pattern as `storefront-caps.d.mts`: the implementation
 * stays plain ESM JS (the seeders import it), this file gives TS consumers (regression/lib/fixtures.ts)
 * real types.
 */

/** The seeders' `api(method, path, body, { expectStatus })` helper from seed-common.mjs. */
export type ApiFn = (
  method: string,
  path: string,
  body?: unknown,
  opts?: { expectStatus?: number[] },
) => Promise<any>;

type LogFn = (msg: string) => void;

export interface EphemeralAccount {
  handle: string;
  email: string;
  memberId: string;
  userId: string;
  observedGroups: string[];
  dry?: boolean;
}

export declare const EMAIL_DOMAIN: string;
export declare const PASSWORD_VAR: string;
export declare function password(): string;

export declare function newHandle(prefix: string, now?: Date, rand?: number): string;
export declare function handleAgeHours(handle: string, now?: Date): number | null;

export declare function createEphemeralAccount(api: ApiFn, opts: {
  prefix: string;
  storeId?: string;
  withOrg?: boolean;
  orgName?: string;
  organizationId?: string | null;
  groups?: string[];
  firstName?: string;
  lastName?: string;
  dryRun?: boolean;
  log?: LogFn;
  verbose?: LogFn;
}): Promise<EphemeralAccount>;

export declare function deleteEphemeralAccount(api: ApiFn, opts: {
  email: string;
  memberId?: string | null;
  prefix: string;
  verbose?: LogFn;
}): Promise<void>;

export declare function findEphemeralAccounts(api: ApiFn, prefix: string): Promise<any[]>;

export declare function sweepEphemeralAccounts(api: ApiFn, opts: {
  prefix: string;
  maxAgeHours?: number | null;
  now?: Date;
  dryRun?: boolean;
  log?: LogFn;
  verbose?: LogFn;
}): Promise<{ removed: number; spared: number }>;

export declare function storefrontToken(backUrl: string, storeId: string, email: string, pw?: string): Promise<string | null>;
