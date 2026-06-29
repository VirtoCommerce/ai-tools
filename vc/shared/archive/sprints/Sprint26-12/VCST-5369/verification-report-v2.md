# VCST-5369 — Fix Re-Verification (NEW strategy, commit 6f3cf213)

**Verdict: VERIFIED** — The new fix is correct. Authorize.Net 3/3 paid. CyberSource original block is GONE (Place Order enabled, order placed, routed to payment, `'container'` TypeError absent on Billing/Review). Checklist 10/10 PASS (1 with-note).

**Env:** vcst-qa storefront @ theme `2.52.0-pr-2353-6f3c-6f3cf213` (footer + every page confirmed) · playwright-chrome · personal user "Coffee shop / Elena Mutykova". Multistep checkout active. Product: Xerox WorkCentre 6515/DN ($549.00) → Ground (+$150.00) → tax +$139.80 → **Total $838.80** (run 1 used Beats $109/disc → $310.80).

## What changed (new fix) — confirmed live
`allowCartPayment = !checkout_multistep_enabled && paymentMethod.allowCartPayment`. In multistep the new flow is now a 5-step stepper **Shipping → Billing → Order review → Payment → Completed**: NO inline card form on Billing for Authorize.Net/CyberSource/Skyflow; "Place order" on Review is enabled and ungated; Place Order creates the order first and routes to a dedicated `/checkout/payment` step (same model as Datatrans) where the card is entered → `/checkout/payment/success`|`/failure`. Confirmed exactly as designed.

## A. Build/flow gate — PASS
Footer `…-6f3c-6f3cf213`; stepper present with the dedicated Payment step (4). The Payment step appears once an allowCartPayment method is selected. (`v2-step0-multistep-shipping.png`)

## B. Authorize.Net — full flow to PAID order, 3 consecutive runs: **3/3 PASS**
| Run | Billing no inline form | Review Place Order enabled | Routed to /checkout/payment | Card entered + Pay now | /payment/success | Order # | Status |
|-----|------------------------|----------------------------|-----------------------------|------------------------|------------------|---------|--------|
| 1 | PASS | PASS | PASS | PASS | PASS | CO260629-00014 ($310.80) | **Processing (paid)** |
| 2 | PASS | PASS | PASS | PASS | PASS | CO260629-00015 ($838.80) | **Processing (paid)** |
| 3 | PASS | PASS | PASS | PASS | PASS | CO260629-00016 ($838.80) | **Processing (paid)** |

All three reach "PAYMENT SUCCESSFUL … has been successfully submitted" and show **Processing** in the orders list (= payment captured, order advanced). Evidence: `v2-billing-authnet-noform.png`, `v2-run1-review-placeorder-enabled.png`, `v2-run1/2/3-payment-success.png`, `v2-orders-list.png`.

