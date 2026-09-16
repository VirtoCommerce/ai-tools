# BUG: Three Sales Rep hub failures now have NO user-visible signal at all

## Status: MOSTLY RESOLVED by PR #2443 — one instance left (draft, not filed)

**Severity: Low** (nothing is blocked and a refresh recovers; but the rep is either told nothing, or told
something untrue, when a request fails).

**Env:** vcptcore-qa @ Theme `2.56.0-pr-2432-fbea` (vc-frontend PR #2432, VCST-5682) · store `B2B-store` · rep `@td(SR_REP_PRIMARY)`

## Summary
PR #2432 suppresses the global error toast for all twelve Sales Rep hub reads on the premise that each
surface already names its own failure inline. That premise holds for most of them — but for **three** it
does not, and the toast was their only signal. After the fix those failures are silent or, worse, mislabelled.

| # | Failing operation | Before PR #2432 | After PR #2432 |
|---|---|---|---|
| 1 | `SalesRepCustomer` (`/company/my-customers/<id>`) | "Customer not found or not in your customers." **+ toast** | the same **"not found"** verdict, no toast — a transient failure reads as "this customer isn't yours" |
| 2 | `SalesRepCustomersCount` (sidebar badge) | badge renders without its number **+ toast** | badge silently renders "My customers" with **no number** and no explanation |
| 3 | `SalesRepOrderFilterRules` (Recent orders status tabs) | tabs row absent **+ toast** | the whole status-tab row **silently disappears**; the rep sees an unfiltered list with no filter UI and no hint that anything failed |

Same applies to the sibling rule queries (`SalesRepOrderSortRules`, `SalesRepTopSellerFilterRules`,
`SalesRepTopSellerSortRules`) — controls fall back to baseline with no signal.

## Steps to Reproduce
1. Sign in as a Sales Rep; open the surface named in the table.
2. Force **only** that one operation of `POST /graphql` to fail (500); leave every other operation passing.
3. Reload.

**Expected:** the surface names the failure the way its siblings already do — "Couldn't load …" for the
widget/table, an explicit banner for the layout (`SalesRepLayout` is the good example: *"The saved layout
could not be loaded, so the default arrangement is shown."*), and a load-failure state — **not** a
not-found verdict — on the customer profile.
**Actual:** per the table above.

## A/B evidence (pre-fix vs post-fix, both live)
Pre-fix build vcst-qa `2.56.0-pr-2437` (no `suppressErrorNotifications` marker) vs fixed build vcptcore-qa
`2.56.0-pr-2432`:

| Case | Pre-fix toast | Post-fix toast | Post-fix inline signal |
|---|---|---|---|
| `SalesRepCustomersCount` | 1 | 0 | none (number just vanishes) |
| `SalesRepOrderFilterRules` | 1 | 0 | none (tab row just vanishes) |
| `SalesRepCustomer` | 1 | 0 | wrong ("not found") |

## Provenance
Collateral of PR #2432 (VCST-5682) — the fix itself is correct and verified; these three surfaces simply
never had the inline state the PR assumed. Not a reason to hold the fix: pre-fix these cases showed a
misleading *page-level outage* toast for one degraded control, which is the very thing VCST-5682 removed.

## Fix Routing
`vc-frontend`, `modules/sales-rep`: give each of these composables' consumers an `error` branch —
`useSalesRepCustomer` (load-failure state distinct from not-found), `useSalesRepCustomersCount` (badge
fallback marker), and the rule-driven controls (keep the control visible with a "couldn't load filters"
state, or a small inline notice). BL-SR-012 — a failure state must stay distinguishable from "no data".

Evidence: `reports/tickets/Sprint26-15/VCST-5682/screenshots/VCST-5682-finding-customer-profile-misleading-not-found.png`,
verification report `reports/tickets/Sprint26-15/VCST-5682/verification-report.md`


## Re-test 2026-08-19 — vcst-qa @ theme `2.56.0-pr-2443-0e61`
[PR #2443](https://github.com/VirtoCommerce/vc-frontend/pull/2443) *"keep a failure signal where the toast was
suppressed"* answers two of the three instances; verified live:

| # | Instance | State on pr-2443 |
|---|---|---|
| 1 | `SalesRepCustomer` | **FIXED** — "This customer couldn't be loaded. Try refreshing the page.", and a genuine not-found still says "Customer not found or not in your customers." |
| 3 | rule queries (orders + top sellers) | **FIXED** — new `sales-rep-rule-alert.vue` renders the filter / sort / both variants, localized (checked en + de), desktop and mobile |
| 2 | `SalesRepCustomersCount` badge | **STILL OPEN** — the badge renders "My customers" with no number and no signal; `useSalesRepCustomersCount` is not touched by PR #2443 |

Remaining scope is instance 2 only: lowest impact of the three (no wrong information shown, nothing blocked).
Either accept it as-is or give the badge a fallback marker.
