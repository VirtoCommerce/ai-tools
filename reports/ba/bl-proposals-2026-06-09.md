# Business Logic Proposals — BA-2026-06-09

> ✅ **PROMOTED 2026-06-09** (user-approved, all 7). `BL-LOY-001..006` were created as a new
> **Domain 17 (Loyalty & Mixed Cart)** in `.claude/agents/knowledge/business-logic.md`, and `BL-CART-004`
> was revised (Mixed Cart amendment). Body sections only — the Invariant Coverage Summary table was left
> untouched per project rule. Regression case `050b4` GQL-MC-006 now maps `BL-LOY-001; BL-LOY-004`.
> This file is retained as the source/audit record.

> **These are drafts. They are NOT applied to `.claude/agents/knowledge/business-logic.md`.**
> Promotion requires **explicit user approval per proposal**. Review, edit as needed,
> approve individual entries, assign final `BL-*` IDs, then direct Claude to promote
> only the approved entries. Claude will never modify `business-logic.md` on its own.
>
> Source: `/ba-analyze Mixed cart VCST-5101` run `2026-06-09` — see `reports/ba/ba-report-2026-06-09.md`.
> No `BL-LOY-*` domain exists yet; these would create it (next free numbers 001+). All cited against
> vc-module-x-cart #120 / vc-module-cart #188 / vc-module-loyalty (dev) on GitHub + this run's QA evidence.

---

## New Invariants Proposed

### PROPOSED-BL-LOY-001: Mixed Cart — promotion/coupon evaluation scoped to primary-currency lines only `[P0-revenue]`

- **Rule:** When `Loyalty.Mode = "Mixed Cart"`, promotion and coupon discount evaluation MUST use only line items whose currency matches the cart's primary currency. Loyalty-currency lines MUST NOT enter `CartPromoEntries`, the `CartTotal` base, or any reward calculation. A percentage-off coupon on a mixed cart applies exclusively to the primary-currency (e.g. USD) subtotal, independent of loyalty-line quantity.
- **Verify:**
  - Add 1 USD line + 1 PTS loyalty line; apply a 10% subtotal coupon.
  - Discount = exactly 10% × USD subtotal, with zero contribution from the PTS line.
  - Step PTS qty 1→2→3 with USD constant; discount does not change.
- **Violation signal:** Discount > 10% × USD subtotal, or discount = `(USD_subtotal + PTS_qty × PTS_listPrice) × 0.10`.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** vc-module-x-cart feat/VCST-5101 `src/VirtoCommerce.XCart.Data/Mapping/CartMappingProfile.cs` — `CartAggregate → PromotionEvaluationContext` iterates `cartAggr.CartCurrencySelectedLineItems` with comment "// Tax and Promotion are computed only on primary-currency lines". **Note:** the per-line loop is filtered, but `promoEvalcontext.CartTotal = cartAggr.Cart.SubTotal` (scalar) is the actual % -coupon base and is the suspected leak point — this invariant guards the contract regardless of the implementation site.
- **Triggered by:** P1 root-cause analysis (VCST-5101)

---

### PROPOSED-BL-LOY-002: Mixed Cart — `addItem(itemCurrencyCode)` pins the line currency; no cross-currency merge `[P1-data]`

- **Rule:** When `addItem` is called with a non-null `itemCurrencyCode`, the resulting `LineItem.Currency` MUST equal `itemCurrencyCode` and the `CartProducts` key MUST be `{productId}:{itemCurrencyCode}`. Adding the same `productId` at two different currencies MUST produce two separate line items, never a merged/quantity-summed line.
- **Verify:**
  - `addItem(productId=X, itemCurrencyCode="PTS")` then `addItem(productId=X, itemCurrencyCode=cart.currency)`.
  - Assert two distinct line items for `X` with different `currencyCode`.
- **Violation signal:** One line item for `X` with doubled quantity.
- **Agents:** qa-backend-expert
- **Source:** vc-module-x-cart feat/VCST-5101 `src/VirtoCommerce.XCart.Core/CartAggregate.cs` — `FormatGetCartProductKey` / find-existing-line updated to match on productId **and** currency.
- **Triggered by:** architecture analysis (CartProducts composite key)

---

### PROPOSED-BL-LOY-003: Mixed Cart — `cartTotals` = one entry per distinct line currency `[P1-data]`

- **Rule:** `cart.cartTotals[]` MUST contain exactly one entry per distinct currency present among line items. The `isDefaultTotalCurrency=true` entry MUST correspond to `cart.currency`. Each entry's `subTotal/discountTotal/taxTotal/total` reflect ONLY that currency's lines. A primary-currency-only cart → exactly one entry.
- **Verify:**
  - Mixed cart (USD + PTS) → query `cartTotals { isDefaultTotalCurrency total { currency { code } } subTotal { amount } }`.
  - Assert exactly 2 entries; default entry currency = cart currency; each subTotal = its own lines' sum.
