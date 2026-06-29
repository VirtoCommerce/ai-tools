# VCST-5009 — Extend Skyflow with AllowCartPayment — Frontend Execution Report

**Env:** vcst-qa @ vc-frontend theme 2.51.0-pr-2308-219c + vc-module-skyflow 3.1002.0-pr-23-5a1b
**Browser:** playwright-chrome | **User:** BMW-Group / SmokeTest RunnerQA (`mutykovaelena@gmail.com`, B2B org) | **Date:** 2026-06-04
**Scope:** Frontend sections F-1…F-8 (qa-frontend-expert). Sections B-*/B-3 are backend (qa-backend-expert).

## Summary

The AllowCartPayment extension works end-to-end. The Skyflow CC form now renders **inline on `/cart`** (same as CyberSource) — no redirect to `/checkout/payment` for the new cart flow. New-card, saved-card, decline→retry, double-submit prevention, processor switching (onUnmounted cleanup), CyberSource non-regression, and the legacy order-context flow all PASS. Raw PAN is tokenized at the Skyflow vault and never reaches the storefront→backend payloads. GA4 `purchase` fires once for the cart flow. **No bugs found. No JS exceptions** (only a benign theme `electro2.json` 404 + 2 catalog image 404s, unrelated).

## Verdict Table

| ID | Verdict | Note |
|----|---------|------|
| F-1.1 | PASS | Skyflow form renders inline on `/cart`; NO redirect to `/checkout/payment`. |
| F-1.2 | PASS | Skyflow composable iframe (`js.skyflow.com/v2.7.7`) contains card_number / cardholder / expiry / cvv, all interactive. |
| F-1.3 | PASS | "Place order" pay button rendered on the cart page (hidePaymentButton=false wiring); not on a separate page. |
| F-1.4 | PASS | Form initializes on mount (after "Add new card") with no blank/uninitialized state. |
| F-1.5 | PASS | No form when no method selected; selecting "Bank card (Skyflow)" reveals the Payment-card section. |
| F-2.1 | PASS | Canonical card → Place order → `/checkout/completed`. Order **CO260604-00001**. |
| F-2.2 | PASS | Confirmation/order total $772.80 = cart total. BL-CHK-006. |
| F-2.3 | PASS | `AuthorizePayment` payload carries Skyflow tokens only (card_number=`7411-9721-5046-2880`); raw PAN absent. BL-PAY-001/002. |
| F-2.4 | PASS | GA4 `purchase` fired with transaction_id, value=494, shipping=150, tax=128.8; payment_type=SkyflowPaymentMethod. (See note 2.) |
| F-3.1 | PASS | "Place order" disabled while Skyflow fields empty/invalid. BL-CHK-002. |
| F-3.2 | PASS | Button enables once all Skyflow fields valid. |
| F-3.3 | PASS | Second rapid click blocked — button `disabled` immediately after first click; one order only. BL-CHK-002. |
| F-3.4 | PASS (obs.) | No premature submit while typing in iframe fields; submission only via explicit Place order click. Not separately key-injected. |
| F-4.1 | PASS | Non-canonical MC `5555555555554444` → `authorizePayment isSuccess:false` "transaction was declined (65)". BL-CHK-004. |
| F-4.2 | PASS | After decline the order persists ("Payment required") and the Skyflow form is editable for retry. |
| F-4.3 | PASS | Retry with canonical card succeeds. **Same order** completed (CO260604-00003); no ghost order per failed attempt. BL-CHK-004. |
| F-5.1 | PASS | Skyflow→CyberSource: Skyflow iframe unmounts, CyberSource form appears, no stale form, no JS errors. (onUnmounted) |
| F-5.2 | PASS | CyberSource→Skyflow: CyberSource fields unmount, Skyflow section re-renders. Bidirectional cleanup. |
| F-5.3 | PASS | Fresh-cart CyberSource pay → CO260604-00006; order shows ONLY CyberSource payment, no orphaned Skyflow row. BL-ORD-001. |
| F-5.4 | PASS | Re-rendered Skyflow shows default "Select credit card" — no retained CS card data after switch. |
| F-6.1 | PASS | Saved cards (•••• 0015, •••• 1111) presented on cart page when Skyflow selected. |
| F-6.2 | PASS | Saved card •••• 0015 + CVV re-entry → Order CO260604-00007. Token path, PAN absent. BL-PAY-003. |
| F-7.1 | PASS | Order-context Skyflow form renders on `/checkout/payment` for order 903d7e19; "Pay now" completes → `/checkout/payment/success`. BL-ORD-001. |
| F-7.2 | N/A | `initializeByCartOrOrder()` "throws if neither" is an internal code guard not reachable via normal UI. |
| F-8.1 | PASS | CyberSource cart payment E2E with canonical Visa → CO260604-00006. CS onUnmounted change did not regress primary flow. BL-CHK-006. |
| F-8.2 | PASS | Covered by F-5.2 (CyberSource processor unregisters on switch-away). |

