# VCST-5009 — Extend Skyflow with AllowCartPayment — Backend/API Execution Report

**Env:** vcst-qa @ Platform 3.1032.0, Skyflow 3.1002.0-pr-23-5a1b · GraphQL `POST {BACK_URL}/graphql`
**Agent:** qa-backend-expert (playwright-edge) · **Date:** 2026-06-04
**Scope executed:** Section B (B-1, B-2, B-3) + key scenarios 1–7. F-section is the frontend agent's.

## Summary

The PR works as designed at the API + Admin layer. `PaymentMethodType` now exposes `allowCartPayment`; Skyflow returns `allowCartPayment: true` in cart `availablePaymentMethods`. The new `initializeCartPayment(cartId, paymentId)` path returns Skyflow vault `publicParameters` with no errors, and the safe-cast change leaves the order-context `initializePayment` + state machine intact. A completed cart-flow Skyflow order reaches `Paid` (legal Pending→Authorized→Paid) with a tokenized reference and no raw PAN. **No bugs found.**

## Verdict Table

| ID | Verdict | Note |
|----|---------|------|
| B-1.1 | PASS | `initializeCartPayment` on cart w/ Skyflow payment → `isSuccess:true`, `publicParameters` (accessToken/vaultID/vaultURL/tableName), no `errors[]`, `paymentActionType:PreparedForm` |
| B-1.2 | PASS | Bogus/empty `cartId` & bogus `paymentId` → HTTP 200 + graceful `errors[]` (`INVALID_OPERATION`), no 500 |
| B-1.3 | PASS | Order-context `initializePayment(orderId,paymentId)` on unpaid Skyflow order CO260604-00002 → `isSuccess:true` + `publicParameters`; safe-cast did not break it |
| B-2.1 | PASS | Cart-flow order CO260604-00001: `payStatus=Paid`, `isApproved=true`, `authorizedDate`+`capturedDate` set, txn approved → legal Pending→Authorized→Paid (BL-ORD-001/006) |
| B-2.2 | PASS | Order-context inPayment created at status `New` (=Pending); safe-cast `is PaymentIn` recognizes the order Payment, no regression |
| B-2.3 | PASS | Cart `availablePaymentMethods` includes `SkyflowPaymentMethod` with `allowCartPayment:true` (CyberSource also true; AuthorizeNet/Datatrans/Manual/Loyalty false) — core AC-1 |
| B-2.4 | PARTIAL / by-design | API `authorizePayment` w/o vault-tokenized data → graceful `errors[]`, no completed order. True card-decline needs iframe vault tokenization → **covered-by-frontend-E2E (F-4.1)** |
| B-3.1 | PASS | Admin PaymentIn blade: method `SkyflowPaymentMethod`, txn note "Paid successfully. Transaction Info 120084003263" (tokenized ref), no raw PAN anywhere |
| B-3.2 | PASS | Admin order payment status = `Paid` (not Pending/New) after cart payment |
| B-3.3 | PASS | Order-context Skyflow payment (CO260604-00002) renders correct method+status in Admin/REST; safe-cast did not break admin display |

## Scenario coverage (task list)

1 PASS (B-2.3) · 2 PASS (B-1.1) · 3 PASS (B-1.3) · 4 PASS (B-2.1) · 5 PASS (B-2.2/B-3.3) · 6 PASS (B-3.1) · 7 PASS (B-1.2)

## BL rules verified

- **BL-ORD-001 / BL-ORD-006** (payment state machine): cart-flow Skyflow order progressed New→Authorized→Paid with both timestamps + approved transaction; no illegal transition. Order-context PaymentIn correctly starts at `New`/Pending. PASS.
- **BL-CHK-006** (totals admin vs storefront): cart subtotal 494.00 + shipping 150.00 + tax 128.80 = order Total 772.80 USD, consistent storefront→admin. PASS.
- **BL-PAY-001/002** (tokenization, no raw PAN): no `5424000000000015` in payment record/transaction; Admin shows tokenized Transaction Info only. PASS.

## GraphQL operations validated (against live introspection)

- `cart { availablePaymentMethods { code name allowCartPayment paymentMethodType } }` — new `allowCartPayment` field confirmed on `PaymentMethodType`
- `mutation initializeCartPayment(command: InputInitializeCartPaymentType!)` — input `cartId!,paymentId!,storeId,cultureName`; returns `InitializeCartPaymentResultType { isSuccess errorMessage paymentMethodCode paymentActionType actionRedirectUrl actionHtmlForm publicParameters{key value} }`
- `mutation initializePayment(command: InputInitializePaymentType!)` — input `orderId,paymentId!,storeId,cultureName,parameters`; returns `InitializePaymentResultType` (incl. `orderNumber`, `publicParameters`)
- `mutation authorizePayment(command: InputAuthorizePaymentType!)` — returns `AuthorizePaymentResultType { isSuccess errorMessage }`
- `addItem` / `addOrUpdateCartPayment` (`paymentGatewayCode:"SkyflowPaymentMethod"`) / `addOrUpdateCartShipment` / `createOrderFromCart` — cart build chain (all require `userId`)

## Observations (not bugs)

- Each `addOrUpdateCartPayment` call appends a new payment row (cart-resolver behavior) → an order created after switching can carry duplicate Skyflow inPayment rows. Pre-existing platform behavior; the PR's frontend `onUnmounted` cleanup (F-5) is the mitigation — frontend scope.
- `addOrUpdateCartShipment` throws `DB_UPDATE`/`SQL` on a cart with stale shipment state; resolved by `clearCart` + rebuild (documented quirk `feedback_apollo_cart_shipment_stale_data`). Not related to this PR.
- Negative-path error messages are generic ("Error trying to resolve field 'initializeCartPayment'") but carry a structured `code` and stay HTTP 200 — meets contract; a more specific message would be a nice-to-have, not a defect.

## Evidence

- `B-3-skyflow-payment-paid.png` — Admin PaymentIn #PI260604-00001 blade: SkyflowPaymentMethod, status Paid, tokenized txn reference, no PAN
- `B-3-skyflow-payment-blade.png` — order CO260604-00001 detail (Processing, Paid PaymentIn)

## Teardown

Test order CO260604-00002 deleted (HTTP 204); slot3 cart cleared. No config/payment-method settings modified. (Note: scratch file `_harness.mjs` in this folder could not be auto-deleted — safe to remove manually.)
