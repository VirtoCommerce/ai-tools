# Testing Checklist — VCST-5101 [Loyalty][Mixed Cart][E2E] Add Loyalty Product to Cart

**Build:** Platform 3.1035.0 · theme 2.51.0-pr-2310 · XCart 3.1018.0-pr-120 · Cart 3.1005.0-pr-188 (all deployed to vcst-qa)
**Env:** FRONT `https://vcst-qa-storefront.govirto.com` · BACK `https://vcst-qa.govirto.com` · store `B2B-store` · loyalty currency `PTS`, mode "Mixed Cart"
**Domains:** Cart, Loyalty, xCart (GraphQL) · **Priority:** P1 / revenue-critical cart flow

## Acceptance Criteria → Coverage

| AC (from ticket) | Verification | Case(s) | Status this session |
|---|---|---|---|
| **Task 1** — `cart` returns per-currency `cartTotals`; primary-only cart → exactly 1 element | GraphQL + UI | GQL-MC-002, GQL-MC-004, CART-071 | ✅ verified live (PASS) |
| **Task 1** — tax & promotion computed only on primary-currency lines | GraphQL + UI | GQL-MC-003 (extendedPriceTotal USD-only) | ⚠ partial — **exploratory** (promotion/tax on mixed cart not yet stressed) |
| **Task 2** — mutation adds a loyalty product to current cart with currency (`itemCurrencyCode`) | GraphQL | GQL-MC-001, GQL-MC-005 | ✅ verified live (PASS) |
| **Task 3** — cart summary splits line items by currency; correct totals per block | UI | CART-071, CART-072, LOYF-025 | ✅ verified live (VERIFIED) |
| **Constraint** — exclude configurable products | — | — | **Out of scope** — not tested (configurables excluded from VCST-5101) |

## Business Rules (must hold)
- **BL-CART-007** — same productId + same currency → quantity merge; **+ different currency → separate line** (currency-scoped). ✅ GQL-MC-001 / CART-072.
- **BL-CART-004** — *historically* "no mixed-currency state"; **now superseded** for Mixed Cart mode (flagged conflict, awaiting BL amendment). ⚠ documented.
- **BL-CART-001** (max qty), **BL-PRICE-005** (currency-specific price lists), **BL-CROSS-004** (currency switch recalculation) — confirm not regressed by the mixed-cart path. → exploratory.

## Gaps routed to exploratory (Step 5)
1. Mixed-cart **persistence** across reload + sign-out→sign-in.
2. Guest → sign-in **cart merge** with a foreign-currency (PTS) line.
3. **Checkout** with a mixed cart — order-summary split totals at `/checkout`; can an order be placed / what is the designed behavior?
4. **Promotion/coupon + tax** on a mixed cart (Task 1 invariant: primary-currency lines only).
5. **Remove all USD** leaving only a PTS line — does `isDefaultTotalCurrency` / the summary handle a cart with no primary-currency lines?
6. Select/unselect + quantity stepper on the PTS line; independence from USD line.
7. **Configurable product exclusion** — confirm a configurable product cannot be added in PTS / is excluded from the split.

## Execution evidence (this session, same build/env)
- xAPI: GQL-MC-001/002/003/004/005 all **PASS** via `scripts/graphql-runner.ts` (live).
- Storefront: split line-item display + split order-summary ("Products in PTS" / "Total in PTS") **VERIFIED** (firefox/edge); cartTotals=2 (USD default + PTS), per-line `currencyCode` present.
- Backend telemetry: 0 `cartTotals`/XCart exceptions (App Insights, 48h). Incidental client-only Apollo `currencyCode` cache warning root-caused (vc-frontend, non-fatal) — `reports/bugs/BUG-mixed-cart-currencyCode-apollo-cache-write.md`.
