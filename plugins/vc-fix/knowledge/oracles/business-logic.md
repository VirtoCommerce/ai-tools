---
applicability: reference
applicability_rationale: "76 storefront BLs covering pricing, cart, checkout, B2B, etc. Universal as a STARTING POINT (most BLs are platform-level invariants). Customer adapts: some BLs encode vcst-specific assumptions (specific currency, specific tier rules, specific role names). Customer's own BL-{CUSTOMER}-* IDs namespace alongside."
---

# Business Logic Invariants — Agent Reference

Testable business rules for the Virto Commerce B2B e-commerce platform. Use this file to judge correctness when specs are ambiguous, absent, or when cross-domain interactions create emergent behavior.

## How to Use This File

- Each invariant has an ID (`BL-DOMAIN-NNN`), a severity tag, a declarative **Rule**, a **Verify** instruction, and a **Violation signal**.
- When a test result is ambiguous, check this file before classifying as PASS or AMBIGUOUS.
- When writing test cases, each business invariant should map to at least one test case assertion.
- Cross-domain invariants (`BL-CROSS-*`) are the highest-value rules — they catch the bugs that single-domain testing misses.
- If observed behavior violates an invariant here, classify as **FAIL** regardless of whether a JIRA spec explicitly covers it.

### Severity Tags

| Tag | Meaning | Test Priority |
|-----|---------|---------------|
| `[P0-revenue]` | Directly impacts revenue, orders, or payments | Must pass before any deployment |
| `[P0-security]` | Security boundary (auth, authz, privilege escalation, data leakage) | Must pass before any deployment |
| `[P1-data]` | Data integrity, state correctness | Must pass before sprint release |
| `[P1-ux]` | UX rule with stakeholder or legal weight (e.g., golden-rule UI sequence, WCAG-overlapping) | Must pass before sprint release |
| `[P2-ux]` | User experience, display, non-blocking | Should pass; acceptable to defer with ticket |

---

## Domain 1: Pricing & Discounts (BL-PRICE)

### BL-PRICE-001: Discount stacking order `[P0-revenue]`
- **Rule:** Discounts apply in order: (1) catalog sale price replaces list price, (2) tier/volume price applies at quantity threshold, (3) coupon/promo code applies to the already-discounted amount — never to the original list price.
- **Verify:** `cart.items[].placedPrice` reflects the stacked discount. Coupon savings are calculated on the post-tier price, not the list price.
- **Violation signal:** Cart total higher than expected; coupon discount amount equals percentage of list price instead of sale/tier price.
- **Agents:** qa-frontend-expert (UI totals), qa-backend-expert (xAPI `cart` query response)

### BL-PRICE-002: Tax calculation position `[P0-revenue]`
- **Rule:** Tax is always calculated AFTER all discounts are applied. Tax base = (line total after discounts), not the pre-discount subtotal. Tax rate depends on the shipping address (destination-based).
- **Verify:** In cart/checkout, compare: `taxTotal` should equal `taxRate × (subtotal - totalDiscount)`, not `taxRate × subtotal`.
- **Violation signal:** Tax amount is higher than expected (calculated on pre-discount price), or tax changes when discount is applied/removed but the math doesn't align.
- **Agents:** qa-frontend-expert (checkout totals), qa-backend-expert (order API)

### BL-PRICE-003: Price rounding `[P0-revenue]`
- **Rule:** All monetary amounts round half-up to 2 decimal places in the display currency. Intermediate calculations may use higher precision, but all customer-visible prices (line totals, subtotal, tax, grand total) display exactly 2 decimals.
- **Verify:** No prices display with 0, 1, or 3+ decimal places. Check edge cases: items at $X.X95 should round to $X.X0 (half-up).
- **Violation signal:** Price displays like "$12.5" or "$12.456", or rounding inconsistency between line total and cart subtotal.
- **Agents:** qa-frontend-expert (UI display), ui-ux-expert (price formatting)

### BL-PRICE-004: Tiered/volume pricing boundaries `[P0-revenue]`
- **Rule:** When a product has tiered pricing (e.g., 1-9 units = $10, 10+ units = $8), the lower price activates at exactly the threshold quantity. All units in the line use the same tier price (not split pricing).
- **Verify:** Add 9 units → price = $10/unit. Add 1 more (qty=10) → price drops to $8/unit for ALL 10 units. Line total = $80, not $90+$8.
- **Violation signal:** "From $X" label on listing doesn't match lowest tier; adding 1 unit at threshold doesn't change all units; split pricing applied.
- **Agents:** qa-frontend-expert (PDP price, cart), qa-backend-expert (pricing API)

### BL-PRICE-005: Currency-specific price lists `[P0-revenue]`
- **Rule:** Each currency has its own price list. Switching currency activates the corresponding price list — prices are NOT converted by exchange rate. If no price list exists for the selected currency, the product shows as unavailable.
- **Verify:** Switch currency → prices change to values from that currency's price list (not mathematically converted). Products without prices in the new currency disappear or show "Unavailable".
- **Violation signal:** Prices appear to be exchange-rate conversions of the default currency; products without currency-specific prices still show a price.
- **Agents:** qa-frontend-expert (currency switcher), qa-backend-expert (price list API)

### BL-PRICE-006: Price list deletion behavior `[P1-data]`
- **Rule:** Deleting a price list in Admin removes all price entries it contained. Products that relied solely on that price list become unpurchasable on the storefront. No prices should fall back to $0 — they should show as "Unavailable" or hide the "Add to Cart" button. Already-placed orders retain their historical prices.
- **Verify:** Delete a price list → storefront products show "Unavailable" (not $0) → existing orders in Admin still display original prices → re-creating a price list with same products restores storefront availability.
- **Violation signal:** Product shows $0.00 after price list deletion; "Add to Cart" remains enabled; historical order prices change retroactively.
- **Agents:** qa-backend-expert (pricing API, Admin), qa-frontend-expert (storefront display)

### BL-PRICE-007: Organization-specific (contract) pricing `[P0-revenue]`
- **Rule:** When an organization has a dedicated price list assigned, its members see contract prices that override the store default. Contract pricing takes precedence over catalog sale prices but is still subject to tier pricing within the contract list. Users not in the organization never see contract prices.
- **Verify:** Sign in as Org A member → product shows contract price (e.g., $7) instead of store default ($10). Sign in as non-org user → same product shows $10. Org A member adds to cart → cart uses $7.
- **Violation signal:** Non-org user sees contract prices; org member sees store default instead of contract; cart uses wrong price list after org switch.
- **Agents:** qa-frontend-expert (price display), qa-backend-expert (price list priority API)

### BL-PRICE-008: No floating-point money arithmetic `[P0-revenue]`
- **Rule:** All monetary calculations must use decimal or integer-cent arithmetic internally. Floating-point rounding errors must never accumulate across line items — the sum of rounded line totals must equal the displayed subtotal. A discrepancy of even $0.01 between `sum(lineTotals)` and `cartSubtotal` is a bug.
- **Verify:** Add 3+ items with prices like $19.99, $7.33, $0.10 → manually sum line totals → compare against displayed subtotal. Check multi-quantity lines: qty × unit price = line total exactly.
- **Violation signal:** Subtotal differs from manual sum of line totals by $0.01+; penny discrepancy grows with more items; line total ≠ qty × unit price.
- **Agents:** qa-frontend-expert (cart math), qa-backend-expert (xAPI cart response)

---

## Domain 2: Cart (BL-CART)

### BL-CART-001: Max quantity enforcement `[P0-revenue]`
- **Rule:** Per-product max quantity is enforced by available stock (inventory). Per-cart there is no global max unless configured. When a user enters a quantity exceeding available stock, the system must either reject the input or cap it to available stock with a notification.
- **Verify:** Enter quantity > stock → error message or auto-cap. Stepper "+" disabled at max stock. Direct input of 999 when stock=50 → qty set to 50 with message.
- **Violation signal:** Quantity accepted exceeding stock without warning; order placed for more units than in inventory.
- **Agents:** qa-frontend-expert (cart UI), qa-backend-expert (addToCart mutation validation)

### BL-CART-002: Out-of-stock mid-session `[P0-revenue]`
- **Rule:** If a product's stock reaches 0 after the user has added it to cart but before checkout completes, the system must prevent the order from being placed. The cart should show an error state for the affected item.
- **Verify:** Add item (stock=2) → in another session/admin, reduce stock to 0 → attempt checkout → error message, order NOT created. Cart should flag the item.
- **Violation signal:** Order placed successfully for an out-of-stock item; no error shown at checkout; oversold inventory.
- **Agents:** qa-frontend-expert (checkout flow), qa-testing-expert (multi-session scenario)

### BL-CART-003: Coupon + sale interaction `[P0-revenue]`
- **Rule:** A percentage coupon applies to the already-discounted (sale) price, not the original list price. A fixed-amount coupon subtracts from the cart total after all line-level discounts. If a coupon's minimum order amount is not met after sale discounts, the coupon must be rejected. Only one coupon per cart unless multi-coupon is explicitly enabled.
- **Verify:** Item at $100 list, $80 sale → apply 10% coupon → discount = $8 (10% of $80), not $10. Apply second coupon → rejected with "Only one coupon allowed" message.
- **Violation signal:** Coupon discount calculated on list price; coupon accepted when min-order threshold not met; multiple coupons applied when multi-coupon is disabled.
- **Agents:** qa-frontend-expert (cart totals), qa-backend-expert (promotion engine API)
- **Known behavior (2026-03-13):** Under `BestRewardPromotionPolicy`, applying a coupon-backed `CartSubtotalReward` **always replaces** an auto-applied cart subtotal reward, even if the coupon discount is smaller. This is by design in `BestRewardPromotionPolicy.cs:79-80` — coupon-backed rewards are explicitly preferred via `FirstOrDefault(x => !x.Coupon.IsNullOrEmpty()) ?? FirstOrDefault()`. Under `CombineStackablePromotionPolicy`, only one `CartSubtotalReward` per priority group is kept. Stacking two cart subtotal discounts requires different priority values. Neither policy is a bug — it's a store configuration choice. See `SBTM-promotions-2026-03-13.md` for full source code analysis.

### BL-CART-004: Currency switching recalculates primary-currency lines `[P0-revenue]`
- **Rule:** When the user switches the cart currency, every line item **denominated in the previous cart currency** must recalculate using the new currency's price list. If such a product has no price in the new currency, that line item must be flagged or removed. Shipping and tax recalculate. **Mixed Cart exception (Loyalty mode "Mixed Cart"):** line items denominated in a non-primary currency (e.g. a PTS loyalty line) are NOT converted — they are preserved at their original currency, so a cart MAY legitimately hold multiple currencies simultaneously. See BL-LOY-006 for the switch contract and BL-LOY-003 for the per-currency totals split.
- **Verify:** Single-currency cart: add items → switch currency → all prices, subtotal, shipping, tax use the new currency; products without a new-currency price are flagged/removed. Mixed cart: with a PTS loyalty line present, switch the base currency USD→EUR → USD lines convert to EUR, the PTS line stays PTS, item count unchanged.
- **Violation signal:** A previous-currency line still uses the old price; subtotal/shipping not recalculated; **OR** (Mixed Cart) a non-primary-currency loyalty line is wrongly converted, dropped, or duplicated on currency switch.
- **Agents:** qa-frontend-expert (cart UI), qa-backend-expert (xAPI cart recalculation)
- **Amended:** 2026-06-09 (Mixed Cart — VCST-5101). Previously asserted "no mixed-currency state"; superseded by the Mixed Cart model — see Domain 17 (BL-LOY).

