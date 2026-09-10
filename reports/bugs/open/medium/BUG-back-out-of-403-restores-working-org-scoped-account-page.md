# BUG — Browser Back out of a `/403` restores a working, org-scoped account page and stays there

## Status: CONFIRMED

**Severity:** Medium-High · **Priority:** Medium · **Found:** 2026-09-09
**Provenance:** **PRE-EXISTING** — the route guard's history-pop behaviour predates the VCST-5317 PRs. Surfaced by, but **not caused by**, `vc-frontend` #2469 / `vc-module-profile-experience-api` #145.
**Env:** vcst-qa — `FRONT_URL=https://vcst-qa-storefront.govirto.com`
**Found by:** `/qa-test VCST-5317` Step 4 frontend lane. This is `B2C-ORG-050`'s FAIL.

## Summary

When every organization membership is locked, `/account/dashboard` correctly redirects to `/403`. Pressing **Back** returns the user to `/account/dashboard`, which **renders its own org-scoped content and stays there** — no re-redirect. The route guard does not re-run on a history pop.

Notably the **switcher inside that restored page is correctly all-disabled**, so the client *did* re-evaluate the organization list. It is the route guard, not the data, that is skipped.

## Steps to reproduce

1. Multi-org buyer with **every** membership locked (V7): `npm run seed:membership-lock -- --lane frontend --state V7`.
2. Sign in and navigate to `/account/dashboard` → correctly redirected to `/403`.
3. Press the browser **Back** button.

**Actual:** lands on `/account/dashboard` rendering org-scoped content — "Latest orders", "Monthly spend report $58,152 / $530,152" — and **remains there**; no re-redirect after 5 s.
**Expected:** the guard re-evaluates on a history pop and returns the user to `/403` (or to a no-org-context state).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `S4-FE-BUG-ORG-050-back-out-of-403-restores-account-dashboard.png` |
| 2–4 | N/A / PASS | the server correctly refuses; the switcher on the restored page is all-disabled, proving the data layer re-evaluated |

**Owning layer:** Layer 1 — the Vue router guard.

## Root cause analysis

The `requiresOrganization` guard runs on navigation but not on a `popstate` restore, so the previously rendered view is re-shown from history without re-authorization. The rendered figures are the dashboard's static/mock "Monthly spend" widget (known not to be user-scoped), so this is a **stale-view** exposure rather than a fresh privileged data fetch — which is why it is graded Medium-High rather than High.

## Impact

A user with no accessible organization can return to, and sit on, an organization-scoped page they were just refused. What is visible is the previously rendered view rather than freshly fetched privileged data, which bounds it.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend · **Ownership hint:** platform
- **Component / module:** router guards — the `requiresOrganization` / `beforeEnter` path
- **RCA anchor:** the `requiresOrganization` guard registration in `client-app/router/` — **not precisely located this run**
- **Routing confidence:** **MEDIUM** — the behaviour is reproduced and the layer is certain; the exact guard registration was not pinned to a file:line.

## Relationship to other tickets

**Related, not duplicate,** to the open P0 `BUG-multiorg-no-self-recovery-when-pinned-org-blocked-VCST-5281.md`. That one is *"a user pinned to a blocked org cannot recover"*; this is the inverse — *the user can get back, but to a page they should not be on*. Different mechanism (route guard vs org resolution), different direction. Link them; do not fold.

## Evidence

- `reports/tickets/Sprint26-18/VCST-5317/screenshots/S4-FE-BUG-ORG-050-back-out-of-403-restores-account-dashboard.png`
- Carrier: `B2C-ORG-050` (High, `Draft`) — its `[NAV]` and `[DOM]` assertions fail; its two listbox assertions pass.

## Not claimed

- Whether the same history-pop gap affects other guarded routes (`/company/*`, checkout) was **not** swept — only `/account/dashboard` was exercised.
- No attempt was made to establish whether freshly privileged data can be fetched from the restored view; only that the view renders and persists.
