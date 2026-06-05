# BUG: Skyflow card form has no per-brand CVV length validation — 3-digit CVV on Amex enables Place order `[Low / P3-ux]`

## Status: READY_TO_SUBMIT
**JIRA:** VCST-5202 (filed 2026-06-05)

**Env:** vcst-qa @ Platform 3.1032.0, theme 2.51.0-pr-2308 (Skyflow cart-embedded AllowCartPayment flow / VCST-5009)

## Summary
The Skyflow card form's CVV validation uses the generic storefront-set regex `^[0-9]{3,4}$` and is not wired to the detected card brand. A 3-digit CVV on an American Express card (which requires 4 digits) passes client validation and enables Place order; submitting yields a processor decline instead of an inline fix-it message. Because the VCST-5009 cart flow pre-creates the order on Place order, the user is also left with an unpaid "Payment required" order in their history. Mirror asymmetry exists too: a 4-digit CVV on Mastercard passes validation. Brand detection itself works (Amex icon + 4-6-5 grouping) but is display-only; the CVV placeholder stays "111" (3-digit) even for Amex.

## STR (cart-embedded Skyflow form, signed in, 1 item in cart)
1. /cart → payment method `Bank card (Skyflow)` → `Add new card`
2. Card number: Amex test card `@td(SKYFLOW_AMEX.number)` (e.g. 370000000000002 used in repro) — brand icon switches to Amex, 4-6-5 grouping applied
3. Cardholder: any; Expiration: 02/29; Security code: **`123`** (3 digits)
4. Observe field state and `Place order` button
5. Click `Place order`

## Expected vs Actual
- **Expected:** Security code field marks invalid for an Amex card with a 3-digit CVV ("Amex security code is 4 digits"); `Place order` stays disabled. CVV placeholder reflects the detected brand (1111 for Amex).
- **Actual:** field shows valid, `Place order` ENABLES; submit pre-creates order **CO260605-00009** and returns processor decline `isSuccess:false` "Your transaction was declined: This transaction has been declined. (65)". 1–2-digit CVVs are correctly blocked. 4-digit CVV on MC 5424…0015 also passes validation (not submitted).

## Evidence (live repro 2026-06-05, real-user UI interaction + payload capture)
- B-series validation ladder + payloads: `tests/Sprint26-11/VCST-5009/amex-cvv-probe.md`, screenshots `VCST-5009-{A..E}-*.png`
- `authorizePayment` (payment PI260605-00009): identical decline (65) for CVV `123` and `1234` — on this QA env the vault rejects the Amex card itself, so the demonstrated harm is the decline path; on production stores with full brand support the harm is real authorization attempts with malformed CVVs.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | 3-digit CVV + Amex passes client validation; button enables |
| 2. Backend Admin | N/A | not admin-visible |
| 3. GraphQL xAPI | PASS | CVV tokenized + forwarded correctly; authorizePayment responds per processor |
| 4. Platform REST API | N/A | processor-side behavior correct |

**Owning layer:** Layer 1 — Storefront (client-side validation config)

## Root Cause Analysis
`client-app/shared/payment/components/payment-processing-skyflow.vue` defines `const CVV_REGEX = "^[0-9]{3,4}$"` and passes it into the Skyflow element config — a static brand-agnostic rule. The Skyflow SDK already detects the brand (icon/grouping prove it); the storefront never derives CVV length from it. Fix: brand-conditional CVV rule (AMEX → `^[0-9]{4}$`, others → `^[0-9]{3}$`) + brand-aware CVV placeholder. Compounding factor: VCST-5009 cart flow pre-creates the order, so each validation miss now also produces an unpaid order.

## Regression coverage
Suite `040-payment-processors.csv` → **PAY-SKY-015** asserts correct per-brand behavior; stays red until fixed.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Component / module:** Skyflow payment component (`client-app/shared/payment/components/payment-processing-skyflow.vue`)
- **RCA anchor:** `CVV_REGEX` constant in payment-processing-skyflow.vue (introduced/retained in PR #2308)
- **Routing confidence:** HIGH
