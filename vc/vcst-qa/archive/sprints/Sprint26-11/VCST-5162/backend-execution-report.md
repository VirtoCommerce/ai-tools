# VCST-5162 Backend Execution Report — Authorize.Net AllowCartPayment

**Env:** vcst-qa | Platform 3.1032.0, vc-module-authorize-net 3.1001.0-pr-12-c821 | 2026-06-05
**Browser:** playwright-edge (Admin SPA) | API: canonical graphql-runner + REST OAuth2

## Per-check verdict

| Check | Verdict | Evidence |
|-------|---------|----------|
| 1. CART-PAY-GQL-004 (runner) | **PASS** (8/8) | `reports/regression/graphql-evidence/CART-PAY-GQL-004-1780672178635.json` |
| 2. xAPI availablePaymentMethods probe | **PASS** | covered by runner read_cart (ORG_USER, B2B-store) — matrix below |
| 3a. AN module version | **PASS** | Admin → Modules: `3.1001.0-pr-12-c821` |
| 3b. AllowCartPayment store setting | **PASS (by design — not a UI toggle)** | see note |
| 4. AN order transaction shape (ORD-018) | **PASS w/ bug candidate** | CO260605-00014/00015 authorized; gateway tx record MISSING |
| 5. Cleanup | **DONE** | 5 orders cancelled |

## allowCartPayment matrix (cart.availablePaymentMethods, B2B-store, 6 methods)

| code | allowCartPayment | expected | match |
|------|-----------------|----------|-------|
| AuthorizeNetPaymentMethod | **true** | true | ✅ |
| CyberSourcePaymentMethod | true | true | ✅ |
| SkyflowPaymentMethod | true | true | ✅ |
| DatatransPaymentMethod | false | false (redirect) | ✅ |
| DefaultManualPaymentMethod | false | false | ✅ |
| LoyaltyPaymentMethod | false | false | ✅ |

AC-1 confirmed at the xAPI layer: `AuthorizeNetPaymentMethod.allowCartPayment=true`. Schema field `allowCartPayment` present on `PaymentMethodType` (graphql-schema.md L416).

## Check 3b note (not a defect)
The B2B-store Authorize.Net payment-method has 5 settings (Mode=test, Payment action type=Authorization/Capture, Process payment action URL, AcceptJS Production/Sandbox path). There is **no "AllowCartPayment" store-level toggle** — per the CSV case, VCST-5162 hardcodes `AllowCartPayment=true` on the `AuthorizeNetPaymentMethod` class and exposes it via the xAPI schema field (same pattern as CyberSource/Skyflow). The capability is therefore verified at the schema layer (Check 1/2), not as an Admin setting. Working as designed.

## Check 4 — transaction shape findings (BUG CANDIDATE — do not file, recorded here)
Two AN orders reached **Authorized / Processing** during this run: CO260605-00014 (210.00 USD), CO260605-00015. Both have:
- Admin → Payment → "Payment gateway transactions" blade = **"No data"**
- REST `customerOrders/{id}` → `inPayments[].transactions = []`, `isApproved=false`

Apples-to-apples comparison (same env, same projection):
- Authorized **CyberSource** order CO260604-00006: `transactions.length=1` (id f1b117cd…, hasResponse=true), `isApproved=true`
- Paid **Skyflow** order CO260605-00007: `transactions.length=1` (id 6c9c1240…, status=Approved)
- Authorized **Authorize.Net** CO260605-00014/00015: `transactions.length=0`, `isApproved=false`

**Finding:** Authorize.Net (PR#12) does NOT persist a `PaymentGatewayTransaction` audit record on authorize, where CyberSource/Skyflow do. The earlier voided AN orders (00010/00011) also had empty `transactions[]`. Order authorizes and is usable, and void-on-cancel works (00014/00015 → Voided), but the gateway transaction trail is absent — affects reconciliation/refund traceability. Second-source confirmed (REST + Admin UI agree). Severity: Medium. (Cross-ref BL-ORD-001/006 — state machine itself transitions correctly; the gap is the missing transaction record, not an illegal transition.)

## Check 5 — cleanup
All 5 run orders by slot-1 pool user "Agent Chrome" cancelled via Admin (reason "VCST-5162 test order cleanup"):

| Order | Method / pre-cancel pay status | post-cancel |
|-------|-------------------------------|-------------|
| CO260605-00012 | AN / New | Cancelled (pay Cancelled) |
| CO260605-00013 | Manual / New | Cancelled (pay Cancelled) |
| CO260605-00014 | AN / Authorized | Cancelled (pay **Voided**) |
| CO260605-00015 | AN / Authorized | Cancelled (pay **Voided**) |
| CO260605-00016 | AN / New | Cancelled (pay Cancelled) |

No slot-2/slot-3 orders were created during the run. Pre-existing AN orders CO260605-00010/00011 ("SmokeTest RunnerQA", created before run start) left untouched.

## Notes
- Temp REST poll helpers were created under `tests/Sprint26-11/VCST-5162/` (poll-orders.mjs, order-detail.mjs, order-raw.mjs) — `rm` denied by sandbox; please delete manually.
- Console: 6 benign Angular errors on Admin order blades (pre-existing, not VCST-5162).
