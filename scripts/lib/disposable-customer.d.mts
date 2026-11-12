/**
 * Type declarations for `disposable-customer.mjs` — a storefront customer created for one test case
 * and deleted after it. The implementation stays plain ESM JS (the CLI and seeders import it); this
 * file gives TS consumers (regression/lib/fixtures.ts) real types. Same pattern as
 * `loyalty-ephemeral-account.d.mts`.
 */
import type { ApiFn } from "./loyalty-ephemeral-account.mjs";

export type DisposableKind = "personal" | "orgMember";

export interface DisposableCustomerRecord {
  kind: DisposableKind;
  email: string;
  userId: string;
  memberId: string;
  organizationId?: string;
}

export declare const DISPOSABLE_PREFIX: string;
export declare const KINDS: DisposableKind[];

export declare function createDisposableCustomer(
  api: ApiFn,
  opts: { kind?: DisposableKind; storeId: string },
): Promise<DisposableCustomerRecord>;

export declare function deleteDisposableCustomer(
  api: ApiFn,
  customer: Pick<DisposableCustomerRecord, "email" | "memberId" | "organizationId">,
): Promise<void>;

export declare function sweepDisposableCustomers(
  api: ApiFn,
  opts?: { maxAgeHours?: number; dryRun?: boolean; log?: (msg: string) => void },
): Promise<{ removed: number; spared: number }>;
