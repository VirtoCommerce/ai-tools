#!/usr/bin/env node
/**
 * disposable-customer.mjs — the agent lane's door to `[PRE:DISPOSABLE_CUSTOMER:<kind>]`.
 *
 *   npm run td:customer -- create [--kind personal|orgMember]
 *       Creates a customer for ONE case and prints one JSON line:
 *       {"kind","email","userId","memberId","organizationId"?,"passwordKey":"DEFAULT_TEST_PASSWORD"}
 *       Sign in with that email as plain text and type the password by its NAME (`passwordKey`, in the
 *       form the lane's --secrets file spells it — e.g. DEFAULT_TEST_PASSWORD_VCST on the combined file).
 *
 *   npm run td:customer -- delete --email <email>
 *       Deletes that customer, its contact and (orgMember) its organization. Refuses any email that does
 *       not start with the disposable prefix.
 *
 *   npm run td:customer -- sweep [--max-age-hours 2] [--dry-run]
 *       Deletes leftovers of crashed runs older than the age floor (a run in progress is spared).
 *
 * The create/delete path is scripts/lib/disposable-customer.mjs — the same one the Playwright fixture
 * `disposableCustomer` uses. Never prints a password. Exit 2 = refused (env guard, bad arguments).
 */
import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { argv } from "node:process";
import { api, assertSafeTarget, auth, STORE_ID } from "../lib/seed-common.mjs";
import {
  DISPOSABLE_PREFIX,
  KINDS,
  createDisposableCustomer,
  deleteDisposableCustomer,
  sweepDisposableCustomers,
} from "../lib/disposable-customer.mjs";
import { PASSWORD_VAR, password } from "../lib/loyalty-ephemeral-account.mjs";

const [, , command, ...rest] = argv;
const flag = (name, fallback = undefined) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : fallback;
};
const fail = (msg) => {
  console.error(`td:customer: ${msg}`);
  process.exit(2);
};

if (!["create", "delete", "sweep"].includes(command)) fail("usage: create [--kind personal|orgMember] | delete --email <email> | sweep [--max-age-hours N] [--dry-run]");
assertSafeTarget();
await auth();

if (command === "create") {
  const kind = flag("kind", "personal");
  if (!KINDS.includes(kind)) fail(`unknown --kind "${kind}" (${KINDS.join(" | ")})`);
  if (!password()) fail(`${PASSWORD_VAR} is not set — the disposable customer's password comes from it`);
  const customer = await createDisposableCustomer(api, { kind, storeId: STORE_ID });
  console.log(JSON.stringify({ ...customer, passwordKey: PASSWORD_VAR }));
} else if (command === "delete") {
  const email = flag("email");
  if (!email) fail("delete needs --email <email>");
  if (!email.startsWith(DISPOSABLE_PREFIX)) fail(`refusing to delete ${email}: not a disposable customer (${DISPOSABLE_PREFIX}*)`);
  const user = await api("GET", `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] });
  if (!user?.id) {
    console.log(JSON.stringify({ deleted: false, email, reason: "no such user (already deleted?)" }));
  } else {
    const member = user.memberId
      ? await api("GET", `/api/members/${encodeURIComponent(user.memberId)}`, null, { expectStatus: [200, 204, 404] })
      : null;
    // Only an organization this module created (its name carries the prefix) is deleted with the customer.
    let organizationId;
    for (const orgId of member?.organizations ?? []) {
      const org = await api("GET", `/api/members/${encodeURIComponent(orgId)}`, null, { expectStatus: [200, 204, 404] });
      if (String(org?.name ?? "").startsWith(DISPOSABLE_PREFIX)) organizationId = orgId;
    }
    await deleteDisposableCustomer(api, { email, memberId: user.memberId, organizationId });
    console.log(JSON.stringify({ deleted: true, email, ...(organizationId ? { organizationId } : {}) }));
  }
} else {
  const maxAgeHours = Number(flag("max-age-hours", "2"));
  const dryRun = rest.includes("--dry-run");
  const result = await sweepDisposableCustomers(api, { maxAgeHours, dryRun, log: (m) => console.error(m) });
  console.log(JSON.stringify(result));
}