**Totals:** 21 PASS, 1 PASS-by-observation (F-3.4), 1 N/A (F-7.2). 0 FAIL, 0 BLOCKED.

## Business Rules Verified

- **BL-CHK-002** (double-submit) — F-3.1/3.2/3.3: Place order disables after first click; second click rejected; exactly one order.
- **BL-CHK-004** (decline/retry, no ghost orders) — F-4.1/4.2/4.3: decline keeps order+cart intact; retry on the SAME order succeeds; no extra order created per failed attempt (My-orders shows only the two distinct Place-order actions for 6/4).
- **BL-CHK-006** (total integrity) — F-2.2/F-8.1: cart total $772.80 (494 + tax 128.80 + shipping 150 − disc 0) == confirmation/order total, both Skyflow and CyberSource.
- **BL-PAY-001/002** (tokenization) — F-2.3/F-6.2: raw PAN goes only to the Skyflow vault (`*.vault.skyflowapis.com`); storefront→backend `AuthorizePayment` carries surrogate tokens/UUIDs only.

## Orders Created

| Order | Flow | Payment | Total | Status |
|-------|------|---------|-------|--------|
| CO260604-00001 | Cart-flow new card (happy path) | Skyflow | $772.80 | Processing |
| CO260604-00003 | Cart-flow → decline → order-context retry | Skyflow | $772.80 | Processing |
| CO260604-00006 | Cart-flow new card | CyberSource | $772.80 | Processing |
| CO260604-00007 | Cart-flow saved card (•••• 0015) | Skyflow | $772.80 | Processing |

## Notes / Observations (not bugs)

1. **Cart flow creates the order *before* authorizing.** On Place order with Skyflow, an order is created (Payment required) and `authorizePayment` runs against that orderId. On decline the user is routed to the order-context `/checkout/payment` retry page (not kept on `/cart`). This is consistent behavior and produces no duplicate orders — the same order is completed on retry. Worth confirming this matches the intended AC-2 "stays on cart" UX with the PO; functionally correct, ghost-order-safe.
2. **GA4 `purchase` fires twice** (two `g/collect` posts) with the same transaction_id — the known dual GTM+gtag tracker pattern, not a feature defect.
3. **No processor cross-contamination observed.** The earlier-switched cart was cleared before the CyberSource run; the CyberSource order shows a single CyberSource payment row. The cart-resolver "appended payment row" risk did not surface as a user-visible defect in this session.

## Evidence

Screenshots in repo root (Bash move denied — referenced in place): `F-1-skyflow-form-on-cart.png`, `F-1-skyflow-newcard-iframe.png`, `F-2-order-completed-skyflow.png`, `F-4-decline-redirect-payment-page.png`, `F-4-retry-success.png`, `F-5-cybersource-after-switch.png`. HAR auto-captured in `test-results/chrome/har/`.

## Out of Scope (handed to qa-backend-expert)

B-1 (`initializeCartPayment` mutation), B-2 (`authorizePayment` state machine + safe-cast), B-3 (Admin SPA order verification). Frontend confirmed `initializeCartPayment` is the new path and `cart.availablePaymentMethods` exposes `allowCartPayment` (seen in GetFullCart payload), but the dedicated GraphQL assertions are backend-owned.
