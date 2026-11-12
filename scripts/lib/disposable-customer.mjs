/**
 * disposable-customer.mjs — a storefront customer that exists for ONE test case and is deleted after it.
 *
 * WHY
 * ---
 * A shared test account is shared state: anyone running with a stale password locks it for everyone
 * (USER_DEFAULT on vcst, 2026-11-12: `login_failed` → `user_is_temporary_locked_out` for 15 minutes),
 * and every run that touches its cart leaves state behind for the next. A customer minted for one case
 * has neither problem: nothing else signs in as it, and it is gone when the case ends.
 *
 * TWO CALLERS, ONE CREATE PATH
 * ----------------------------
 * - the Playwright spec fixture `disposableCustomer` (regression/lib/fixtures.ts);
 * - the agent lane, through `[PRE:DISPOSABLE_CUSTOMER:<kind>]` and the CLI
 *   `npm run td:customer -- create|delete|sweep` (scripts/seed-data/disposable-customer.mjs).
 * Both go through `createDisposableCustomer` / `deleteDisposableCustomer` here, which use the seeders'
 * proven account path (`loyalty-ephemeral-account.mjs`: contact → account → approve → password).
 *
 * KINDS
 * -----
 * `personal`  — a contact with no organization.
 * `orgMember` — the only member of an organization created for it (and deleted with it).
 *
 * The password is the ephemeral-account one (`DEFAULT_TEST_PASSWORD`): a browser lane types that key's
 * NAME, the spec fixture resolves it in process — no caller ever sees the value. Every email and every
 * organization name starts with `DISPOSABLE_PREFIX`, which is the only thing delete and sweep will touch.
 *
 * Side-effect-free on import: no env load, no auth. The caller passes the authenticated admin `api`.
 */
import {
  createEphemeralAccount,
  deleteEphemeralAccount,
  newHandle,
  sweepEphemeralAccounts,
} from "./loyalty-ephemeral-account.mjs";

export const DISPOSABLE_PREFIX = "AGENT-TEST-SPEC-";
export const KINDS = ["personal", "orgMember"];

/**
 * Create one disposable customer. Returns `{ kind, email, userId, memberId, organizationId? }`.
 * An org created for an `orgMember` is deleted again if the account cannot be created.
 */
export async function createDisposableCustomer(api, { kind = "personal", storeId } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`disposable customer: unknown kind "${kind}" (${KINDS.join(" | ")})`);
  if (!storeId) throw new Error("disposable customer: storeId is required");
  let organizationId;
  if (kind === "orgMember") {
    const name = newHandle(`${DISPOSABLE_PREFIX}ORG-`);
    const org = await api("POST", "/api/members", { memberType: "Organization", name, status: "Approved" }, { expectStatus: [200, 201] });
    organizationId = org.id;
  }
  try {
    const account = await createEphemeralAccount(api, {
      prefix: DISPOSABLE_PREFIX,
      storeId,
      withOrg: false,
      organizationId,
      firstName: "Agent",
      lastName: kind === "orgMember" ? "OrgMember" : "Personal",
    });
    return { kind, email: account.email, userId: account.userId, memberId: account.memberId, ...(organizationId ? { organizationId } : {}) };
  } catch (e) {
    if (organizationId) await api("DELETE", `/api/members?ids=${organizationId}`, null, { expectStatus: [200, 204, 404] });
    throw e;
  }
}

/** Delete one disposable customer: its account, its contact and — for an `orgMember` — its organization. */
export async function deleteDisposableCustomer(api, { email, memberId, organizationId } = {}) {
  await deleteEphemeralAccount(api, { email, memberId, prefix: DISPOSABLE_PREFIX });
  if (organizationId) await api("DELETE", `/api/members?ids=${organizationId}`, null, { expectStatus: [200, 204, 404] });
}

/**
 * Sweep disposable customers a crashed run left behind, older than `maxAgeHours` (so a run in
 * progress is spared). Their organizations are not swept here; delete those by the same prefix.
 */
export async function sweepDisposableCustomers(api, { maxAgeHours = 2, dryRun = false, log = () => {} } = {}) {
  return sweepEphemeralAccounts(api, { prefix: DISPOSABLE_PREFIX, maxAgeHours, dryRun, log });
}
