# Business Logic Proposals — 2026-07-24 (Sales Rep, TLC-2026-07-24-1906)

**Evidence-bar policy for this run: applicable-axes.** Sales Rep is a brand-new module
(`VirtoCommerce.SalesRep 3.1000.0-pr-4-6596`, PR prerelease) with **no published VirtoOZ
docs yet** → the **docs axis is structurally unavailable**. Per the updated policy, docs is
therefore **waived (N/A)** rather than treated as a permanent blocker, and the evidence bar
becomes the **axes that CAN be verified — live + source**. A candidate is **promoted when
both applicable axes are met AND agree**; it stays a draft when an applicable axis is missing
(unverifiable) or **contradicts** the other. Result this run:

| Candidate | Live | Source | Promoted? |
|-----------|:----:|:------:|-----------|
| SREP-001 (hub access) | pending deploy (source-authoritative) | confirms | **YES → BL-SREP-001** (live-verify pending) |
| SREP-002 (dashboard scope) | confirms | confirms | **YES → BL-SREP-002** |
| SREP-003 (admin RBAC) | **confirms** (SR-ADM-023 RBAC verified) | confirms | **YES → BL-SREP-003** |

**All three promoted.** SREP-001 was promoted on **source authority** (merged PR #2391), operator-directed, with **live-verification pending the VCST-5494 deploy** — the deploy PR was prepared but stopped before merge, so the vcst-qa build still shows the pre-fix redirect (deploy lag, not a violation). This is a deliberate deviation from the strict "contradictory-axis → hold" rule; the entry carries the live-pending caveat so the redirect isn't misread as a FAIL. Each carries its evidence + a re-audit
trigger. Assign final IDs / commit the drafts manually once their conditions are met.

> Next free B2B id verified: **BL-B2B-012** (existing BL-B2B runs 001→011, no gaps). No
> `BL-SREP-*` domain exists yet — a dedicated prefix is proposed below since Sales Rep is a
> distinct feature, but the reviewer may fold these into `BL-B2B-012+`.

---

## New Invariants Proposed

### ✅ PROMOTED → BL-SREP-001: Sales Rep hub access is permission-gated, decoupled from the rep's own org membership `[P1-data]`
> **Promoted to `business-logic.md` (2026-07-24) on SOURCE authority** (merged PR #2391), operator-directed; docs waived (module pre-GA). **Live-verification PENDING the VCST-5494 deploy** — on the current vcst-qa build (theme pr-2395, fix not deployed) the no-membership hub still redirects; that is deploy lag, not a violation. Re-verify redirect→reachable once the fix deploys. The entry in the oracle carries this caveat.
- **Rule:** A user's Sales Rep hub is gated on the **`sales-rep:access`** permission alone. The **rep-facing** hub pages (`/company/dashboard`, `/company/my-customers`, `/company/customer-profile`) must be **reachable regardless of the rep's own organization membership** — a rep's customers are the organizations they *serve*, which is independent of any org the rep belongs to. Only the **buyer-facing** `/company/sales-reps` contact page requires org membership.
- **Verify:** as a rep with `sales-rep:access` and **zero** org memberships, the rep-facing hub links resolve to their pages (incl. the empty "No customers found" state); the buyer-facing sales-reps page remains org-gated. `guardSalesRep` still enforces reps-only access.
- **Violation signal:** a customer-less rep's hub links render but **redirect to `/account/dashboard`** (visible-but-dead links) — the pre-fix VCST-5494 behavior.
- **Agents:** qa-frontend-expert, qa-backend-expert.
- **Source (verified):** vc-frontend PR **#2391** `fix(VCST-5494): reach Sales Rep hub pages without org membership` (merged dev 2026-07-23) — cleared inherited `meta.requiresOrganization` on the three rep-facing routes; child `meta` overrides parent; buyer route kept gated. Rationale in PR body matches memory `reference_sales_rep_membership_equals_served_customer`.
- **Live (verified — CONFLICT, deploy lag):** on vcst-qa (theme `2.54.0-pr-2395`) the customer-less rep **still hard-redirects** to `/account/dashboard` from both hub links (outcome (i), TLC target #1). **Root cause of the conflict: the deployed artifact does not contain PR #2391** — the QA theme is a `pr-2395`-branch build; the deploy PR (`vc-deploy-dev` #6164) carrying #2391's artifact is still **open/unmerged**. So live shows the pre-fix behavior *correctly for the pinned build*.
- **Docs:** pending — no StorefrontUserGuide/DeveloperGuide Sales Rep entry.
- **Verdict / status:** **PROMOTED (source authority) → BL-SREP-001; live-verification pending deploy.** Promoted per operator direction on the merged-source axis; docs waived (module pre-GA); live currently shows the pre-fix redirect only because PR #2391 is not on the pinned vcst-qa artifact. **Open follow-up:** deploy PR #2391 to vcst-qa, then re-verify redirect→reachable to close the live axis.
- **Triggered by / affects:** suite 089 SR-FE-013, SR-FE-021 (assert the redirect as *intended* — **STALE against merged intent**, though they still pass against the current pinned build); new gap case SR-FE-031.

### ✅ PROMOTED → BL-SREP-002: Sales Rep Dashboard statistics are scoped to the rep's served organizations `[P1-data]`
> **Promoted to `business-logic.md` this run (2026-07-24)** — both applicable axes (live + source) CONFIRM; docs waived (N/A, module pre-GA). Kept here for the audit record; the adversarial cross-org-leak negative test strengthens it later but did not block promotion.
- **Rule:** The Sales Rep hub Dashboard statistics — `salesRepCustomerOrderStatistics`, `salesRepCustomerCartStatistics`, `salesRepCustomerCounts`, `salesRepTopSellers` — must return data scoped to the **caller's own served organizations only** (no cross-org leakage).
- **Verify:** rep A's Dashboard KPIs/tables reflect only rep A's served orgs; a rep cannot retrieve counts/top-sellers/statistics for an org they do not serve.
- **Violation signal:** a rep sees order/cart/customer counts or top-sellers for an org outside their served set.
- **Agents:** qa-backend-expert.
- **Source (verified):** the `salesRep*` statistics queries exist in the refreshed live schema (2026-07-24) and back the Dashboard (vc-module-sales-rep #2 X-API endpoints).
- **Live (verified — partial):** primary rep's Dashboard renders **real values scoped to 7 served orgs** (TLC target #2/#4) — KPIs reconcile exactly with `salesRepCustomerOrderStatistics`. **The negative (cross-org leak prevention) was NOT tested** — no second-rep isolation case exists yet.
- **Docs:** pending.
- **Verdict / status:** draft — positive `{OBSERVED}` confirmed; **needs a cross-org negative test** before promotion. Re-audit trigger: add the isolation case + docs publish.
- **Triggered by / affects:** new gap cases SR-GQL-042/044/046/047; suite 091 SR-CP-015 (KPI-source, now real data).

### ✅ PROMOTED → BL-SREP-003: Embedded Sales Rep Admin app gates on customer-member + platform-security permissions, not on `sales-rep:access` `[P1-data]`
> **Promoted to `business-logic.md` (2026-07-24)** — live (SR-ADM-023 three-account RBAC verification) + source (controller `[Authorize]` map) CONFIRM; docs waived. Refined during promotion with the full controller matrix, incl. the **account-ops class** (block/unblock/reset-password = `platform:security:update` only, no `customer:update`) that the frontend composable does not represent.
- **Rule (source-corrected 2026-07-24):** The embedded Sales Rep Admin app is gated by the **customer module's member permissions**, NOT by `sales-rep:access` (which only *defines* a storefront rep) and NOT merely by the module being installed. **`customer:read`** is the access/view gate; mutating a rep requires **`customer:create`/`update`/`delete`** *plus* the login-account permissions **`platform:security:create`/`update`/`delete`**. (An `isAdministrator` account bypasses all checks.)
- **Verify:** an admin **without `customer:read`** cannot open/see the Sales Rep app; an admin with **`customer:read` only** can view reps but the create/edit/delete actions are hidden/403.
- **Violation signal:** a Manager lacking `customer:read` reaches the app; or a read-only (`customer:read`-only) Manager can create/edit/delete a rep or its login account.
- **Agents:** qa-backend-expert.
- **Source (verified):** `vc-module-sales-rep` `useSalesRepPermissions/index.ts` (`dev`) — explicit comment + the `customer:*` / `platform:security:*` permission map; `ModuleConstants.cs` (`sales-rep:access` = rep definition only). VCST-5293.
- **Live (being unblocked):** fixture `RESTRICTED_ADMIN_SALESREP_READONLY` (customer:read only) authored + seeded via `seed:rbac`; `RESTRICTED_CMS_ADMIN` (no `customer:read`) is the no-access control. Live verification pending (`qa-backend-expert`).
- **Docs:** N/A (waived — module pre-GA/undocumented).
- **Verdict / status:** **draft — promotes once the live axis confirms** (source already met; docs waived → the 2-met bar needs live). Re-audit trigger: live RBAC verification with the two seeded accounts.
- **Triggered by / affects:** gap case SR-ADM-023 (retarget its fixture ref to `RESTRICTED_ADMIN_SALESREP_READONLY` + `RESTRICTED_CMS_ADMIN`).

---

## Stale / Contradiction (human decision)

### 089 SR-FE-013 / SR-FE-021 — assert the no-membership redirect as *intended*
- **Current assertion:** a customer-less rep clicking a hub link is redirected to `/account/dashboard` — treated as **by-design** (browser-verified 2026-07-17, *before* PR #2391 merged 07-23).
- **Observed vs merged intent:** PR #2391 makes those pages **reachable**; the redirect is the fixed bug (VCST-5494). So the assertion encodes a **defect-as-intended**.
- **Current build caveat:** on vcst-qa (theme `pr-2395`, fix NOT deployed) the redirect still happens, so these cases **still pass today** — they are **STALE-PENDING-DEPLOY**, not immediately failing.
- **Suggested action:** do NOT canonicalize the redirect. Once PR #2391 deploys to vcst-qa, flip SR-FE-013/021 assertions to "rep-facing hub pages reachable without org membership; empty state shown" and align with SR-FE-031. Until then, add a note that the current pass reflects an undeployed fix.

### 050m SR-GQL-033/034 · 091 SR-CP-009/010/011 — key off removed `salesRepOrderStatuses`
- **Current:** reference the GraphQL operation `salesRepOrderStatuses`.
- **Observed (live, verified):** `salesRepOrderStatuses` is **absent** from the current schema; order-status filter chips are now populated by **`salesRepOrderFilterRules`** (+ `salesRepOrderSortRules` for sort), with **`salesRepOrders(filter:)`** doing the actual filtering (HTTP 200, real filtered results).
- **Suggested action:** update the operation name in these 5 cases to the `salesRepOrderFilterRules`/`salesRepOrders(filter:)` pattern (schema-confirmed) via a targeted `/qa-review-tests --fix`. Not a BL invariant — a test-case/schema-contract staleness item.
