# Test Execution Report — VCST-5101 [Loyalty][Mixed Cart] Add Loyalty Product to Cart

**Verdict: PASS — fix verified 2026-06-10 (both layers).** The 2026-06-09 FAIL (Task-1 AC: promotion not scoped to primary-currency lines) was fixed in `vc-module-x-cart` PR #120 (`RewardExtensions.cs:201` currency filter) and re-verified on vcst-qa. All AC now pass.

- **Env:** vcst-qa @ Platform 3.1035.0 · theme/vc-frontend 2.51.0-pr-2310(-eb35) · XCart pr-120 (currency-filter fix live) · Cart pr-188 · store B2B-store · loyalty `PTS`, mode "Mixed Cart"
- **Date:** 2026-06-09 (initial FAIL) → 2026-06-10 (fix verified) · **Priority:** P1 / revenue-critical cart · **Agents:** qa-testing-expert (exploratory + live) + xAPI runner; same build/env across both passes
- **Re-test:** `reports/regression/REG-2026-06-10-1645/regression-2026-06-10.md` — 18 cases (14 GraphQL + 4 UI CSV) + directed UI flow + 6-run repro matrix, all PASS

## Acceptance Criteria
| AC | Result | Evidence |
|---|---|---|
| **Task 1** — `cart.cartTotals` per-currency; primary-only → 1 element | ✅ PASS | GQL-MC-002/004 PASS; CART-071 VERIFIED |
| **Task 1** — tax & **promotion only on primary-currency lines** | ✅ **PASS (fixed 2026-06-10)** | Was FAIL (Bug 1). Post-fix: coupon QA10OFF = 10% × USD-only, invariant to PTS presence/qty/selection/deletion. GQL-MC-006/010/011 flipped RED→GREEN; UI delta $8.72 = 10% × $87.20 USD |
| **Task 2** — mutation adds loyalty product with currency (`itemCurrencyCode`) | ✅ PASS | GQL-MC-001/005 PASS |
| **Task 3** — cart summary splits line items + totals by currency | ✅ PASS | CART-071/072, LOYF-025 VERIFIED; "Products in PTS" + "Total in PTS" |
| **Constraint** — exclude configurable products | N/A — **out of scope** | Configurable products are out of scope for VCST-5101 (ticket note + confirmed 2026-06-09). Their behavior in the loyalty catalog is not asserted/tested and any configurable anomaly there is not a VCST-5101 defect. |

## Bugs

### Bug 1 — Cart-% coupon over-discounts by folding the PTS line into the USD base `[High / revenue]` — **FIXED, verified 2026-06-10**
> Resolved in `vc-module-x-cart` PR #120 — `RewardExtensions.cs:201` `subTotalExcludeDiscount` sum now currency-filters to primary-currency selected lines. Re-test: coupon = 10% × USD-only (UI $8.72 = 10% × $87.20; GraphQL $16 = 10% × $160), invariant to PTS qty/selection/deletion; fixed-$ coupon, auto promo, mergeCart guards unregressed. Full report: `reports/bugs/fixed/BUG-mixed-cart-coupon-pts-leaks-into-usd-discount.md`. Original FAIL evidence below retained for history.
- **STR:** VIP user, Mixed Cart. Add 1 USD item + 1 PTS loyalty item → apply coupon `QA10OFF` (10% off cart). Step the PTS qty 1→2→3 with the USD line held constant.
- **Actual:** USD discount grows **+$8.00 per +PTS80** (−$51.40 → −$59.40 → −$67.40). API `discounts[]` coupon amount $36.40 = 10% × ($124 USD **+ 240 PTS-as-USD**) = 10% × $364. PTS block stays PTS0.00.
- **Expected:** 10% × $124 USD = **$12.40**, independent of PTS quantity (Task-1: promotion on primary-currency lines only).
- **Scope:** cart-subtotal **% coupon** only. The automatic −20% promotion scopes correctly (PTS discount = 0). Likely backend (mixed-cart promotion/coupon discount-base in the Cart/XCart calc or Marketing reward application).
- **Evidence:** `screenshots/VCST-5101-BUG-pts-qty-leaks-usd-discount.png`, `screenshots/cart-resp-coupon-pts-leak.json` (API). Confirmed two-source (UI qty-step repro + API payload).
- **Coverage gap:** no generated case covered promotion-on-mixed-cart (was flagged exploratory-only) → add a regression case.

## Risks / Questions / Observations
- **Configurable products — out of scope (no longer tracked):** VCST-5101 excludes configurable products; their behavior in the loyalty catalog (grid listing, $0.00/EUR PDP pricing, add-to-cart state) is **not** a VCST-5101 concern and is not tracked here. No test case retained for it (LOYF-026 removed).
- **Risk 2:** Apollo `error 13: Missing field 'currencyCode'` fires on **every** cart mutation (incl. guest USD-only add — broader than first noted). Non-fatal, client-side only; root-caused in `reports/bugs/BUG-mixed-cart-currencyCode-apollo-cache-write.md`. Backend confirmed to return `currencyCode` correctly.
- **Observations (PASS):** persistence across reload; guest→sign-in merge preserves both currencies; remove-all-primary → PTS-only cart renders cleanly (USD block → $0.00, no break); line independence (qty/select on PTS doesn't touch USD); a "Pay with points" payment method is present in the cart payment dropdown (loyalty-relevant, not exercised).

## Cleanup
No order created (stopped at place-order boundary). Cart cleared, VIP user logged out. One AGENT-TEST address created during checkout setup — sweepable by `/qa-seed-data teardown`.

## Artifacts
`tests/Sprint26-11/VCST-5101/` — testing-checklist.md, exploratory-session.md, summary.json, screenshots/ (7 files). xAPI case evidence under `reports/regression/graphql-evidence/`.
