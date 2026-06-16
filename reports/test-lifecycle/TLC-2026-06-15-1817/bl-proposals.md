# Business Logic Proposals — TLC-2026-06-15-1817 (payment domain)

These are **drafts**. They are NOT applied to `.claude/agents/knowledge/business-logic.md`.
Review, approve per-entry, then fold into the file manually (body Domain section only — do NOT
auto-update the Invariant Coverage Summary table; see `feedback_bl_promotion_table_separately`).

**Why:** `/qa-review-tests` on suite 040b found that `BL-PAY-001`, `BL-PAY-003`, and `BL-PAY-004` are
referenced across the entire payment suite family (039, 040a, 040b, 040c, 041, 042, 050b5, 050c) but
**do not exist** in `business-logic.md` — only `BL-CHK-004` ("Payment retry after decline") resolves.
These drafts define the three missing payment invariants the suites already test against. If approved,
the existing `Business_Rule` references resolve as-is; no CSV remap needed.

---

## New Invariants Proposed

### PROPOSED-BL-PAY-001: Client-side card validation gates order submission `[P0-revenue]`
- **Rule:** A storefront bank-card payment form must validate card fields client-side — card number (Luhn), all required fields present, expiry month 01–12 with a fully-entered 2-digit year that is not in the past, CVV 3–4 numeric digits — and keep the "Place order" / pay action **disabled until every field is valid**. No payment-authorization request is sent and no order is created while any field is invalid or incomplete.
- **Verify:** Enter Luhn-invalid number, empty/partial fields, expired or out-of-range expiry, or short/non-numeric CVV → "Place order" stays disabled; no POST to the processor (e.g. `api2.authorize.net`) and no `createOrderFromCart`; inline field-level error shown; errors clear and the button enables only on fully valid data.
- **Violation signal:** Invalid card accepted with no error; pay/place-order enabled with bad or incomplete data; a payment request or a ghost "Payment required" order is created from invalid card input.
- **Agents:** qa-frontend-expert
- **Source:** VCST-5162 PR vc-frontend#2309 (`bank-card-form.vue` `validationSchema`, incl. `isExpirationDateValid` "not-expired" test + yup `.length(2)` year rule); suite 040b PAY-AN-012/013/018/019/020; mirrors CyberSource/Skyflow validation behavior.
- **Triggered by case(s):** PAY-AN-012, PAY-AN-013, PAY-AN-018, PAY-AN-019, PAY-AN-020 (also 039/040a equivalents)

### PROPOSED-BL-PAY-003: Successful card payment creates a paid order with a recorded transaction `[P0-revenue]`
- **Rule:** On a successful tokenized card payment the order is created, the cart is cleared, the user reaches the confirmation page with an order number, and the order persists the payment-method label and the processor transaction id (visible in `/account/orders` and admin). Raw PAN must never appear in storefront network payloads (tokenization via the processor SDK).
- **Verify:** Complete a valid card payment → confirmation page with order number; cart badge empty; order in `/account/orders` and admin shows the processor method + a transaction id; no raw card number in any request body; `createOrderFromCart` `errors[]` empty.
- **Violation signal:** Stuck on `/cart` or payment page after submit; no confirmation/order number; cart not cleared; missing transaction id; raw PAN present in network POST bodies.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** suite 040b PAY-AN-014 (+ deprecated 004/005 for the admin-side transaction-record shape); VCST-5162; backend transaction-record change noted in PR#12 (Status=short enum, ResponseCode=TransactionResponseCode).
- **Triggered by case(s):** PAY-AN-014 (also 039/040a success-flow equivalents)

### PROPOSED-BL-PAY-004: AllowCartPayment renders the card form inline on /cart with a lifecycle-safe shared processor `[P0-revenue]`
- **Rule:** When a payment method has `allowCartPayment=true`, its card form renders **inline on `/cart`** (no redirect to `/checkout/payment`) and initialization uses the cart-context mutation `initializeCartPayment` (not `initializePayment`). The shared cart payment processor is registered only after a successful init **and** while the component is mounted, and `finalizePayment` runs it only when the selected method's `allowCartPayment === true`. Switching to a non-cart-payment method must not charge the card. In multistep checkout the processor + `isCanFinalizePayment` state must survive the Billing-step unmount so "Place order" on Review succeeds. The GA4 `purchase` event fires exactly once (from `useCheckout`, not the payment component).
- **Verify:** Select an `allowCartPayment` method on `/cart` → inline form, URL stays `/cart`, network shows `initializeCartPayment`; switch to a manual method then place order → no charge to the card; multistep Billing→Review→Place order → paid order, not "Payment Required"; exactly one GA4 `purchase`.
- **Violation signal:** Redirect to `/checkout/payment` for an `allowCartPayment` method; card charged after switching methods (stale processor); order left "Payment Required" after multistep (state lost on unmount); double or zero GA4 `purchase`; `initializePayment` called instead of `initializeCartPayment`.
- **Agents:** qa-frontend-expert
- **Source:** VCST-5162 PR vc-frontend#2309 + VCST-5009 (Skyflow); `payment.vue`, `payment-processing-authorize-net.vue` (`isActive` guard, register-after-init), `useCheckout.ts` (`allowCartPayment` finalize guard); suite 040a/040b PAY-AN-010/011/015/016/017.
- **Triggered by case(s):** PAY-AN-010, PAY-AN-011, PAY-AN-015, PAY-AN-016, PAY-AN-017 (also 040a Skyflow equivalents)

---

## Application notes (after approval)
- Add each approved entry under the appropriate Domain section of `business-logic.md` with a final `BL-PAY-NNN` ID (drop the `PROPOSED-` prefix). Suggested: a new **Payment** domain section, or alongside the existing `BL-CHK-*` checkout block.
- Do **not** edit the Invariant Coverage Summary table as part of this (separate, deliberate step).
- Once promoted, the suite references (`BL-PAY-001/003/004`) resolve with no CSV changes. If any entry is rejected, remap that ID's references to an existing `BL-CHK-*` invariant instead.
