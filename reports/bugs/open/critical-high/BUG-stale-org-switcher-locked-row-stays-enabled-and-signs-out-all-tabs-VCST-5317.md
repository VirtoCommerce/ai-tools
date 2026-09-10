# BUG — Desktop org switcher: a tab that opened the switcher before the lock keeps the locked org enabled, and clicking it signs the user out of every tab

## Status: CONFIRMED

**Severity:** High · **Priority:** High · **Found:** 2026-09-09 · **Ticket:** VCST-5317 (**in-scope**)
**Env:** vcst-qa — `FRONT_URL=https://vcst-qa-storefront.govirto.com`
**Found by:** `/qa-test VCST-5317` Step 4 frontend lane (Round 2).

## Summary

PR #2469's locked-organization guard only protects the **freshly rendered** switcher. `GetOrganizations` is fetched **once per page load** — on first account-menu open — and then Apollo-cached for the life of the page. Any tab that opened the switcher *before* a lock lands keeps rendering that organization **enabled, full-contrast, with no padlock**, indefinitely across client-side navigation. Clicking that stale row signs the user out of **all** tabs, with no console error and no org-specific message.

This is the same class of defect as the mobile one (`VCST-5931`) reached by a different route: there, the guard was never written; here, the guard exists but the data it reads is stale.

## Steps to reproduce

1. Multi-org buyer, both memberships unlocked (fixture `MULTI_ORG_TF_BR_ALT`).
2. Sign in, open the account menu so the `Organizations` listbox renders once. Leave the tab open.
3. Out of band, lock the sibling org: `npm run seed:membership-lock -- --lane frontend --state V2`.
4. In the same tab, navigate **client-side only** (sidebar links — do not reload).
5. Re-open the account menu and inspect the locked org's row. Then click it.

**Actual:** the locked row is still **enabled, no padlock** — confirmed still enabled ~90 s after the lock, across multiple client-side navigations and popover open/close cycles. Only a **full page load** flips it. Clicking it signs the user out of every tab → `/sign-in?returnUrl=…`, with **no console error** and **no org-specific copy**.

**Expected:** within a bounded window the row reflects server state — disabled, padlocked — and clicking it is a no-op, exactly as on a freshly loaded page.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `S4-FE-BUG-stale-tab-locked-row-still-enabled.png`, `S4-FE-BUG-stale-row-click-signs-out-both-tabs.png` |
| 2. Backend Admin | N/A | not an admin-visible surface |
| 3. GraphQL xAPI | **PASS** | on a fresh load the same query returns the org correctly flagged `isLockedForCurrentUser: true` |
| 4. Platform REST API | **PASS** | `/connect/token` refuses correctly per `BL-AUTH-013` |

**Owning layer:** Layer 1 — the server is correct; the client serves a cached answer past its usefulness.

## Root cause analysis

`useUserOrganizations()` issues `GetOrganizations` once per page load and the result is Apollo-cached with no refetch on popover open, no TTL, and no invalidation on a switch failure. PR #2469's guard in `top-header-organizations.vue` (`selectOrganization()` early-return when `item.isLockedForCurrentUser`) reads that cached collection, so on a stale page **the predicate is evaluated against stale data and correctly returns "not locked"**. The guard is not broken — its input is.

Two consequences worth separating for the fix:
1. **Presentation** — the row renders enabled and unflagged, so the user has no signal.
2. **Failure handling** — the resulting refused switch produces a full sign-out rather than the org-specific message the server actually returns. `BL-AUTH-013` requires that copy be surfaced; here nothing is.

## Impact

A buyer who leaves a tab open — the normal case for a working session — sees a control that looks available, and using it costs them every tab, including the organization they can legitimately use. There is no error, so it reads as an unexplained logout.

**Bound:** the stale window ends at the next full page load. The cart is server-side and survives.

## Module versions

Platform `3.1064.0` · `ProfileExperienceApiModule 3.1018.0-pr-145-4fe6` · storefront `Ver. 2.58.0-pr-2469-83d6-83d6e5d5`. Both PRs **OPEN / unmerged**, PR-deployed to vcst-qa only.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** `useUserOrganizations` + `top-header-organizations.vue`
- **RCA anchor:** `client-app/shared/account/composables/useUserOrganizations.ts` (single fetch, cached) consumed by `client-app/shared/layout/components/header/_internal/top-header-organizations.vue` `selectOrganization()`
- **Routing confidence:** MEDIUM — the *symptom* is certain and reproduced; whether the right fix is a refetch-on-open, a cache TTL, or invalidation on a refused switch is a design call for the owning team.
- **Branch note:** PR #2469 is already open for this ticket and is where the guard was added.

## Evidence

- `reports/tickets/Sprint26-18/VCST-5317/screenshots/S4-FE-BUG-stale-tab-locked-row-still-enabled.png`
- `reports/tickets/Sprint26-18/VCST-5317/screenshots/S4-FE-BUG-stale-row-click-signs-out-both-tabs.png`
- Related, same feature, different route: `BUG-mobile-org-switcher-locked-row-unguarded-signs-user-out-VCST-5317.md` (filed as `VCST-5931`)

## Not claimed

- The exact staleness bound was not measured beyond **~90 s**; the assertion is "no refetch observed short of a full page load", not a specific TTL.
- `B2C-ORG-046` passes under its literal steps (menu opened for the first time *after* the lock). It only fails when the menu was opened first — that is this bug, not a `046` failure. That row wants a precondition note pinning the order.
