# [Sales Rep Hub] Customer profile sends the SalesRepCustomer query twice on every page load

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-11-2211-W2
**Tracker:** VCST-6813 (Low) · relates to VCST-6798 · **Severity:** Low

## Summary
`/company/my-customers/{organizationId}` sends `SalesRepCustomer` twice per load with identical variables; both 200, same data, page renders correctly — one wasted request per profile visit. Not new: seen on every build since 2026-10-14 (kb KB-E9DE91F6).

## Steps
1. Sign in as a sales rep serving at least one organization.
2. DevTools → Network, filter `graphql`.
3. Sales Rep Hub → My customers → click a customer (or open the profile URL directly).
4. Count `SalesRepCustomer` requests: 2 (expected 1).

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | two identical requests — `REG-2026-11-11-2211-W2/traces/SR-CP-053-FAIL-trace.json` |
| 2. Backend Admin | N/A | not admin-visible |
| 3. GraphQL xAPI | PASS | both responses correct and identical |
| 4. Platform REST API | N/A | — |

**Owning layer:** Layer 1 — the Sales Rep storefront plugin.

## Module Versions
Platform 3.1097.0 · theme 2.62.0-alpha.2647 · VirtoCommerce.SalesRep 3.1023.0 (vcst)

## Root Cause Analysis
Three components each call `useSalesRepCustomer(organizationId)`: `pages/customer-profile.vue:72`, `components/customer-profile-info.vue:33`, `components/customer-profile-actions.vue:80` (`src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/`, tag 3.1023.0). The composable runs with `HUB_FETCH_POLICY = "cache-and-network"` (`constants.ts:190`), so the cards that mount after the layout settles fire their own network request.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront (module-embedded storefront plugin)
- **Suggested repo:** VirtoCommerce/vc-module-sales-rep (`StorefrontApp/`)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Sales Rep Hub customer profile
- **RCA anchor:** `useSalesRepCustomer` callers above; `HUB_FETCH_POLICY` in `constants.ts:190`
- **Routing confidence:** MEDIUM (single repo; the fix choice — pass the page's result down vs. dedupe in the composable — is the developer's)
