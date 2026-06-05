# VCST-5009 — Extend Skyflow with AllowCartPayment: Testing Checklist

**Sprint:** 26-11 | **Story type:** Story | **Status:** Ready for Test
**Build under test:** vc-module-skyflow 3.1002.0-pr-23-5a1b (backend) + vc-frontend theme 2.51.0-pr-2308-219c (frontend)
**Environment:** {{FRONT_URL}} / {{BACK_URL}} (vcst-qa)
**Canonical Skyflow test card:** 5424000000000015 / CVV 900 / 02/29
(source: `test-data/payment/order-creation-matrix.txt` — the QA Skyflow vault accepts only this card; any other valid Mastercard number will be declined, which is useful for decline testing)

## Acceptance Criteria Map

| AC | Description | Covered by sections |
|----|-------------|---------------------|
| AC-1 | Skyflow extended with AllowCartPayment | F-1, B-1, B-2 |
| AC-2 | Skyflow CC form displayed on the single checkout page | F-1, F-2, F-3 |

---

## Section F — Frontend / Storefront (agent: qa-frontend-expert, browser: playwright-chrome)

### F-1: Form Presence and Initialization (AC-1, AC-2)
> Prerequisite state: user logged in as {{USER_EMAIL}}/{{USER_PASSWORD}}, fresh cart with at least one item, Skyflow selected as payment method.

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| F-1.1 | Skyflow payment form renders directly on {{FRONT_URL}}/cart — no "Place Order" redirect to /checkout/payment occurs | P0 | BL-PAY-004 | The entire feature premise. If this fails, all F-section cases are moot. Confirm the form iframe(s) load on the cart page without clicking Place Order first. |
| F-1.2 | Skyflow iframe card-number, expiry, and CVV fields are present and interactive on the cart page | P0 | BL-PAY-004 | Same structural checks as PAY-CS-001 for CyberSource — verify iframe presence and cross-origin isolation. |
| F-1.3 | Place Order / Pay Now button is rendered on the cart page (not on a separate /checkout/payment page) | P0 | BL-PAY-004 | Confirms the `hidePaymentButton` prop wiring: when false (parent does not hide), the pay button is visible. |
| F-1.4 | initPayment runs on mount — Skyflow elements initialize without requiring user interaction | P1 | BL-PAY-004 | Frontend change: `initPayment` now ALWAYS runs on mount. Verify no blank/uninitialized form on first load. |
| F-1.5 | When no payment method is selected, the Skyflow form is not visible; selecting Skyflow from the payment method list shows the form | P1 | BL-PAY-004 | Covers the `payment.vue` gateway branch: `paymentTypeName === 'SkyflowPaymentMethod'` condition. |

### F-2: New-Card Happy Path E2E (AC-2)
> Prerequisite state: user logged in, fresh cart with ≥1 item, Skyflow selected.

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| F-2.1 | User fills canonical card (5424000000000015 / 900 / 02/29) in Skyflow fields on the cart page, clicks Place Order, and reaches the order confirmation page / /checkout/completed | P0 | BL-CHK-006, BL-ORD-001, ECL-14.6 | Core E2E. Confirm order number shown on confirmation. Do NOT use any other card — vault rejects all others. |
| F-2.2 | Order confirmation displays correct totals matching the cart subtotal | P0 | BL-CHK-006 | Total integrity: storefront confirmation total = cart total before payment. |
| F-2.3 | Raw card PAN (5424000000000015) is absent from all storefront → backend network request payloads | P0 | BL-PAY-001, BL-PAY-002, ECL-9.1 | Tokenization must still hold in the new cart-embedded context. Open DevTools Network, search all XHR/Fetch payloads. |
| F-2.4 | GA4 "purchase" analytics event fires once after cart-flow order creation | P1 | — | Frontend change: `analytics("purchase")` fires only when NOT orderToPay-driven. Verify it fires for the new cart flow path. Capture in DevTools Network (google-analytics / gtag endpoints). |

