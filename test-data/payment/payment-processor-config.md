# Payment Processor Configuration & Test Guide

**Last Updated:** 2026-05-04

---

## Overview

Virto Commerce supports 5 payment processors plus 2 deferred methods on QA. This guide provides configuration details, **verified storefront flow walkthroughs**, and test card information for each processor.

**Authoritative test card source:** `test-data/payment/order-creation-matrix.txt` — the canonical 5-card matrix used for end-to-end verification. Cards in `test-data/payment/test-cards.csv` not annotated `VERIFIED` are unconfirmed in QA's sandbox vault.

**End-to-end verification:** All processors verified end-to-end on 2026-05-04 by Carlos Rodriguez (test-carlos.rodriguez-20260310 / BuildRight org) — orders CO260504-00001/00002/00009/00010/00006. See `reports/regression/REG-2026-05-04-0756/payment-retest-2026-05-04.md` for evidence.

---

## Storefront flow per processor (verified 2026-05-04)

| Processor | Selection point | Card capture | Final redirect |
|-----------|-----------------|--------------|----------------|
| **CyberSource** | /cart payment dropdown | Inline Microform v2.0.2 iframes ON /cart | /checkout/completed |
| **Authorize.Net** | /cart payment dropdown | Native inputs on /checkout/payment | /checkout/payment/success |
| **Skyflow** | /cart payment dropdown | Skyflow Elements iframe on /checkout/payment | /checkout/payment/success |
| **Datatrans** | /cart payment dropdown | Hosted modal on /checkout/payment (`pay.sandbox.datatrans.com`) | **`/account/orders/{id}/payment?datatransTrxId=…`** (NOT /checkout/payment/success) |
| **Manual** | /cart payment dropdown | None — admin processes offline | /checkout/completed |
| **Pay with points** | /cart payment dropdown | None — uses loyalty balance | /checkout/payment → PROCEED → success/failure |

**Cart-resolver gotcha:** changing payment method (or shipping method) within the same long-lived cart causes the resolver to **append** new shipment/payment rows rather than consolidate. After 2-3 switches, Place Order may consume the wrong row → /checkout/completed shortcut with order in "Payment required" status. **Always start each processor test from a fresh cart** (`removeCart` mutation, or place an order to drain the cart and let it auto-provision a new one).

---

## Payment Processors

### 1. Skyflow (Primary)

**Environment:** QA, Staging
**Priority:** P0 - Critical
**Market Share:** 40% of transactions

**Configuration:**
```bash
# .env variables (canonical card per order-creation-matrix.txt)
SKYFLOW_MASTERCARD=5424000000000015
SKYFLOW_EXPIRY=02/29
SKYFLOW_CVV=900
# Visa not provisioned in QA vault as of 2026-05-04
```

**Storefront flow:**
1. Select "Bank card (Skyflow)" in /cart → Place Order → /checkout/payment
2. Skyflow Elements iframe (`js.skyflow.com/v2.7.4/elements/index.html`) renders all 4 fields in a single iframe
3. Field selectors inside the iframe: `input[name="card_number"]`, `input[name="cardholder_name"]`, `input[name="card_expiration"]` (MM/YY), `input[name="cvv"]`
4. Pay Now → /checkout/payment/success

**Playwright access:** `page.frameLocator('iframe[src*="skyflow.com"]').first().locator('input[name="…"]').fill(…)`

**Test Cards:**

| Card Type | Number | Expiry | CVV | Result | QA Verified |
|-----------|--------|--------|-----|--------|-------------|
| Mastercard (canonical) | 5424000000000015 | 02/29 | 900 | Success | ✅ 2026-05-04 (CO260504-00003 retry, CO260504-00009) |
| Mastercard | 5555555555554444 | 12/2029 | 123 | Success (in docs) | ❌ REJECTED 2026-05-04 — Skyflow vault did not route this PAN |
| Visa | 4242424242424242 | 12/2029 | 123 | Success (in docs) | unverified — likely unrouted |
| Visa (alt) | 4111111111111111 | 12/2029 | 123 | Success (in docs) | unverified |
| Mastercard (alt) | 5200828282828210 | 10/2028 | 100 | Success (in docs) | unverified |
| Amex | 378282246310005 | 06/2030 | 1234 | Success (4-digit CVV) | unverified |
| Discover | 6011111111111117 | 03/2027 | 456 | Success (in docs) | unverified |
| Declined | 4000000000000002 | 12/2029 | 123 | Decline | unverified |
| CVV Fail | 4000000000000127 | 12/2029 | 123 | CVV Error | unverified |
| Processing Error | 4000000000000119 | 12/2029 | 123 | Generic Error | unverified |

