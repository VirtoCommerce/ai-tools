# Regression Run — Coupons Cart-Sidebar Smoke

| | |
|---|---|
| **Run ID** | REG-2026-05-12-1100 |
| **Date** | 2026-05-12 |
| **Selection** | Coupons (cart-sidebar smoke subset) — user-curated CPN-054..060 from Suite 077 |
| **Trigger** | Follow-up to VCST-5016 verification (Coupons sidebar "View all" link `rel` fix) |
| **Environment** | vcst-qa — `https://vcst-qa-storefront.govirto.com` |
| **Theme** | `vc-theme-b2b-vue-2.49.0-pr-2289-e5ef-e5ef1b1f` (PR #2289 build) |
| **Browser** | playwright-chrome (Chromium, isolated MCP context) |
| **Mode** | Standard (1 suite, 1 agent — no parallelism needed) |
| **Seed profile** | None — relied on existing public-active coupons in store |
| **Teardown** | None |
| **Started / Completed** | 2026-05-12 11:00:00 → 11:17:00 EEST (~17 min) |

## Executive Summary

| Metric | Value |
|---|---|
| Suites planned | 1 |
| Suites run | 1 |
| Suites passed | 1 |
| **Suite pass rate** | **100.0%** |
| Test cases planned | 7 |
| Test cases passed | 7 |
| Test cases failed | 0 |
| Test cases blocked | 0 |
| Test cases skipped | 0 |
| **Test pass rate** | **100.0%** |
| Bugs filed | 0 |
| Retries | 0 |

**Verdict: GREEN ✅** — Cart Sidebar Coupons (VCST-4896 feature) is fully functional on this PR build. No regressions detected.

## Suite Results

| Suite | Tests | Pass | Fail | Blocked | Pass % | Verdict | Duration |
|---|---:|---:|---:|---:|---:|---|---:|
| 077-smoke-cart-sidebar — Coupons & Promotions Storefront (Cart Sidebar subset) | 7 | 7 | 0 | 0 | 100.0% | ✅ PASS | ~17 min |

## Per-Test Detail

| ID | Title | Priority | BL/ECL | Status | Notes |
|---|---|---|---|---|---|
| CPN-054 | Cart Page — Coupon Sidebar Shows Preset Coupon Cards from promotionCoupons Query | Critical | BL-CART-003 | ✅ PASS | — |
| CPN-055 | Cart Page — Clicking Preset Coupon Card Apply Button Applies Coupon and Shows Discount | Critical | BL-CART-003 | ✅ PASS | — |
| CPN-056 | Cart Page — Removing Applied Coupon via Sidebar Restores Original Cart Total | Critical | BL-CART-003 | ✅ PASS | Evidence screenshot captured: `screenshots/CPN-056-before-remove.png` |
| CPN-057 | Cart Page — Expired Coupon Not Shown in Sidebar Preset Cards | High | BL-PRICE-002, ECL-09.1 | ✅ PASS | Expired `EXPIRED-TEST` correctly excluded |
| CPN-058 | Cart Page — Unauthenticated User Does Not See Preset Coupon Cards in Sidebar | High | BL-CART-003 | ✅ PASS | Signed-out via popup logout per Phase 4 GOLDEN RULE |
| CPN-059 | Cart Sidebar — Percentage Coupon Applied to Sale Price, Not List Price (BL-CART-003) | High | BL-CART-003, ECL-03.1 | ✅ PASS | Discount = $99.99 × 10% = $9.999 — applied to sale price, not list price |
| CPN-060 | Cart Sidebar — Only Best Coupon Discount Applied When Multiple Applied (BL-CART-009 Radio Policy) | High | BL-CART-009, ECL-03.2 | ✅ PASS | BestRewardPromotionPolicy silently drops `FIXED5` in favor of higher-value `EXCLUSIVE10` — single discount entry in cart |

## Business Rule Coverage

| BL / ECL | Verified by | Result |
|---|---|---|
| BL-CART-003 — Coupon discount applies to effective (sale) price, not list | CPN-054, 055, 056, 058, 059 | ✅ Confirmed |
| BL-PRICE-002 — Expired promotions excluded from `promotionCoupons` query | CPN-057 | ✅ Confirmed |
| BL-CART-009 — BestRewardPromotionPolicy selects single highest-value reward | CPN-060 | ✅ Confirmed |
| ECL-09.1 — Expired-coupon edge case | CPN-057 | ✅ Confirmed |
| ECL-03.1 — Discount-with-sale-price edge case | CPN-059 | ✅ Confirmed |
| ECL-03.2 — Multi-coupon stacking edge case | CPN-060 | ✅ Confirmed |

## Bugs Found

None.

## Retry Log

None — all suites passed on first attempt.

## Cross-Reference with VCST-5016

This regression run was triggered immediately after verifying VCST-5016 (the `rel="noopener noreferrer"` fix on the cart Coupons-section "View all" link). The 7 cases here verify the **broader** Coupons sidebar feature (VCST-4896) introduced alongside the fix. Result: the parent feature is healthy — VCST-5016's fix did not regress the sidebar behavior.

## Test Data Used

- `@td(COUPONS.percentageCode)` → `QA10OFF` (10% off cart, unlimited uses, expires 2026-12-31)
- `@td(COUPONS.fixedAmountCode)` → `FIXED5` ($5 fixed off cart subtotal)
- `@td(COUPONS.expiredCode)` → `EXPIRED-TEST` (expired promotion)
- Additional coupon discovered in store: `EXCLUSIVE10` (10% off, higher cart-value than FIXED5 → wins under BestReward)

## Evidence

- `suite-077-smoke-cart-sidebar-results.json` — full per-test JSON (test-runner-agent Phase 5 schema)
- `screenshots/CPN-056-before-remove.png` — coupon-removal evidence
- HAR file — auto-captured at `test-results/chrome/` (per-step network traffic)

## Run Metadata

- **Suite CSV:** `regression/suites/Frontend/marketing/077-smoke-cart-sidebar.csv` (header + CPN-054..060 extracted from Suite 077)
- **Status tracker:** `reports/regression/test-run-status.json` (this run marked complete after report generation)
- **Agent dispatched:** `test-runner-agent` (sonnet) on `playwright-chrome` slot
- **Test data resolver:** `scripts/lib/test-data-resolver.ts` (`@td()` resolves at runtime)

## Recommendation

PR #2289 (VCST-5016 fix) and the broader VCST-4896 feature are ready to merge. No follow-up bugs from this run.