### BL-CART-005: Cart isolation per organization `[P1-data]`
- **Rule:** In B2B mode, each organization has its own cart. When a user switches organizations, the previous org's cart is preserved server-side but not visible. The active cart reflects only the current organization's items, prices, and shipping context. Cart items from Org A must never appear in Org B's cart.
- **Verify:** As Org A, add items → switch to Org B → cart is empty (or Org B's separate cart). Switch back to Org A → original items restored. Check xAPI: `cart` query with different org context returns different carts.
- **Violation signal:** Items from Org A visible in Org B's cart; switching back loses Org A's cart; xAPI returns same cart regardless of org context.
- **Agents:** qa-frontend-expert (org switcher + cart), qa-backend-expert (xAPI context)

### BL-CART-006: Pack size enforcement `[P1-data]`
- **Rule:** When a product has a minimum order quantity (MOQ) or pack size (e.g., sold in packs of 6), the cart must enforce that quantity is a multiple of the pack size. The quantity stepper should increment by pack size, and manual entry of non-multiple quantities must be rejected or rounded up.
- **Verify:** Product with pack size 6 → add to cart → qty = 6. Try to change qty to 7 → rejected or auto-rounded to 12. Stepper increments: 6 → 12 → 18.
- **Violation signal:** Quantity 7 accepted for a pack-size-6 product; stepper increments by 1 instead of pack size; order placed with non-multiple quantity.
- **Agents:** qa-frontend-expert (cart stepper), qa-backend-expert (addToCart validation)

### BL-CART-007: Same product adds quantity, not duplicate line `[P1-data]`
- **Rule:** Adding the same SKU to the cart a second time increments the existing line item's quantity — it does not create a duplicate line. This applies regardless of whether the add came from PDP, quick-add, or xAPI. Exception: different product configurations (variants) create separate lines.
- **Verify:** Add Product A (qty 1) → go back to listing → add Product A again → cart shows 1 line with qty 2, not 2 lines with qty 1.
- **Violation signal:** Duplicate line items for the same SKU; quantity not incremented on re-add; line count increases on every add.
- **Agents:** qa-frontend-expert (cart UI), qa-backend-expert (addToCart mutation)

### BL-CART-008: Cart persistence across sign-out / sign-in `[P1-data]`
- **Rule:** A registered user's cart is persisted server-side. If the user signs out and signs back in, the cart must be restored with the same items and quantities. If the user had items as a guest (anonymous cart), upon sign-in those items should merge into the registered user's existing cart (merge strategy: add quantities, no duplicates).
- **Verify:** Add items → sign out → sign in → cart restored. Separately: browse as guest, add items → sign in (existing account with different cart items) → carts merge without duplicates.
- **Violation signal:** Cart empty after sign-in; guest cart items lost on authentication; duplicate lines after merge; quantities not combined.
- **Agents:** qa-frontend-expert (sign-in flow), qa-backend-expert (cart merge API)

### BL-CART-009: Radio-button coupon transition `[P1-data]`
- **Rule:** When the storefront `applyCoupon(code)` is called with a code different from the currently applied coupon, the system MUST first call `removeCoupon` on the existing coupon and complete that mutation before calling `validateCoupon` + `addCoupon` for the new code. The cart MUST NOT hold two coupons simultaneously during the transition. The intermediate state (after remove, before add) MUST NOT be visible to the user — the UI shows the previous card returning to default state and the new card transitioning to applied state, but never two applied cards at once.
- **Verify:** Apply coupon A → assert `cart.coupons[]` contains exactly one entry with `code: A, isAppliedSuccessfully: true`. Apply coupon B (different code) → network trace shows: `removeCoupon` mutation 200 → `validateCoupon` query → `addCoupon` mutation 200, in that order. Final `cart.coupons[]` contains only B. Discount math reflects only B's reward.
- **Violation signal:** `cart.coupons[]` briefly or permanently contains 2 entries; `addCoupon` mutation fires before `removeCoupon` completes (out-of-order or parallel); UI flashes both cards in applied state; second coupon's discount stacks on top of the first.
- **Agents:** qa-frontend-expert (UI state transitions on `<CouponsSection>` widget), qa-backend-expert (mutation sequencing & cart state)

### BL-CART-010: Configuration-item selection reprices the parent configurable lineItem `[P0-revenue]`
- **Rule:** When `selectedForCheckout` is flipped on a `ConfigurationItem` belonging to a configurable lineItem, the parent lineItem's `listPrice` MUST be recalculated immediately as the sum of all placements whose `selectedForCheckout = true`. The updated `listPrice` propagates into cart subtotal, taxes, and shipping via `SaveAsync → RecalculateAsync`. Deselecting a config item reduces `listPrice`; reselecting restores it. **Asymmetry:** lineItem-level selection (`changeCartItemSelected` family) does NOT change `lineItem.listPrice` — only configuration-item selection does.
- **Verify:** Obtain cart with configurable lineItem, all sections selected; record `lineItem.listPrice` as `price_all_selected`. Call `changeCartConfigurationItemSelected` to deselect one section → assert `lineItem.listPrice < price_all_selected`. Assert `cart.subTotal.amount` decreases by the same delta and `cart.taxTotal.amount` recalculates proportionally. Call `changeCartItemSelected` (lineItem-level) on an unrelated simple lineItem → assert its own `listPrice` is unchanged (asymmetry verification).
- **Violation signal:** `lineItem.listPrice` remains equal to `price_all_selected` after deselecting a placement; cart subtotal does not change; tax total does not update; pricing frozen at pre-toggle value.
- **Agents:** qa-backend-expert (xAPI mutation response, repricing path), qa-frontend-expert (cart UI price display after toggle)
- **Source:** vc-module-x-cart PR #114 — `ConfiguredLineItemContainer.UpdatePrice` filters placements by `selectedForCheckout` when summing into `lineItem.ListPrice`.

### BL-CART-011: Unmatched section key in batch selection is a silent no-op `[P1-data]`
- **Rule:** When `selectCartConfigurationItems` or `unSelectCartConfigurationItems` receives a `configurationSections[]` list where one or more keys do not match any `ConfigurationItem` on the target lineItem, those unmatched keys MUST be silently skipped. The mutation MUST still process all matched keys, MUST return HTTP 200, and MUST return `errors[]` as empty. Unmatched keys leave no trace in the response.
- **Verify:** Obtain a configurable lineItem with 2 known section keys (A and B). Call `selectCartConfigurationItems` with `configurationSections: [keyA, {sectionId: 'does-not-exist', type: 'Product'}]`. Assert HTTP 200 and `errors[]` is empty. Assert `configurationItems[keyA].selectedForCheckout = true` (matched item flipped). Assert no error entry or warning appears for the unmatched key.
- **Violation signal:** HTTP 4xx or `errors[]` non-empty due to unmatched section key; entire batch aborted and no items flipped.
- **Agents:** qa-backend-expert (xAPI batch mutations)
- **Source:** vc-module-x-cart PR #114 §Validation errors; `CartAggregateTests` "unmatched section no-op" unit test.

### BL-CART-012: Configuration-item selection mutations are scoped to one `lineItemId`; "all" never crosses lineItem boundaries `[P1-data]`
- **Rule:** All five configuration-item selection mutations (`changeCartConfigurationItemSelected`, `selectCartConfigurationItems`, `unSelectCartConfigurationItems`, `selectAllCartConfigurationItems`, `unSelectAllCartConfigurationItems`) accept exactly one `lineItemId`. The "all" variants operate only on configuration items belonging to that specified lineItem. No mutation may flip `selectedForCheckout` on configuration items belonging to other lineItems in the same cart.
- **Verify:** Build a cart with two configurable lineItems (L1 and L2), each with at least one config item. Call `unSelectAllCartConfigurationItems` with `lineItemId = L1.id`. Assert all config items on L1 have `selectedForCheckout = false`. Assert all config items on L2 retain their original state and `L2.listPrice` is unchanged.
- **Violation signal:** Config items on L2 are toggled when only L1's `lineItemId` was specified; `listPrice` of L2 changes after a mutation scoped to L1.
- **Agents:** qa-backend-expert
- **Source:** vc-module-x-cart PR #114 §Scoping.

### BL-CART-013: No-change short-circuit on configuration-item selection mutations `[P1-data]`
- **Rule:** When a configuration-item selection mutation is called but the resulting `selectedForCheckout` state for every affected configuration item is identical to the pre-mutation state, `UpdateConfiguredLineItemPrice` MUST NOT be executed. The cart aggregate detects the no-change condition before invoking the reprice path and short-circuits. Applies to idempotent re-sends, to `selectAll` when all already selected, and to `unSelectAll` when all already unselected.
- **Verify:** Obtain a cart with a configurable lineItem where all config items have `selectedForCheckout = true`. Call `selectAllCartConfigurationItems` for that lineItem. Assert cart totals are unchanged. Confirm `UpdateConfiguredLineItemPrice` was not triggered (via platform logs or unit test coverage). Repeat with `changeCartConfigurationItemSelected` sending the same value already set.
- **Violation signal:** Repricing executes on a no-change call; unnecessary `RecalculateAsync` invocation observable in platform logs; performance regression in batch UIs that resend full selection state on every interaction.
- **Agents:** qa-backend-expert
- **Source:** vc-module-x-cart PR #114 §Key business behavior; `CartAggregateTests` "no-change short-circuit" and "idempotency" unit tests.

### BL-CART-014: Configuration-section identification — `(sectionId, type)` for Text/File; `option.productId` required for Variation `[P1-data]`
- **Rule:** When identifying a `ConfigurationItem` for selection mutations: for `Text` and `File` sections, `(sectionId, type)` alone is sufficient for unique lookup. For `Variation` sections, `option.productId` is mandatory because multiple variations of the same configurable section can coexist on a lineItem. Omitting `option` for a `Variation`-type section results in a no-op (item not found, per BL-CART-011). For `Product` sections, `option.productId` resolves the option but is not required for uniqueness when only one product placement per section is allowed.
- **Verify:** For a Variation section: call `changeCartConfigurationItemSelected` with `{sectionId, type: 'Variation'}` and no `option` field → assert silent no-op (flag does not flip). Repeat with `{sectionId, type: 'Variation', option: {productId: <valid-id>}}` → assert flag flips. For a Text section: call with `{sectionId, type: 'Text'}` and no `option` → assert flag flips (lookup succeeds). For a File section: same as Text.
- **Violation signal:** Text/File section fails without `option` field (overly strict); Variation section succeeds with missing `option` (ambiguous lookup); wrong config item toggled.
- **Agents:** qa-backend-expert
- **Source:** vc-module-x-cart PR #114 — `ConfigurationSectionKeyInput.cs` and `ConfigurableProductOptionKeyInput.cs`.

---

## Domain 3: Checkout (BL-CHK)

### BL-CHK-001: Guest vs authenticated checkout `[P0-revenue]`
- **Rule:** Guest checkout is only available when the store setting `createAnonymousOrderEnabled = true`. When disabled, anonymous users must sign in before reaching checkout. Guest checkout skips address book (no saved addresses) and order history is not linked to an account.
- **Verify:** With flag OFF → "Add to cart" → "Checkout" → redirect to sign-in. With flag ON → anonymous user can complete full checkout without account.
- **Violation signal:** Anonymous user reaches checkout when flag is OFF; guest order appears in a registered user's order history; saved addresses shown to guest.
- **Agents:** qa-frontend-expert (checkout flow), qa-backend-expert (store settings API)

### BL-CHK-002: Double-submit prevention (Place Order idempotency) `[P0-revenue]`
- **Rule:** Clicking "Place Order" twice in rapid succession must NOT create two orders. The button must be disabled after first click, and the backend must enforce idempotency (same cart token → same order).
- **Verify:** Click "Place Order" → immediately click again → only 1 order created. Check Admin → Orders → verify single order. Check button state (disabled/loading after first click).
- **Violation signal:** Two orders with same items created; button remains clickable during processing; no loading indicator.
- **Agents:** qa-frontend-expert (button state), qa-testing-expert (rapid click test), qa-backend-expert (order API dedup)

### BL-CHK-003: Address validation by country `[P1-data]`
- **Rule:** Checkout address forms must adapt required fields based on the selected country. US addresses require state and ZIP code. Countries without postal codes (e.g., some African nations) must not require ZIP. Invalid state/ZIP combinations should be flagged. The address must be validated before proceeding to payment.
- **Verify:** Select US → state and ZIP required. Select a country without postal codes → ZIP field optional or hidden. Enter invalid ZIP for US state → validation error before payment step.
- **Violation signal:** ZIP required for countries that don't use postal codes; invalid state/ZIP accepted; address form fields identical regardless of country.
- **Agents:** qa-frontend-expert (checkout form), qa-backend-expert (address validation API)

### BL-CHK-004: Payment retry after decline `[P0-revenue]`
- **Rule:** When a payment is declined by the gateway (insufficient funds, expired card, etc.), the user must be able to retry with a different card or correct the issue — without losing their cart or shipping selections. The checkout state (address, shipping method) must persist through payment retries. After 3 consecutive declines, the system may lock the checkout temporarily.
- **Verify:** Enter invalid card → decline message shown → change card details → retry → success. Verify shipping address and method are unchanged after decline. Check that a new order is not partially created on each decline.
- **Violation signal:** Cart emptied after payment decline; shipping address reset; partial/ghost orders created on each failed attempt; no retry option shown.
- **Agents:** qa-frontend-expert (checkout flow), qa-testing-expert (payment decline scenarios), qa-backend-expert (payment API state)

### BL-CHK-005: Shipping method depends on address `[P1-data]`
- **Rule:** Available shipping methods are determined by the shipping address. Changing the address must refresh the list of available shipping methods and their rates. Previously selected shipping method that is no longer available for the new address must be deselected with a notification. BOPIS (store pickup) option depends on proximity or store assignment.
- **Verify:** Enter domestic address → see standard/express options. Change to international address → shipping methods update → rates change. Select BOPIS → change to address far from any store → BOPIS option disappears.
- **Violation signal:** Shipping methods don't update when address changes; unavailable method remains selected; rates don't change for different destinations.
- **Agents:** qa-frontend-expert (checkout shipping step), qa-backend-expert (shipping API)

### BL-CHK-006: Order total formula `[P0-revenue]`
- **Rule:** The order total must always equal: `sum(line item totals) + shipping cost + tax - cart-level discounts`. This formula is invariant — no hidden fees, no unexplained differences. The total displayed at checkout must match the total on the order confirmation page and in the Admin order detail.
- **Verify:** Manually calculate: add all line totals + shipping + tax - discounts. Compare to displayed total. After placing order → check order confirmation → check Admin order detail → all three must match.
- **Violation signal:** Total doesn't match manual calculation; checkout total differs from confirmation page; Admin order shows different amount; unexplained $0.01+ discrepancy.
- **Agents:** qa-frontend-expert (checkout + confirmation), qa-backend-expert (order API), qa-testing-expert (cross-check)

### BL-CHK-007: Minimum order amount enforcement `[P0-revenue]`
- **Rule:** When a store has a minimum order amount configured, the checkout "Place Order" button must be disabled (or checkout blocked) if the cart subtotal (after discounts) is below the minimum. The minimum applies to the subtotal, not the grand total (before shipping/tax). A clear message must indicate the minimum and the shortfall.
- **Verify:** Set min order = $50 → add items totaling $40 → checkout blocked with message "Minimum order is $50, you need $10 more." Add more items to exceed $50 → checkout unblocked.
- **Violation signal:** Order placed below minimum; no message shown; minimum checked against grand total instead of subtotal; checkout not blocked.
- **Agents:** qa-frontend-expert (checkout flow), qa-backend-expert (order validation API)

### BL-CHK-008: Address-popup State/Province facet renders only when result set contains regionId values `[P1-data]`
- **Rule:** The "State/Province" facet in the address-selection popup is rendered if and only if the term aggregation for `regionId` in the current address result set returns at least one non-null value. When `term: []` (all addresses in the set have `null regionId`), the facet element is absent from the DOM — it is not rendered as an empty dropdown. This rule is data-driven: facet presence changes dynamically as the result set changes (e.g., filtering to a country whose addresses all have null regionId causes the facet to disappear). Currently: USA and Canada addresses carry non-null regionId; other countries (UK/GB, Albania, etc.) carry null regionId.
- **Verify:** Open address-selection popup with a user whose address book contains ≥1 US or CA address → "State/Province" facet visible with term values. Apply Country facet = non-US/CA country (e.g., GB) → "State/Province" facet disappears from DOM (not just empties). Remove Country filter → facet reappears. For a user with only non-US/CA addresses (e.g., Albania-only), facet must not be rendered at all.
- **Violation signal:** "State/Province" facet visible with empty/zero values when result set has no non-null regionId; facet persists in DOM after filter narrows the set to null-region addresses only; facet missing when USA/Canada addresses are present.
- **Scope:** Address-selection popup only (per VCST-4710 / PR #129); does NOT apply to `/account/addresses` page or ship-to popover.
- **Agents:** qa-frontend-expert (popup UI), test-management-specialist (test cases SA-027–SA-030)

---

## Domain 4: Orders & Fulfillment (BL-ORD)

### BL-ORD-001: Order state machine guards `[P0-revenue]`
- **Rule:** Payment and shipment follow strict state machines with guards:
  - **Payment:** `Pending → Authorized → Captured → Refunded/Voided`. Cannot capture without authorization. Cannot refund without capture. Void only possible before capture.
  - **Shipment:** `New → Pick & Pack → Ready to Send → Send`. Cannot mark "Send" before "Pick & Pack". No "Delivered" sub-state — delivered semantics live at ORDER level (`OrderStatus = Completed`). See BL-ORD-007 and `project_order_status_vocab` memory.
- **Verify:** In Admin → Order → attempt to skip states (e.g., capture without authorization) → should fail or button should be absent. Verify API rejects invalid state transitions.
- **Violation signal:** Payment captured without prior authorization; shipment marked delivered while still "New"; state skipped without error.
- **Agents:** qa-backend-expert (order API, state transitions), qa-testing-expert (Admin SPA)

### BL-ORD-002: Cancellation restores inventory conditionally `[P1-data]`
- **Rule:** When an order is cancelled, inventory is restored ONLY if the "Adjust inventory on order cancellation" flag is enabled in store settings. Without the flag, cancellation does NOT restore stock — manual inventory adjustment required.
- **Verify:** Enable flag → cancel order → check FFC inventory (should increase). Disable flag → cancel order → inventory unchanged.
- **Violation signal:** Inventory restored when flag is OFF; inventory NOT restored when flag is ON; stock count mismatch after cancellation.
- **Agents:** qa-backend-expert (inventory API, order API), qa-testing-expert (Admin SPA workflow)

### BL-ORD-003: Partial fulfillment rules `[P1-data]`
- **Rule:** An order with multiple line items can be partially fulfilled — some items shipped while others remain pending. Each shipment tracks its own items and state independently. The order status reflects the aggregate: "Partially shipped" when at least one (but not all) shipments are sent. Only when all shipments reach "Delivered" does the order become "Completed."
- **Verify:** Order with 3 items → create 2 shipments (items A+B in shipment 1, item C in shipment 2) → ship shipment 1 → order status = "Partially shipped" → ship shipment 2 → order status = "Completed."
- **Violation signal:** Order marked "Completed" while shipments are pending; partial shipment not reflected in order status; items missing from shipment tracking.
- **Agents:** qa-backend-expert (order/shipment API), qa-testing-expert (Admin SPA)

### BL-ORD-004: Refund conditions `[P0-revenue]`
- **Rule:** Refund is only possible on a payment that has been captured. Partial refund amount must be ≤ captured amount minus any previous refunds. Full refund sets payment status to "Refunded." A voided payment cannot be refunded. Refund does not automatically restore inventory — that follows BL-ORD-002 cancellation rules separately.
- **Verify:** Attempt refund on "Authorized" (not captured) payment → rejected. Capture $100 → refund $30 → remaining refundable = $70. Refund another $80 → rejected (exceeds remaining). Void a payment → refund button absent.
- **Violation signal:** Refund allowed on uncaptured payment; partial refund exceeds captured amount; refund succeeds on voided payment; inventory auto-restored on refund without cancellation.
- **Agents:** qa-backend-expert (payment API), qa-testing-expert (Admin refund flow)

### BL-ORD-005: Order number format and uniqueness `[P1-data]`
- **Rule:** Every order receives a unique, sequential order number upon creation. The format is store-configurable (e.g., prefix + auto-increment). Order numbers must never be reused, even after cancellation. The order number is immutable after creation.
- **Verify:** Place 3 orders → numbers are sequential (e.g., CO00001, CO00002, CO00003). Cancel CO00002 → place another order → number is CO00004 (not CO00002 reused). Check Admin → order number matches confirmation page.
- **Violation signal:** Duplicate order numbers; gap-less numbering after cancellation (number reused); order number changes after creation.
- **Agents:** qa-backend-expert (order API), qa-frontend-expert (confirmation page)

### BL-ORD-006: Payment state machine (detailed) `[P0-revenue]`
- **Rule:** Payment states and allowed transitions:
  - `Pending` → `Authorized` (gateway authorization successful)
  - `Authorized` → `Captured` (funds captured/settled)
  - `Authorized` → `Voided` (authorization cancelled before capture)
  - `Captured` → `Refunded` (full refund processed)
  - `Captured` → `PartiallyRefunded` (partial refund, remainder still captured)
  - Illegal: `Pending → Captured` (skipping auth), `Voided → Captured`, `Refunded → Captured`
- **Verify:** For each illegal transition, attempt via API → expect 400/422 error. In Admin, verify buttons only show valid next states.
- **Violation signal:** Any illegal transition succeeds; Admin shows buttons for invalid states; API returns 200 on illegal transition.
- **Agents:** qa-backend-expert (payment API state machine)

### BL-ORD-007: Shipment state machine (detailed) `[P1-data]`
- **Rule:** Live admin Shipment Status dropdown exposes 5 values (verified 2026-04-22 on vcst-qa):
  - `New` → `Pick & Pack` (items being prepared)
  - `Pick & Pack` → `Ready to Send`
  - `Ready to Send` → `Send` (shipped with tracking number — note admin spelling is "Send" not "Sent")
  - `Any state` → `Cancelled`
- **No "Delivered" shipment sub-state.** Delivered/fulfilled semantics are represented at the ORDER level via `OrderStatus = Completed`, not at the shipment level.
- Illegal: `New → Send` (skipping Pick & Pack and Ready to Send); reversing transitions.
- **Verify:** For each illegal transition, attempt via API → expect error. In Admin, verify available actions match current state. Tracking number required for `Send` transition.
- **Violation signal:** State skipped; shipment marked `Send` without tracking number; API allows illegal jump.
- **Storefront label mapping:** per `project_order_status_vocab` memory — admin `Send` → storefront "Shipped"; order-level `Completed` → storefront "Completed" (delivered semantics).
- **Agents:** qa-backend-expert (shipment API), qa-testing-expert (Admin SPA)

### BL-ORD-009: Order status vocabulary `[P1-data]`
- **Rule:** Admin Order → Status dropdown exposes exactly 7 settable system values (verified 2026-04-22 on vcst-qa via Settings → Order Statuses dictionary):
  - `New` — order created, no payment activity yet
  - `Pending` — awaiting fulfillment action
  - `Payment required` — payment not yet authorized/captured
  - `Ready for pickup` (system value `ReadyForPickup`) — BOPIS: items prepared at store for customer pickup
  - `Completed` — delivered/fulfilled; terminal success state
  - `Cancelled` — terminal cancelled state (see BL-ORD-002 for inventory rules)
  - `Custom` — extensibility slot for store-specific workflows
- **Read-only computed status (NOT in the dropdown):**
  - `Processing` — auto-assigned when payment is captured; visible in Orders grid but cannot be set directly via admin UI.
- **System value vs display label:** The dictionary stores PascalCase system values (`ReadyForPickup`), while Admin UI and storefront render localized labels (`Ready for pickup` / "Ready for pickup"). Tests must assert against the correct surface — see `project_order_status_vocab` memory.
- **Storefront labels may differ:** Storefront applies user-facing relabeling on top of platform status (e.g. admin `Pending` + shipment `Send` → storefront "Shipped"). Do not assume 1:1 label mapping between admin and storefront.
- **Verify:** Open Admin → Orders → any order → Status dropdown shows exactly the 7 settable values above (no `Processing`). Create a BOPIS order → after pickup-ready trigger → status = `Ready for pickup`. Capture payment on a `New` order → grid shows `Processing` but the per-order Status dropdown still only offers the 7 settable values.
- **Violation signal:** Dropdown exposes `Processing` as settable; missing `Custom` slot; a value set via API not reflected in dropdown; storefront shows raw system value (`ReadyForPickup`) instead of localized label.
- **Agents:** qa-backend-expert (order API + status dictionary), qa-testing-expert (Admin SPA Status dropdown, storefront order history labels)

### BL-ORD-008: Audit trail completeness `[P1-data]`
- **Rule:** Every order state change (status, payment, shipment) must be recorded in the order's change log with: actor (user/system), timestamp, previous state, and new state. The audit trail is append-only — entries cannot be edited or deleted. Admin users can view the full change log from the order detail blade.
- **Verify:** Place order → authorize → capture → ship → deliver. Open order change log in Admin → every transition recorded with correct actor and timestamps. Verify via API: `GET /api/order/customerOrders/{id}/changes` returns full history.
- **Violation signal:** Missing entries in change log; actor shows "system" for manual actions; timestamps out of order; change log entries editable.
- **Agents:** qa-backend-expert (order API, change log), qa-testing-expert (Admin SPA)

### BL-ORD-010: Order totals — one entry per distinct line currency, unique default-currency flag `[P1-data]`
- **Rule:** `CustomerOrder.OrderTotals[]` MUST contain exactly one entry per distinct currency present across `Items[].Currency`, `Shipments[].Currency`, and `InPayments[].Currency`. The entry whose `CurrencyCode == CustomerOrder.Currency` MUST have `isDefaultTotalCurrency = true`; no other entry may. Each entry's `total/subTotal/taxTotal/discountTotal` reflect only that currency's entities. A single-currency order → exactly 1 entry. The REST `WithOrderTotals` response group (bit 9 = 512) must be requested; without it `OrderTotals` is null (not empty).
- **Verify:** Single-currency USD order → `order { orderTotals { isDefaultTotalCurrency total{currency{code}} } }` → exactly 1 entry, USD, `isDefaultTotalCurrency=true`. Mixed (USD + PTS) order → exactly 2 entries, exactly one `isDefaultTotalCurrency=true`, each subTotal = sum of its-currency lines. REST GET without `WithOrderTotals` → `orderTotals` null.
- **Violation signal:** Duplicate currency entries; zero or two `isDefaultTotalCurrency=true`; an entry's subtotal mixes currencies; `OrderTotals` populated without the flag requested.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-order #497 `DefaultCustomerOrderTotalsCalculator.CalculateTotals` + `OrderTotal.cs`; vc-module-x-order #43 `CustomerOrderAggregate.OrderTotals` / `CustomerOrderType.cs:179`; live-verified vcst-qa 2026-06-22. Covered by suites 075b/083b.
- **Promoted:** 2026-06-23.

---

## Domain 5: Users & Authentication (BL-AUTH)

### BL-AUTH-001: Session expiry during checkout `[P0-revenue]`
- **Rule:** If a user's session expires while in the checkout flow, the cart contents must be preserved (server-side). After re-authentication, the user should be able to resume checkout with the same cart — not start over.
- **Verify:** Start checkout → wait for session expiry (or manually expire token) → re-sign in → verify cart intact, checkout resumable from last step.
- **Violation signal:** Cart emptied after session expiry; user redirected to homepage instead of checkout; items lost.
- **Agents:** qa-frontend-expert (checkout flow), qa-testing-expert (session manipulation)

### BL-AUTH-002: Email verification gate `[P1-data]`
- **Rule:** When `emailVerificationRequired = true` in store settings, newly registered users cannot access protected features (checkout, order history, account management) until they verify their email via the confirmation link. They can still browse the catalog and add items to cart. The verification link must expire after a configurable period.
- **Verify:** Register with `emailVerificationRequired = true` → attempt checkout → blocked with "Please verify your email" message. Click verification link → features unlocked. Test expired link → shows "Link expired, request a new one."
- **Violation signal:** Unverified user completes checkout; no verification prompt; expired link still works; verified status not persisted after sign-out/sign-in.
- **Agents:** qa-frontend-expert (registration + checkout), qa-backend-expert (auth API, store settings)

### BL-AUTH-003: Account lockout after N failed attempts `[P1-data]`
- **Rule:** After a configurable number of consecutive failed login attempts (platform default: 5), the account is temporarily locked. During lockout, even correct credentials are rejected with a generic message (not revealing whether the account exists). Lockout duration is configurable. Successful login resets the failure counter.
- **Verify:** Enter wrong password 5 times → 6th attempt (even with correct password) → "Account locked" message. Wait for lockout expiry → successful login. Verify 4 failures + 1 success → counter resets (next failure starts from 1).
- **Violation signal:** No lockout after many failures; lockout message reveals account existence ("Account locked" vs "No such user"); lockout doesn't expire; counter not reset after success.
- **Scope:** This invariant covers **authentication-failure** lockout only (sets the global `ApplicationUser.LockoutEnd`). The **administrative org-scoped lockout** introduced by VCST-5028 (`OrganizationMembership.IsLocked`) is a distinct mechanism that deliberately does NOT set `LockoutEnd` and is governed by BL-AUTH-012 / BL-AUTH-013.
- **Agents:** qa-frontend-expert (login page), qa-backend-expert (auth API), qa-testing-expert (brute-force scenario)

### BL-AUTH-004: Returning vs new customer defaults `[P2-ux]`
- **Rule:** A returning customer (previously placed orders) sees pre-filled saved addresses and payment methods at checkout. A new customer (first order) sees empty address forms and no saved payment methods. The system must not show addresses or payment methods from other accounts, even if the email was reused across organizations.
- **Verify:** New account → checkout → empty forms. Place order → next checkout → address pre-filled from last order. Sign in as different user → no cross-contamination of addresses.
- **Violation signal:** New customer sees pre-filled data; returning customer's addresses missing; addresses from another account displayed.
- **Agents:** qa-frontend-expert (checkout forms), qa-backend-expert (customer profile API)

### BL-AUTH-005: RBAC 6-permission model `[P1-data]`
- **Rule:** Every module in Virto Commerce follows a 6-permission model: `access`, `read`, `create`, `update`, `delete`, `export`. Permissions are assigned to roles, and roles are assigned to users. A user without `create` permission on a module must not see the "Create" button in Admin. API calls without the required permission must return 403 Forbidden.
- **Verify:** Create a role with only `read` on Catalog → assign to user → sign in as that user → "Create" and "Delete" buttons absent in Catalog blade. Attempt `POST /api/catalog/products` → 403. Add `create` permission → button appears.
- **Violation signal:** Buttons visible for unauthorized actions; API returns 200 instead of 403; user can create/delete without permission; `access` permission not required to enter module.
- **Agents:** qa-backend-expert (RBAC API, Admin SPA), qa-testing-expert (permission testing)

### BL-AUTH-006: Role hierarchy `[P1-data]`
- **Rule:** Virto Commerce follows a role hierarchy: `Administrator > Store Manager > Customer Service > Customer > Anonymous`. Higher roles inherit all permissions of lower roles. An Administrator can perform any action. Store Managers can manage their assigned store(s) but not platform settings. Customers can only access their own data. Anonymous users are limited to browsing (if `anonymousUsersAllowed = true`).
- **Verify:** Store Manager → can manage products, orders for assigned store → cannot access Platform Settings blade. Customer → can view own orders → cannot access Admin SPA. Anonymous → can browse catalog (if flag ON) → cannot access cart/checkout (if guest checkout OFF).
- **Violation signal:** Lower role accesses higher-role functions; Store Manager modifies platform settings; customer sees other customers' orders; anonymous user bypasses access restrictions.
- **Agents:** qa-backend-expert (Admin SPA, roles API), qa-frontend-expert (storefront permissions)

### BL-AUTH-007: Storefront logout UX — popup-only `[P1-ux]` `[GOLDEN RULE]`
- **Rule:** The storefront exposes logout **only** inside the account-menu popup in the top header. There is no `/sign-out` page, no `/logout` page, and no standalone logout icon in the header. Correct sequence: (1) click the user name / avatar in the top-right header — opens the account-menu popup; (2) click the **Logout** button inside the popup (selector `data-testid="main-layout.top-header.account-menu.sign-out-button"`).
- **Verify:** `browser_navigate('/sign-out')` and `/logout` must not resolve to a logout page (404 or redirect to home). Header nav must not contain a top-level logout button. Clicking the user name opens the popup; clicking Logout inside the popup signs the user out and redirects to home or `/sign-in`.
- **Violation signal:** A `/sign-out` route renders a page; a header-level logout button exists; logout works only via a URL (no popup); the popup selector `main-layout.top-header.account-menu.sign-out-button` is missing.
- **Applies to:** All test cases whose Steps say "sign out", "log out", "Click logout button", or "Navigate to /sign-out" — agents MUST execute the popup sequence and reviewers MUST reject the loose/wrong Step text in favor of the popup sequence.
- **Agents:** qa-frontend-expert (storefront), qa-testing-expert (execution), test-management-specialist (CSV review)

### BL-AUTH-008: Self-impersonation must have a defined non-circular outcome `[P1-data]`
- **Rule:** When an operator with `CanImpersonate` navigates to `/account/impersonate/{ownUserId}` (their own platform user ID), the result must be a defined, non-circular outcome: (a) session cleared with redirect to `/sign-in`, (b) a handled error page, or (c) a redirect to home with the operator's own session intact and no impersonation banner. The system must NOT enter a circular state where the banner shows "Operator logged in as Operator" or an infinite redirect loop.
- **Verify:** Authenticated SUPPORT_AGENT navigates to `/account/impersonate/@td(SUPPORT_AGENT.userId)` → outcome is one of the three acceptable states; no banner showing the operator as both impersonator and target; no infinite redirect loop in Network panel.
- **Violation signal:** Banner displays "{operator name} logged in as {operator name}"; infinite redirect loop (>5 consecutive redirects between `/account/impersonate/...` and other routes); session enters a wedged state where neither operator nor target is authenticated and no error is shown.
- **Applies to:** IMP-017 (suite 082-auth-impersonation). Any future case that exercises the self-target path of the impersonation route.
- **Agents:** qa-frontend-expert (storefront route guard), qa-backend-expert (`/connect/token grant_type=impersonate` self-target rejection)

### BL-AUTH-009: Nested impersonation forbidden — no silent path from impersonated session `[P0-security]`
- **Rule:** An impersonated session must not be able to silently impersonate a third user. When the current authenticated session is itself an impersonation (banner visible, target identity active, operator context preserved), navigating to `/account/impersonate/{thirdUserId}` MUST require the operator's own credentials again via the Security Verification Form. The silent flow (form-skipping when `operator != null`) applies only to the original operator's authenticated session, never to a session where the operator IS being impersonated.
- **Verify:** Authenticated session is impersonating User-A → navigate to `/account/impersonate/@td(USR-B.userId)` → Security Verification Form renders (no silent path); attempting to submit User-A's credentials fails (User-A lacks `CanImpersonate`); only the original operator's credentials succeed and return to operator → User-B impersonation.
- **Violation signal:** Silent flow triggers from an impersonated session (form does not render); impersonated user successfully impersonates a third user without providing the operator's credentials; chained impersonation tokens are issued (privilege escalation).
- **Applies to:** IMP-013 (suite 082-auth-impersonation). Security audits of the impersonation token chain.
- **Agents:** qa-backend-expert (`/connect/token` chain enforcement), qa-frontend-expert (silent-flow gate condition)

### BL-AUTH-010: Impersonation banner must persist across SPA navigation `[P1-ux]`
- **Rule:** Once an impersonation session is active, the banner `[operator name] + "logged in as" + [Account menu: target name]` must remain visible on every storefront page until the operator explicitly stops the impersonation. The banner must NOT disappear on route changes, modal opens, or async data loads. This includes navigation to: home, category pages, product detail, cart, checkout, account pages, search results, and CMS pages.
- **Verify:** Start impersonation → verify banner on home → navigate to /catalog → banner present → /cart → banner present → /checkout → banner present → /account/orders → banner present → click any internal link → banner still present. Banner DOM element survives SPA route transitions.
- **Violation signal:** Banner disappears on any storefront route except the explicit Stop Impersonation action; banner re-renders inconsistently (flicker); banner missing on cart or checkout (revenue-critical pages); banner shows operator/target names that don't match the live session.
- **Applies to:** IMP-011 (suite 082-auth-impersonation). Cross-cutting regression for any new storefront layout/route changes.
- **Agents:** qa-frontend-expert (storefront layout + route persistence)

### BL-AUTH-011: Stop Impersonation must restore operator session without sign-in round-trip `[P1-data]`
- **Rule:** Clicking Stop Impersonation in the banner must restore the original operator's authenticated session in place — without redirecting to `/sign-in`, without requiring re-authentication, and without losing the operator's prior session state (cart, in-progress flows, etc.). The result: target identity is removed, operator identity is active, no auth prompt.
- **Verify:** Operator (SUPPORT_AGENT) starts impersonating target → confirms banner → clicks Stop Impersonation → URL does NOT redirect to `/sign-in`; account menu now shows operator name (not target); operator's cart/wishlist/addresses are restored to operator-scope; no Security Verification Form rendered; no `/connect/token` call with `grant_type=password` (only the existing operator token is restored).
- **Violation signal:** Stop Impersonation redirects to `/sign-in` (operator must re-authenticate); account menu shows "Sign in" instead of operator name (session lost); target's cart/data persists in operator's session after stop; full page reload occurs (operator session is dropped and recreated).
- **Applies to:** IMP-012 (suite 082-auth-impersonation). Any regression that touches the impersonation token-stack restore logic.
- **Agents:** qa-frontend-expert (storefront stop-impersonation handler), qa-backend-expert (operator token re-activation)

### BL-AUTH-012: Org-scoped lockout does not touch the global account `[P0-revenue]`
- **Rule:** Setting `OrganizationMembership.IsLocked = true` for (userId, orgX) MUST NOT set `ApplicationUser.LockoutEnd`. `GET /api/platform/security/users/{userId}/locked` MUST remain `{"locked": false}`, and the user MUST still authenticate into any other organization whose membership is unlocked. (VCST-5028 — the exact regression the feature exists to prevent: the old handler globally locked the shared user.)
- **Verify:** Lock membership in org X via `POST /api/customer/organization-memberships/{id}/lock` → `GET /api/platform/security/users/{userId}/locked` returns `locked: false` → `/connect/token` with `organization_id=X` → HTTP 400 `code: user_is_locked_in_organization` → `/connect/token` with `organization_id=Y` (same user, unlocked) → HTTP 200.
- **Violation signal:** Global `locked: true` after an org-scoped lock; login to a non-locked org fails with the same credentials.
- **Agents:** qa-backend-expert (organization-memberships REST, security API)

### BL-AUTH-013: Org-scoped lockout error is distinct from global lockout `[P1-data]`
- **Rule:** When membership in org X is locked, `/connect/token` with `organization_id=X` MUST return HTTP 400, `error: invalid_grant`, `code: user_is_locked_in_organization` — never the global lockout codes (`user_is_locked_out` / `user_is_temporary_locked_out`). The storefront sign-in form AND the org switcher MUST surface org-specific copy ("…access to this organization has been blocked…"), not the generic global-lockout message.
- **Verify:** Lock membership for org X → `/connect/token` org X → assert `code == "user_is_locked_in_organization"`; storefront `/sign-in` or org-switch into the locked org → assert org-specific copy (distinct from the suite-031 global-lockout copy).
- **Violation signal:** Token endpoint returns a global lockout code for an org-scoped lock; storefront shows the generic lockout message.
- **Agents:** qa-frontend-expert (sign-in form, org switcher), qa-backend-expert (token endpoint)

---

## Domain 6: B2B / Organization (BL-B2B)

### BL-B2B-001: Org switching isolates cart, addresses, and lists `[P0-revenue]`
- **Rule:** When a B2B user switches between organizations, the cart, saved addresses, wish lists, and pricing context must completely reset to the new organization's scope. No data from the previous org should leak into the new org's context.
- **Verify:** Org A has items in cart → switch to Org B → cart is empty (or shows Org B's cart). Org A's addresses not visible under Org B. Switch back → Org A's cart restored.
- **Violation signal:** Org A's cart items visible under Org B; addresses from wrong org shown; prices from wrong org applied.
- **Agents:** qa-frontend-expert (org switcher), qa-backend-expert (xAPI context switching)

### BL-B2B-002: Organization-specific pricing overrides store default `[P0-revenue]`
- **Rule:** When an organization has an assigned price list, those prices override the store's default price list for all members of that organization. The priority chain is: organization price list → store default price list → "Unavailable." If the org price list doesn't cover a product, the store default applies as fallback.
- **Verify:** Org A has custom price list (Product X = $50). Store default has Product X = $75. Sign in as Org A member → Product X shows $50. Sign in as non-org user → Product X shows $75. Check a product NOT in org's price list → should show store default price.
- **Violation signal:** Org member sees store default price instead of org price; non-org user sees org prices; product without org price shows "Unavailable" instead of falling back to store default.
- **Agents:** qa-frontend-expert (price display), qa-backend-expert (price list resolution API)

### BL-B2B-003: Quote expiry makes quote non-convertible `[P1-data]`
- **Rule:** Quotes (RFQ) have an expiration date set by the seller. After expiry, the buyer cannot convert the quote to an order — the "Convert to Order" action must be disabled or show an "Expired" message. Expired quotes remain visible in history but are not actionable. The seller can extend or reissue an expired quote.
- **Verify:** Create quote with expiry in 1 hour → wait for expiry → buyer attempts to convert → blocked with "Quote expired" message. Seller re-opens and extends → buyer can now convert.
- **Violation signal:** Expired quote converted to order; no expiry indication shown; "Convert" button active on expired quote; order placed at expired quote prices.
- **Agents:** qa-frontend-expert (quotes UI), qa-backend-expert (quotes API)

### BL-B2B-004: Delegated purchasing limits `[P0-revenue]`
- **Rule:** Organization members with "Buyer" role have a purchasing limit (budget threshold). Orders exceeding the limit require approval from an org admin or manager. The limit applies per-order, not cumulative. When the limit is exceeded, the order enters "Pending approval" status instead of being placed directly.
- **Verify:** Set buyer limit to $500 → buyer places $400 order → succeeds. Buyer places $600 order → enters "Pending approval" → org manager approves → order placed. Buyer attempts to self-approve → rejected.
- **Violation signal:** Order exceeding limit placed without approval; buyer can approve their own order; limit check skipped; pending order auto-approved.
- **Agents:** qa-frontend-expert (checkout approval flow), qa-backend-expert (order approval API)

### BL-B2B-005: Member role determines feature visibility `[P1-data]`
- **Rule:** Organization features visible on the storefront depend on the member's role. Org Admins see: member management, quotes, order approval, lists. Buyers see: order placement (within limits), lists, own orders. Members without purchasing role see: catalog browsing only. Feature visibility is controlled by both role permissions and the store's feature flags (`quotesEnabled`, etc.).
- **Verify:** Sign in as Org Admin → see "Members", "Quotes", "Approval" menu items. Sign in as Buyer → see "Orders", "Lists" but NOT "Members." Sign in as view-only member → no cart, no checkout access.
- **Violation signal:** Buyer sees member management; non-purchasing member can add to cart; features visible when feature flag is OFF; role change not reflected until re-login.
- **Data path (VCST-5028):** Permission-gated features read `pageContext.user.permissions`, which MUST be populated from the **active `OrganizationMembership.Roles`** after an org-switch. The global `ApplicationUser.Roles` is no longer the source of truth for org-scoped visibility. (BUG-A: the org-scoped JWT was correct but the `me`/GetPageContext projection returned `permissions:[]`, hiding maintainer actions — see BL-B2B-007.)
- **Agents:** qa-frontend-expert (storefront nav), qa-backend-expert (org roles API)

### BL-B2B-006: White labeling resolution order `[P1-data]` → superseded by Domain 19 (BL-WL)
- **Rule:** White labeling resolution now lives in **Domain 19 (BL-WL-001..006)**. The authoritative behavior: a **store master switch** (`WhiteLabeling.WhiteLabelingEnabled`, store-level public setting, storefront-enforced in `useWhiteLabeling.ts`) gates all WL for the store — when OFF, the storefront applies no branding at all and everyone (incl. org users) sees theme defaults (**BL-WL-003 layer 1** — this validates the original claim's spirit). When ON, org and store WL *records* are merged **per-field** with the org value preferred (**BL-WL-002**), each record filtered by its own `IsEnabled` flag (**BL-WL-003 layer 2** — a disabled/absent store record removes only the store's contribution and does NOT suppress an enabled org record). The current `GetWhiteLabelingSettingsQueryHandler` resolves **organization + store** only — a user-level override is not present in the handler (do not assume it).
- **Verify:** See BL-WL-002 (per-field merge) and BL-WL-003 (store master switch + record-level gating).
- **Violation signal:** Master switch OFF but WL still applied; whole-object override instead of per-field merge; an enabled org's branding suppressed merely by a disabled/absent store *record* (confusing the record flag with the master switch).
- **Agents:** qa-frontend-expert (visual theming, master-switch gate), qa-backend-expert (white labeling xAPI, store settings)
- **Corrected:** 2026-07-02 (TLC-2026-07-02-2043). Refined the original *"user-level override → organization → store default; org overrides only apply when store WL enabled; if disabled all users see store default regardless of org"* into the two-layer model above: the master switch (store setting, storefront-enforced) is real and does suppress org branding; the per-record `IsEnabled` merge (per-field, org-preferred) is the newly-documented xAPI detail. User-level override not found in the current handler.

### BL-B2B-007: Per-org JWT permission set is org-scoped; pageContext must match it `[P0-revenue]`
- **Rule:** A JWT issued for org X MUST carry only the `permission[]` derived from `OrganizationMembership.Roles` for (userId, orgX); permissions from any other org MUST NOT appear. `pageContext.user.permissions` (the `me`/GetPageContext projection) MUST equal the active-org JWT `permission[]`. (VCST-5028.)
- **Verify:** User is org-maintainer in X, org-employee in Y. Switch to X → decode JWT → maintainer set present, employee-only set absent. Switch to Y → only employee set. For each org, `GetPageContext` → `user.permissions` matches the decoded JWT for that org.
- **Violation signal:** JWT carries another org's permissions; `pageContext.user.permissions` diverges from the JWT (BUG-A condition — pageContext returned `[]` while the JWT held 8 maintainer perms).
- **Agents:** qa-frontend-expert (org switcher, pageContext), qa-backend-expert (token minting, xAPI me resolver)

### BL-B2B-008: Org-scoped role change mutates only the target org's membership `[P1-data]`
- **Rule:** Changing a member's role in org X (`changeOrganizationContactRole(memberId, roleIds)` or REST `PUT /api/customer/organization-memberships/{id}`) MUST update only the (userId, orgX) `OrganizationMembership.Roles`. Other orgs' membership records and the global `ApplicationUser.Roles` MUST be unchanged. (VCST-5028 — guards against the old handler that replaced global roles.)
- **Verify:** Member is employee in X, manager in Y. Change X → manager. `POST /api/customer/organization-memberships/search {userId}` → X role = manager, Y role still manager. `GET /api/platform/security/users/{userId}` → global `roles[]` unchanged.
- **Violation signal:** Role change in X also alters Y's membership or the global account roles.
- **Agents:** qa-backend-expert (organization-memberships REST + xAPI mutation)

### BL-B2B-009: Inviting a member creates a per-org membership, not a global role `[P1-data]`
- **Rule:** Inviting a user into org X with a role MUST create an `OrganizationMembership` for (newUserId, orgX) with that role; the global `ApplicationUser.Roles` MUST NOT be modified. After acceptance, `GET /api/customer/organization-memberships/user/{userId}/count` ≥ 1. (VCST-5028.)
- **Verify:** Invite a new user into X as employee; after acceptance, `POST /search {userId}` → contains org X with role employee. `GET /api/platform/security/users/{userId}` → global `roles[]` empty / no org-specific role.
- **Violation signal:** No membership record after invite acceptance; the invite writes a global role instead.
- **Agents:** qa-backend-expert (invite + membership API), qa-frontend-expert (invite flow)

### BL-B2B-010: Self-service company registration grants org-membership roles only, never global roles `[P1-data]`
- **Rule:** Self-service company registration (storefront `/sign-up`, "Organization" account type) MUST create the `Organization`, the registrant `Contact`, and an `OrganizationMembership` for (newUserId, newOrg) carrying the registrant's org role(s) (e.g. org-maintainer); the registration flow MUST NOT write any platform security role to the global `ApplicationUser.Roles`. This is the registration-time counterpart of BL-B2B-009 (which covers the invite path). (VCST-5028.)
- **Verify:** Register a new company with a fresh `AGENT-TEST-` user. `POST /api/customer/organization-memberships/search {userEmail}` → membership exists with non-empty org role(s) and `isActive=true`. `GET /api/platform/security/users/{userId}` → global `roles[]` empty / contains no platform admin role. The two assertions together prove roles live in the membership record, not on the global account.
- **Violation signal:** After registration the global `ApplicationUser.Roles` is non-empty with platform roles; or no membership/org role is created for the new organization.
- **Agents:** qa-frontend-expert (registration flow), qa-backend-expert (members + organization-memberships + security/users API)

---

## Domain 7: Catalog & Inventory (BL-CAT)

### BL-CAT-001: Stock zero disables purchase `[P0-revenue]`
- **Rule:** When a product's aggregated stock across all fulfillment centers reaches 0, the storefront must show "Sold out" (or equivalent), and the "Add to Cart" button must be disabled. The product remains visible but non-purchasable.
- **Verify:** Set stock to 0 in Admin → storefront shows "Sold out" label → "Add to Cart" disabled/hidden → attempt via xAPI `addToCart` → error response.
- **Violation signal:** "Add to Cart" still active when stock=0; product purchasable via API despite zero stock; no visual indicator of out-of-stock.
- **Agents:** qa-frontend-expert (PDP, listing), qa-backend-expert (inventory API, xAPI)

### BL-CAT-002: Virtual catalog inherits physical catalog changes `[P1-data]`
- **Rule:** A virtual catalog is a view over physical catalog data — not a copy. Any change to a product in the physical catalog (price, description, stock, images) is immediately reflected in all virtual catalogs that include it. There is no manual sync or publish step for catalog data propagation. Deletion of a product from the physical catalog removes it from all linked virtual catalogs.
- **Verify:** Edit product name in physical catalog → open virtual catalog → name updated immediately. Delete product from physical catalog → virtual catalog no longer shows it. Add product to physical catalog in a linked category → appears in virtual catalog.
- **Violation signal:** Virtual catalog shows stale data after physical catalog edit; deleted product still appears in virtual catalog; changes require manual sync.
- **Agents:** qa-backend-expert (catalog API, Admin SPA)

### BL-CAT-003: Search index lag window `[P2-ux]`
- **Rule:** After an admin change (product create/update/delete, price change, stock update), there is a 30-60 second window where the Elasticsearch index still reflects old data. During this window, storefront search/listing may show stale results. However, PDP (direct product page) and cart always use live data. After reindex, search results must match the current state.
- **Verify:** Change product name in Admin → immediately search on storefront → may show old name (acceptable within 60s). Wait 60s → search shows new name. Direct product URL shows new name immediately (not from search index).
- **Violation signal:** Stale data persists beyond 120s (2 reindex cycles); PDP shows stale data (should be live); reindex doesn't resolve the discrepancy.
- **Agents:** qa-frontend-expert (search + PDP), qa-backend-expert (search index API)

### BL-CAT-004: Category visibility toggle `[P2-ux]`
- **Rule:** Setting a category to "invisible" (visible=false) in Admin hides it from storefront navigation menus and category pages. However, products within a hidden category remain accessible via direct URL, search, and other categories they belong to. Subcategories of a hidden category also become hidden from navigation.
- **Verify:** Hide category in Admin → storefront menu no longer shows it → products still accessible via search or direct URL → subcategories also hidden from nav. Unhide → category and subcategories return to nav.
- **Violation signal:** Hidden category still in navigation menu; products in hidden category inaccessible via direct URL; subcategories still visible when parent is hidden.
- **Agents:** qa-frontend-expert (storefront nav), qa-backend-expert (category API)

### BL-CAT-005: Product requires virtual catalog assignment for storefront `[P1-data]`
- **Rule:** A product that exists only in a physical catalog (not linked to any virtual catalog assigned to a store) will NOT appear on the storefront. The storefront reads from the virtual catalog assigned to the store. Products must be in a category within the store's virtual catalog (or its linked physical catalog) to be visible.
- **Verify:** Create product in physical catalog only (not in store's virtual catalog) → storefront search returns nothing → add to virtual catalog category → product appears on storefront.
- **Violation signal:** Product visible on storefront without virtual catalog assignment; product appears in wrong store's catalog; physical-only product accessible via search.
- **Agents:** qa-backend-expert (catalog API), qa-frontend-expert (storefront search)

### BL-CAT-006: Configurable product requires all sections filled `[P0-revenue]`
- **Rule:** A configurable product (product with required configuration sections/options) cannot be added to cart until all required configuration sections are completed by the customer. The "Add to Cart" button must remain disabled until every required section has a selection. Optional sections may be left empty.
- **Verify:** Open configurable product → "Add to Cart" disabled → fill first required section → still disabled (more sections required) → fill all required sections → "Add to Cart" enabled. Leave an optional section empty → still enabled.
- **Violation signal:** "Add to Cart" enabled with incomplete required sections; configurable product added without configuration; configuration selections not reflected in cart line item.
- **Agents:** qa-frontend-expert (PDP configuration UI), qa-backend-expert (addToCart validation)

### BL-CAT-007: Multi-FFC inventory aggregation `[P1-data]`
- **Rule:** A product's available stock on the storefront equals the sum of inventory across all fulfillment centers (FFCs) assigned to the store. If FFC-A has 10 units and FFC-B has 5 units, the storefront shows 15 available. Stock is decremented from the appropriate FFC based on fulfillment logic (closest to shipping address or priority order).
- **Verify:** Set FFC-A = 10, FFC-B = 5 → storefront shows "In stock" with effective availability of 15. Place order for 12 → FFC-A decremented first (allocation logic). Check remaining: FFC-A + FFC-B totals correct.
- **Violation signal:** Storefront shows stock from only one FFC; total doesn't match sum; decrement applied to wrong FFC; stock goes negative in one FFC while another has units.
- **Agents:** qa-backend-expert (inventory API, FFC management), qa-frontend-expert (stock display)

### BL-CAT-008: Unit-of-measure CRUD integrity `[P2-ux]`
- **Rule:** Creating, renaming, or deleting a unit-of-measure group or unit in the Catalog module persists atomically and leaves no orphaned data. Deleting a group removes its units; a deleted group/unit no longer appears in the list or in product UoM dropdowns; group integrity is preserved after a unit delete.
- **Verify:** Create UoM group → appears in list; rename → list reflects new name; delete group → group and its units absent (`GET /api/catalog/measureunits`). Create unit in group → appears with name/short-name/conversion-factor; edit → persists; delete unit → removed, group intact (`GET /api/catalog/measureunits/{groupId}`).
- **Violation signal:** Group/unit not created; edit not persisted; delete leaves orphaned units or stale API data; group integrity broken after a unit deletion.
- **Agents:** qa-backend-expert (Admin SPA + REST `/api/catalog/measureunits`)

---

## Domain 8: Cross-Domain Invariants (BL-CROSS)

These invariants span multiple modules and are where the most expensive production bugs hide. Agents should prioritize these during regression testing.

### BL-CROSS-001: Price list deletion → storefront unavailability `[P0-revenue]`
- **Rule:** When a price list is deleted in Admin, affected products on the storefront must show as "Unavailable" (not $0). The "Add to Cart" button must be disabled. Products without any active price list in the current currency cannot be purchased.
- **Verify:** Delete price list in Admin → storefront product shows "Unavailable" or equivalent, not "$0.00" → "Add to Cart" disabled → xAPI `products` query returns `price: null` or empty price object.
- **Violation signal:** Product displays "$0.00" price after price list deletion; "Add to Cart" remains active; order can be placed for $0.
- **Agents:** qa-backend-expert (pricing API, Admin), qa-frontend-expert (storefront display), qa-testing-expert (end-to-end)

### BL-CROSS-002: Catalog change → search lag → cart price mismatch window `[P0-revenue]`
- **Rule:** After a product price or availability is changed in Admin, there is a 30-60 second window where the Elasticsearch index still reflects old data. During this window, the storefront may show stale prices. However, the cart/checkout must always use the server-side (current) price — not the cached search index price.
- **Verify:** Change price in Admin → immediately check storefront listing (may show old price) → add to cart → cart must show the NEW price. After reindex → listing matches cart.
- **Violation signal:** Cart uses stale price from search index; order placed at old price after admin price increase; price mismatch between listing and cart persists beyond reindex window.
- **Agents:** qa-frontend-expert (price display), qa-backend-expert (search index, pricing), qa-testing-expert (timing scenario)

### BL-CROSS-003: Module disable → API 404, Admin section removal, dependent degradation `[P1-data]`
- **Rule:** When a module is disabled in Admin, its REST APIs return 404, its Admin SPA sections disappear, and its GraphQL schema types are removed. Dependent modules should degrade gracefully — not crash.
- **Verify:** Disable module → its API endpoints return 404 → Admin menu item gone → dependent module shows appropriate fallback (not error screen) → re-enable → everything restored.
- **Violation signal:** API returns 500 instead of 404; Admin section still visible but broken; dependent module crashes; re-enable doesn't restore functionality.
- **Agents:** qa-backend-expert (API, Admin), qa-frontend-expert (storefront degradation)

### BL-CROSS-004: Currency switch triggers multi-system recalculation `[P0-revenue]`
- **Rule:** When a user switches currency on the storefront, the following must all update atomically: (1) product prices switch to the new currency's price list, (2) cart line items recalculate using new prices, (3) shipping rates update for the new currency, (4) tax recalculates if rates differ. Products without prices in the new currency become unavailable.
- **Verify:** Switch currency → all prices update → cart totals recalculate → shipping and tax adjust → products without new-currency prices show "Unavailable".
- **Violation signal:** Partial update (prices change but cart doesn't recalculate); shipping in old currency; tax on pre-switch amounts; mixed currency display.
- **Agents:** qa-frontend-expert (full UI flow), qa-backend-expert (xAPI response)

### BL-CROSS-005: Order placement triggers multi-system side effects `[P0-revenue]`
- **Rule:** When an order is successfully placed, the following side effects must all occur: (1) inventory decremented by ordered quantities, (2) order confirmation email sent to the customer, (3) GA4 `purchase` event fired with correct order ID, revenue, and items, (4) order appears in the customer's order history, (5) cart is cleared. All side effects must complete — partial execution (e.g., inventory decremented but email not sent) is a bug.
- **Verify:** Place order → check inventory (decremented) → check email inbox (confirmation received) → check GA4 dataLayer (purchase event with correct data) → check "My Orders" (order listed) → check cart (empty). Verify in Admin: order exists with correct totals.
- **Violation signal:** Inventory not decremented; email not sent; GA4 event missing or wrong revenue; order not in history; cart not cleared; any side effect missing.
- **Agents:** qa-frontend-expert (confirmation + GA4), qa-backend-expert (inventory + order API), qa-testing-expert (email + end-to-end)

### BL-CROSS-006: Feature flag toggle → immediate behavior change `[P1-data]`
- **Rule:** Store-level feature flags (e.g., `quotesEnabled`, `anonymousUsersAllowed`, `createAnonymousOrderEnabled`) take effect on the storefront without requiring a restart or redeployment. The storefront reads flags from xAPI on each page load. Module-level flags (e.g., module enable/disable) may require a platform restart. The distinction must be documented per flag.
- **Verify:** Toggle `quotesEnabled` OFF in Admin → refresh storefront → "Request Quote" button disappears. Toggle ON → button returns. For module flags: disable module → restart platform → verify effects.
- **Violation signal:** Flag change requires restart when it shouldn't; flag change has no effect until cache expires; storefront caches flags beyond one page load.
- **Agents:** qa-frontend-expert (storefront UI), qa-backend-expert (store settings API)

### BL-CROSS-007: Admin entity deletion → cascade cleanup `[P1-data]`
- **Rule:** When a top-level entity is deleted in Admin, all dependent data must be cleaned up: (1) delete catalog → products, categories, prices, search index entries removed; (2) delete organization → members disassociated (not deleted), org-specific price lists unlinked; (3) delete store → associated virtual catalog unlinked, orders preserved (historical). No orphaned records should remain in the database.
- **Verify:** Delete a catalog → its products no longer appear in search, pricing, or any virtual catalog. Delete an org → members can still log in but have no org association. Check xAPI: no references to deleted entities.
- **Violation signal:** Orphaned products in search after catalog deletion; orphaned prices referencing deleted products; member accounts deleted with org; API returns references to deleted entities.
- **Agents:** qa-backend-expert (Admin SPA, APIs), qa-testing-expert (cascade verification)

### BL-CROSS-008: Organization switch → full context swap `[P0-revenue]`
- **Rule:** When a B2B user switches organization, ALL of the following must swap atomically: (1) cart — new org's cart loads, (2) addresses — new org's address book, (3) pricing — new org's price list, (4) lists/wish lists — new org's lists, (5) white labeling — new org's theme (if WL enabled), (6) quotes — new org's quotes. Partial swap (e.g., cart changes but prices don't) is a critical bug.
- **Verify:** As Org A, note cart, addresses, prices, theme → switch to Org B → verify ALL six contexts changed → switch back → ALL restored to Org A's state.
- **Violation signal:** Cart swaps but prices remain from previous org; addresses from wrong org; theme doesn't change; partial context swap of any kind.
- **Agents:** qa-frontend-expert (full UI), qa-backend-expert (xAPI org context)

### BL-CROSS-009: Eventual consistency is bounded `[P1-data]`
- **Rule:** Any change to an entity — an admin edit (product, price, inventory, category, settings) **or a write through any API surface** (REST, xAPI/GraphQL) — must be reflected everywhere that entity is read within 120 seconds (2 reindex cycles). This bound covers search index, cache layers, CDN, **and per-entity read caches**: a write on one surface must invalidate the cached read of the *same* entity on every other surface — caches must expire on the entity's change event, not only on a same-surface write. After 120 seconds, any discrepancy (Admin vs storefront, or one API surface vs another) is a bug.
- **Verify:** (a) Make an admin change → start timer → check storefront repeatedly → reflects within 120s; if using CDN, verify cache purge within the same window. (b) Cross-surface: write an entity via one API (e.g. a REST cart change) → read the *same* entity via another API (e.g. a GraphQL cart query) → the read reflects the write, because the change event invalidated the read cache.
- **Violation signal:** Storefront shows stale data after 120s; change requires manual cache purge; inconsistency between search results and product detail pages; a read on one API surface returns stale data after a write on another surface (read cache not invalidated on the change event).
- **Agents:** qa-testing-expert (timing scenario), qa-frontend-expert (storefront), qa-backend-expert (search index; cross-surface API read-cache consistency)
- **Amended:** 2026-07-23 (generalized to cross-API-surface read-cache invalidation on the entity change event. Verified live: a REST cart write is reflected by a subsequent xAPI cart read once the cart-changed event expires the aggregate read cache. 3-source: {OBSERVED} live GREEN + source (a cart-changed event handler that expires the per-cart cache token) + fix ticket VCST-5505.)

### BL-CROSS-010: Idempotency on all checkout mutations `[P0-revenue]`
- **Rule:** All checkout-related mutations (addToCart, removeFromCart, placeOrder, processPayment) must be idempotent when retried with the same idempotency key or cart token. Network retries, browser refreshes, and double-clicks must never produce duplicate side effects (double charges, double orders, double inventory decrement).
- **Verify:** Call `placeOrder` twice with same cart token → only 1 order created, 1 inventory decrement, 1 payment charge. Simulate network timeout + retry → same result. Refresh the confirmation page → no new order.
- **Violation signal:** Duplicate orders on retry; double payment charge; inventory decremented twice; different results on identical retry.
- **Agents:** qa-backend-expert (order/payment API), qa-testing-expert (retry scenarios)

### BL-CROSS-011: Graceful degradation when dependent service is down `[P1-data]`
- **Rule:** When a dependent service is unavailable (Elasticsearch down, payment gateway timeout, email service failure, analytics endpoint unreachable), the platform must degrade gracefully: (1) search down → show "Search unavailable" message, catalog browsing via categories still works; (2) payment gateway down → show error at checkout, don't create orphan orders; (3) email down → order still placed, email queued for retry; (4) analytics down → order still placed, events lost (acceptable).
- **Verify:** Simulate each service outage → verify core flow continues or shows meaningful error → no 500 errors, no white screens, no data corruption.
- **Violation signal:** White screen / 500 error when a dependent service is down; orphan orders created when payment fails; order blocked because email service is down; silent data loss without logging.
- **Agents:** qa-backend-expert (API resilience), qa-testing-expert (fault injection), qa-frontend-expert (error UX)

### BL-CROSS-012: Admin entity deletion never creates $0 products `[P0-revenue]`
- **Rule:** No admin action (price list deletion, catalog reorganization, module disable, currency removal) should ever result in a product being purchasable at $0.00 on the storefront. The safe state for a product without a valid price is "Unavailable" / "Add to Cart disabled" — never $0.00 with an active purchase button.
- **Verify:** Delete price list → check affected products show "Unavailable" not $0. Remove currency → products in that currency become unavailable. Disable pricing module → all products become unpurchasable.
- **Violation signal:** Any product purchasable at $0.00 due to admin action; "Add to Cart" active when price data is missing; order placed at $0.
- **Agents:** qa-frontend-expert (storefront), qa-backend-expert (pricing API), qa-testing-expert (end-to-end)

---

## Domain 9: Search (BL-SRCH)

### BL-SRCH-001: Facet counts match filtered results `[P1-data]`
- **Rule:** Facet counts displayed alongside filter options (brand, category, price range) must exactly match the number of products returned when that filter is applied. After applying filter "Brand: X (15)", exactly 15 products must appear in the filtered listing. Facet counts must update after each filter is applied (cascading facets).
- **Verify:** Note facet count for Brand X = 15 → click filter → verify exactly 15 products listed. Apply a second filter (e.g., price range) → facet counts for all other facets update to reflect the combined filter.
- **Violation signal:** Facet shows 15 but filter returns 12 products; facet counts don't update after second filter; total count mismatches; empty facets still shown (count > 0 but no results).
- **Agents:** qa-frontend-expert (catalog page), qa-backend-expert (xCatalog facet API)

### BL-SRCH-002: Zero-result query shows suggestions `[P2-ux]`
- **Rule:** When a search query returns zero results, the storefront must display: (1) a clear "No results found for '[query]'" message, (2) optionally, spelling suggestions or "Did you mean..." alternatives, (3) a fallback — popular products or categories. The page must NOT show a blank grid, a broken layout, or an error.
- **Verify:** Search for a nonsense term → "No results" message shown → page layout intact → suggestions or fallback content visible. Search for a common misspelling → "Did you mean..." suggestion appears.
- **Violation signal:** Blank product grid; broken layout on zero results; no message indicating empty results; error/500 on uncommon search terms.
- **Agents:** qa-frontend-expert (search results page), ui-ux-expert (UX evaluation)

### BL-SRCH-003: Search index consistency after catalog change `[P1-data]`
- **Rule:** After a product is created, updated, or deleted in Admin, the search index must reflect the change within the consistency window (BL-CROSS-009: 120s). Specifically: new product appears in search, updated product name/description changes in results, deleted product disappears from search. No ghost results for deleted products.
- **Verify:** Create product → wait 120s → search by name → found. Update name → wait 120s → search by new name → found, old name → not found. Delete product → wait 120s → search → not found.
- **Violation signal:** New product not findable after 120s; deleted product still in search results; updated fields not reflected in search; ghost/phantom results.
- **Agents:** qa-backend-expert (search index API, Admin), qa-frontend-expert (storefront search)

### BL-SRCH-004: Search respects store and catalog scope `[P1-data]`
- **Rule:** Search results are scoped to the current store's virtual catalog. Products from other stores or unlinked physical catalogs must never appear in search results. The search API requires `storeId` context — omitting it is an API contract violation.
- **Verify:** Search on Store A → only products from Store A's virtual catalog appear. Product in Store B's catalog → not in Store A's search. xAPI query without `storeId` → error, not unscoped results.
- **Violation signal:** Products from wrong store in search results; unscoped search returns cross-store data; xAPI returns results without storeId context.
- **Agents:** qa-backend-expert (xCatalog API), qa-frontend-expert (storefront search)

### BL-SRCH-005: Special characters in search queries `[P2-ux]`
- **Rule:** Search must handle special characters safely: quotes, ampersands, angle brackets, Unicode, emoji, and SQL/NoSQL injection patterns. Special characters should be escaped or treated as literal text — never interpreted as query operators (unless explicitly supported like `"exact phrase"` search). No 500 errors, no information leakage.
- **Verify:** Search for `<script>alert(1)</script>` → no XSS, shows "No results." Search for `'; DROP TABLE--` → no error, shows "No results." Search for product with `&` in name → found correctly.
- **Violation signal:** 500 error on special characters; XSS executes; search syntax injection; product with special chars in name not findable.
- **Agents:** qa-frontend-expert (search UI), qa-backend-expert (search API), qa-testing-expert (security scenarios)

---

## Domain 10: Shipping & BOPIS (BL-SHIP)

### BL-SHIP-001: Ship-to address determines available methods `[P0-revenue]`
- **Rule:** Available shipping methods and rates are determined by the shipping (delivery) address, not the billing address. Each shipping method has configured zones — only methods covering the destination zone are shown at checkout. Changing the shipping address must refresh the available methods and their rates in real time.
- **Verify:** Enter domestic address → see local methods (standard, express). Change to international address → local methods disappear, international methods appear with different rates. Enter an address in an uncovered zone → no shipping methods, checkout blocked with message.
- **Violation signal:** Shipping methods don't change when address changes; billing address used instead of shipping; methods shown for uncovered zones; rates don't update for new destination.
- **Agents:** qa-frontend-expert (checkout shipping step), qa-backend-expert (shipping API)

### BL-SHIP-002: BOPIS requires store pickup location `[P1-data]`
- **Rule:** Buy Online, Pick Up In Store (BOPIS) is only available when at least one fulfillment center is configured for store pickup in the customer's area. The customer must select a specific pickup location during checkout. BOPIS orders skip the shipping address step but still require a billing address.
- **Verify:** Select BOPIS → prompted to choose pickup location from list → no shipping address form shown → billing address still required → order placed with pickup location in order details.
- **Violation signal:** BOPIS shown when no pickup locations exist; shipping address required for BOPIS; no pickup location selection; order lacks pickup location reference.
- **Agents:** qa-frontend-expert (checkout BOPIS flow), qa-backend-expert (fulfillment center API)

### BL-SHIP-003: Free shipping threshold recalculates on cart change `[P0-revenue]`
- **Rule:** When a store offers free shipping above a threshold (e.g., orders over $100), the shipping cost must recalculate every time the cart changes (add/remove items, change quantity, apply/remove coupon). The threshold applies to the cart subtotal after discounts but before tax. A progress indicator ("$15 away from free shipping") is recommended.
- **Verify:** Cart = $90 → standard shipping = $10. Add item ($20) → cart = $110 → shipping = $0 (free). Apply coupon reducing total to $95 → free shipping removed, shipping = $10 again.
- **Violation signal:** Free shipping not recalculated after cart change; threshold applies to pre-discount total; free shipping persists after coupon reduces total below threshold.
- **Agents:** qa-frontend-expert (cart + checkout shipping), qa-backend-expert (shipping calculation API)

### BL-SHIP-004: Shipping method selection persists through checkout edits `[P1-data]`
- **Rule:** Once a customer selects a shipping method, that selection must persist through address edits, payment entry, and back-navigation within checkout — unless the address change invalidates the method (BL-SHIP-001). The selected method's rate is locked at selection time — no silent rate changes during checkout.
- **Verify:** Select "Express $15" → go to payment step → go back to shipping → "Express $15" still selected. Edit address (same zone) → method and rate persist. Edit address (different zone) → method deselected with notification.
- **Violation signal:** Shipping selection lost on back-navigation; rate changes silently during checkout; method persists after address change to incompatible zone.
- **Agents:** qa-frontend-expert (checkout navigation), qa-testing-expert (multi-step checkout)

---

## Domain 10a: BOPIS-Specific Rules (BL-BOPIS)

These invariants are extracted from BOPIS suite assertions (suites 036–038). They complement the general Shipping & BOPIS rules in Domain 10 with BOPIS-specific behavioral contracts.

### BL-BOPIS-001: Cart-level Pickup toggle assigns a single pickup shipment to all items `[P1-data]`
- **Rule:** Storefront v2.48.0 exposes a cart-level Pickup/Shipping toggle (not per-line). When the customer selects Pickup, all items in the cart are assigned to a single pickup fulfillment center. The cart xAPI must return exactly one shipment record with `fulfillmentCenterId` populated and `shippingAddress` null. Switching back to Shipping must clear the FFC and revert to a standard delivery shipment.
- **Verify:** Select cart-level Pickup → choose a store → inspect cart xAPI `shipments[]` → exactly one shipment with `fulfillmentCenterId` set, `shippingAddress` = null → checkout shows pickup store, no shipping address form → switch to Shipping → `fulfillmentCenterId` cleared, shipping address form appears.
- **Violation signal:** Cart xAPI returns zero shipments or more than one shipment for a pure-BOPIS cart; `fulfillmentCenterId` is null after Pickup is confirmed; `shippingAddress` is populated on a pickup shipment; switching to Delivery does not clear `fulfillmentCenterId`.
- **Note:** Per-line mixed fulfillment (some items pickup, some delivery in the same cart) is not supported in v2.48.0. This invariant will be updated when mixed-mode ships.
- **Agents:** qa-frontend-expert (cart Pickup toggle, checkout), qa-backend-expert (cart xAPI `shipments[]`)

### BL-BOPIS-002: BOPIS pickup always has $0 shipping cost `[P0-revenue]`
- **Rule:** Items selected for in-store pickup must have $0.00 shipping cost regardless of cart subtotal, applied promotions, or the presence of other delivery items in the same cart. The $0 pickup cost must not be inflated by any shipping fee calculation. The order confirmation and Admin order detail must also show $0 for the pickup shipment.
- **Verify:** Add BOPIS item → checkout → shipping section shows $0.00 → add a delivery item → delivery shipment shows a shipping rate, pickup section still shows $0 → place order → Admin order detail shows pickup shipment with $0 shipping.
- **Violation signal:** Pickup item shows a non-zero shipping cost; free shipping promotion applied to pickup item (redundant but incorrect base); Admin order shows shipping fee on pickup shipment.
- **Agents:** qa-frontend-expert (checkout totals), qa-backend-expert (order shipment API)

### BL-BOPIS-003: FFC availability label matches actual stock level `[P1-data]`
- **Rule:** The availability label shown for each fulfillment center in the BOPIS store-selector modal must accurately reflect the product's stock at that FFC. The label mapping is: `In Stock` (qty > 0, available today), `Available for Transfer` (qty > 0, requires inter-FFC transfer), `Not Available` (qty = 0 at this FFC). Labels must update after stock changes within the 120s consistency window (BL-CROSS-009).
- **Verify:** FFC-A has qty=5 → label shows "In Stock." Set FFC-A qty=0 → wait 120s → label shows "Not Available." Set qty=1 with transfer flag → label shows "Available for Transfer."
- **Violation signal:** "In Stock" label shown when FFC qty=0; "Not Available" shown when stock exists; label stale beyond 120s; label missing entirely; "Available for Transfer" shown for direct-availability stock.
- **Agents:** qa-frontend-expert (BOPIS modal labels), qa-backend-expert (inventory API, FFC data)

### BL-BOPIS-004: BOPIS store-selector modal is view-only on PDP `[P1-data]`
- **Rule:** The "Check Availability" / "Pick Up In Store" modal on the Product Detail Page (PDP) is a read-only view. It shows which stores have the product available but does NOT add the product to cart or select a pickup location. Cart addition and pickup-store selection happen from the cart page, not the PDP modal. The modal must close cleanly without side effects.
- **Verify:** Open PDP → open BOPIS modal → verify no "Add to Cart" button inside modal → close modal → cart is empty (no items added) → no store selection persisted.
- **Violation signal:** Modal adds item to cart on open or close; modal persists a store selection without user action; modal has a functional "Add to Cart" button; closing the modal triggers a navigation.
- **Agents:** qa-frontend-expert (PDP modal), qa-backend-expert (console — no addToCart mutation fired)

### BL-BOPIS-005: Inactive or closed pickup locations excluded from selector `[P1-data]`
- **Rule:** The BOPIS store-selector must only show fulfillment centers that are active and configured for pickup (not delivery-only FFCs). FFCs marked inactive or disabled in Admin must never appear in the pickup selector, even if they have stock. This prevents customers from selecting a location that cannot fulfill pickup orders.
- **Verify:** Create an FFC → mark as inactive in Admin → open BOPIS modal → FFC does not appear in the list. Re-activate → appears in list. Create a delivery-only FFC → does not appear in pickup selector.
- **Violation signal:** Inactive FFC shown in pickup selector; customer can select a disabled location; delivery-only FFC appears in pickup list; FFC reappears in list without admin re-activation.
- **Agents:** qa-frontend-expert (BOPIS modal list), qa-backend-expert (FFC API, Admin FFC settings)

### BL-BOPIS-006: BOPIS checkout requires billing address, skips shipping address `[P1-data]`
- **Rule:** For a pure-BOPIS checkout (all items are pickup), the checkout form must NOT display a shipping address section. The billing address is still required (for payment processing). This is a strict fulfillment-type-driven form variant — the absence of the shipping address section is correct behavior, not a bug. For mixed carts (BOPIS + delivery), the shipping address section IS displayed (for the delivery items).
- **Verify:** Pure BOPIS cart → checkout → no shipping address form visible → billing address form IS visible → order placed successfully with billing address only → Admin order shows pickup location, no shipping address.
- **Violation signal:** Shipping address form shown for pure-BOPIS checkout; billing address not required; order placed without any address; shipping address form missing for mixed-cart checkout (delivery items need it).
- **Agents:** qa-frontend-expert (checkout form structure), qa-backend-expert (order address fields in xAPI)

### BL-BOPIS-007: BOPIS store-selector map does not collapse on no-results search `[P2-ux]`
- **Rule:** When the store-selector modal's search returns no results (no matching store name or location), the map panel must remain visible and maintain at least 40% of the modal width. The map must NOT collapse to zero width or hidden state on a no-results query. The no-results message appears in the list panel; the map panel is unaffected.
- **Verify:** Open BOPIS store-selector modal → measure map panel width (baseline ~50% of modal) → search for a guaranteed no-match term (e.g., `xyzabc123notastore`) → no-results message appears in list panel → map panel width remains >= 40% of modal total width (measure via `browser_evaluate` with `getBoundingClientRect()`).
- **Violation signal:** Map panel collapses to < 40% of modal width after no-results search; map panel hidden entirely; map width measured at 0px after search; map panel width decreases on no-results but not on results.
- **Cross-reference:** VCST-4518 (map collapse regression)
- **Agents:** qa-frontend-expert (BOPIS modal layout), ui-ux-expert (layout measurement)

### BL-BOPIS-008: Confirmed cart pickup location always returned at items[0] of cartPickupLocations `[P1-data]`
- **Rule:** Pickup locations referenced by any cart shipment (`cart.Shipments[].PickupLocationId`, distinct, non-null) must appear at `items[0]` of the `cartPickupLocations` xAPI response, regardless of paging (`first`), keyword search, facet, or filter. Backend resolves the missing IDs separately and prepends them to the result set, ordered by `PickupLocation.Name`. This guarantees the storefront BOPIS modal can pre-select the confirmed location on reopen even when it would otherwise be paged or filtered out.
- **Verify:** Set `cart.Shipments.PickupLocationId` to a location alphabetically/positionally beyond the first paged batch (e.g., 51+ of 102) → query `cartPickupLocations(cartId, storeId, first: 1)` → assert `items[0].id` matches the confirmed location ID. Repeat with `keyword` that matches zero other locations → still returned at `items[0]`. Storefront: confirm a far-page location → close modal → reopen → radio is checked, location at top of list with no scrolling, map centered on location.
- **Violation signal:** Confirmed pickup location absent from `cartPickupLocations` response; location returned but not at `items[0]`; modal reopen shows no checked radio; map zoomed out to default after reopen; location only appears after applying matching keyword/filter; multiple confirmed locations from same cart not all returned.
- **Cross-reference:** VCST-4707 (pre-selection pagination bug); PR [VirtoCommerce/vc-module-x-pickup#8](https://github.com/VirtoCommerce/vc-module-x-pickup/pull/8) — adds `IncludeLocationIds` field on `MultipleProductsPickupLocationSearchCriteria` and prepend logic in `ProductPickupLocationService.SearchPickupLocationsAsync`.
- **Agents:** qa-frontend-expert (BOPIS modal reopen pre-selection — see BOPIS-091), qa-backend-expert (`cartPickupLocations` xAPI — see GQL-094)
- **Promoted:** 2026-04-28 (from `PROPOSED-BL-BOPIS-008` in `reports/test-lifecycle/TLC-2026-04-28-2050/lifecycle-report.md`).

---

## Domain 11: Notifications (BL-NOTIF)

### BL-NOTIF-001: Order confirmation email sent exactly once `[P1-data]`
- **Rule:** When an order is successfully placed, exactly one order confirmation email is sent to the customer's email address. Duplicate emails (due to retries, webhooks, or event duplication) are a bug. If the email service is temporarily unavailable, the email must be queued for retry — not silently dropped. Failed notifications are visible in Admin → Notification activity feed.
- **Verify:** Place order → check email inbox → exactly 1 confirmation received. Check Admin → Notification feed → sent status shown. Simulate email service failure → retry mechanism sends email after service recovery → still only 1 email total.
- **Violation signal:** 0 or 2+ confirmation emails; email silently dropped on service failure; no retry mechanism; notification feed shows no record.
- **Agents:** qa-backend-expert (notification API), qa-testing-expert (email verification)

### BL-NOTIF-002: Email content matches order data `[P1-data]`
- **Rule:** Order confirmation email content must match the actual order: order number, item names, quantities, prices, subtotal, shipping cost, tax, and grand total. The email uses the same currency as the order. Personalization tokens (customer name, shipping address) must be resolved — no `{{customerName}}` or blank fields.
- **Verify:** Place order → compare email content against Admin order detail → all values match. Check for unresolved tokens or placeholder text. Verify currency symbol matches order currency.
- **Violation signal:** Email shows wrong order total; unresolved template tokens; prices in wrong currency; missing items in email; order number mismatch.
- **Agents:** qa-testing-expert (email content verification), qa-backend-expert (notification template API)

### BL-NOTIF-003: Notification failure does not block order `[P0-revenue]`
- **Rule:** If the email/notification service fails during order placement, the order must still be created successfully. Notification sending is asynchronous — it must never block or roll back the order transaction. The customer should see the order confirmation page, and the email will be retried in the background.
- **Verify:** Simulate email service outage → place order → order created successfully → confirmation page shown → order in Admin → email queued for retry (visible in notification feed as "Pending").
- **Violation signal:** Order fails because email service is down; 500 error at checkout due to notification failure; order transaction rolled back; customer sees error but order was actually created (inconsistent state).
- **Agents:** qa-backend-expert (order API, notification service), qa-testing-expert (fault injection)

---

## Domain 12: Import / Export (BL-IMPEX)

### BL-IMPEX-001: CSV import is idempotent `[P1-data]`
- **Rule:** Re-importing the same CSV file must update existing records (matched by ID or code), not create duplicates. The import uses a unique identifier (product code, SKU, or explicit ID column) for matching. If the identifier is missing or ambiguous, the import must fail with a clear error — not silently create duplicates.
- **Verify:** Import CSV with 50 products → 50 products created. Re-import same CSV → still 50 products (updated, not 100). Modify one row → re-import → only that product updated, others unchanged.
- **Violation signal:** Re-import doubles the record count; duplicate products with same code; import succeeds without unique identifier; modified records not updated on re-import.
- **Agents:** qa-backend-expert (import API, Admin SPA)

### BL-IMPEX-002: Export matches admin grid filters `[P1-data]`
- **Rule:** When exporting data from Admin (products, orders, customers), the exported file must contain exactly the records matching the current grid filter/search. Exporting without a filter exports all records. The export format (CSV columns, date format, encoding) must be consistent and documented. Export must handle large datasets without timeout (background job for > 1000 records).
- **Verify:** Filter products by category X (showing 30) → export → CSV contains exactly 30 rows. Clear filter → export → CSV contains all products. Check CSV encoding (UTF-8 BOM for Excel compatibility).
- **Violation signal:** Export includes records outside current filter; export count doesn't match grid count; large export times out with no error; encoding issues (garbled characters).
- **Agents:** qa-backend-expert (export API, Admin SPA)

### BL-IMPEX-003: Large import does not timeout silently `[P1-data]`
- **Rule:** CSV imports with more than 1000 rows must run as a background job (Hangfire). The user must see a progress indicator or notification when the job completes. If the import fails mid-way (e.g., row 500 of 1000 has invalid data), already-processed rows must be committed (partial success), and the error must be reported with the failing row number and reason.
- **Verify:** Import 2000-row CSV → job starts in background → progress visible → completion notification. Import CSV with bad row 500 → rows 1-499 imported → error report shows "Row 500: invalid price format" → rows 501+ skipped or continued (based on config).
- **Violation signal:** Large import runs synchronously (browser hangs); silent timeout with no error; no progress indication; partial failure rolls back all rows; error message doesn't identify failing row.
- **Agents:** qa-backend-expert (import API, Hangfire dashboard)

### BL-IMPEX-004: Import validates data integrity before commit `[P1-data]`
- **Rule:** Import must validate data types, required fields, foreign key references (e.g., category exists, currency valid), and business rules (e.g., price > 0) before committing. Validation errors must be collected and reported as a batch — not one-at-a-time. A "dry run" or validation-only mode should be available for large imports.
- **Verify:** Import CSV with: missing required field → error "Row 3: Name is required." Invalid category reference → error "Row 7: Category 'XYZ' not found." Negative price → error "Row 12: Price must be > 0." All errors reported in one batch.
- **Violation signal:** Invalid data imported without error; errors reported one at a time (requiring multiple re-imports); foreign key violations cause 500 error instead of validation message; no dry-run option.
- **Agents:** qa-backend-expert (import validation API)

---

## Domain 13: SEO & URLs (BL-SEO)

### BL-SEO-001: Slug uniqueness enforced `[P1-data]`
- **Rule:** Every product and category URL slug must be unique within a store. Attempting to create a product with a duplicate slug must either auto-append a suffix (e.g., `-1`) or reject with a validation error. Slugs are case-insensitive — `/product-a` and `/Product-A` must resolve to the same entity.
- **Verify:** Create Product A with slug "my-product" → create Product B with same slug → rejected or auto-renamed to "my-product-1." Navigate to `/MY-PRODUCT` → same page as `/my-product`.
- **Violation signal:** Duplicate slugs accepted without suffix; two different products with same slug (one overwrites); case-sensitive slug resolution (404 for different case).
- **Agents:** qa-backend-expert (catalog API, SEO settings), qa-frontend-expert (URL navigation)

### BL-SEO-002: Deleted product returns proper HTTP status `[P2-ux]`
- **Rule:** When a product is deleted, its URL must return HTTP 410 Gone (preferred) or 404 Not Found — never 200 with an empty/broken page. Cached search engines should be informed via the status code to remove the listing. Redirecting to a relevant category page with 301 is an acceptable alternative if configured.
- **Verify:** Note product URL → delete product in Admin → navigate to URL → HTTP 410 or 404 status. Check page: either a proper error page or redirect. Never a blank page with 200 status.
- **Violation signal:** 200 status with blank/broken content; no status code change after deletion; product page still accessible indefinitely; 500 error.
- **Agents:** qa-frontend-expert (URL navigation), qa-backend-expert (routing/SEO config)

### BL-SEO-003: Canonical URL set on all pages `[P2-ux]`
- **Rule:** Every storefront page must have a `<link rel="canonical">` tag pointing to its preferred URL. Products accessible from multiple categories must have one canonical URL (typically the product's primary category path). Search result pages, filtered views, and paginated pages must have appropriate canonical tags (pointing to the unfiltered/first page, or self-referencing with query parameters).
- **Verify:** Open PDP → inspect `<link rel="canonical">` → URL matches expected format. Open same product via different category → canonical still points to primary URL. Check paginated listing → page 2 has canonical pointing to page 2 (self-referencing) or page 1 (depending on SEO strategy).
- **Violation signal:** Missing canonical tag; canonical points to wrong URL; different canonical for same product from different entry points (unless intentional); canonical on paginated page points to page 1 when self-referencing is expected.
- **Agents:** qa-frontend-expert (page source inspection), ui-ux-expert (SEO audit)

### BL-SEO-004: SEO link type controls URL format `[P1-data]`
- **Rule:** The store setting `seoLinkType` controls how product and category URLs are generated. When changed, all storefront URLs must update to the new format. Old-format URLs should either redirect (301) to the new format or return 404 — never serve content at both old and new URLs simultaneously (duplicate content penalty).
- **Verify:** Set `seoLinkType` to format A → note URLs. Change to format B → URLs update to new format. Navigate to old-format URL → 301 redirect to new format (or 404).
- **Violation signal:** Old and new format URLs both serve content (duplicate); URL format doesn't change after setting update; old URLs return 200 instead of 301/404; broken links after format change.
- **Agents:** qa-backend-expert (store settings API), qa-frontend-expert (URL navigation)

---

## Domain 14: Profile & Member Data (BL-PROFILE)

### BL-PROFILE-001: Silent duplicate-skip on `updateMemberAddresses` and matching `checkDuplicateAddress` detection `[P1-data]`
- **Rule (write path — `updateMemberAddresses`):** When `updateMemberAddresses` is called with an address whose key fields — `line1` + `city` + `countryCode` + `postalCode` + `regionId` + `addressType` — exactly match an already-saved address on the same member, the server MUST silently skip the insert. No new record is created, no error is raised in `errors[]`, and the member's total address count (`currentCustomerAddresses.totalCount`) MUST remain unchanged. This holds regardless of the size of `addresses[]` (one or many) AND regardless of `memberType` (Contact or Organization — same endpoint, same dedup semantics). The dedup check is **against the member's stored collection**, not only within the incoming batch, and must NOT depend on auto-computed fields like `name` that the client submits as null.
- **Rule (read path — `checkDuplicateAddress`):** `checkDuplicateAddress(memberId, address)` MUST return `isDuplicated: true` if and only if an existing stored address on `memberId` matches the submitted address by the same key fields listed above. Novel addresses return `isDuplicated: false`; exact matches return `true`. The detection contract MUST agree with the write-path dedup contract — whatever `updateMemberAddresses` silently skips, `checkDuplicateAddress` must flag. The query MUST require authentication (no anonymous access) and MUST enforce same-member / same-org authorization (no cross-member probing).
- **Verify (write path):** Capture totalCount = N and the full field set of an existing address. Call `updateMemberAddresses(command: { memberId, addresses: [{…same fields}] })` with exactly one byte-identical element. Re-query totalCount → must equal N. Count rows in `items[]` matching the duplicate's line1 + firstName + lastName → must equal 1 (not 2). `errors[]` must be empty. Repeat with a 2-element `addresses[]` where one element is identical-to-existing and one is novel → novel row is added, duplicate is skipped, totalCount = N+1. Repeat both scenarios for a Contact memberId AND an Organization memberId.
- **Verify (read path):** With a valid bearer token, call `checkDuplicateAddress(memberId: <own>, address: {…byte-identical fields of an existing saved address})` → `isDuplicated: true`. Call with a novel address → `isDuplicated: false`. Call anonymously (no Authorization header) → request rejected with 401 or equivalent authz error; not HTTP 200. Call with a foreign memberId (different user) → authz error, no data returned.
- **Violation signal:** `totalCount` = N+1 after single-element submission; two rows with identical key fields appear in `items[]`; the mutation raises an error instead of silently skipping. For the read path: `checkDuplicateAddress` returns `isDuplicated: false` for an address that clearly exists on the member; or returns data to an unauthenticated caller (HTTP 200 without 401); or returns data when a foreign memberId is used.
- **Agents:** qa-backend-expert (GraphQL direct — see GQL-056, and planned GQL-060/061 for checkDuplicate detection), qa-frontend-expert (storefront UI — see B2C-SHIP-014), test-management-specialist (cross-layer coverage audit)
- **Origin:** PR [VirtoCommerce/vc-module-profile-experience-api#129](https://github.com/VirtoCommerce/vc-module-profile-experience-api/pull/129) — adds both `MemberAggregateRootBase.UpdateAddresses` dedup AND `checkDuplicateAddress` query. As of 2026-04-24 the PR delivers: Contact-path write dedup ✅ works; Organization-path write dedup ❌ broken (`BUG-updateMemberAddresses-Single-Append-Dedup-Miss.md`); `checkDuplicateAddress` detection ❌ always returns false (`BUG-checkDuplicateAddress-Non-Functional.md`).
- **Promoted:** 2026-04-23 (from `PROPOSED-BL-PROFILE-001` in `reports/test-lifecycle/TLC-2026-04-23-1700/bl-proposals.md`).

---

## Domain 15: UI Display & Layout Stability (BL-UI)

These invariants hold for any rendered surface — Storybook stories, storefront pages, admin SPA blades — regardless of feature spec or Figma source. They turn "looks broken" into "measurably violates a rule." Violations are FAIL even when a JIRA ticket does not call them out, because the design system contract makes them implicit acceptance criteria. Canonical measurement helper: [`scripts/lib/measure-layout.ts`](../../scripts/lib/measure-layout.ts). Canonical regression suite: `regression/suites/Frontend/cross-cutting/048b-layout-stability.csv` (suite id `048b`, selection group `layout-stability` — full `vc-qa` plugin only, not shipped here).

### BL-UI-001: Layout stability on initial render `[P2-ux]`
- **Rule:** After first paint, visible content MUST NOT shift as late assets resolve (images, web fonts, async data, skeleton → content swap). Cumulative Layout Shift (CLS) — measured via `PerformanceObserver({ type: 'layout-shift' })` summing `entry.value` where `entry.hadRecentInput === false` — must be ≤ 0.1 on initial render. Image elements without intrinsic dimensions (`width`/`height` attrs or CSS `aspect-ratio`) are the most common offender.
- **Verify:** Install the observer before navigating (`LAYOUT_SNIPPETS.installClsObserver`). Load the component / page. Wait for `load` + idle. Read accumulated CLS (`LAYOUT_SNIPPETS.readCls`). Repeat on throttled network ("Fast 3G") — late-loading images often hide shifts on fast connections.
- **Violation signal:** CLS ≥ 0.1 (FAIL), ≥ 0.25 (P0 if on checkout / cart / PDP). Visible jump as image loads. Skeleton snaps to different height when data arrives. Font swap (FOIT/FOUT) reflows surrounding text.
- **Agents:** ui-ux-expert (Storybook + storefront), qa-frontend-expert (revenue-critical surfaces)
- **Suite coverage:** `048b` LAYOUT-CLS-001..004 (home, PDP, cart, checkout)
- **Promoted:** 2026-05-14 (from `ui-ux-expert.md` UI-invariants draft).

### BL-UI-002: Spacing grid compliance `[P2-ux]`
- **Rule:** Every computed `padding`, `margin`, and `gap` MUST resolve to a multiple of 4 px (preferred step 8 px). Allowed values: `{0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96}` px. Anything else (13 px, 27 px, 41 px) is off-grid and violates the Coffee theme contract — regardless of how the rendered output looks.
- **Verify:** For each container and its key children, read `getComputedStyle(el).paddingTop|Right|Bottom|Left`, `marginTop|…`, and `gap` via `spacingAuditSnippet(selector)`. Strip `"px"`, cast to number, check membership in the allowed set. Run at multiple viewports — some breakpoints introduce token overrides.
- **Violation signal:** Computed values like `"13px"`, `"27px"`, `"41px"`. Hardcoded pixel values in styles instead of design-token CSS variables (`var(--spacing-md)` etc.).
- **Agents:** ui-ux-expert (component audit), qa-frontend-expert (storefront pages)
- **Suite coverage:** `048b` LAYOUT-SPC-001..003 (catalog product cards, cart line items, checkout form)
- **Promoted:** 2026-05-14 (from `ui-ux-expert.md` UI-invariants draft).

### BL-UI-003: No state-induced layout shift `[P2-ux]`
- **Rule:** Hover, focus, validation-message insertion, badge/counter updates, and skeleton → content swap MUST NOT move adjacent elements. A border that appears on hover must use `outline` (which does not affect layout) OR reserve its space with a transparent border in the default state. A counter widening from 1-digit to 3-digit must not push siblings.
- **Verify:** Record `getBoundingClientRect()` of a neighbor sibling (`rectSnapshotSnippet(selector)`). Trigger the state change. Re-record. Compare with `compareRectSnapshots(before, after)` — `topDelta` and `leftDelta` must be 0.
- **Violation signal:** Neighbor moves on hover. Form below a field jumps when validation error inserts. Cart-icon badge change shifts navbar items. Skeleton dimensions ≠ resolved content → snap on load.
- **Agents:** ui-ux-expert (components), qa-frontend-expert (cart/checkout/forms)
- **Suite coverage:** `048b` LAYOUT-SHIFT-001..003 (product-card hover, cart-badge update, validation error insertion)
- **Promoted:** 2026-05-14 (from `ui-ux-expert.md` UI-invariants draft).

### BL-UI-004: Content boundary `[P2-ux]`
- **Rule:** Text and child elements MUST stay inside their container at every supported viewport. Long content must wrap, truncate with ellipsis, or scroll — never overflow silently and never be clipped by `overflow: hidden` without an explicit ellipsis indicator. Horizontal scrolling on the document at any tested viewport (375 / 768 / 1024 / 1280 / 1920) is a bug unless the scrolling element is itself an intentional horizontal scroller (e.g., a data table).
- **Verify:** Inject stress content (80-char product title, 12-digit SKU, German-equivalent label, 4-digit quantity). At each viewport, run `LAYOUT_SNIPPETS.overflowAudit` — checks `document.documentElement.scrollWidth > window.innerWidth` (horizontal overflow) and for each suspect element `el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'hidden'` (silent clipping).
- **Violation signal:** Page scrolls horizontally at 375 px. Product title is cut off mid-character with no `…`. Card stretches to fit the longest sibling's text, breaking grid alignment. Locale labels (German `Versandadresse`) overflow into adjacent column.
- **Agents:** ui-ux-expert (stress states), qa-frontend-expert (i18n verification)
- **Suite coverage:** `048b` LAYOUT-OVF-001..002 + LAYOUT-VPS-001 (mobile pages, long-title injection, 50-px viewport sweep)
- **Promoted:** 2026-05-14 (from `ui-ux-expert.md` UI-invariants draft).

### BL-UI-005: Alignment in horizontal groups `[P2-ux]`
- **Rule:** Elements in a horizontal group share a baseline: text baselines align, vertical centers align within 1 px, buttons in the same row share `height` exactly, and an icon adjacent to text vertically centers with that text (within 1 px). Product-grid cells share height per row; table-row cells share height per row.
- **Verify:** Read `getBoundingClientRect()` for each item in the row via `alignmentAuditSnippet(selector)`. For vertical-center alignment, compute `top + height/2` per item — values must match within 1 px. For row-height parity, `height` values must match exactly. The helper returns `centerDriftPx`, `heightDriftPx`, and a boolean `misaligned`.
- **Violation signal:** Cart-quantity stepper buttons sit 2 px lower than the number field. Icon-and-label pair has icon offset upward. One product card in a row is taller than its neighbors, breaking the grid. Table row heights drift from row to row.
- **Agents:** ui-ux-expert (component rows), qa-frontend-expert (PDP, cart, tables)
- **Suite coverage:** `048b` LAYOUT-ALN-001..002 (product grid row, cart-row stepper/price/remove)
- **Promoted:** 2026-05-14 (from `ui-ux-expert.md` UI-invariants draft).

### BL-UI-006: Touch target size and spacing `[P1-data]`
- **Rule:** At mobile viewport (≤ 768 px), every interactive element — `<button>`, `<a>`, `<input type="checkbox|radio">`, `[role="button"]`, custom steppers, toggle switches — MUST measure ≥ 44 × 44 CSS px and have ≥ 8 px gap from any adjacent interactive element. Padding counts toward the target; hit area is `getBoundingClientRect()` of the element including padding, NOT the visible glyph alone.
- **Verify:** Set viewport to 375 px. Run `LAYOUT_SNIPPETS.touchTargetAudit` — for each interactive selector, reads `getBoundingClientRect()` and checks `width >= 44 && height >= 44`; for pairwise spacing, checks closest-edge distance ≥ 8 px between any two interactives. Returns `{ undersized[], tooClose[] }`.
- **Violation signal:** 32 × 32 close button on a modal. Quantity stepper buttons 28 × 28 with 4 px between. Two checkboxes stacked with 6 px gap. A tap that should hit one element hits a neighbor instead.
- **Agents:** ui-ux-expert (mobile audits), qa-frontend-expert (revenue-critical mobile flows)
- **Suite coverage:** `048b` LAYOUT-TGT-001..003 (PDP, cart, checkout @ 375 px)
- **Severity rationale:** P1 (not P2) because legal/accessibility risk overlaps WCAG 2.5.5 (Target Size — AAA in WCAG 2.1, AA in WCAG 2.2).
- **Promoted:** 2026-05-14 (from `ui-ux-expert.md` UI-invariants draft).

---

## Domain 16: GraphQL xAPI Contract (BL-GQL)

Transport-layer invariants for the xAPI GraphQL endpoint at `{BACK_URL}/graphql`. These rules apply across every GraphQL operation regardless of resolver domain, and are enforced by `scripts/graphql-runner.ts` for runner-native test cases. See `graphql-schema.md` for the schema reference and `graphql-test-cases-runner.md` for the authoring contract.

### BL-GQL-001: GraphQL error contract `[P1-data]`
- **Rule:** Invalid, malformed, or forbidden GraphQL operations return a structured response: HTTP 200 with `errors[]` non-empty and `data: null` (or partial-null per spec). The server must NEVER (a) return HTTP 5xx for client-side validation failures (unknown field, missing required arg, unknown root field, missing `command` wrapper on mutations), (b) leak internal details in error messages — stack traces (`at System.`), SQL fragments (`SqlException`, `Microsoft.Data`, `SELECT … FROM`), connection strings, file paths, (c) crash instead of returning a structured error.
- **Verify:** Send queries with `INVALID_FIELD`, `nonExistentTopLevelField`, missing `command` arg, etc. — response must be HTTP 200, `errors[]` populated with field/arg name referenced, `data === null`, message does not match the internal-leak regex `/^((?!at System\.|SqlException|StackTrace|Microsoft\.Data|connection string|SELECT .+ FROM).)*$/i` (use negation in DATA assertion).
- **Violation signal:** HTTP 5xx on schema-validation error; `errors[]` empty on an obviously-invalid query; stack trace or SQL fragment exposed in `errors[0].message`; thrown exception bubbles to transport layer.
- **Agents:** qa-backend-expert (xAPI), test-runner-agent (graphql-runner.ts client-side validator enforces this contract).
- **Suite coverage:** `050g` XCC-GQL-015 (direct test); referenced by ~183 cases across all 14 GraphQL suites as the "no HTTP 500 / graceful failure" invariant.
- **Promoted:** 2026-05-15 (from `bl-proposals.md` TLC-2026-05-15-1830; 264 phantom references cleaned up across all GraphQL suites).

### BL-GQL-002: GraphQL query performance thresholds `[P2-ux]`
- **Rule:** Happy-path GraphQL operations against the xAPI complete within target wall-clock thresholds measured from request-send to response-received: simple single-resolver queries (`me`, `categories(first:1)`, flat `orders(first:10)`) **< 500 ms**; deep nested queries (`orders { items addresses inPayments shipments }`) **< 1000 ms**; introspection (`__schema { types }`) **< 1000 ms**. Thresholds are environment-specific — these are vcst-qa baselines; staging may differ.
- **Verify:** Runner-native `[PERF label=X] elapsed_ms < N` assertion against `r.elapsed_ms` captured per operation by `scripts/graphql-runner.ts`. Repeat the same deep query 5× to check for N+1: elapsed_ms should not grow proportionally.
- **Violation signal:** `elapsed_ms` exceeds threshold consistently (not just one spike); response time grows linearly with repetition (N+1 hint); timeout; 504 Gateway Timeout.
- **Agents:** qa-backend-expert (xAPI perf), regression-orchestrator (track elapsed_ms trend across runs).
- **Suite coverage:** `050g` XCC-GQL-018 (direct test); ~75 references across 12 suites mark perf-sensitive query paths.
- **Promoted:** 2026-05-15. Note: XCC-GQL-018 PERF assertions currently fail on vcst-qa at ~765 ms vs 500 ms target — real regression awaiting JIRA triage; NOT a flaw in this invariant.

### BL-GQL-003: GraphQL response data integrity `[P1-data]`
- **Rule:** Successful GraphQL operations return data conformant to the schema's declared return type: (a) non-null fields are non-null in the response (resolver did not silently drop a required projection), (b) computed/derived fields (cart totals `total`/`subTotal`/`taxTotal`/`discountTotal`; index-backed price fields `price.actual`/`price.list`) are present and arithmetically consistent, (c) mutation responses include the full mutated entity, not a partial echo, (d) after-state queries reflect the mutation's effect — no stale read.
- **Verify:** `[DATA label=X] $.path is non-null` on every required field of the projection; cross-path arithmetic checks (e.g., `subTotal.amount >= 0`; `total.amount >= subTotal.amount` when no discount; `discountTotal.amount > 0` after valid coupon); after-mutation re-read shows the new state.
- **Violation signal:** `null` returned where schema declares `T!`; computed field `0` or missing after a recalc; stale cart state returned after `changeCartItemQuantity`; `data.entity.field` exists in projection but absent in response.
- **Agents:** qa-backend-expert (xAPI integrity), test-management-specialist (full field selection per `feedback_graphql_full_field_selection`).
- **Suite coverage:** `050a` CAT-GQL-002/022, `050b1` CRB-GQL-006/017/046/047, plus ~18 references on flows where recalculation/full-shape correctness matters.
- **Promoted:** 2026-05-15.

### BL-GQL-004: GraphQL resolver auth gating `[P0-security]`
- **Rule:** GraphQL resolvers enforce authentication and authorization at the resolver level, not the transport level. (a) **Public ops** (`categories(storeId:X)`, `__schema`, `slugInfo`): accessible without a Bearer token. (b) **Soft-gated ops** (`me`): callable anonymously but returns `{ memberId: null, contact: null }` for anonymous callers — no error, no leak. (c) **Hard-gated ops** (`orders`, profile reads, cart mutations): return `errors[].extensions.code = "Unauthorized"` for anonymous callers, `data: null`. (d) **Cross-user reads**: an authenticated user cannot read another user's `orders` / `cart` — resolver returns `Forbidden` or empty result.
- **Verify:** Same op called (1) without token → expected gate response, (2) with `ORG_USER` token → real data with valid `memberId`. `errors[0].extensions.code` checked explicitly via `[DATA label=X] errors[0].extensions.code = Unauthorized` (graphql-runner supports `errors`/`extensions` path routing).
- **Violation signal:** Anonymous `orders()` returns real data; `me()` returns another user's `memberId` or `contact`; `extensions.code` missing or wrong on rejected op; HTTP 401/403 returned instead of structured GraphQL error.
- **Agents:** qa-backend-expert (xAPI security), qa-testing-expert (cross-user negative cases).
- **Suite coverage:** `050g` XCC-GQL-016 (direct test of all four sub-rules); ~82 references mark every operation that requires `[AUTH role=ORG_USER]` prelude (all xCart/xProfile/xMarketing mutation cases).
- **Promoted:** 2026-05-15.

---

## Domain 17: Loyalty & Mixed Cart (BL-LOY)

> Loyalty "Mixed Cart" mode (store setting `Loyalty.Mode = "Mixed Cart"`, `Loyalty.Currency` e.g. `PTS`) lets a single cart hold regular primary-currency lines and loyalty (points-currency) lines simultaneously, with one checkout. These invariants govern that model. Introduced with VCST-5101 / Epic VCST-5099 (vc-module-x-cart PR #120, vc-module-cart PR #188, vc-frontend PR #2310). See BL-CART-004 (currency switch, amended) and BL-CART-003 (coupon + sale).

### BL-LOY-001: Mixed Cart — promotion/coupon evaluation scoped to primary-currency lines only `[P0-revenue]`
- **Rule:** In Mixed Cart mode, promotion and coupon discount evaluation MUST use only line items whose currency matches the cart's primary currency. Loyalty-currency lines MUST NOT enter the promotion entries, the discount base (`CartTotal`), or any reward calculation. A percentage-off coupon on a mixed cart applies exclusively to the primary-currency (e.g. USD) subtotal, independent of loyalty-line quantity.
- **Verify:** Add 1 USD line + 1 PTS loyalty line; apply a 10% subtotal coupon → discount = exactly 10% × USD subtotal with zero contribution from the PTS line. Step PTS qty 1→2→3 with the USD line constant → discount does not change.
- **Violation signal:** Discount > 10% × USD subtotal, or discount equals `(USD_subtotal + PTS_qty × PTS_listPrice) × 0.10` (PTS value folded into the base at 1:1). This is the VCST-5101 Bug-1 symptom.
- **Agents:** qa-frontend-expert (cart totals), qa-backend-expert (promotion engine API)
- **Source:** vc-module-x-cart PR #120 `CartMappingProfile.cs` — `CartAggregate → PromotionEvaluationContext` iterates `CartCurrencySelectedLineItems` ("Tax and Promotion are computed only on primary-currency lines"). Note: the per-line loop is filtered, but the cart-subtotal `%`-coupon evaluates against `promoEvalcontext.CartTotal = Cart.SubTotal` — the suspected leak site (BUG-mixed-cart-coupon-pts-leaks-into-usd-discount.md). Suite: `050b4` GQL-MC-006.
- **Promoted:** 2026-06-09.

### BL-LOY-002: Mixed Cart — `addItem(itemCurrencyCode)` pins the line currency; no cross-currency merge `[P1-data]`
- **Rule:** When `addItem` is called with a non-null `itemCurrencyCode`, the resulting `LineItem.Currency` MUST equal `itemCurrencyCode` and the cart-product key MUST be `{productId}:{itemCurrencyCode}`. Adding the same `productId` at two different currencies MUST produce two separate line items — never a merged/quantity-summed line. (This is the Mixed Cart counterpart to BL-CART-007, which merges same-SKU adds in a single currency.)
- **Verify:** `addItem(productId=X, itemCurrencyCode="PTS")` then `addItem(productId=X, itemCurrencyCode=cart.currency)` → assert two distinct line items for `X` with different `currencyCode`.
- **Violation signal:** One line item for `X` with doubled quantity; cross-currency dedup collapses the two adds.
- **Agents:** qa-backend-expert (addItem mutation)
- **Source:** vc-module-x-cart PR #120 `CartAggregate.cs` — cart-product key / find-existing-line matches on productId AND currency. Suite: `050b4` GQL-MC-001/005.
- **Promoted:** 2026-06-09.

### BL-LOY-003: Mixed Cart — `cartTotals` exposes one entry per distinct line currency `[P1-data]`
- **Rule:** `cart.cartTotals[]` MUST contain exactly one entry per distinct currency present among the cart's line items. The entry with `isDefaultTotalCurrency = true` MUST correspond to `cart.currency`. Each entry's `subTotal`/`discountTotal`/`taxTotal`/`total` reflect ONLY that currency's lines. A primary-currency-only cart → exactly one entry.
- **Verify:** Mixed cart (USD + PTS) → query `cartTotals { isDefaultTotalCurrency total { currency { code } } subTotal { amount } }` → assert exactly 2 entries; the default entry's currency = cart currency; each `subTotal` = that currency's lines' sum.
- **Violation signal:** Single entry on a mixed cart (grouping broken); zero or multiple `isDefaultTotalCurrency = true` entries; a block's totals include other-currency values.
- **Agents:** qa-backend-expert (xAPI), qa-frontend-expert (split-by-currency summary)
- **Source:** vc-module-x-cart PR #120 `CartType.cartTotals` + vc-module-cart PR #188 `DefaultShoppingCartTotalsCalculator` (`cartsByCurrency`). `CartTotalType` = `{ isDefaultTotalCurrency, total, subTotal, taxTotal, discountTotal }`. Suite: `050b4` GQL-MC-002, `CRX-GQL-096`.
- **Promoted:** 2026-06-09.

### BL-LOY-004: Mixed Cart — loyalty lines excluded from the promotion context even when selected for checkout `[P0-revenue]`
- **Rule:** A loyalty-currency line with `selectedForCheckout = true` MUST NOT appear in the promotion evaluation context's entries, and its price MUST NOT contribute to the discount base. This holds for every reward type (percentage, fixed amount, free shipping, gift). Selecting a PTS line for checkout never makes it eligible for a primary-currency promotion.
- **Verify:** Select a PTS line for checkout; apply a 100% subtotal coupon → USD lines receive a 100% discount, the PTS price is unchanged, and no discount line appears on the PTS item.
- **Violation signal:** PTS item is discounted; or the USD total discount exceeds the USD subtotal because the PTS line entered the base.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-x-cart PR #120 `CartMappingProfile.cs` (currency-filtered loop) + `CartAggregate.EvaluatePromotionsAsync` gate `CartCurrencySelectedLineItems.Any()`. Complements BL-LOY-001.
- **Promoted:** 2026-06-09.

### BL-LOY-005: Mixed Cart — a loyalty-currency line shows no "earn points" indicator `[P2-ux]`
- **Rule:** When loyalty points are computed for a line item, if `lineItem.Currency == Loyalty.Currency` (the store's configured points currency), the returned `loyaltyPoints` MUST be zero or null. Computing points-on-points from a points-priced item is semantically invalid and MUST NOT be displayed.
- **Verify:** Mode "Mixed Cart", `Loyalty.Currency = "PTS"`; add a PTS line → query `cart.items { loyaltyPoints { amount } }` → assert the PTS line returns null or 0.
- **Violation signal:** A PTS line returns a non-zero `loyaltyPoints` value (suggests earning points on a points purchase).
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** vc-module-loyalty `LineItemTypeHook.CalculatePoints(x.ExtendedPrice, x.ProductId)` has no currency guard; `LoyaltyPointsCalculator` resolves `PointsCurrency` from the `Loyalty.Currency` setting.
- **Promoted:** 2026-06-09.

### BL-LOY-006: Mixed Cart — currency switch converts primary lines, preserves loyalty lines `[P1-data]`
- **Rule:** On a cart-currency change in Mixed Cart mode, items whose currency = the PREVIOUS cart currency MUST be converted to the new cart currency; items in any other currency (e.g. PTS loyalty) MUST retain their original currency. No line item is lost or duplicated. This is the Mixed Cart refinement of BL-CART-004.
- **Verify:** Mixed cart USD + PTS, `cart.currency = USD`; `changeCartCurrency → EUR` → USD items now EUR (EUR pricing), PTS items still PTS at original prices, item count unchanged.
- **Violation signal:** PTS items disappear, are duplicated, or are switched to the new base currency on a currency change.
- **Agents:** qa-backend-expert
- **Source:** vc-module-x-cart PR #120 `ChangeCartCurrencyCommandHandler.ResolveTargetCurrency` — `itemCurrencyCode.EqualsIgnoreCase(current.Cart.Currency) ? newCart.Currency : current.GetCurrencyByCode(itemCurrencyCode)`. See BL-CART-004 (amended).
- **Promoted:** 2026-06-09.

### BL-LOY-007: Mixed Cart order — points earned and redeemed exactly once, dedup per operation type `[P0-revenue]`
- **Rule:** On a Mixed-Cart order (`LoyaltyMode = "Mixed Cart"`): (a) exactly one `Earned` log per `(CustomerOrder, orderId)` for cash-line ProductPoints; (b) exactly one `Redeemed` log per `(CustomerOrder, orderId)` for the loyalty-currency order total; (c) both may coexist on one orderId — dedup key is `(objectType, objectId, operationType)`; (d) a Hangfire retry posts neither a second time; (e) orders paid via the LoyaltyPaymentMethod gateway are excluded (handled by the gateway).
- **Verify:** Mixed order → operation log for `objectId=orderId` has exactly 2 entries (one `Earned`, one `Redeemed`). Re-trigger `ProcessOrdersAsync` for the same order → still exactly 2 (idempotent). Second mixed order, same user → its own 2 entries. LoyaltyPaymentMethod-gateway order → 0 entries from this handler.
- **Violation signal:** 0 or ≥2 `Earned`/`Redeemed` for one order; missing earn or redeem (balance not deducted); retry duplicates.
- **Agents:** qa-backend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyProgramHandler.EarnProductPointsAsync` / `RedeemLoyaltyProductsAsync` + `LoyaltyLogicService.LogLoyaltyProgramOperationInternalAsync` (dedup by op-type); live-verified 2026-06-22 (both posted, no dup on retry). Redeem depends on `OrderTotals` being loaded (see report PP-06). Covered by suites 075b/083b.
- **Promoted:** 2026-06-23.

### BL-LOY-008: Insufficient loyalty balance blocks order creation with a typed `LOYALTY_INSUFFICIENT_BALANCE` error `[P0-revenue]`
- **Rule:** When a cart's loyalty-currency total exceeds the user's loyalty balance, `LoyaltyCartValidator` MUST surface a `LOYALTY_INSUFFICIENT_BALANCE` validation error with params `{required, available}` (`required > available`), and the order MUST NOT be created — the shortfall blocks checkout. The cart MUST remain intact and readable.
- **Verify:** Mixed cart whose PTS total exceeds balance (or balance drained to 0) → cart validation returns `LOYALTY_INSUFFICIENT_BALANCE` with `required`/`available` present and `required > available`; order not created; cart still readable. Storefront surfaces the localized message (i18n `loyalty_insufficient_balance`).
- **Violation signal:** Order created despite a balance shortfall; missing/empty `required`/`available`; balance allowed to go negative.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyCartValidator.cs` (rule 4); vc-frontend #2335 i18n `loyalty_insufficient_balance`; verified working on vcst-qa 2026-06-22. Full negative path needs a dedicated zero-balance user (`LOYALTY_NOBAL_USER_*` fixture open).
- **Promoted:** 2026-06-23.

### BL-LOY-009: Mixed Cart earn — only cash-currency lines earn points; loyalty-currency lines earn zero `[P1-data]`
- **Rule:** In Mixed-Cart `EarnProductPointsAsync`, earned points are computed exclusively from `order.Items` whose `Currency != loyaltyCurrency`; loyalty-currency (points-priced) items contribute 0. Holds both in the order-time job and the cart `loyaltyPoints` preview. Guard: `Items.Where(x => !x.Currency.EqualsIgnoreCase(loyaltyCurrency))`. Order-layer refinement of BL-LOY-005.
- **Verify:** Mixed cart 1 USD + 1 PTS → placed order `Earned` amount = points from the USD line only. `cart.items { loyaltyPoints { amount } }` → PTS line null/0, USD line non-zero. PTS-only cart → no `Earned` log (points ≤ 0 → not written).
- **Violation signal:** A loyalty-currency line earns non-zero; USD earn includes a PTS contribution; `loyaltyPoints` non-zero on a PTS line.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyProgramHandler.EarnProductPointsAsync` + `LineItemTypeHook` (currency-filtered) + `LoyaltyPointsCalculator.ResolveAsync` (early-return when `currencyCode == pointsCurrency`). Refines BL-LOY-005.
- **Promoted:** 2026-06-23.

### BL-LOY-010: Mixed Cart — a points-only cart is rejected; at least one cash line is required `[P1-data]`
- **Rule:** A cart whose lines are **entirely** loyalty-currency (points-priced), with no cash-currency line, MUST surface a `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` validation error and MUST NOT be checked out. Adding at least one cash-currency line MUST clear that specific error (the cart becomes valid if no other rule fires). Implements the VCST-5103 AC "at least one common (cash) product must be in the cart, otherwise error."
- **Verify:** Auth as a loyalty user in a Mixed-Cart store; build a cart with only a PTS line → `cart.validationErrors` contains `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED`; add a cash line and re-read → that error code is gone.
- **Violation signal:** A points-only cart validates clean / is allowed to check out; or the error fails to clear after a cash line is added.
- **Agents:** qa-backend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyCartValidator.cs` rule 2; VCST-5103 AC. Covered by suite 075b MCO-GQL-006. Live-verified PASS 5/5 on vcst-qa 2026-06-24.
- **Promoted:** 2026-06-24. *(NOTE: PROPOSED-BL-LOY-011 — points-priced products only allowed in Mixed Cart mode, rule 1 — is reserved/pending live verification via the MCO-GQL-007 store-mode flip; see TLC-2026-06-24-1121 bl-proposals.md.)*

### BL-LOY-012: The loyalty payment gateway is only valid in Payment Method mode `[P1-data]`
- **Rule:** When a cart carries a payment whose gateway code is `LoyaltyPaymentMethod` and the store loyalty mode is anything other than `"Payment Method"`, the cart MUST surface a `LOYALTY_PAYMENT_METHOD_NOT_ALLOWED` validation error and MUST NOT be checked out.
- **Verify:** In a non-Payment-Method store (e.g. the seeded Mixed Cart mode), add a payment via the `LoyaltyPaymentMethod` gateway → `cart.validationErrors` contains `LOYALTY_PAYMENT_METHOD_NOT_ALLOWED`. (`addOrUpdateCartPayment` accepts the gateway code without a registered-method requirement, so no mode flip or gateway provisioning is needed to exercise this.)
- **Violation signal:** A `LoyaltyPaymentMethod` payment is accepted outside Payment Method mode; checkout proceeds.
- **Agents:** qa-backend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyCartValidator.cs` rule 3 + `ModuleConstants.LoyaltyPaymentMethodGatewayCode`. Covered by suite 075b MCO-GQL-011. Live-verified PASS 3/3 on vcst-qa 2026-06-24.
- **Promoted:** 2026-06-24.

### BL-LOY-013: Mixed Cart order — `order.orderTotals` exposes one entry per distinct line currency `[P1-data]`
- **Rule:** The GraphQL `order` query MUST return `orderTotals: [OrderTotalType]` with exactly one element per distinct line-item currency on the order. Each element carries `isDefaultTotalCurrency` (`true` for the store's primary currency, `false` otherwise) and per-currency `total`/`subTotal`/`taxTotal`/`discountTotal` (`MoneyType`). Exactly one element has `isDefaultTotalCurrency = true`. A single-currency order returns one element; a mixed-cart loyalty order (cash + points) returns ≥2. The order's top-level scalar `total`/`subTotal`/`taxTotal`/`discountTotal` reflect ONLY the primary-currency leg — the loyalty (points) leg is exposed exclusively in the non-default `orderTotals` element. Order-level analog of BL-LOY-003 (cart-level `cartTotals`). NOTE: the deployed field is `orderTotals`, not `totals` as the originating story (VCST-5104) worded it.
- **Verify:** Place a mixed-cart order (1 USD line + 1 PTS line); query `order(number: …) { total { amount currency { code } } orderTotals { isDefaultTotalCurrency total { amount currency { code } } subTotal { amount } } }` → assert exactly 2 `orderTotals` entries; exactly one `isDefaultTotalCurrency = true` (currency = store currency); the non-default entry's currency = the loyalty/points currency; top-level `total` equals the default entry's `total`. Single-currency order → `orderTotals` length 1, `isDefaultTotalCurrency = true`.
- **Violation signal:** A single `orderTotals` entry on a mixed-currency order (grouping broken); zero or multiple `isDefaultTotalCurrency = true` entries; the points leg leaks into the top-level scalar totals; an entry's totals mix amounts from another currency.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** VCST-5104 PRs vc-module-x-order #43 + vc-module-order #497. Live introspection of `CustomerOrderType.orderTotals: [OrderTotalType]` / `OrderTotalType` / `MoneyType` / `CurrencyType` on `{{BACK_URL}}/graphql`, confirmed against 4 live orders (single-currency length 1; 3 mixed orders length 2) — 2026-06-24. Select `currency { code symbol }` (avoid `currency.name`, pre-existing resolver `INVALID_OPERATION`). See BL-LOY-003 (cart analog).
- **Promoted:** 2026-06-24 (via `/ba-analyze VCST-5104`).

### BL-LOY-014: Mixed Cart order — Admin SPA Line items blade shows per-currency totals independently `[P2-ux]`
- **Rule:** In the Admin SPA, the order **Line items** blade for a mixed-currency order MUST display one totals summary bar per currency (e.g. a USD bar and a PTS bar), and the line items table MUST carry a per-row **Currency** column so each line's currency is unambiguous. Neither currency's totals may be omitted. The order's top-level totals accordion legitimately shows the primary-currency total only — the per-currency split is surfaced in the Line items blade.
- **Verify:** Open the Admin (`{{BACK_URL}}`, `@td(ADMIN_DEFAULT)`), Orders → open a mixed-cart order (one PTS line + one USD line) → open the **Line items** accordion → assert two totals bars (one USD, one PTS) above the table, and a **Currency** column showing PTS for the loyalty line and USD for the cash line.
- **Violation signal:** The Line items blade shows only the primary-currency totals; the points-line total is absent from the summary bars despite PTS line items in the table; the Currency column is missing.
- **Agents:** qa-backend-expert
- **Source:** VCST-5104 Task 4 (Admin UI multi-currency totals), PR vc-module-order #497. UI-observed on vcst-qa 2026-06-24 — `reports/ba/screenshots/vcst-5104/08-admin-order-line-items-split-currency.png` (USD 240.00 / PTS 10.00 bars + Currency column).
- **Promoted:** 2026-06-24 (via `/ba-analyze VCST-5104`).

---

## Domain 18: Payment Processors (BL-PAY)

### BL-PAY-001: Client-side card validation gates order submission `[P0-revenue]`
- **Rule:** A storefront bank-card payment form validates card fields client-side — card number (Luhn), all required fields present, expiry month 01–12 with a fully-entered 2-digit year that is not in the past, CVV 3–4 numeric digits — and keeps the "Place order" / pay action disabled until every field is valid. No payment-authorization request is sent and no order is created while any field is invalid or incomplete.
- **Verify:** Enter a Luhn-invalid number, empty/partial fields, an expired or out-of-range expiry, or a short/non-numeric CVV → "Place order" stays disabled; no POST to the processor (e.g. `api2.authorize.net`) and no `createOrderFromCart`; an inline field-level error is shown; errors clear and the button enables only on fully valid data.
- **Violation signal:** Invalid card accepted with no error; pay/place-order enabled with bad or incomplete data; a payment request or a ghost "Payment required" order created from invalid card input.
- **Agents:** qa-frontend-expert
- **Source:** VCST-5162 PR vc-frontend#2309 (`bank-card-form.vue` `validationSchema`, incl. `isExpirationDateValid` "not-expired" test + yup `.length(2)` year rule); suite 040b PAY-AN-012/013/018/019/020; mirrors CyberSource/Skyflow validation.
- **Promoted:** 2026-06-15.

### BL-PAY-003: Successful card payment creates a paid order with a recorded transaction `[P0-revenue]`
- **Rule:** On a successful tokenized card payment the order is created, the cart is cleared, the user reaches the confirmation page with an order number, and the order persists the payment-method label and the processor transaction id (visible in `/account/orders` and admin). Raw PAN never appears in storefront network payloads (SDK tokenization).
- **Verify:** Complete a valid card payment → confirmation page with order number; cart badge empty; order in `/account/orders` and admin shows the processor method + a transaction id; no raw card number in any request body; `createOrderFromCart` `errors[]` empty.
- **Violation signal:** Stuck on `/cart` or payment page after submit; no confirmation/order number; cart not cleared; missing transaction id; raw PAN present in network POST bodies.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** suite 040b PAY-AN-014 (+ deprecated 004/005 admin transaction-record shape); VCST-5162; backend transaction-record change (Status=short enum, ResponseCode=TransactionResponseCode). See BL-ORD-006 (payment state machine).
- **Promoted:** 2026-06-15.

### BL-PAY-004: AllowCartPayment renders the card form inline on /cart in single-step checkout only; multistep checkout redirects to the payment page `[P0-revenue]`
- **Rule:** When a payment method has `allowCartPayment=true`, its card form renders inline on `/cart` (no redirect to `/checkout/payment`) **in single-step checkout only**, and initialization uses the cart-context mutation `initializeCartPayment` (not `initializePayment`). The shared cart payment processor is registered only after a successful init and only while the component is mounted, and `finalizePayment` runs it only when the selected method's `allowCartPayment === true`. Switching to a non-cart-payment method must not charge the card. **In multistep checkout (`checkout_multistep_enabled=true`) the inline-on-`/cart` form does NOT apply: selecting an `allowCartPayment` method must route the flow to the dedicated payment page (`/checkout/payment`) for card entry, and "Place order" on Review must stay reachable — it must never be blocked by a cart-inline processor state that does not exist on the multistep path.** The GA4 `purchase` event fires exactly once (from `useCheckout`, not the payment component).
- **Verify:** *Single-step:* select an `allowCartPayment` method on `/cart` → inline form, URL stays `/cart`, network shows `initializeCartPayment`; switch to a manual method then place order → no charge to the card. *Multistep:* selecting an `allowCartPayment` method routes to `/checkout/payment` (NO inline form on `/cart`), card entered there, Review → Place order succeeds → paid order, not "Payment Required". Exactly one GA4 `purchase` in both modes.
- **Violation signal:** *Single-step:* redirect to `/checkout/payment` for an `allowCartPayment` method; card charged after switching methods (stale processor). *Multistep:* the inline card form still renders on `/cart` and "Place order" on Review is blocked/disabled with no redirect to `/checkout/payment` (the cart-inline path leaked into multistep). Either mode: double or zero GA4 `purchase`; `initializePayment` called instead of `initializeCartPayment`.
- **Agents:** qa-frontend-expert
- **Source:** VCST-5162 PR vc-frontend#2309 + VCST-5009 (Skyflow); `payment.vue`, `payment-processing-authorize-net.vue` (`isActive` guard, register-after-init), `useCheckout.ts` (`allowCartPayment` finalize guard); suite 040a/040b PAY-AN-010/011/015/016/017. Multistep redirect-to-payment-page intent (single-step inline only) corrected 2026-06-25 per QA-lead direction — supersedes the earlier "inline state survives the Billing-step unmount into Review" wording; see the multistep cart-inline Place-Order block bug in `reports/bugs/open/`.
- **Promoted:** 2026-06-15. **Corrected:** 2026-06-25.

---

## Domain 19: White Labeling (BL-WL)

Per-org / per-store branding resolved after sign-in by the White Labeling module's xAPI query
(`GetWhiteLabelingSettingsQueryHandler`). These supersede the WL-specific detail formerly carried by
`BL-B2B-006` (see the cross-reference there). Grounded in `vc-module-white-labeling` source + live
vcst-qa verification (TLC-2026-07-02-2043).

### BL-WL-001: Branding is org-context & post-auth; no enabled config → platform defaults `[P2-ux]`
- **Rule:** White Labeling branding resolves from the signed-in user's organization context after authentication. `whiteLabelingSettings(organizationId, storeId)` returns `null` when neither an enabled org setting nor an enabled store setting exists; the storefront then shows platform/theme defaults — no crash, no partial branding.
- **Verify:** Query for an org+store with no enabled WL setting → null; storefront renders default logo/theme.
- **Violation signal:** Error, blank header, or stale branding when no WL config exists.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** PlatformUserGuide White Labeling overview; `GetWhiteLabelingSettingsQueryHandler.Handle` → `return null` when `OrganizationSetting == null && StoreSetting == null`.
- **Promoted:** 2026-07-02 (TLC-2026-07-02-2043).

### BL-WL-002: Org & store settings merge per-field, org-preferred (NOT whole-object override) `[P1-data]`
- **Rule:** Org and store WL settings are merged **field by field**. For each of `logoUrl`, `secondaryLogoUrl`, `faviconUrl`, `themePresetName`, `footerLinkListName`, `mainMenuLinkListName`, the org value is used when non-empty, otherwise the store value. An org that sets only some fields inherits the store's remaining fields — it is not a whole-object override.
- **Verify:** Org sets logo only; store sets theme + footer → merged result = org logo + store theme + store footer. (Live-verified 2026-07-02: Electronics org @ B2B-store → org's Watermelon theme replaces store Coffee while other fields merge.)
- **Violation signal:** Setting one org field blanks out store-provided fields; or org fields ignored entirely.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `GetCombinedWhiteLabelingSetting()` — per-field ternaries `!IsNullOrEmpty(org.X) ? org.X : store.X` + `WhiteLabelingFlags` (HasLogo/HasSecondaryLogo/HasFavicon) picks. Refines the old BL-B2B-006 "override" wording.
- **Promoted:** 2026-07-02 (TLC-2026-07-02-2043).

### BL-WL-003: Two enable layers — store master switch (storefront) vs per-record IsEnabled (xAPI) `[P1-data]`
- **Rule:** White Labeling has **two independent enable mechanisms** at different layers:
  1. **Store master switch** — the store-level public setting `WhiteLabeling.WhiteLabelingEnabled` (Boolean, default `true`). The storefront (`useWhiteLabeling.ts`) reads it from the current store's module settings; when `false`, `fetchWhiteLabelingSettings()` returns early and **no** white labeling is fetched or applied — logo/favicon/footer/mainMenu/theme all fall back to theme (`settings_data.json`) defaults. Because it gates the whole store context, it **suppresses org branding too** (defaults shown regardless of org settings). This is the true master switch.
  2. **Per-record `WhiteLabelingSetting.IsEnabled`** — the enabled flag on each org/store WL *record*, applied only when the master switch is ON. It controls only whether that record joins the xAPI per-field merge (`GetWhiteLabelingSettingsQueryHandler`, `IsEnabled=true` filter). A disabled/absent **store record** removes only the store's contribution; an enabled **org record** still resolves. This is NOT a master switch.
- **Verify:** (1) Store setting `WhiteLabeling.WhiteLabelingEnabled=false` → org user sees theme defaults (no org logo/theme); set `true` → branding returns. (2) With the master switch ON, query an enabled org against a store that has no enabled store-WL record → org logo+theme still resolve (live-verified 2026-07-02, non-destructive).
- **Violation signal:** Master switch OFF but WL still applied; OR an enabled org's branding suppressed merely because the store *record* is disabled/absent (confusing the two layers).
- **Agents:** qa-frontend-expert (master-switch/storefront gate), qa-backend-expert (xAPI record resolution)
- **Source:** `WhiteLabeling.WhiteLabelingEnabled` in `ModuleConstants.Settings.General` (`StoreLevelSettings`, `IsPublic`, default true) + storefront `useWhiteLabeling.ts` (`moduleEnabled` guard in `fetchWhiteLabelingSettings`/`setWhiteLabelingSettings`); record-level filter in `GetWhiteLabelingSettingsQueryHandler` (`IsEnabled=true`) with independent org/store per-field merge.
- **Promoted:** 2026-07-02. **Corrected:** 2026-07-02 — added the store master-switch layer per user correction; an earlier same-day draft wrongly claimed no master switch existed (that draft had only exercised the record-level layer).

### BL-WL-004: Link lists resolve by name; missing → empty array, no error; footer legacy fallback `[P2-ux]`
- **Rule:** `mainMenuLinks` resolves the link list named in `MainMenuLinkListName`; `footerLinks` resolves `FooterLinkListName`. A NULL/empty/non-existent name yields an **empty array**, HTTP 200, no `errors[]`. Footer (only) additionally falls back to a `footer-{organizationName}` list when `FooterLinkListName` is empty (backward compat); main menu has no such fallback. Querying without `mainMenuLinks` in the selection set stays valid (optional field).
- **Verify:** Org with NULL MainMenuLinkListName → `mainMenuLinks: []`, no error; org with empty FooterLinkListName but a `footer-<orgname>` list present → footer resolves.
- **Violation signal:** Error/500 on missing list; main-menu resolving a `main-menu-{org}` fallback that does not exist in code.
- **Agents:** qa-backend-expert
- **Source:** `AddMainMenuLinksAsync()` / `AddFooterLinksAsync()` (footer `footer-{organization.Name}` branch); `ExpWhiteLabelingSetting` lists default to `[]`.
- **Promoted:** 2026-07-02 (TLC-2026-07-02-2043).

### BL-WL-005: A WL setting binds to exactly one of Store XOR Organization `[P2-ux]`
- **Rule:** Each `WhiteLabelingSetting` references exactly one of Store or Organization — never both, never neither. The Admin blade rejects both-set and neither-set, and blocks duplicate store/org bindings.
- **Verify:** Admin WL blade with both Store & Org set → "Both Store and Organization set" error; neither → "Store or Organization must be set"; a duplicate store/org → "Duplicate Store or Organization".
- **Violation signal:** A setting saved with both or neither binding; duplicate bindings persisted.
- **Agents:** qa-backend-expert
- **Source:** `en.WhiteLabeling.json` errors `store-and-organization-set` / `store-or-organization-must-be-set` / `duplicate-store-or-organization`.
- **Promoted:** 2026-07-02 (TLC-2026-07-02-2043).

### BL-WL-006: Distinct allowed upload types — logo vs favicon `[P2-ux]`
- **Rule:** The **Logo** widget accepts **PNG / GIF / SVG**; the **Favicon** widget accepts **PNG / JPG / WEBP**. Other extensions are rejected with a "Filetype error" dialog. The sets are distinct — JPG/WEBP are favicon-only, GIF/SVG are logo-only.
- **Verify:** Upload `.gif` logo → accepted; `.jpg` logo → rejected ("Only PNG, GIF or SVG files are allowed"); `.webp` favicon → accepted; `.svg` favicon → rejected ("Only PNG, JPG, or WEBP files are allowed").
- **Violation signal:** Logo widget accepts JPG/WEBP; favicon widget accepts GIF/SVG; no filetype-error dialog on a disallowed extension.
- **Agents:** qa-backend-expert
- **Source:** `en.WhiteLabeling.json` — logo hint/filter (PNG/GIF/SVG) + favicon hint/filter (PNG/JPG/WEBP). Suite 067 WL-003/004/005.
- **Promoted:** 2026-07-02 (TLC-2026-07-02-2043).

---

## Invariant Coverage Summary

P0 column rolls up `[P0-revenue]` + `[P0-security]`; P1 column rolls up `[P1-data]` + `[P1-ux]`.

| Domain | ID Range | Total | P0 | P1 | P2 |
|--------|----------|-------|----|----|----|
| Pricing & Discounts | BL-PRICE-001–008 | 8 | 7 | 1 | 0 |
| Cart | BL-CART-001–014 | 14 | 5 | 9 | 0 |
| Checkout | BL-CHK-001–008 | 8 | 5 | 3 | 0 |
| Orders & Fulfillment | BL-ORD-001–009 | 9 | 3 | 6 | 0 |
| Users & Auth | BL-AUTH-001–011 | 11 | 2 | 8 | 1 |
| B2B / Organization | BL-B2B-001–006 | 6 | 3 | 3 | 0 |
| Catalog & Inventory | BL-CAT-001–007 | 7 | 2 | 3 | 2 |
| Cross-Domain | BL-CROSS-001–012 | 12 | 7 | 5 | 0 |
| Search | BL-SRCH-001–005 | 5 | 0 | 3 | 2 |
| Shipping & BOPIS | BL-SHIP-001–004 | 4 | 2 | 2 | 0 |
| BOPIS-Specific | BL-BOPIS-001–008 | 8 | 1 | 6 | 1 |
| Notifications | BL-NOTIF-001–003 | 3 | 1 | 2 | 0 |
| Import / Export | BL-IMPEX-001–004 | 4 | 0 | 4 | 0 |
| SEO & URLs | BL-SEO-001–004 | 4 | 0 | 2 | 2 |
| Profile & Member Data | BL-PROFILE-001 | 1 | 0 | 1 | 0 |
| UI Display & Layout Stability | BL-UI-001–006 | 6 | 0 | 1 | 5 |
| GraphQL xAPI Contract | BL-GQL-001–004 | 4 | 1 | 2 | 1 |
| **Total** | | **114** | **39** | **61** | **14** |
