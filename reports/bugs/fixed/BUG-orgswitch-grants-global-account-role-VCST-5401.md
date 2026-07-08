# BUG — Storefront sign-in / organization switch writes a GLOBAL platform role onto the customer account (privilege escalation) `[High / P1]`

## Status: FIXED
**JIRA:** VCST-5401 (Bug, High, filed 2026-06-30; relates to VCST-5028). **Closed as Fixed/Done.**

## Resolution
- **Fixed in:** `VirtoCommerce.Customer 3.1014.0` line (VCST-5028 / vcst-5239) — `OrganizationIdClaimProvider` reworked to claim-only, no global-role-join write. PR #300 merged 2026-06-19.
- **JIRA:** VCST-5401 (closed Fixed/Done)
- **Verified:** 2026-07-08
- **Verification method:** QA re-verification — CP0→CP5 sequence, 30+ fresh-token REST polls all `roles: []` + source confirmation (see block below). JIRA comment #102389.
- **Follow-up owed:** one-off cleanup sweep for accounts escalated by the old build (rows persisted past sign-out); `ron.wisley` confirmed clean.

---

## QA Re-verification — 2026-07-08 (does NOT reproduce)

**Re-run of the exact CP0→CP5 sequence on the current deployed build — escalation gone.**

**Build then vs now:** ticket filed against Platform 3.1041.0 · **Customer PR #300** (`3.1010.0-pr-300`) · **ProfileExperienceApi PR #135**. Currently deployed: **`VirtoCommerce.Customer 3.1014.0-alpha.1002-vcst-5239`** · **`ProfileExperienceApiModule 3.1010.0-pr-137`** · storefront theme `2.53.0-pr-2354`. The buggy build is no longer live.

Account `roles[]` from `GET /api/platform/security/users/ron.wisley@hogwarts.com` (admin OAuth, fresh token per read):

| CP | Action | account `roles[]` | reads | modifiedDate / by |
|----|--------|-------------------|-------|-------------------|
| 0 | baseline (no session) | `[]` | 5/5 stable | 10:15:28 · `http:anonymous` |
| 1 | signed in → lands on "Quoted" | `[]` | 5/5 stable | 11:14:21 · `http:anonymous` |
| 3 | switched active org → Müller | `[]` | 5/5 stable | 11:14:21 (unchanged) |
| 4 | rotated all orgs (Quoted→Müller→Hogwarts) | `[]` | **15/15 stable** | 11:14:21 (unchanged) |
| 5 | signed out, waited ~10s | `[]` | 5/5 stable | 11:14:21 (unchanged) |

30+ fresh-token polls, **all `roles: []`** — no flapping, no union of membership roles, no `org-maintainer`/`purchasing-agent` written. The privilege escalation is gone. `isAdministrator` stayed `false`.

**Residual (not the defect):** sign-in still bumps the account `modifiedDate` to login time via `http:anonymous` while writing **no** roles — ordinary sign-in bookkeeping (e.g. last-login/security-stamp), not a role-join write. The role-persistence part of the original bug is absent.

**Source confirms the fix.** Current `dev` `OrganizationIdClaimProvider.AddOrgScopedPermissionsAsync` (`src/VirtoCommerce.CustomerModule.Data/OpenIddict/OrganizationIdClaimProvider.cs`) now:
- resolves membership for the **active org only** (`GetByUserAndOrgAsync(userId, organizationId)`) — no longer iterates the union of all memberships;
- adds each role's permission claims to the **token principal only** (`identity.AddClaim(...).SetDestinations(AccessToken)`) — permissions stay in the JWT claim layer;
- contains **no** `UserManager`/`RoleManager.AddToRoleAsync` / `AspNetUserRoles` write — it never persists roles onto the global `ApplicationUser`.

This is exactly the fix the RCA below prescribed ("keep org-membership roles in the claim layer; never mutate `ApplicationUser.Roles`"). PR #300 (VCST-5028) merged 2026-06-19; the escalation was later removed on the VCST-5028/vcst-5239 line now deployed.

**Not done here (needs a human decision):** JIRA not commented/transitioned; report not moved to `fixed/`; the ticket is still In Progress with the dev. Formal closure is `/qa-verify-fix VCST-5401`. **One-off cleanup still owed** for any live accounts that had escalated rows written by the old build (the original bug persisted past sign-out) — verify `ron.wisley` and peers are clean.

---

