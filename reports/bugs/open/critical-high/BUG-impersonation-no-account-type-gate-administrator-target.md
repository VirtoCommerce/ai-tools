# Impersonation has no account-type gate — an Administrator account can be impersonated `[P0]` `[Security]`

**Env:** vcst-qa @ Store `3.1007.0` · Customer `3.1023.0` · Theme `2.57.0-alpha.2490`
**Found by:** `/qa-regression` REG-2026-09-07-1342, suite 082 (`IMP-022`) · triaged `REAL_BUG` · live-verified 2026-09-08

## Summary

Neither the Admin SPA's "Login on behalf" entry point, the storefront's impersonation-verification form, nor the
`/connect/token grant_type=impersonate` OAuth endpoint checks the **target's account type**. An operator holding
only `loginOnBehalf` (no other administrative right) successfully minted a live storefront session impersonating
a platform user whose `Account type = Administrator` / `isAdministrator = true`. This is distinct from the
already-filed `BUG-nested-impersonation-privilege-escalation.md` (BL-AUTH-009, chained-token escalation) — that
defect is about a *second* impersonation riding an already-impersonated token; this one is a missing check on the
very *first* grant's target.

## Steps to reproduce

1. Sign in to Admin SPA (`{{BACK_URL}}/#!/workspace/security`) as an admin. Open Users, find an
   Administrator-type user with a `memberId`/`storeId` set (e.g. `e2e-test-store-administrator@e2e-contoso.com`,
   `userType=Administrator`, `isAdministrator=true`, `storeId=B2B-store`).
2. Open that user's detail blade. Observe the "Login on behalf" button is present in the toolbar.
3. Click it — a new tab opens `{{FRONT_URL}}/account/impersonate/<targetUserId>`, rendering the storefront's
   security-verification form (not a silent bypass).
4. Sign the verification form with `SUPPORT_AGENT` credentials (an operator whose own storefront role is
   "Organization maintainer" — not a platform admin, holds `loginOnBehalf` only).
5. `POST /connect/token grant_type=impersonate` → **HTTP 200**. Storefront redirects home with header
   **"John Mitchell logged in as [E2E Test] Store Administrator"**. `Back to John Mitchell` reverts cleanly.

## Expected vs actual

**Expected:** an Administrator-type target is refused at some layer — the Admin SPA button absent for
non-customer account types, or the OAuth grant rejecting a `user_id` whose `userType = Administrator`.
**Actual:** all three layers permit it. The button renders, the verification form accepts SUPPORT_AGENT's
credentials, and the token endpoint issues a valid 30-minute Bearer for the Administrator target with no
account-type check anywhere in the chain.

![Login on behalf present on an Administrator-type user's blade](../../../regression/REG-2026-09-07-1342/screenshots/IMP-022-VERIFY-button-present.png)
![Impersonation succeeded — header shows the operator logged in as the Administrator target](../../../regression/REG-2026-09-07-1342/screenshots/IMP-022-VERIFY-REPRODUCED-admin-impersonated.png)

## Note on a secondary, non-blocking target

A second Administrator-type target (`demo_admin`, no `Container/storeId` configured) refused with *"Store URL was
not added to the store setting. Please contact administrator"* — a **store-configuration** block, not an
account-type refusal. It happens to be harmless here only because that particular admin record has no store
context; it is not a defense against this defect and must not be read as one.

## Root cause (hypothesis)

No layer in the impersonation chain (Admin SPA blade toolbar, storefront `impersonate.vue` verification gate,
platform `/connect/token grant_type=impersonate`) checks the target's `userType`/`isAdministrator`. The existing
`SecurityLoginOnBehalf` permission check (see `AuthorizationController.IsImpersonateGrantType()`, referenced in
the sibling `BUG-nested-impersonation-privilege-escalation.md`) authorizes the *operator*, never inspects the
*target*.

## Impact

An operator with only `loginOnBehalf` — a support-desk-level permission — can obtain a live, fully-functional
session as a platform Administrator-type account. Combined with whatever the Administrator account can reach on
the storefront (and any Admin-SPA-adjacent capability an Administrator-type contact carries), this is a privilege
boundary gap distinct from, and independent of, the chained-token escalation already filed.

## Fix Routing

- **Primary:** `vc-platform` `AuthorizationController` (or the impersonation grant handler) — reject
  `grant_type=impersonate` when the resolved target's `userType`/`isAdministrator` marks it as a non-customer,
  administrative account; only a customer-type target may be impersonated.
- **Defense-in-depth:** Admin SPA — hide/disable "Login on behalf" on an Administrator-type user's blade
  (`impersonation-menu` widget in whichever `vc-module-*` or platform Web module owns the Users blade toolbar).
- **Layer:** backend (platform token endpoint), with an Admin SPA UI companion.
- Do NOT auto-merge — human review required.
