# Business Logic Proposals — TLC-2026-06-24-1121 (VCST-5103)

These are **drafts**. They are NOT applied to `.claude/agents/knowledge/oracles/business-logic.md`.
Per `feedback_business_logic_promotion`, each entry needs explicit per-entry approval before promotion;
per `feedback_bl_promotion_table_separately`, on promotion edit only the Domain 17 body, never the
Invariant Coverage Summary table.

Context: `LoyaltyCartValidator` (vc-module-loyalty PR #10, plugged into the vc-module-x-cart PR #125
`ICartValidatorRegistry` chain at Order 100) emits 4 typed cart-validation errors. Rule 4 is already
covered by **BL-LOY-008**. Rules 1–3 have no invariant today — the 3 drafts below. Next free IDs in
Domain 17 are BL-LOY-010/011/012.

---

## New Invariants Proposed

### PROPOSED-BL-LOY-010: Mixed Cart — a points-only cart is rejected; at least one cash line is required `[P1-data]`
- **Rule:** A cart whose lines are **entirely** loyalty-currency (points-priced), with no cash-currency line, MUST surface a `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` validation error and MUST NOT be checked out. Adding at least one cash-currency line MUST clear that specific error (the cart becomes valid if no other rule fires). Implements the VCST-5103 AC "at least one common (cash) product must be in the cart, otherwise error."
- **Verify:** Auth as a loyalty user in a Mixed-Cart store. Build a cart with only a PTS line → `cart.validationErrors` contains `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED`. Add a cash line and re-read → that error code is gone. **Live-verified PASS 5/5 on vcst-qa 2026-06-24 (MCO-GQL-006).**
- **Violation signal:** A points-only cart validates clean / is allowed to check out; or the error fails to clear after a cash line is added.
- **Agents:** qa-backend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyCartValidator.cs` rule 2; VCST-5103 AC. Covered by suite 075b MCO-GQL-006.
- **Triggered by case(s):** MCO-GQL-006

### PROPOSED-BL-LOY-011: Points-priced products are only allowed in Mixed Cart mode `[P1-data]`
- **Rule:** When the store loyalty mode is anything other than `"Mixed Cart"`, a cart containing any loyalty-currency (points-priced) line MUST surface a `LOYALTY_POINT_PRODUCTS_NOT_ALLOWED` validation error and MUST NOT be checked out. The check is driven by `Store.GetLoyaltyMode()` (fallback currency `XPT`).
- **Verify:** Set the store loyalty mode to `Loyalty Store` (or `Payment Method`/`Coupon Redemption`), add a PTS line → `cart.validationErrors` contains `LOYALTY_POINT_PRODUCTS_NOT_ALLOWED`. Restore Mixed Cart mode → the error is gone. **NOT yet live-verified** — needs a store-mode flip (MCO-GQL-007 is Semi-Automated; vcst-qa is seeded Mixed Cart).
- **Violation signal:** A points-priced line is accepted in a non-Mixed-Cart mode; or the error persists after the store returns to Mixed Cart mode.
- **Agents:** qa-backend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyCartValidator.cs` rule 1 + `StoreExtensions.GetLoyaltyMode()`. Covered by suite 075b MCO-GQL-007 (Semi-Automated).
- **Triggered by case(s):** MCO-GQL-007

### PROPOSED-BL-LOY-012: The loyalty payment gateway is only valid in Payment Method mode `[P1-data]`
- **Rule:** When a cart carries a payment whose gateway code is `LoyaltyPaymentMethod` (the loyalty payment gateway) and the store loyalty mode is anything other than `"Payment Method"`, the cart MUST surface a `LOYALTY_PAYMENT_METHOD_NOT_ALLOWED` validation error and MUST NOT be checked out.
- **Verify:** In a non-Payment-Method store (e.g. the seeded Mixed Cart mode), add a payment via the `LoyaltyPaymentMethod` gateway → `cart.validationErrors` contains `LOYALTY_PAYMENT_METHOD_NOT_ALLOWED`. **Live-verified PASS 3/3 on vcst-qa 2026-06-24 (MCO-GQL-011)** — `addOrUpdateCartPayment` accepts the gateway code without a registered-method requirement, and the validator fires.
- **Violation signal:** A `LoyaltyPaymentMethod` payment is accepted outside Payment Method mode; checkout proceeds.
- **Agents:** qa-backend-expert
- **Source:** vc-module-loyalty #10 `LoyaltyCartValidator.cs` rule 3 + `ModuleConstants.LoyaltyPaymentMethodGatewayCode`. Covered by suite 075b MCO-GQL-011.
- **Triggered by case(s):** MCO-GQL-011

---

## Stale BL-* Flagged
None — BL-LOY-001..009 remain accurate (PR #125 is an internal DI refactor; the public `cart.validationErrors` contract is unchanged).

## Approval — RESOLVED 2026-06-24
- **PROMOTED:** `BL-LOY-010` (rule 2, live-verified) and `BL-LOY-012` (rule 3, live-verified) added to Domain 17 body of `business-logic.md` (coverage-summary table untouched). Cases MCO-GQL-006/011 `Business_Rule` columns updated to reference them.
- **HELD:** `PROPOSED-BL-LOY-011` (rule 1 — points products only in Mixed Cart mode) reserved pending live verification via a MCO-GQL-007 store-mode-flip run. Promote once that case passes live.
