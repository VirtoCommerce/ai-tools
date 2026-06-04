# Regression Report — REG-2026-06-04-1321

- **Selection:** 050j (GraphQL xMarketing — promotionCoupons) · **Env:** vcst-qa · **Mode:** graphql-runner (runner-native, no browser)
- **Build:** Platform 3.1032.0 · Theme 2.51.0-alpha.2362 · MarketingExperienceApi **3.1002.0-pr-16-3e3b** (PR #16 artifact) · Marketing 3.1003.0

| Suite | Cases | Pass | Fail | Skip | Verdict |
|-------|-------|------|------|------|---------|
| 050j | 20 | 18 | 0 | 2 | **PASS** |

**Passes:** MKT-GQL-001..008, 010..016, 018, 019, 020 (93/93 assertions).
**Skips (by design, not regressions):** MKT-GQL-009 (cross-layer case requires manual admin deactivate step; deterministic across retry), MKT-GQL-017 (`@needs-env-without-xmarketing` — module installed on vcst-qa).

**VCST-5022 sort fix confirmed on this build:** endDate:asc first=`super` (null endDates first) vs endDate:desc first=`E2E-COUPON` (2026-12-31) vs no-sort first=`SUPER` — all distinct; name:asc lexicographic; invalid sort (`doesnotexist:asc`) still silently accepted per PR #16 deferred-validation contract.

**Bugs Found:** none.
**Watch item:** MKT-GQL-010 cart mutations slow (clearCart 3.6s / addItem 2.9s / addCoupon 5.8s — no assertion impact; promotionCoupons query itself 184ms). Likely XCart projection settle, not xMarketing.
**Fixed during run:** `config/test-suites.json` 050j testCount 16→20 (stale after TLC-2026-06-04-1309 additions).
**Evidence:** `reports/regression/graphql-evidence/MKT-GQL-*-17805724*.json`

**Quality Gate: PASS** — 0 failures, P1 suite green on the PR artifact.
