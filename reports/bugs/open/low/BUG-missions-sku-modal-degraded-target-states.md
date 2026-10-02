# SKU mission modal mis-renders three degraded target states — raw GUID title + 404 link, green stock chip on an unbuyable row, over-stock quantity counted in the summary — **P3**

## Status: CONFIRMED (live: 3x firefox, 4a chrome, C1 REG-2026-10-01-1243)
**Found by:** agent — testing VCST-5957 (`/qa-test`, 2026-10-01)
**Tracker:** not filed — below the severity floor (Low). Named in the VCST-5957 QA comment.
**Archetype:** `FALLBACK` / `PARITY` · **Provenance:** PRE-EXISTING. Each is unchanged logic on `main`; PR #2524 only moved the rows onto `VcLineItems`. Related: VCST-6141 (backend SKU totals, Refinement).
Rolled up because all three are the same shape: a degraded target state that the modal renders as if it were normal.

**Env:** vcst-qa · theme `2.59.0-pr-2524-3069-30691594` · B2B-store · `@td(LOY_PERSONAL_NOORG)`.

| # | State | Actual | Expected | Evidence |
|---|---|---|---|---|
| 1 | Goal item whose product was deleted (`items[].product: null`, `@td(MSN_DL_SKU_NOAVAIL)`) | title and image alt = raw product GUID; the link `/product/<guid>` opens "404 Page not found"; stepper disabled | a readable placeholder ("Product no longer available") and no dead link `{HYPOTHESIS}`, PO decision | `reports/regression/REG-2026-10-01-1243/screenshots/MSNF-099-FAIL-link-404.png` · source `name: item?.product?.name ?? id` |
| 2 | Target with `isBuyable=false`, `isInStock=true` (SKU 16785001) | green chip "33" (title "In stock") and $0.00 next to a disabled stepper, no reason | stock chip consistent with purchasability (ECL-2.1); reason text `{HYPOTHESIS}` | `screenshots/MSNF-100-FAIL-unbuyable-instock.png` · shared `in-stock.vue` reads only `isInStock` |
| 3 | Quantity above available stock (qty 150, stock 99) | field invalid + hint "Order from 1 to 99", Add disabled with no visible reason, but the summary counts it: units 150, Targets met 1/5, subtotal $18,450.00, "Buy at least" chip green | the summary excludes invalid quantities | `reports/tickets/Sprint26-19/VCST-5957/screenshots/4a-sku-modal-overstock-150-of-99.png` |

## STR
Sign in, open `/account/missions`, open the SKU missions named above, inspect each row; for #3 type a quantity above the shown stock.

## Cases holding the expectation
`MSNF-099`, `MSNF-100` (`{HYPOTHESIS}` — a PO decision item), `MSNF-101` (BLOCKED: needs a tracked-stock fixture), 083c Draft.

## Fix Routing
`VirtoCommerce/vc-frontend` · `client-app/modules/loyalty/components/sku-mission-modal.vue`; #2 also `client-app/shared/catalog/components/in-stock.vue`.