### F-3: Pay-Button State Machine and Double-Submit Prevention (AC-2)

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| F-3.1 | Place Order / Pay Now button is disabled while Skyflow form fields are invalid or empty | P0 | BL-UI (pay-button gate), BL-CHK-002 | `isPaymentDataValid` watcher drives `setCardDataValid/Invalid` → parent disables Pay button. Test with empty fields, then with invalid card (Luhn fail). |
| F-3.2 | Filling all valid fields enables the Pay Now button | P1 | BL-CHK-002 | Button transitions from disabled to enabled after all fields pass Skyflow internal validation. |
| F-3.3 | Clicking Place Order twice in rapid succession creates exactly one order | P0 | BL-CHK-002, ECL-1.2 | Double-submit prevention. The `disabled` prop and `usePayment().registerPaymentProcessor` pattern must gate this. Check via order history — only one order. |
| F-3.4 | Pressing Enter inside a Skyflow iframe field does NOT trigger form submission when `hidePaymentButton=false` | P1 | BL-CHK-002 | Frontend gating: Skyflow SUBMIT (Enter key) is gated by `!props.hidePaymentButton`. When the parent shows the button, Enter in iframe should not auto-submit. |

### F-4: Decline and Retry Flow (AC-2)

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| F-4.1 | Entering a valid-format card that is not the canonical card (any Mastercard other than 5424000000000015) results in a decline error on the cart page | P0 | BL-CHK-004, ECL-1.1 | Vault rejects all non-canonical cards — this is a reliable decline trigger for QA. Error should surface on cart page (not on /checkout/payment, which no longer exists for this flow). |
| F-4.2 | After decline the cart is intact, the Skyflow form fields are editable for correction | P1 | BL-CHK-004 | User can fix card details and retry without losing cart contents or starting over. |
| F-4.3 | Entering the canonical card after a decline succeeds and produces an order | P1 | BL-CHK-004, ECL-1.1 | Full decline→retry→success cycle. Verify only one order created. |

### F-5: Payment Method Switching (Stale Processor Cleanup)

> NOTE: The cart-resolver appends a payment row each time the payment method is switched. Start from a FRESH cart (call clearCart or use a new session) at the start of each switching sub-case to avoid orphaned payment rows.

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| F-5.1 | Switching from Skyflow to CyberSource: CyberSource form renders on cart page, Skyflow form disappears, no stale Skyflow processor remains registered | P0 | BL-PAY-004, ECL-7.1 | New risk: `onUnmounted` in `payment-processing-skyflow.vue` now unregisters the processor + calls `setCardDataInvalid`. Verify the unregister fires when switching away. If stale processor stays, the subsequent CyberSource payment will be routed wrong. |
| F-5.2 | Switching from CyberSource to Skyflow: Skyflow form renders on cart page, CyberSource form disappears, CyberSource processor unregisters | P0 | BL-PAY-004, ECL-7.1 | Regression test for the complementary CyberSource `onUnmounted` cleanup fix also shipped in this PR. |
| F-5.3 | After Skyflow → CyberSource switch: completing a CyberSource payment succeeds (no duplicate payment rows, no cross-processor routing bug) | P0 | BL-PAY-004, BL-ORD-001 | Start fresh cart. Switch to CS, pay with @td(CYBERSOURCE_VISA.number). Confirms no orphaned Skyflow payment row on the order. |
| F-5.4 | After switching payment methods, previously entered Skyflow card data does not persist in the DOM or network state | P1 | BL-PAY-001, ECL-7.1 | Card data must be cleared on unmount. Inspect DOM / DevTools Application storage after switching. |

### F-6: Saved Cards (if applicable)

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| F-6.1 | If a saved Skyflow card exists for the test user ({{USER_EMAIL}}), it is presented on the cart page payment section | P2 | BL-PAY-003 | Conditional — only testable if saved cards exist in the QA environment for the test account. If no saved card exists, mark N/A. |
| F-6.2 | Paying with a saved Skyflow card from the cart page succeeds (order confirmation reached, raw PAN absent from network) | P2 | BL-PAY-003, BL-PAY-001 | Same tokenization assertion as F-2.3 but via the saved-card path. |

### F-7: Order-Context Flow Regression (MUST NOT REGRESS)

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| F-7.1 | An existing unpaid Skyflow order opened via {{FRONT_URL}}/account/orders/{id} still shows the Skyflow payment form and can be paid via the order-context path (`initializePayment({orderId, paymentId})`) | P0 | BL-ORD-001, BL-CHK-006 | Backend safe-cast: `if (request.Payment is PaymentIn payment)` — for order context the payment IS a PaymentIn. This flow must still set PaymentStatus=Pending and complete. Create an unpaid order (e.g. via Admin SPA or the manual-payment route) then pay it via /account/orders. |
| F-7.2 | `payment-processing-skyflow.vue` throws (or shows an error) if neither cart+payment nor orderId+payment props are supplied | P2 | — | Edge guard in `initializeByCartOrOrder()`: `throws if neither`. Low-risk user-facing but validates the guard contract. |