<details><summary>Original report as filed 2026-06-30 (bug DID reproduce on Customer PR #300)</summary>

**Env:** vcst-qa @ Platform 3.1041.0 · Customer module (VCST-5028, PR #300) · ProfileExperienceApi (VCST-5028, PR #135) · theme 2.52.0-alpha.2394.
**Feature:** VCST-5028 — per-organization roles & access control. **Related:** `BUG-org-scoped-maintainer-perms-not-honored-VCST-5028` (fixed), VCST-5314.

## Summary
A B2B customer (`ron.wisley@hogwarts.com`) whose permissions are supposed to come **only** from per-organization `OrganizationMembership` roles gains a **global platform account role** ("Organization maintainer") on the security account simply by signing in and/or switching active organization in the storefront. The account's authoritative baseline is `roles: []`; immediately after a storefront org session, the Platform Security REST read returns `roles: [{ id: "org-maintainer", name: "Organization maintainer" }]` with the account `modifiedDate` equal to the login time (`modifiedBy: http:anonymous`). This is a privilege-escalation + data-integrity defect: an org-scoped membership role is being promoted into the global account `Roles` slot.

## Steps to Reproduce
**Fixture:** `ron.wisley@hogwarts.com` / `Password1!` — member of 3 orgs with distinct roles: Hogwarts = *Organization maintainer*, "Müller" % Schmidt GmbH = *Purchasing agent*, "Quoted" Double Quotes = *Organization maintainer*. memberId `7eda4b02-2bf8-4408-b8d6-078c0722c8ca`, account id `f36e4331-d271-4749-985e-f336883a9a71`.

1. **Baseline (no active storefront session):** as platform admin, `GET {BACK_URL}/api/platform/security/users/ron.wisley@hogwarts.com` → `roles: []`, `isAdministrator: false`, `userType: Customer`. *(The Security REST route is `/api/platform/security/users/{userName}` — `/api/security/users/...` 404s.)*
2. On the storefront, **sign in** as `ron.wisley@hogwarts.com` and switch the active organization through the org switcher (Hogwarts → Müller → Quoted).
3. **Re-read** `GET {BACK_URL}/api/platform/security/users/ron.wisley@hogwarts.com` (poll a few times — see read-replica lag below) → global `roles[]` now holds the **union of the contact's per-org membership roles**.
4. **Sign out** and re-read → roles still present (persists).

**Clean sequential repro (single Chrome storefront session + curl REST, fresh admin token per read):**

| CP | Action | account `roles[]` | modifiedDate |
|----|--------|-------------------|--------------|
| 0 | baseline, no storefront session (admin had cleared at 13:26) | `[]` (stable) | 13:26:14 by `admin` |
| 1 | signed in → lands on Hogwarts | `[]`* | 13:29:49 by `http:anonymous` |
| 3 | switched active org → "Müller" % Schmidt GmbH | **`[org-maintainer, purchasing-agent]`** | 13:29:49 (unchanged) |
| 4 | switched active org → "Quoted" Double Quotes | **`[org-maintainer, purchasing-agent]`** | 13:29:49 (unchanged) |
| 5 | signed OUT, waited ~65s | **`[org-maintainer, purchasing-agent]` — PERSISTS** | 13:29:49 (unchanged) |

\* CP1's single `[]` was a stale-replica read; `org-maintainer` was already written at sign-in (present by CP3). **Trigger = establishing/switching storefront org context** — sign-in writes the first membership role(s); switching accumulates the rest until the account holds the **union of all** the contact's org-membership roles (`org-maintainer` ← Hogwarts+Quoted, `purchasing-agent` ← Müller). `isAdministrator` stays `false` throughout.

## Expected vs Actual
- **Expected:** the customer account's global `roles[]` stays **empty**. Per-org permissions are delivered via the JWT / `OrganizationMembership` role for the active org only; signing in or switching org must never mutate the platform account's global role assignment.
- **Actual:** after the storefront org session the account's global `roles[]` holds the **union of all the contact's per-org membership roles** — `org-maintainer` ("Organization maintainer") + `purchasing-agent` ("Purchasing agent") — written by the sign-in/org-context path and **persisting beyond sign-out**.

## Evidence
- Platform REST ground truth (admin OAuth, populated read), verbatim: `roles: [{ id: "org-maintainer", name: "Organization maintainer", permissions: [] }, { id: "purchasing-agent", name: "Purchasing agent", permissions: [] }]`, `isAdministrator: false`, `userType: Customer`. Payload: `tests/Sprint-current/VCST-5028-rolecheck/rest-evidence-populated-roles.json`.
- The written role ids/names are **identical to the customer-module org-membership roles** — i.e. per-org membership roles promoted into the GLOBAL platform-account `roles[]` slot. Both currently expand to `permissions: []` (possibly inert *today*, but the global assignment itself is the design violation).
- **Read-replica / cache lag:** every populated checkpoint *flaps* between `[]` and the 2-role set across consecutive reads, and `modifiedDate` **never advances past the sign-in time** even when roles populate → the role rows are written to the user-role join (e.g. `AspNetUserRoles`) **without bumping the user entity's `modifiedDate`**, and a read-replica/cache serves the pre-write state intermittently. This is why the storefront GraphQL `me.securityAccounts[].roles` read `[]` (hit stale reads) and why the first investigation flip-flopped. **Poll the REST read a few times to beat the lag.**
- Screenshots: `tests/Sprint-current/VCST-5028-rolecheck/screenshots/admin-org-memberships-PRE.png` (org→role grid). Admin SPA POST-switch Roles-widget capture not obtained (Firefox CLS click-stability quirk on the blade widgets); the REST payload is the higher-authority Layer-4 proof.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A (trigger) | The sign-in/org-switch is the user action that triggers the write; storefront GraphQL `securityAccounts.roles` itself shows `[]`. |
| 2. Backend Admin | FAIL (inherited) | Account Roles widget shows the spurious global "Organization maintainer" role after the storefront session. |
| 3. GraphQL xAPI | N/A | `me`/pageContext does not expose/own the account-role write; perms shown scoped correctly. |
| 4. Platform REST API | **FAIL (owning)** | `GET /api/platform/security/users/ron.wisley@hogwarts.com` returns global `roles: [org-maintainer]` after sign-in/org-switch; baseline `[]`. The global account role is persisted at the platform layer. |

**Owning layer:** Layer 4 — the global account role is written by the sign-in / org-context resolution path (Customer module), persisted on the platform security account.

## Root Cause Analysis (hypothesis — to confirm with source)
The VCST-5028 sign-in / active-org resolution path (`vc-module-customer` — `OrganizationIdClaimProvider` and/or a sign-in / `SecurityAccount` reconciliation handler introduced in PR #300) **persists the contact's `OrganizationMembership` roles into the platform account's global role join (`AspNetUserRoles`)** instead of keeping them scoped to the issued JWT claim. Evidence the write lives in this path: it fires at sign-in/org-context establishment (`modifiedBy: http:anonymous`), it writes the **union of all** membership roles (not just the active org's — so it iterates the contact's memberships), it uses the **same role ids** as the membership roles, and it bypasses the user-entity audit (`modifiedDate` not bumped → a direct join-table insert, not an `ApplicationUser` save). The fix must keep org-membership roles in the membership/claim layer and **never mutate `ApplicationUser.Roles` / the user-role join** from the storefront sign-in/org-switch path. (Existing escalated rows on live accounts will need a one-off cleanup since they persist.)

## Impact
A customer-type B2B account silently acquires a **global** platform role through a normal storefront login/org-switch. Even though the storefront UI scopes correctly today, any other consumer of the platform account's global roles (Admin SPA authorization, other modules, subsequent token issuance) may honor the escalated role across all orgs — a cross-scope privilege-escalation and data-integrity defect. High/P1 (re-weigh to P0 if the global role is shown to grant admin-SPA or cross-org access).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — Platform / Customer module sign-in & org-context resolution
- **Suggested repo:** VirtoCommerce/vc-module-customer
- **repoKind:** module
- **Component / module:** Customer — `OrganizationIdClaimProvider` / sign-in (active-org) reconciliation that touches `ApplicationUser.Roles` (PR #300, VCST-5028)
- **RCA anchor:** the VCST-5028 sign-in/claim path writing the active-org membership role into the platform account's global `Roles` (search `OrganizationIdClaimProvider` and any `SaveChangesAsync`/role-merge on the user account in the sign-in flow); confirm with `modifiedBy: http:anonymous` write at login.
- **Routing confidence:** MEDIUM — owning layer (Layer 4 REST/platform account) is confirmed by the REST baseline-vs-post diff; exact write site to be confirmed via `search_code`. If the write turns out to originate in xProfile (ProfileExperienceApi PR #135) the route shifts to `vc-module-profile-experience-api`.

</details>