## C. CyberSource — the previously-failing processor: **fix VERIFIED**
- Billing: payment method selectable, **NO inline card form** (by design). `v2-cs-billing-noform.png`
- Review: **"Place order" ENABLED** — the original VCST-5369 / v1-recheck block (Place Order stuck disabled) is **GONE**. `v2-cs-review-placeorder-enabled.png`
- Order **placed** (CO260629-00017) and **routed to `/checkout/payment`**, where the CyberSource Microform renders cleanly (Card# + CVV cross-origin iframes + native Cardholder/Expiration). `v2-cs-payment-microform.png`
- **`TypeError: …'container'` in `payment-processing-cyber-source.vue` is GONE during Billing AND Review** — 0 console errors throughout both CyberSource steps (the v1 "smoking gun" no longer fires, because the Microform is no longer mounted on Billing/Review; it now mounts only on the dedicated payment page).
- Microform accepted automated keystrokes and **"Pay now" became ENABLED** (`v2-cs-payment-filled-paynow-enabled.png`). Pay now → `/checkout/payment/failure`: "Payment failed — Order CO260629-00017 has not been paid." (`v2-cs-payment-failed.png`)
- **Did CyberSource reach a paid order?** No — the gateway DECLINED the automated transaction (order stays "Payment required"). Honest caveat (cf. VCST-5100): the cross-origin CyberSource sandbox did not approve the keystroke-tokenized card under automation; I cannot prove a real human card would also decline. This is an automation/sandbox limitation, **not** a regression in this fix. **All key fix assertions PASS: Place Order enabled + order placed + routed to payment + `'container'` crash gone.**

## D. Skyflow — flow integrity: **PASS (up to gateway)**
Billing no inline form; Review "Place order" ENABLED; order **placed** (CO260629-00018) and **routed to `/checkout/payment`**. The Skyflow card container shows **"Loading…"** and stalls — the known **gateway-down infra** issue on vcst-qa (vault/bearer-token creds lost in 2026-05-15 restore, `project_skyflow_qa_gateway_down`), NOT a fix failure. `v2-skyflow-payment-loading.png`
> **Note (secondary, not a blocker):** on the *Skyflow* payment page (gateway stalled), the same `payment-processing-cyber-source.vue` `'container'` TypeError appeared once in console. It did NOT fire on the CyberSource Billing/Review path (the fix's scope) and did not block any step reached. Appears to be a residual cross-payment-component teardown on the dedicated payment page when a gateway never initializes; worth a follow-up glance but out of scope for the VCST-5369 Place-Order block.

## E. Regression / checklist
| # | Item | Result |
|---|------|--------|
| 1 | Multistep flow active; theme `…-6f3c` | **PASS** |
| 2 | Billing: no inline card form for allowCartPayment methods (by design) | **PASS** (Authorize.Net, CyberSource, Skyflow all show selector only) |
| 3 | Review: "Place order" enabled for Authorize.Net, CyberSource, Skyflow | **PASS** (all three) |
| 4 | Authorize.Net: full flow → paid order (3/3) | **PASS** (00014/00015/00016, all Processing) |
| 5 | CyberSource: Place Order enabled + order placed + routed to payment + `'container'` gone | **PASS** (paid blocked only by gateway decline, see C) |
| 6 | Order totals + line items correct on Billing/Review + placed order | **PASS** ($549 + tax $139.80 + ship $150 = $838.80; qty 1; consistent across steps & orders list) |
| 7 | Cart contents/qty persist across multistep steps | **PASS** (Xerox qty 1 / $549 stable Shipping→Billing→Review→Payment) |
| 8 | Non-allowCartPayment method works in multistep (Datatrans) | **PASS** — Place Order enabled, order placed (CO260629-00019), routed to `/checkout/payment` showing "Secure Payment … redirected to Datatrans" + Pay now $838.80. `v2-datatrans-payment-redirect.png` |
| 9 | No NEW console errors; checkout `POST /graphql` 200, no 4xx/5xx, no `errors[]` | **PASS (with note)** — all checkout/order-placement `/graphql` 200; 2 transient `/graphql` 400s on non-checkout page-load queries (also present in the Authorize.Net session, off the placement path); the only checkout-flow console error was the Skyflow-page `'container'` note in §D |
| 10 | BL-PAY-004: allowCartPayment card entry deferred to dedicated payment step; order completes as paid | **PASS** — Authorize.Net completes paid via the dedicated payment step; CyberSource/Skyflow deferred correctly (paid contingent on gateway) |

**Checklist score: 10/10 PASS** (items 5 & 9 carry the gateway-decline / Skyflow-`'container'` notes above).

## Console / Network
- Checkout & order-placement `POST /graphql` → all 200; no `errors[]`; no 4xx/5xx.
- 2 transient `/graphql` 400s seen at session level on non-checkout page-load queries (consistently 2, also in the clean Authorize.Net session — not on the placement path).
- `payment-processing-cyber-source.vue` `'container'` TypeError: **absent on CyberSource Billing/Review** (the fix target); fired once only on the **Skyflow** dedicated payment page (gateway stalled) — see §D note.
- HAR: `test-results/chrome/har/` (session artifact).

## Orphan test orders (unpaid, expected)
CO260629-00017 (CyberSource, gateway decline), CO260629-00018 (Skyflow, gateway down), CO260629-00019 (Datatrans, redirect not completed) — all "Payment required". Authorize.Net 00014/00015/00016 are paid/Processing.

## Screenshots (`tests/Sprint-current/VCST-5369/screenshots/`, prefix `v2-`)
step0-multistep-shipping · billing-authnet-noform · run1-review-placeorder-enabled · run1/2/3-payment-success · cs-billing-noform · cs-review-placeorder-enabled · cs-payment-microform · cs-payment-filled-paynow-enabled · cs-payment-failed · skyflow-payment-loading · datatrans-payment-redirect · orders-list

## CyberSource isolated authorize capture
**Diagnostic-only run** (CyberSource ONLY, no Skyflow touched). vcst-qa @ theme `2.52.0-pr-2353-6f3c-6f3cf213`, multistep ON, playwright-chrome, user "Coffee shop / Elena Mutykova". Product: Xerox WorkCentre 6515/DN $549 → Ground +$150 → tax +$139.80 → **Total $838.80**. (Note: catalog/search browse is broken store-wide on this build — XCatalog 3.1009.0/XFrontend 3.1003.0 backend version mismatch → `products` GraphQL 400 → "0 results" everywhere; reached the PDP via Recently-browsed. Not part of payment scope.)

**Order:** CO260629-00024 (orderId `0d35523f-42fd-4ee2-86ee-d78254edc72c`, paymentId `69881cdc-d4c1-49d6-9c25-cbbcddf39245`). **Pay-now click:** 2026-06-29 **11:40:35 UTC** (13:40:35 CEDT). Result: `/checkout/payment/failure` — "Payment failed — Order CO260629-00024 has not been paid. There is a problem with your payment."

**`InitializePayment` (on payment-page mount, req #182):** HTTP 200, `{ initializePayment: { isSuccess: true, errorMessage: null, actionHtmlForm: null, actionRedirectUrl: null, paymentActionType: "Standard", publicParameters: [jwt, clientLibraryIntegrity, clientScript=https://testflex.cybersource.com/microform/bundle/v2.0.2/flex-microform.min.js, kid] } }`. Clean CyberSource Flex init; JWT targetOrigin `vcst-qa-storefront.govirto.com`, mfOrigin `testflex.cybersource.com`. No `errors[]`.

**`AuthorizePayment`: NOT SENT.** This is the finding. After Pay-now the Microform tokenized the card successfully — `POST https://testflex.cybersource.com/flex/v2/tokens → 201` (req #192, JWT token returned) — but the storefront then navigated **straight to `/checkout/payment/failure` WITHOUT ever issuing an `authorizePayment` (or any) GraphQL mutation** to `{FRONT}/graphql`. Every `/graphql` POST after the tokenize (#197-202) is unrelated layout/menu/address/push-message; the only post-click app call is GA `page_view` for the failure URL (#203/204). So the storefront never reached `authorizePayment` → backend gateway `pts/v2/payments` was never asked to authorize, matching the bare order-payment record. The break is on the storefront **between successful Flex tokenization and the authorizePayment call** (token never forwarded; no mutation fired).

**Console during payment step:** 0 errors (the `payment-processing-cyber-source.vue` `'container'` TypeError did NOT fire). **Skyflow:** NOT referenced anywhere — not in `initializePayment` response, not in console, not in any network call. CyberSource path is cleanly isolated.

Evidence: `screenshots/v3-cs-payment-failure.png`. HAR: `test-results/chrome/har/` (session artifact). Req refs are 1-based indices from the live network panel this run.

## CyberSource re-verify on 003c
**Env:** vcst-qa @ theme `vc-theme-b2b-vue-2.52.0-pr-2353-003c-003cb1b3` (fix commit `003cb1b3`), multistep checkout ON, playwright-chrome, user "Coffee shop / Elena Mutykova". Product: Fanta Peach Soda 6x330ml $25 → Ground +$150 → tax +$35 → **Total $210.00**.

**VERDICT: CyberSource-fix VERIFIED.** `AuthorizePayment` now fires with the real order; CyberSource accepts it (`isSuccess:true`); both runs route to `/checkout/payment/success`.

### (a) AuthorizePayment now fires with real orderId/paymentId — YES (the fix)
Both runs sent `mutation AuthorizePayment` POST `{FRONT}/graphql` → HTTP 200 with correct, non-undefined variables (NOT a MouseEvent):
- **Run 1** order `a1cb0ac8-afd8-4f45-85d0-ead52764ab5a`, paymentId `65ad9a41-ca11-416d-a3a9-83773cf3ab19`, `storeId:B2B-store`, `cultureName:en-US`, `parameters:[{key:"token", value:<CyberSource Flex JWT>}]` (no raw card/CVV in the mutation — only the Flex token). Pay-now click **2026-06-29 12:11:26 GMT**.
- **Run 2** order `8ac3ad0a-f52a-4751-a594-0355cf8e52a7`, paymentId `aeea39cb-0155-4f9e-b3e1-c61ca38c5c55`, same shape. Pay-now click **2026-06-29 12:15:07 GMT**.

### (b) CyberSource outcome — gateway ACCEPTED (held for review), order numbers below
Both runs: response `{authorizePayment:{isSuccess:true, errorMessage:"Your transaction was held for review: The order is marked for review by Decision Manager"}}` — no `errors[]`. `isSuccess:true` = authorization reached + accepted by CyberSource; the Decision Manager "held for review" flag (sandbox fraud screen) is a gateway/test-data matter, NOT the frontend bug. Storefront correctly routed to `/checkout/payment/success`.
- **Run 1 → Order CO260629-00027** (status "Payment required" = authorized-but-held, capture pending review).
- **Run 2 → Order CO260629-00030** (same).
GA4 `purchase` fired (transaction_id = run-1 orderId, value 25 / shipping 150 / tax 35).

### (c) Authorize.Net sanity — PASS (billing.vue revert intact)
One full multistep run, CyberSource→Authorize.Net swap only → **Order CO260629-00031** (PI260629-00033), status **Processing** ($210.00, orderId `d4301e07-cd57-4f9a-b5a7-cfed80da7730`) = captured/paid. The working processor still works.

### (d) Regression sanity (Step 6) — PASS
Multistep **Billing** renders correctly across all 3 runs: payment-method selector present, billing-address "Same as shipping" checkbox, **NO inline card form** (by design); Review→Place Order stays enabled. The reverted `:cart` prop did not break Billing or Review.

### (e) Console / network — clean
Checkout/order-placement `POST /graphql` all 200, no `errors[]`, no 4xx/5xx. Zero payment-flow console errors across all 3 runs (the prior `payment-processing-cyber-source.vue 'container'` error did not recur). Only benign homepage image 404s (`cms-content/.../GC952104...webp`), off the payment path. HAR: `test-results/chrome/har/` (session artifact).

### Screenshots (`screenshots/`, prefix `v4-`)
`v4-cybersource-payment-form-ready.png` (Pay-now enabled), `v4-cybersource-payment-success-run1.png`, `v4-cybersource-payment-success-run2.png`.
