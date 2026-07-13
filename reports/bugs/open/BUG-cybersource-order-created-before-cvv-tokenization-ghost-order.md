# BUG — CyberSource: order created before card tokenization → orphaned unpaid order

## Status: CONFIRMED

**Severity:** High
**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368-997c, vc-module-CyberSource 3.1002.0
**Found in:** regression REG-2026-07-13-1542 (suite 039, PAY-CS-012); reproduced live 2026-07-13

## Summary

At the CyberSource cart-page payment step (`allowCartPayment=true`), an order is persisted via `CreateOrderFromCart` **before** the card is tokenized. When tokenization then fails (HTTP 400 from CyberSource Flex), the order and its unapproved payment already exist — leaving an orphaned "Payment required" order the customer never completes. An invalid security code that reaches the field via **paste / browser autofill / password-manager** (bulk-set, not keystroke) is enough to trigger it.

## Steps to Reproduce

From `/cart` with items, shipping address, and delivery method already selected, payment method = "Bank card (CyberSource)":
1. Fill Card number `4622 9431 2701 3705`, name, Expiration `09/2029`.
2. Put an invalid Security code (e.g. `abc`) into the CVV field via **bulk-set input** — paste, browser autofill, or a password manager. (Character-by-character *typing* is correctly filtered client-side and does NOT trigger this — see Note.)
3. Place Order becomes enabled → click it.

**Expected:** No order is created; the card is validated/tokenized first, and only a successful token proceeds to `CreateOrderFromCart`.
**Actual:** `CreateOrderFromCart` returns a full order (**CO260713-00018**, status `Payment required`) *before* the tokenize call. `POST https://testflex.cybersource.com/flex/v2/tokens` then returns **400** (`captureData.securityCode: Invalid security code format`). User is bounced to `/checkout/payment` with an empty form, while order + payment `PI260713-00018` already exist and are never cleaned up.

**Note (entry vector):** Keystroke typing of letters is stripped client-side (field stays empty, Place Order stays disabled — correct). The defect is the **order-before-tokenization sequencing**; the unmasked/unvalidated CVV (see sibling bug) is what lets an invalid value reach Place Order via autofill/paste.

![Place Order enabled with invalid CVV](../screenshots/BUG_039_003-004-cvv-plaintext-placeorder-enabled.png)
![Orphaned order in Admin](../screenshots/BUG_039_003-admin-orphaned-order-CO260713-00018.png)

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | Place Order enabled with invalid CVV; redirected to `/checkout/payment` post-place |
| 2. Backend Admin | FAIL | Order CO260713-00018 present, `Confirmed=false`, status "Payment required" |
| 3. GraphQL xAPI | FAIL | `CreateOrderFromCart` (200) returns the order **before** tokenize |
| 4. Platform REST | N/A | order-create is via the GraphQL mutation; tokenize is a direct client→CyberSource call |

**Owning layer:** Checkout orchestration — the order-creation mutation is not gated on a successful token.

## Root Cause Analysis

Network ordering confirms the two client-initiated calls run in the wrong order: `CreateOrderFromCart` (#151, 200) precedes `POST .../flex/v2/tokens` (#153, 400). The correct `allowCartPayment` flow tokenizes the card first and only creates the order on a valid token. Because the caller sequences create-order ahead of tokenize (and doesn't roll back / cancel the order on a 400), every tokenization failure accretes an orphaned "Payment required" order. The regression run's earlier orphan **CO260713-00011** (`1f384a2b-…`) is still uncancelled, confirming there is no auto-cleanup.

## Related

- Same **ghost-order class** as `reports/bugs/open/BUG-AN-cart-card-number-no-luhn-ghost-order.md` (Authorize.Net, card-number/Luhn trigger). Different processor + trigger — file distinct; confirm during fix whether the order-before-payment sequencing is a shared checkout code path across payment modules (candidate to fix once, upstream of the processor).
- Sibling: CyberSource CVV plaintext/no-masking (`BUG-cybersource-cvv-microform-plaintext-not-masked.md`) — the enabler for an invalid CVV reaching Place Order.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Checkout orchestration (order-create sequenced ahead of payment tokenization)
- **Suggested repo:** `vc-frontend` (storefront checkout step that orders the `CreateOrderFromCart` vs tokenize calls) **OR** `VirtoCommerce/vc-module-CyberSource` (if the sequencing/rollback lives in the module's payment flow)
- **repoKind:** frontend | module
- **Ownership hint:** platform (native env — no client profile)
- **Component / module:** CyberSource cart payment (`allowCartPayment`) checkout flow
- **RCA anchor:** client call sequence `CreateOrderFromCart` → `flex/v2/tokens`; search `vc-frontend` checkout/payment composable for the CyberSource place-order path and `vc-module-CyberSource` for the Microform tokenize + order-create ordering
- **Routing confidence:** MEDIUM — the two calls are client-initiated, so the ordering likely lives in `vc-frontend`, but the module may own the place-order/rollback contract; `/qa-fix` Gate 1 to confirm from the RCA anchor.