- **Violation signal:** Single entry on a mixed cart, or totals include other-currency values.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-x-cart #120 `CartAggregate.cs` `CartTotals` property + `Schemas/CartType.cs` `cartTotals` field; vc-module-cart #188 `DefaultShoppingCartTotalsCalculator.cs` `cartsByCurrency`.
- **Triggered by:** architecture analysis (CartTotalType)

---

### PROPOSED-BL-LOY-004: Mixed Cart — loyalty lines excluded from promo context even when selected for checkout `[P0-revenue]`

- **Rule:** A loyalty-currency line with `selectedForCheckout=true` MUST NOT appear in `PromotionEvaluationContext.CartPromoEntries`, and its price MUST NOT contribute to `CartTotal`. Holds for every reward type (percent, fixed amount, free shipping, gift).
- **Verify:**
  - Select a PTS line for checkout; apply a 100% subtotal coupon.
  - USD lines receive 100% discount; PTS price unchanged; no discount line on the PTS item.
- **Violation signal:** PTS item discounted, or USD discount exceeds USD subtotal.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-x-cart #120 `CartMappingProfile.cs` (currency-filtered loop) + `CartAggregate.cs` `EvaluatePromotionsAsync` gate `CartCurrencySelectedLineItems.Any()`.
- **Triggered by:** root-cause analysis (confirmed currency filter)

---

### PROPOSED-BL-LOY-005: Loyalty-currency line shows no "earn points" indicator `[P2-ux]`

- **Rule:** When loyalty points are computed for a line item, if `lineItem.Currency == Loyalty.Currency`, the returned `loyaltyPoints` MUST be zero/null. Computing points-on-points from a points-priced item is semantically invalid and MUST NOT display.
- **Verify:**
  - Mode "Mixed Cart", `Loyalty.Currency="PTS"`; add a PTS line.
  - Query `cart.items { loyaltyPoints { amount } }`; assert PTS line returns null or 0.
- **Violation signal:** PTS line returns non-zero `loyaltyPoints`.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** vc-module-loyalty dev `src/VirtoCommerce.Loyalty.ExperienceApi/TypeHooks/LineItemTypeHook.cs` — `CalculatePoints(x.ExtendedPrice, x.ProductId)` has no currency guard; `LoyaltyPointsCalculator.cs` resolves `PointsCurrency` from `Loyalty.Currency`.
- **Triggered by:** P3 configurable/points-display analysis

---

### PROPOSED-BL-LOY-006: Mixed Cart — currency switch converts primary lines, preserves loyalty lines `[P1-data]`

- **Rule:** On `ChangeCartCurrency` for a mixed cart, items whose currency = the PREVIOUS cart currency MUST convert to the new cart currency; items in any other currency (loyalty PTS) MUST retain their original currency. No line item is lost or duplicated.
- **Verify:**
  - Mixed cart USD + PTS, `cart.currency=USD`; `changeCartCurrency → EUR`.
  - USD items now EUR (EUR pricing); PTS items still PTS at original prices; item count unchanged.
- **Violation signal:** PTS items disappear, duplicate, or switch to EUR.
- **Agents:** qa-backend-expert
- **Source:** vc-module-x-cart #120 `src/VirtoCommerce.XCart.Data/Commands/ChangeCartCurrencyCommandHandler.cs` `ResolveTargetCurrency` — `itemCurrencyCode.EqualsIgnoreCase(current.Cart.Currency) ? newCart.Currency : current.GetCurrencyByCode(itemCurrencyCode)`.
- **Triggered by:** architecture analysis (ChangeCartCurrencyCommandHandler)

---

## Stale BL-* Flagged

### BL-CART-004: Currency switching recalculates cart `[P0-revenue]`
- **Current Rule:** Assumes a single-currency cart model — switching currency globally recalculates all items (all items share the cart currency).
- **Observed behavior:** In Mixed Cart mode, `ChangeCartCurrency` converts only items in the OLD base currency; loyalty (PTS) items are preserved at their own currency. A cart now holds multiple currencies simultaneously, so "currency switching = global recalculation of all items" no longer holds.
- **Source:** vc-module-x-cart #120 `ChangeCartCurrencyCommandHandler.cs` `ResolveTargetCurrency` (explicitly preserves non-base-currency items).
- **Suggested action:** **revise** — narrow scope to "primary-currency items only"; add a Mixed Cart clause (preserves non-primary-currency items) and cross-link `[[PROPOSED-BL-LOY-006]]`.

---

## Application Notes

1. Assign final IDs by reading `business-logic.md` for the next available sequence. Since no `BL-LOY-*` domain exists, create the domain section (suggest placing after `BL-CART-*`) and number `BL-LOY-001..006`.
2. Replace the `PROPOSED-` prefix with the final ID.
3. Paste each approved entry into the correct domain section of `business-logic.md`; update the Invariant Coverage Summary table separately only if directed.
4. After entries land, re-run `/qa-review-tests` against the mixed-cart suites so test cases gain their `Business_Rule` mapping; add the missing promotion-on-mixed-cart regression case (P1 / R5).
