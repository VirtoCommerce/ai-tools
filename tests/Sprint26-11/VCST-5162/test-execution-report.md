# VCST-5162 Test Execution Report — Authorize.Net AllowCartPayment (inline /cart form)

**Env:** vcst-qa @ theme `2.51.0-pr-2309-ba0b-ba0bcf37` (verified in footer = correct new bundle, stale-cache caveat cleared), module AuthorizeNetPayment 3.1001.0-pr-12-c821, Platform 3.1032.0
**Browser:** playwright-chrome | **User:** qa-agent-slot1@virtocommerce.com (slot-1 pool) | **Date:** 2026-06-05
**Card data:** `@td(AUTHORIZENET_VISA.*)` (valid Visa, exp 12/29, cvv 900) / `@td(CYBERSOURCE_INVALID.number)` (Luhn-fail) — resolved from `test-data/payment/test-cards.csv`, never hardcoded in report.

## Results

| Case | Verdict | Notes |
|------|---------|-------|
| PAY-AN-010 | PASS | Inline Accept.js form renders on /cart (card #, cardholder, expiry MM/YY, CVV). URL stays /cart. Accept.js loaded 200 from jstest.authorize.net. Place order disabled while empty. No payment console errors. |
| PAY-AN-011 | PASS | AN card filled → switch to **Manual** unmounts the AN form; no POST to authorize.net on switch or on Place order. Order **CO260605-00013** created via Manual (status "New"). useCheckout.ts allowCartPayment guard works. |
| PAY-AN-012 | **FAIL** | Deviation **persists on ba0bcf37**. Luhn-invalid card: NO inline error, Place order stayed ENABLED, clicking it created unpaid order **CO260605-00012** ("Payment required") and redirected to /checkout/payment. No client-side Luhn validation. Same symptom as old build (CO260605-00010). No AN charge POST (gateway never reached). |
| PAY-AN-013 | PASS | Place order disabled on empty; disabled with only card # (partial); enabled only after all 4 fields valid. |
| PAY-AN-014 | PASS | Valid card → Place order → /checkout/completed (no /checkout/payment redirect). POST apitest.authorize.net/xml/v1/request.api → 200. Order **CO260605-00014** "Processing" (paid). Cart cleared. |
| PAY-AN-015 | SKIPPED-tooling | playwright-chrome MCP exposes no request-route/abort tool; browser_evaluate is blocked by real-user hook. Cannot block js.authorize.net. Not a product result. |
| PAY-AN-016 | PASS | GA4 (network beacons): exactly ONE `purchase` event for txn 6f816a7f… (value 45, shipping 150, tax 39) + one `place_order`. No component double-fire (the per-event network duplication shares identical `_s` sequence = sendBeacon retry, not a second fire). Order **CO260605-00015** "Processing". |
| PAY-AN-017 | BLOCKED | PRE-CHECK: /checkout/review redirects → /cart ⇒ `checkout_multistep_enabled=false`. Per case semantics = BLOCKED, not FAIL. |

## Exploratory additions (coordinator handoff)

| Item | Verdict | Notes |
|------|---------|-------|
| Q1 — Past-expiry second-source (Chrome) | **CONFIRMED bug (reproduces Firefox)** | Valid card + PAST expiry `01/20`: NO inline error, Place order ENABLED. Clicking it created unpaid order **CO260605-00016** ("Payment required", $286.80), `place_order` fired, NO `purchase`, NO AN charge POST, redirect to /checkout/payment. **Same root cause as PAY-AN-012** — cart form does no client-side card validation (Luhn or expiry); only month-range (13/29) is caught. |
| Coupon survival w/ AN form open | PASS | Card fields filled, applied coupon "super" ($30-off). AN "Payment card" form survived re-render (all values intact incl. cardholder "John Smith"), Place order stayed enabled. Total re-synced: Subtotal $21 − Discount $21 + Tax $30 + Ship $150 = **$180.00**. |

## Bug candidate (report-only, NOT filed)

**No client-side card validation on AN inline /cart form (ba0bcf37).** Invalid-Luhn (PAY-AN-012) AND past-expiry (Q1) both: bypass validation, keep Place order enabled, create an unpaid "Payment required" order, then fall back to /checkout/payment. Single root cause. The ba0bcf37 finalize guard did not add card-field validation. Severity: High (creates ghost/unpaid orders + confusing UX; revenue-adjacent). Suggest one ticket covering both Luhn + expiry. Month-range validation (13/xx) does work.

## Orders created (for backend admin cleanup)

| Order | Status | Case | Amount |
|-------|--------|------|--------|
| CO260605-00012 | Payment required (ghost) | PAY-AN-012 | $205.20 |
| CO260605-00013 | New (Manual) | PAY-AN-011 | $286.80 |
| CO260605-00014 | Processing (AN paid) | PAY-AN-014 | $210.00 |
| CO260605-00015 | Processing (AN paid) | PAY-AN-016 | $234.00 |
| CO260605-00016 | Payment required (ghost) | Q1 expired-date | $286.80 |

Abandoned cart left with 1× Fanta Orange 500ml (Clear cart did not fully clear; harmless, reset on next RESET_CART).

## Evidence

Screenshots (repo root + `test-results/chrome/`): `PAY-AN-010-cart-an-selected.png`, `PAY-AN-012-invalid-card-state.png`, `PAY-AN-012-redirect-checkout-payment.png`, `PAY-AN-014-order-completed.png`, `coupon-survival-an-form.png`. HAR auto-captured under `test-results/chrome/har/`. Console errors during run were benign demo-CDN image 404s (`starmarket-platform.demo.govirto.com`) only — no payment JS exceptions.
