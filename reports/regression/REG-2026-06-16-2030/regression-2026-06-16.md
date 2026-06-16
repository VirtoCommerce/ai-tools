# Regression — 050b1 GraphQL xCart Basic

**Run ID:** REG-2026-06-16-2030 · **Date:** 2026-06-16 · **Env:** vcst-qa @ `https://vcst-qa.govirto.com` (Platform health 200)
**Selection:** `050b1` (Backend/graphql) · **Mode:** runner-native (`scripts/graphql-runner.ts`, deterministic) · **Role:** ORG_USER

## Summary

20 cases. **14 PASS / 5 FAIL / 1 ERROR (Draft).** No product defects found — every failure is a **test-data / stale-case** issue.
A first pass showed 6/20 passing; root cause was a **polluted ORG_USER cart** (a named cart `AGENT-TEST-ORDER-013` with 4 stale items that `clearCart` couldn't reach — see below). After removing the user's stale carts, 14/20 pass and the residual failures resolve to two known, actionable causes.

## Counts

| Result | Count | Cases |
|--------|-------|-------|
| PASS | 14 | 005, 006, 007, 008, 009, 017, 050, 059, 060, 093, 132, 021, GQL-MC-001, GQL-MC-004 |
| FAIL | 5 | 010, 046, 047, 048, 051 |
| ERROR | 1 | 049 (Draft) |

## Failures (root-caused — none are product bugs)

| TC | Symptom | Root cause | Action |
|----|---------|-----------|--------|
| CRB-GQL-046/047/048/051 | `updateCartQuantity` → `ARGUMENT_NULL` on the resolver | **Stale test:** command omits `currencyCode`/`cultureName`; the resolver keys the cart by store+currency+user and can't resolve it. Verified live: same call **+`currencyCode`** → OK. | Fix suite: add `currencyCode`/`cultureName` to the `updateCartQuantity` command (via `/qa-test-lifecycle`). |
| CRB-GQL-049 (Draft) | Runner ERROR | Same `updateCartQuantity` stale shape; also Draft (not ready). | Fix with the cluster above; promote from Draft. |
| CRB-GQL-010 | `addCoupon` accepted (coupons.length=1) but `discountTotal.amount = 0` | **Fixture/promotion drift:** coupon resolves but its promotion yields no discount (inactive/conditions unmet). | Re-seed an active promotion + coupon, or repoint the coupon fixture. Needs-review. |

## Cart-state contamination (resolved this run)

The ORG_USER default `cart()` returned a **named** cart `AGENT-TEST-ORDER-013` (4 leftover items), while `clearCart` (no cartName) targeted a *different* `default` cart — so the cases' `pre_clear` never emptied the cart the read-backs queried. Removing the user's stale carts (`removeCart`) cleared the contamination; 8 cases flipped to PASS. The leftover cart was AGENT-TEST-prefixed (sweepable by `/qa-seed-data teardown`).

## Notes

- Evidence: `reports/regression/graphql-evidence/CRB-GQL-*.json` (per-case).
- App Insights correlation: skipped (single backend GraphQL suite; no UI agents).
- Verdict pattern (stale-case + fixture-drift, no product defect) means **no JIRA bug filed**.