### F-8: CyberSource Cart Payment Regression (MUST NOT REGRESS)

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| F-8.1 | CyberSource cart-embedded payment flow still works end-to-end: canonical VISA card @td(CYBERSOURCE_VISA.number) → order confirmation | P0 | BL-PAY-004, BL-CHK-006 | PAY-CS-001 equivalent. The `payment-processing-cyber-source.vue` `onUnmounted` cleanup change must not break the primary CS flow. |
| F-8.2 | CyberSource `onUnmounted` cleanup: switching away from CyberSource unregisters the processor (verified via F-5.2, cross-reference) | P1 | BL-PAY-004 | This is the companion fix to the Skyflow unregister. Already covered under F-5.2 — listed here as an explicit regression callout for CyberSource. |

---

## Section B — Backend / API (agent: qa-backend-expert, browser: playwright-edge)

### B-1: GraphQL — Cart Payment Initialization (AC-1)

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| B-1.1 | `initializeCartPayment(cartId, paymentId)` mutation returns `publicParameters` (Skyflow vault URL, field metadata) with no `errors[]` | P0 | BL-ORD-001 | This is the NEW initialization path invoked by `initializeByCartOrOrder()` when cart+payment props are present. Verify the mutation exists in schema (see `graphql-schema.md`), submit with valid cartId from a live session, assert non-empty `publicParameters`, `errors[]` is empty. |
| B-1.2 | `initializeCartPayment` with invalid/missing `cartId` returns a meaningful `errors[]` entry, not a 500 | P1 | ECL-3.1 | Negative path for the new mutation. |
| B-1.3 | `initializePayment(orderId, paymentId)` mutation (order context) still returns `publicParameters` correctly with no `errors[]` | P0 | BL-ORD-001 | Regression — the safe-cast change must not break the order-context initialize path. Use an unpaid Skyflow order's orderId. |

### B-2: Payment State Machine and Safe-Cast Regression (AC-1)

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| B-2.1 | `authorizePayment` mutation after a cart-flow Skyflow payment transitions the order to Authorized or Paid status | P0 | BL-ORD-001, BL-ORD-006 | State machine: Pending→Authorized/Paid. After a successful cart payment, query the created order and assert `paymentStatus` is not still New/Pending. |
| B-2.2 | `authorizePayment` for an order-context (PaymentIn) Skyflow payment still transitions correctly — safe cast does not regress PaymentStatus=Pending assignment | P0 | BL-ORD-001, BL-ORD-006 | The PR replaced a hard cast with `if (request.Payment is PaymentIn payment)` — PaymentStatus=Pending is now only set for PaymentIn. Assert that the order-context path still sets PaymentStatus=Pending before authorization, then Authorized after. |
| B-2.3 | Skyflow appears in cart `availablePaymentMethods` when querying the cart GraphQL object | P0 | BL-ORD-001 | `AllowCartPayment=true` must surface Skyflow as an option in the cart payment methods list. Query `cart { availablePaymentMethods { code } }` and assert `SkyflowPaymentMethod` is present. |
| B-2.4 | `authorizePayment` with a declined card (non-canonical card, vault rejects) returns a payment-failure `errors[]` and does NOT create a completed order | P1 | BL-CHK-004, BL-ORD-001 | Backend decline path. Mirrors F-4.1 at the API layer. |

### B-3: Admin SPA Order Verification

| # | Check | Priority | BL/ECL | Notes |
|---|-------|----------|--------|-------|
| B-3.1 | After a successful Skyflow cart-flow payment: Admin SPA order detail shows payment method as "Skyflow" (or equivalent label) with a tokenized card reference (not raw PAN) | P0 | BL-PAY-001, BL-ORD-001 | Cross-layer verification. Navigate to {{BACK_URL}} Admin → Orders, find the order by number from storefront confirmation. |
| B-3.2 | Admin SPA order payment status reflects Authorized or Paid (not Pending/New) after successful cart payment | P1 | BL-ORD-001, BL-ORD-006 | State machine visible in Admin. |
| B-3.3 | Admin SPA order detail for an order paid via order-context flow (F-7.1) shows correct Skyflow payment status — safe-cast regression | P1 | BL-ORD-001 | Ensures the safe-cast change did not break Admin display for order-context payments. |

---

## Section G — Coverage Gaps

The following are areas with zero existing test coverage in suite 040 that are introduced or exposed by this ticket:

| Gap | Description | Suggested priority |
|-----|-------------|-------------------|
| G-1 | `initializeCartPayment` GraphQL mutation — no existing cases in 040 or 050* suites | P0 — new mutation, no coverage |
| G-2 | Cart-embedded Skyflow form presence and initialization on /cart — no existing case (all PAY-SKY-* were authored for /checkout/payment redirect) | P0 — core AC-2 |
| G-3 | `onUnmounted` processor unregistration: Skyflow and CyberSource cleanup on method switch — no existing switching test validates processor cleanup at the component level | P0 — new logic, untested |
| G-4 | `initializeByCartOrOrder()` branching logic — no case validates that the correct initialize path fires based on props (cart vs order context) | P1 — new branching logic |
| G-5 | GA4 "purchase" event in cart-flow context — event fires differently for cart-flow vs orderToPay-driven flow; no existing analytics case for Skyflow | P1 — new conditional in analytics path |
| G-6 | `AllowCartPayment=true` — Skyflow in cart `availablePaymentMethods` — no existing GraphQL case asserts Skyflow availability in cart context (B-2.3) | P0 — feature enablement assertion |
| G-7 | Order-context Skyflow payment via /account/orders (F-7.1) — existing PAY-SKY-001..009 all assert /checkout/payment redirect; none test the order-context re-payment path | P1 — regression risk from safe-cast change |

---

## Section OBSOLETE — Suite 040 Cases Requiring Rewrite After Merge

> Do NOT rewrite these now. Flag for the test lifecycle pipeline to pick up post-merge.

The following cases in `regression/suites/Frontend/payment/040-payment-processors.csv` describe the OLD Skyflow redirect flow (`Place Order → /checkout/payment`) and will produce false failures against the new cart-embedded behavior:

| Case ID | Title | Why outdated |
|---------|-------|--------------|
| PAY-SKY-001 | Skyflow - Complete Payment Flow | Asserts redirect to /checkout/payment; new flow keeps user on /cart |
| PAY-SKY-002 | Skyflow - Mastercard Payment | Same redirect assertion |
| PAY-SKY-003 | Skyflow - Invalid Card Number Validation | Step references /checkout/payment as precondition |
| PAY-SKY-004 | Skyflow - Empty Fields Validation | Step references /checkout/payment as precondition |
| PAY-SKY-005 | Skyflow - Real-time Card Type Detection | Step references /checkout/payment as precondition |
| PAY-SKY-006 | Skyflow Payment Form Renders on Checkout Payment Page | Title + steps explicitly assert /checkout/payment — entire case premise is inverted |
| PAY-SKY-007 | Skyflow Invalid Card Number Rejected With Error | Precondition: "Skyflow form rendered on /checkout/payment" |
| PAY-SKY-008 | Skyflow Empty Required Fields Blocked | Precondition: "Skyflow form rendered on /checkout/payment" |
| PAY-SKY-009 | Skyflow Successful Payment Redirects to Confirmation | Steps navigate to /checkout/payment |
| PAY-SKTOK-001 | Skyflow Tokenization - Raw Card PAN Absent | Step: "Click Place Order → redirects to /checkout/payment" |

Recommended action: after merge + deploy, run `/qa-test-lifecycle suite 040` to sync these cases against the new behavior. The rewrite scope is PAY-SKY-001..009 + PAY-SKTOK-001 (10 cases).

---

## Checklist Summary

| Section | Items | P0 | P1 | P2 |
|---------|-------|----|----|----|
| F-1: Form presence and init | 5 | 3 | 2 | 0 |
| F-2: New-card E2E happy path | 4 | 3 | 1 | 0 |
| F-3: Button state / double-submit | 4 | 2 | 2 | 0 |
| F-4: Decline and retry | 3 | 1 | 2 | 0 |
| F-5: Payment method switching | 4 | 3 | 1 | 0 |
| F-6: Saved cards | 2 | 0 | 0 | 2 |
| F-7: Order-context regression | 2 | 1 | 0 | 1 |
| F-8: CyberSource regression | 2 | 1 | 1 | 0 |
| B-1: GQL cart payment init | 3 | 2 | 1 | 0 |
| B-2: Payment state machine | 4 | 3 | 1 | 0 |
| B-3: Admin SPA | 3 | 1 | 2 | 0 |
| **TOTAL** | **36** | **20** | **13** | **3** |

**Coverage gaps found:** 7 (G-1 through G-7) — all in new or changed behavior with zero existing cases.
**Obsolete cases flagged:** 10 (PAY-SKY-001..009 + PAY-SKTOK-001) — require rewrite post-merge via `/qa-test-lifecycle suite 040`.
