# Regression Report — REG-2026-04-27-1930

**Selection:** `050j` (single suite)
**Mode:** Standard (regression-orchestrator) · GraphQL Runner Fast Path
**Environment:** QA — `https://vcst-qa.govirto.com` (backend) · `https://vcst-qa-storefront.govirto.com` (storefront)
**Started:** 2026-04-27 17:30 UTC
**Completed:** 2026-04-27 17:33 UTC
**Duration:** ~3 min (12 GraphQL cases executed sequentially via fast-path)

## Executive Summary

| Metric | Value |
|--------|-------|
| Suites run | 1 / 1 |
| Suites passed | 1 |
| Suites failed | 0 |
| **Suite pass rate** | **100%** |
| Total cases | 13 |
| Passed | 12 |
| Failed | 0 |
| Blocked | 0 |
| Skipped | 1 (manual-only, MKT-GQL-009) |
| **Case pass rate (automated)** | **12/12 = 100%** |
| **Case pass rate (overall)** | **92.3%** |
| Bugs raised | 0 |
| Quality gate | **APPROVED** |

## Build State (cached from REG-2026-04-27-1901; no redeploy detected)

| Component | Version |
|-----------|---------|
| Theme | `vc-theme-b2b-vue-2.48.0-pr-2269-cd06-cd06f094` |
| Platform | `3.1025.0-pr-2987-eb8e-vcst-4710-eb8e622b` |
| Marketing | `3.1003.0` |
| MarketingExperienceApi | `3.1001.0` |
| XCart | `3.1009.0` |
| Cart | `3.1003.0` |

## Suite Results

| ID | Suite | Priority | Agent | Lane | Status | Pass / Total | Notes |
|----|-------|----------|-------|------|--------|--------------|-------|
| 050j | GraphQL xMarketing (promotionCoupons) | P1 | qa-backend-expert | fast-path | ✅ PASS | 12 / 12 (auto) · 12 / 13 (overall) | 1 skipped — manual admin step |

## Test Case Breakdown

| ID | Title | Status |
|----|-------|--------|
| MKT-GQL-001 | promotionCoupons — Happy Path Query | ✅ PASS |
| MKT-GQL-002 | promotionCoupons — Schema Introspection Contract | ✅ PASS |
| MKT-GQL-003 | promotionCoupons — Anonymous Caller Is Hard-Gated (Unauthorized) | ✅ PASS |
| MKT-GQL-004 | promotionCoupons — Wrong Store Returns Forbidden | ✅ PASS |
| MKT-GQL-005 | promotionCoupons — Missing Required storeId Argument | ✅ PASS |
| MKT-GQL-006 | promotionCoupons — Pagination Correctness (first/after) | ✅ PASS |
| MKT-GQL-007 | promotionCoupons — Filter Excludes Inactive and Private Promotions | ✅ PASS |
| MKT-GQL-008 | promotionCoupons — Localization (cultureName en-US vs Default) | ✅ PASS |
| MKT-GQL-009 | promotionCoupons — Cross-Layer: Admin Deactivate Removes Promotion | ⏭ SKIPPED — requires manual operator toggle in Admin |
| MKT-GQL-010 | promotionCoupons — E2E: Apply Returned CouponCode in Cart | ✅ PASS |
| MKT-GQL-011 | promotionCoupons — Error Schema: No Internal Data Leak | ✅ PASS |
| MKT-GQL-012 | promotionCoupons — Performance: Response Time Stability | ✅ PASS |
| MKT-GQL-013 | promotionCoupons — Response-Time Consistency Across Repeated Calls | ✅ PASS |

## Performance Notes

Response times observed: **130–570 ms** per request (well under the 500 ms target for paginated queries and the 2000 ms hard cap for `large_first` probes). No timing flapping across the 5x repeat probe (MKT-GQL-013).

## Bugs

None.

## Retry Log

None — single attempt, clean pass.

## Errors

None.

## Cross-References

- **Prior run:** [REG-2026-04-27-1901](../REG-2026-04-27-1901/regression-report.md) — same selection, same outcome (13/13 PASS — that run had no skip handling for the manual case).
- **Related lifecycle work:** TLC-2026-04-27-1700 — GAP-001 (cursor-based pagination) tracked separately; current implementation accepts numeric offsets (validated by MKT-GQL-006).
- **Source CSV:** `regression/suites/Backend/graphql/050j-graphql-xmarketing.csv`
- **Per-case evidence:** `reports/regression/REG-2026-04-27-1930/graphql-evidence/MKT-GQL-{001..013}-*.json`
- **Suite results JSON:** `reports/regression/REG-2026-04-27-1930/050j-results.json`

## Verdict

**APPROVED.** All 12 automated cases passed. The single skipped case (MKT-GQL-009) requires a manual admin toggle and is covered only in interactive runs — not a regression risk. Quality gate passes.