**Features:**
- Iframe-based card entry (PCI compliant)
- Tokenization (no plain text card storage)
- Real-time validation
- Support for all major card brands

**API Endpoints:**
- Production: `https://api.skyflow.com/v1/`
- Test: `https://sandbox.skyflow.com/v1/`

**Known Issues:**
- **Skyflow vault on QA only routes the canonical card `5424000000000015` (CVV 900, exp 02/29).** Other Mastercards/Visas in this doc are either unverified or rejected. Always use the canonical card for Skyflow regression unless the team confirms additional PANs.
- `postMessage` origin warning ("DOMWindow target origin mismatch") in console — known noise, non-blocking, observed during normal payment flow.

---

### 2. CyberSource (Secondary)

**Environment:** QA, Staging
**Priority:** P0 - Critical
**Market Share:** 30% of transactions

**Configuration:**
```bash
# .env variables
CYBERSOURCE_CARD=4622943127013705
CYBERSOURCE_EXPIRY=09/2029
CYBERSOURCE_CVV=838
```

**Storefront flow (unique — NO redirect to /checkout/payment):**
1. Select "Bank card (CyberSource)" in /cart payment dropdown
2. **CyberSource Microform v2.0.2 iframes render INLINE on /cart** (Card # in `#cardNumber-container iframe`, CVV in `#securityCode-container iframe`)
3. Cardholder Name + Expiration Date are native parent-page inputs (e.g., `#input-1527`, `#input-1530`)
4. Place Order on /cart → 5-7s processing → /checkout/completed (no /checkout/payment hop)

**Playwright access (debunks suite 039 Edge blocker):**
- Card #: `page.frameLocator('#cardNumber-container iframe').locator('#number').fill('…')`
- CVV: `page.frameLocator('#securityCode-container iframe').locator('#securityCode').fill('…')`
- Expiry/Name: native — fill via `page.locator('#input-XXXX')`
- **Edge handles these cross-origin iframes correctly via `frameLocator`** — the prior "Edge can't access CyberSource cross-origin iframes" caveat in suite 039 is wrong. Verified with order CO260504-00001.

**Test Cards:**

| Card Type | Number | Expiry | CVV | Result | QA Verified |
|-----------|--------|--------|-----|--------|-------------|
| Visa (canonical) | 4622943127013705 | 09/2029 | 838 | Success | ✅ 2026-05-04 (CO260504-00001) |
| Visa (alt) | 4111111111111111 | 12/2029 | 838 | Success (in docs) | unverified |
| Mastercard | 5555555555554444 | 12/2029 | 123 | Success (in docs) | unverified |
| Amex | 378282246310005 | 06/2030 | 1234 | Success (4-digit CVV) | unverified |
| Declined | 4000000000000002 | 12/2029 | 123 | Decline | unverified |
| Invalid | 1234567890123456 | 12/2029 | 123 | Invalid (Luhn fail) | unverified |

**Features:**
- Secure Acceptance Web/Mobile
- Tokenization via iframe (Microform v2.0.2)
- 3D Secure support (optional)
- Fraud detection built-in

**API Endpoints:**
- Production: `https://api.cybersource.com/`
- Test: `https://apitest.cybersource.com/`

**Known Issues:**
- VCST-3387: Special characters in cardholder name may require encoding

---

### 3. Authorize.Net (Tertiary)

**Environment:** QA, Staging
**Priority:** P1 - High
**Market Share:** 20% of transactions

**Configuration:**
```bash
# .env variables
AUTHORIZNET_CARD=4007000000027
AUTHORIZNET_EXPIRY=12/29
AUTHORIZNET_CVV=900
```

**Storefront flow (redirect to /checkout/payment, native inputs):**
1. Select "Bank card (Authorize.Net)" in /cart → Place Order → /checkout/payment
2. Native HTML inputs (no iframe). Field IDs are dynamic (e.g., `#input-916`, `#input-919`, `#input-922`, `#input-925`); locate by `aria-label` (Card number, Cardholder name, Expiration date, Security code)
3. Expiration date format: **MM/YY** (2-digit year, NOT 4-digit)
4. Pay Now → /checkout/payment/success

**Test Cards:**

| Card Type | Number | Expiry | CVV | Result | QA Verified |
|-----------|--------|--------|-----|--------|-------------|
| Visa (canonical, 13-digit) | 4007000000027 | 12/29 | 900 | Success | ✅ 2026-05-04 (CO260504-00002) |
| Mastercard | 5424000000000015 | 02/29 | 900 | Success | unverified — same PAN routable for Skyflow, likely OK |
| Visa (alt) | 4012888818888 | 12/2029 | 123 | Success (in docs) | unverified |
| Amex | 370000000000002 | 06/2030 | 1234 | Success (4-digit CVV) | unverified |
| Discover | 6011000000000012 | 03/2027 | 456 | Success (in docs) | unverified |
| Declined | 4000000000000002 | 12/2029 | 123 | Decline | unverified |

**Features:**
- Accept.js for secure payment
- Customer Information Manager (CIM) for stored cards
- Fraud Detection Suite

**API Endpoints:**
- Production: `https://api.authorize.net/xml/v1/request.api`
- Test: `https://apitest.authorize.net/xml/v1/request.api`

**Known Issues:**
- None currently

---

### 4. Datatrans (3D Secure-capable)

**Environment:** QA only
**Priority:** P1 - High
**Market Share:** 10% of transactions
**Special:** 3D Secure authentication with conditional OTP step-up

**Configuration:**
```bash
# .env variables (canonical card per order-creation-matrix.txt)
DATATRANCE_MASTERCARD=5100001000000014
DATATRANCE_EXPIRY=06/28
DATATRANCE_CVV=123
DATATRANCE_OTP=4000   # Per matrix; 112233 in older docs — only invoked if step-up 3DS fires
```

**Storefront flow (hosted modal — UNIQUE redirect target):**
1. Select "Bank card (Datatrans)" in /cart → Place Order → /checkout/payment
2. /checkout/payment shows splash: "Secure Payment — You will be redirected to a secure Datatrans payment window. PAY NOW - $X.XX"
3. PAY NOW → modal opens with iframe `name="datatransPaymentFrame"` at `pay.sandbox.datatrans.com/upp/jsp/upStart_1.jsp`
4. Modal shows payment-method tiles: Visa, Mastercard, Amex, PayPal, Diners, Discover, Alipay+
5. Pick brand tile → card form in same iframe with `#cardNumber`, `#expiry` MM/YY (or `#cardExpirationMonth` + `#cardExpirationYear` split), `#cvv`
6. Visible submit button text is "Pay USD {amount}" (the form's `<input type=submit>` is hidden — click the visible button instead)
7. Approval redirects to **`/account/orders/{orderId}/payment?datatransTrxId={tx}`** showing "PAYMENT SUCCESSFUL — Status: Processing". This is **NOT** the typical `/checkout/payment/success` URL — handle both patterns when scripting waitForURL.

**Playwright access:**
- Frame: `page.frame({ name: 'datatransPaymentFrame' })`
- Tile click: `dt.locator('text=Mastercard').first().click()`
- Card #: `dt.locator('#cardNumber').fill('5100001000000014')`
- Expiry: `dt.locator('#expiry').fill('06/28')` (or split month/year fields)
- CVV: `dt.locator('#cvv').fill('123')`
- Submit: `dt.locator('text=Pay USD ' + total).click()` (the visible button, NOT `input[type=submit]`)

**Test Cards:**

| Card Type | Number | Expiry | CVV | OTP | Result | QA Verified |
|-----------|--------|--------|-----|-----|--------|-------------|
| Mastercard (canonical) | 5100001000000014 | 06/28 | 123 | 4000 (conditional) | Success — frictionless on $299.99 sandbox | ✅ 2026-05-04 (CO260504-00010) |
| Mastercard (3DS challenge) | 5123456789012346 | 12/2029 | 100 | 112233 | Success with OTP (older doc value) | unverified — OTP behavior depends on amount/risk score |
| Visa | 4111111111111111 | 12/2029 | 123 | N/A | Success (no 3DS in docs) | unverified |
| Mastercard (alt) | 5200000000000007 | 10/2028 | 200 | N/A | Success (no 3DS in docs) | unverified |
| Declined | 4000000000000002 | 12/2029 | 123 | N/A | Decline | unverified |

**Features:**
- 3D Secure (3DS) authentication — **conditional step-up**, not always invoked
- OTP verification flow when challenged
- Multi-method modal (Visa/Mastercard/Amex/PayPal/Diners/Discover/Alipay+)
- Fallback to non-3DS cards

**OTP Testing:**
- **Test OTP per matrix:** 4000
- **Test OTP per legacy docs:** 112233 (used by 5123456789012346 card specifically)
- **OTP only invoked when Datatrans returns a step-up 3DS challenge** — for `5100001000000014 / $299.99` in QA sandbox no OTP step appeared (frictionless approval). Only fill the OTP field when/if the step-up screen renders.
- **OTP Timeout:** 5 minutes
- **Invalid OTP:** Wrong value will fail the transaction

**API Endpoints:**
- Test: `https://sandbox.datatrans.com/` (note correct spelling: Datatrans, not Datatrance — module config uses `DatatransPaymentMethod`)

**Known Issues:**
- OTP modal may timeout if network is slow (increase timeout to 60s)
- Console errors include 4× PayPal CSP `frame-src` violations (`https://www.sandbox.paypal.com/`) — report-only mode, cosmetic. Datatrans CSP entry (`https://3d.sandbox.datatrans.com`) is correctly listed.
- Stale-cart processor switching can cause Place Order to skip the Datatrans modal entirely → /checkout/completed with order in "Payment required" status. **Workaround:** start each Datatrans test from a fresh cart.

---

### 5. Manual (offline / cash)

**Environment:** QA, Staging
**Priority:** P2 - Medium
**Market Share:** Internal / B2B special arrangements

**Storefront flow:**
1. Select "Manual" in /cart → Place Order → /checkout/completed (no card capture, no /checkout/payment hop)
2. Order is created in standard flow; admin marks paid offline via Backend Orders module

**Test Cards:** N/A — no card data required.

**QA Verified:** ✅ 2026-05-04 (CO260504-00006)

**Known Issues:** None.

---

### 6. Pay with Points (loyalty)

**Environment:** QA only (loyalty module enabled)
**Priority:** P2 - Medium

**Storefront flow:**
1. Select "Pay with points" in /cart → Place Order → /checkout/payment
2. Page shows "You're attempting to pay for the order using points. Your current points balance is X." with PROCEED button
3. PROCEED:
   - If sufficient balance → /checkout/payment/success
   - If insufficient → /checkout/payment/failure (order created in unpaid state)

**Test Cards:** N/A.

**QA Verified:** ⛔ Failure path verified 2026-05-04 (CO260504-00005 — Carlos has 0 points balance, expected fail). Success path NOT verified — no test fixture provides a B2B user with non-zero loyalty points.

**Test-data gap:** Add a fixture user (or top up Carlos via Backend → Loyalty admin) before next regression to exercise the success path.

**Known Issues:**
- No fixture for success path on QA as of 2026-05-04.

---

## Test Scenarios by Processor

### Priority P0 (Critical) - Must Test Before Release

| Scenario | Skyflow | CyberSource | Authorize.Net | Datatrance |
|----------|---------|-------------|---------------|------------|
| Happy Path Visa | ✅ MUST | ✅ MUST | ✅ MUST | ✅ MUST |
| Happy Path Mastercard | ✅ MUST | ✅ MUST | ✅ MUST | ✅ MUST |
| Declined Card | ✅ MUST | ✅ MUST | ✅ MUST | ✅ MUST |
| 3D Secure/OTP | N/A | Optional | Optional | ✅ MUST |
| Special Chars in Name | ✅ MUST | ✅ MUST | ✅ MUST | ⚠️ Optional |

### Priority P1 (High) - Regression Testing

| Scenario | Skyflow | CyberSource | Authorize.Net | Datatrance |
|----------|---------|-------------|---------------|------------|
| Amex (4-digit CVV) | ✅ Test | ✅ Test | ✅ Test | N/A |
| Invalid Card Number | ✅ Test | ✅ Test | ✅ Test | ⚠️ Optional |
| Incorrect CVV | ✅ Test | ✅ Test | ⚠️ Optional | ⚠️ Optional |
| Expired Card | ✅ Test | ⚠️ Optional | ⚠️ Optional | ⚠️ Optional |
| Unicode in Name | ✅ Test | ⚠️ Optional | ⚠️ Optional | ⚠️ Optional |

---

## Environment-Specific Details

### QA Environment
- **URL:** https://vcst-qa-storefront.govirto.com
- **Admin:** https://vcst-qa.govirto.com
- **All 4 processors:** Skyflow, CyberSource, Authorize.Net, Datatrance
- **Test mode:** All cards in test mode
- **Email notifications:** Sent to Mailhog (not real emails)

### Staging Environment
- **URL:** https://virtostart-demo-store.govirto.com
- **Admin:** https://virtostart-demo-admin.govirto.com
- **3 processors:** Skyflow, CyberSource, Authorize.Net (NO Datatrance)
- **Test mode:** Yes
- **Email notifications:** Real emails sent

### Production Environment
- **Processors:** Skyflow, CyberSource, Authorize.Net
- **Test cards:** NOT ALLOWED - Real cards only
- **PCI compliance:** Enforced

---

## Security & PCI Compliance

### Payment Form Security Checklist

- [ ] All payment fields in secure iframe (not plain HTML inputs)
- [ ] HTTPS enforced (no HTTP allowed)
- [ ] Card number never sent to backend in plain text
- [ ] Tokenization used for all card storage
- [ ] CVV never stored (even tokenized)
- [ ] PCI SAQ-A compliance (if using iframe tokenization)
- [ ] Browser console does not log card data
- [ ] Network requests do not contain plain text card data
- [ ] Saved cards show last 4 digits only
- [ ] Session timeout after 15 minutes of inactivity

### Testing Security

**Verify with Browser DevTools:**

1. Open DevTools → Network tab
2. Enter test card and submit
3. Inspect all XHR/Fetch requests
4. **Verify:** Card number appears only as token (e.g., `tok_1A2B3C...`)
5. **Verify:** CVV never appears in any request
6. **Verify:** All requests use HTTPS

**Console Log Check:**
```javascript
// Should NOT see any of these in console:
4242424242424242  // ❌ Full card number
123               // ❌ CVV
12/2029           // ⚠️ Expiry (less critical but avoid)
```

---

## Troubleshooting

### Common Issues

**Issue:** Payment form doesn't load
**Solution:** Check network for iframe blocking, verify processor is configured

**Issue:** Declined card shows generic error
**Solution:** Check processor-specific error codes, improve error message mapping

**Issue:** Payment succeeds but order not created
**Solution:** Check webhook configuration, verify order creation API

**Issue:** 3D Secure OTP modal doesn't appear (Datatrance)
**Solution:** Verify 3DS-enabled card, check popup blocker settings

**Issue:** Saved payment methods not displaying
**Solution:** Check tokenization service, verify user has saved cards

---

## Analytics Events

### Google Analytics 4 Events

Payment-related events to track:

| Event | Trigger | Properties |
|-------|---------|------------|
| `begin_checkout` | Checkout page load | items, value, currency |
| `add_payment_info` | Payment method selected | payment_type |
| `purchase` | Payment successful | transaction_id, value, items, tax, shipping |
| `payment_error` | Payment failed | error_code, error_message, payment_type |

**Testing Analytics:**
1. Open browser console
2. Filter network by `google-analytics` or `gtag`
3. Trigger payment flow
4. Verify events fire with correct properties

---

## Test Data References

- **Test Cards:** `test-data/payment/test-cards.csv`
- **Test Scenarios:** `test-data/payment/payment-scenarios.csv`
- **Test Users:** `test-data/users/test-users.csv`
- **Test Addresses:** `test-data/addresses/us-addresses.csv`

---

## Contact

**Payment Integration Issues:** Contact DevOps team
**Test Data Questions:** See `.claude/agents/qa/test-management-specialist`
**Processor Support:** See processor-specific documentation links above

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-06 | test-management-specialist | Initial payment processor guide created |
| 1.1 | 2026-05-04 | qa-testing-expert | End-to-end verification of all 5 active processors via Carlos Rodriguez / BuildRight (orders CO260504-00001/00002/00009/00010/00006). Added per-processor storefront flow walkthroughs + Playwright access patterns. Switched canonical cards to `order-creation-matrix.txt` source: Skyflow Mastercard 5424000000000015 / 02/29 / 900 (only routable card in QA vault — 5555 rejected); CyberSource Visa 4622943127013705 / 09/2029 / 838 with verified Microform iframe accessibility on Edge (debunked suite 039 caveat); Authorize.Net Visa 4007000000027 / 12/29 / 900; Datatrans Mastercard 5100001000000014 / 06/28 / 123 with hosted modal flow at `pay.sandbox.datatrans.com/upp/jsp/upStart_1.jsp` and unique post-payment redirect to `/account/orders/{id}/payment?datatransTrxId=…`. Added Manual + Pay-with-points sections. Added QA Verified column to all card tables. Added cart-resolver gotcha (fresh cart per processor). |
