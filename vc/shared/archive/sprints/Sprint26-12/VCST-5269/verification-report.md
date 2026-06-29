# VCST-5269 — Fix Verification: Inline payment card form no longer requires address/delivery selection

**Verdict: FIX VERIFIED (PASS)** — the inline bank-card form renders on `/cart` as soon as an `allowCartPayment` method is selected, before any delivery method or shipping/billing address. Order placed end-to-end on the default processor.

- **Env:** vcst-qa @ storefront theme `2.52.0-pr-2336-14b2-14b272fb` (fix PR #2336 live)
- **Browser:** playwright-chrome | **User:** signed-in (Coffee shop / Elena Mutykova), B2B-store
- **Product:** `@td(BUYABLE_NO_MIN_QTY)` STD-001 (Animal Crossing, ALCE0128, $200), qty 1
- **Processors tested:** Authorize.Net (default inline, full place-order) + Skyflow (visibility) + Manual (BL-PAY-004)
- **Available `allowCartPayment` methods on this store:** Authorize.Net, CyberSource, Skyflow (+ Datatrans = redirect; Manual / Pay-with-points = non-card)

## Checklist results

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Card form independent of billing address (root cause) | **PASS** | Initial cart state showed "Please Select a billing address" (NOT set) **with** full card form visible; Authorize.Net card form rendered with no billing-address dependency |
| 2 | Card visible immediately on selecting `allowCartPayment` method, before delivery/shipping (3/3) | **PASS 3/3** | Runs 1–3: "Payment card" + Card number field present, Delivery method = "Select a delivery method" (unselected), URL `/cart` |
| 3 | URL stays `/cart`; cart-payment init fires | **PASS** | No redirect to `/checkout/payment` for any inline method; `InitializeCartPayment` mutation fires (not `initializePayment`) |
| 4 | After selecting address + delivery, form remains visible & usable | **PASS** | Authorize.Net card form stayed visible and accepted input after delivery method (Fixed Rate Ground) selected |
| 5 | Order places with valid card (BL-PAY-003) | **PASS** | Order **CO260622-00001**, $420 (sub $200 + tax $70 + ship $150); `createOrderFromCart` errors[]=empty; `authorizePayment.isSuccess=true` |
| 6 | No new console / network / GraphQL errors | **PASS (Authorize.Net flow)** | 0 console errors through add→place; all order GraphQL 200, no errors[]. Skyflow-only init error noted below (pre-existing, out of scope) |
| 7 | Storefront reflects corrected behavior (card visible early) | **PASS** | Card section gated only on payment-method selection, not address/delivery |
| 8 | Order created — confirmation + number, mutation errors[] empty | **PASS** | `/checkout/completed` "Order CO260622-00001 has been successfully submitted." |
| 9 | BL-PAY-001 — Place Order gated until required data valid | **PASS** | Place order **disabled** while card fields empty; **enabled** only after card filled; **re-disabled** after click (BL-CHK-003 double-submit prevention) — never forced |
| 10 | BL-PAY-004 — manual method doesn't charge card; correct URL | **PASS** | "Manual" → card form removed, no card field, no charge, URL stays `/cart`, no redirect |
| — | **Skyflow visibility (coordinator add-on)** | **PASS (visibility) / form-load BLOCKED by pre-existing init** | See below |

## 3/3 visibility runs (core STR)
Authorize.Net, fresh `/cart` each time, no delivery method selected:
- Run 1: select method → card form appears immediately. URL `/cart`. PASS
- Run 2: reload → method persisted, card form visible, delivery still unselected. PASS
- Run 3: reload → same. PASS
Card form is consistently visible without delivery method. Screenshot: `screenshots/TC-5269-card-visible-no-address.png`

## Order placement (BL-PAY-003) — key network evidence
- `CreateOrderFromCart` → order `CO260622-00001`, status "Payment required", total $420, `errors[]` empty
- `AuthorizePayment` → `isSuccess:true`, `errorMessage:null`; body carried **Accept.js token** (`dataDescriptor: COMMON.ACCEPT.INAPP.PAYMENT`) — **no raw PAN** in any request body (client-side tokenized)
- Cart cleared; redirected to `/checkout/completed`. Screenshot: `screenshots/TC-5269-order-confirmation.png`

## Skyflow visibility (added per coordinator)
Skyflow **is** offered on this store. Investigated the "visible but broken" regression hypothesis (selecting Skyflow before an address now fires `initializeCartPayment` prematurely). **Determination: PRE-EXISTING Skyflow gateway outage on vcst-qa — NOT a regression from PR #2336.** Not filed.

**Visibility fix itself — PASS:** "Payment card" section renders immediately on selecting Skyflow, before delivery method (still "Select a delivery method"), URL stays `/cart`. `InitializeCartPayment` fires (cart-inline flow, not `initializePayment`).

**The break:** Skyflow `initializeCartPayment` → GraphQL `errors[]` `INVALID_OPERATION` ("Error trying to resolve field 'initializeCartPayment'"), `data.initializeCartPayment: null` → cross-origin iframe stuck on **"Loading..."**; one console error: `TypeError: Cannot read properties of undefined (reading 'container')` at `assets/payment-processing-cyber-source.vue_...-C1NQwQnD.js:1:6619` (shared payment chunk reacting to the null init). With Skyflow stuck, **"Place order" is disabled** (cart cannot complete on Skyflow); switching to another payment method works (cart not hard-stuck).

**Decisive evidence it is NOT the fix — three independent proofs:**

1. **Module-level Skyflow query fails (zero cart/billing dependency).** Selecting Skyflow also fires `GetSkyflowCards` (variables: `{storeId:"B2B-store"}` only — no cart, no payment, no address) → `INVALID_OPERATION`, `data.skyflowCards:null`. This is a plain "list this user's saved Skyflow cards" lookup that has nothing to do with PR #2336 or any address timing. Its failure proves the **entire Skyflow module/gateway is non-operational on vcst-qa.**

2. **Same processor-init operation: Skyflow fails, CyberSource succeeds, on the identical cart.** Both are `allowCartPayment` and both fire `initializeCartPayment` at method-selection (the exact mechanism the fix changed the *timing* of). On the same `cartId a7671de9…`:
   - CyberSource → `isSuccess:true` + Flex JWT + Microform v2.0.2 → working iframe.
   - Skyflow → `INVALID_OPERATION`, data:null → stuck "Loading…".
   If the fix's earlier-init timing caused the failure, CyberSource would fail too. It doesn't.

3. **The billing-address variable was tested directly and ruled out** (the coordinator's corrected Test A). I verified the cart's actual `payments[0].billingAddress` via `GetFullCart`/`AddOrUpdateCartPayment` responses (not just the UI):
   - Skyflow init with cart `billingAddress: NULL` → `INVALID_OPERATION`.
   - Explicitly selected a billing address via the "Select a billing address" dialog (unchecked "Same as shipping", picked the address, OK) → the Skyflow component **self-re-fired** `initializeCartPayment` (Test B: it does re-init on billingAddress change, no reload needed) → **still `INVALID_OPERATION`**.
   - Note: CyberSource **succeeded with cart `billingAddress: NULL`** (same "Same as shipping" UI state that leaves the cart payment billing null). So a present-vs-absent billing address changes nothing for either processor — Skyflow is dead either way, CyberSource works either way. The failure variable is the **processor**, not the billing address.

**Conclusion:** PR #2336 changes only the Vue `paymentCardVisible` computed and fires `initializeCartPayment` identically for every `allowCartPayment` processor. A frontend visibility change cannot make one processor's backend resolver (and an unrelated `skyflowCards` query) return `INVALID_OPERATION` while another processor succeeds. Root cause is **server-side Skyflow module/gateway provisioning on vcst-qa** (consistent with `test-cards.csv`: only one Skyflow PAN "verified routable in QA vault"). **PRE-EXISTING, not a regression.**

**Self-recovery (Test B):** the Skyflow Vue component DOES re-fire `initializeCartPayment` when the billing address changes (observed without reload) — so any future fix needs to re-gate/re-init on context change, but that is moot here because the backend rejects every attempt.

**Evidence bodies (init request always `{storeId:B2B-store, cartId:a7671de9…, paymentId:889d72c8…}`):**
- Skyflow `initializeCartPayment` (billing null AND billing-selected): `{"errors":[{"message":"Error trying to resolve field 'initializeCartPayment'.","extensions":{"code":"INVALID_OPERATION"}}],"data":{"initializeCartPayment":null}}`
- Skyflow `GetSkyflowCards` `{storeId}`: `{"errors":[{"message":"Error trying to resolve field 'skyflowCards'.","extensions":{"code":"INVALID_OPERATION"}}],"data":{"skyflowCards":null}}`
- CyberSource `initializeCartPayment` (same cart, cart billingAddress null): `{"data":{"initializeCartPayment":{"isSuccess":true,"errorMessage":null,...flex JWT + flex-microform.min.js v2.0.2}}}`
- Cart `payments[0].billingAddress` at Skyflow init: **NULL** (confirmed in `AddOrUpdateCartPayment` + `GetFullCart` responses, even with "Same as shipping" checked / billing shown in UI).
- Console error (all Skyflow attempts): `TypeError: Cannot read properties of undefined (reading 'container')` at `assets/payment-processing-cyber-source.vue_...-C1NQwQnD.js:1:6619`. With Skyflow stuck, **"Place order" is disabled** (cannot complete); switching to another method recovers the cart (not hard-stuck).
- Screenshots: `screenshots/TC-5269-skyflow-with-billing-address.png` (billing address selected, still Loading…), `TC-5269-skyflow-with-address.png`, `TC-5269-skyflow-card-visible-no-address.png`.
- Did NOT attempt a Skyflow place-order (blocked: Place order disabled in the stuck state).

### Cross-environment scope check — virtostart staging (storefront Ver. 2.51.0, PRE-PR-#2336)
Reproduced on a **different** environment (own backend/catalog/users/Skyflow config) to scope the outage. Signed in as `@td(ACME_BUYER_VIRTOSTART)`, added an in-stock virtostart product (Car Phone Holder), `/cart`.
- `allowCartPayment` methods offered on virtostart: Authorize.Net, CyberSource, **Skyflow**, Manual, Account Balance Payment.
- virtostart runs **storefront 2.51.0 (before the fix)** — so the card section requires an address (old behavior): selecting Skyflow with NO shipping address rendered **no "Payment card" section at all** (component didn't mount, no init fired). After setting a shipping address, the card section mounted → **"Loading…"**.
- **Skyflow REPRODUCES:** `initializeCartPayment` → `INVALID_OPERATION`, `data:null` (fired twice, both failed); stuck "Loading…"; same console error `TypeError: Cannot read properties of undefined (reading 'container')` at `payment-processing-cyber-source.vue_...-BHLKsh8X.js` (same code, different bundle hash).
- **Contrast — CyberSource works on virtostart:** same cart/address, `initializeCartPayment` → `isSuccess:true` + Flex JWT + `flex-microform.min.js v2.0.2` → working Microform iframe. So virtostart's generic cart-payment init path is healthy; only Skyflow fails.
- Screenshot: `screenshots/TC-5269-skyflow-virtostart.png`.

**Scope verdict:** Skyflow's `INVALID_OPERATION` is **NOT vcst-qa-specific** — it reproduces on virtostart too, on a build that predates PR #2336. This is a **broader Skyflow module/gateway problem** across both environments, fully independent of the fix (virtostart doesn't even have the fix). CyberSource succeeding on both envs confirms it is Skyflow-processor-specific, not a generic init failure.

## Notes
- A residual session shipping/billing address ("...Bulgaria", "Same as shipping" checked) was present; the decisive no-billing-address proof is the **initial cart state** which showed the card form fully visible with billing explicitly unset ("Please Select a billing address").
- No new 4xx/5xx introduced on `/cart`; all GraphQL 200. Only error observed is the Skyflow-init `INVALID_OPERATION` above.

**Processor tested for full order:** Authorize.Net (order CO260622-00001). Skyflow: visibility fix confirmed working; full card load blocked by a **PRE-EXISTING** Skyflow gateway outage on vcst-qa (`initializeCartPayment` → `INVALID_OPERATION`), proven not-a-regression by CyberSource succeeding on the identical cart. Reported, not filed.
