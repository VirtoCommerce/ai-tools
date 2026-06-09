# Test Execution Report — VCST-5101 [Loyalty][Mixed Cart] Add Loyalty Product to Cart

**Verdict: FAIL** — Task-1 AC violated (promotion not scoped to primary-currency lines). Feature is otherwise functional.

- **Env:** vcst-qa @ Platform 3.1035.0 · theme 2.51.0-pr-2310 · XCart pr-120 · Cart pr-188 (all deployed) · store B2B-store · loyalty `PTS`, mode "Mixed Cart"
- **Date:** 2026-06-09 · **Priority:** P1 / revenue-critical cart · **Agents:** qa-testing-expert (exploratory + live) + xAPI runner; execution evidence from this session's live verification (same build/env)

## Acceptance Criteria
| AC | Result | Evidence |
|---|---|---|
| **Task 1** — `cart.cartTotals` per-currency; primary-only → 1 element | ✅ PASS | GQL-MC-002/004 PASS; CART-071 VERIFIED |
| **Task 1** — tax & **promotion only on primary-currency lines** | ❌ **FAIL** | Cart-% coupon QA10OFF leaks PTS value into USD discount base (see Bug 1) |
| **Task 2** — mutation adds loyalty product with currency (`itemCurrencyCode`) | ✅ PASS | GQL-MC-001/005 PASS |
| **Task 3** — cart summary splits line items + totals by currency | ✅ PASS | CART-071/072, LOYF-025 VERIFIED; "Products in PTS" + "Total in PTS" |
| **Constraint** — exclude configurable products | N/A — **out of scope** | Configurable products are out of scope for VCST-5101 (ticket note + confirmed 2026-06-09). Their behavior in the loyalty catalog is not asserted/tested and any configurable anomaly there is not a VCST-5101 defect. |

## Bugs

### Bug 1 — Cart-% coupon over-discounts by folding the PTS line into the USD base `[High / revenue]`
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
