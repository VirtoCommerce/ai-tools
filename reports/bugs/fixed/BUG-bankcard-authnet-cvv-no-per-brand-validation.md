# BUG: Shared bank-card form (Authorize.Net) has no per-brand CVV validation — 3-digit CVV on Amex enables Place order `[Low / P3-ux]`

## Status: READY_TO_SUBMIT
**JIRA:** VCST-5344 (filed 2026-06-23)

**Env:** vcst-qa @ Theme 2.52.0-pr-2335-f5b1-f5b11db6 (Authorize.Net AllowCartPayment / VCST-5162 cart-embedded flow). Browser: Edge.

## Summary
The shared manual card form `client-app/shared/payment/components/bank-card-form.vue` (used by Authorize.Net via `BankCardForm`) validates the CVV with a brand-agnostic rule `securityCode: yup.string().required().min(3).max(4)` plus `minlength=3 / maxlength=4` and mask `"####"`, and does **no card-brand detection at all**. A 3-digit CVV on an American Express card (which requires 4) passes client validation and enables **Place order**; the malformed CVV is only caught later by Accept.js. Mirror asymmetry: a 4-digit CVV on Visa/Mastercard (which need 3) also passes. Same defect *class* as VCST-5202 (Skyflow) but a different component and mechanism — Skyflow at least detects the brand for display; this shared form has zero brand awareness (no card icon, CVV placeholder stays `"111"`, generic 4-4-4-4 grouping even for Amex).

## STR (Authorize.Net cart-embedded form, signed in, 1 item in cart)
1. Sign in as `{{USER_EMAIL}}`; add an in-stock item; go to `/cart`.
2. Payment method → **Bank card (Authorize.Net)** → inline VcInput card form renders on `/cart` (not an iframe).
3. Card number: Amex `@td(AUTHORIZENET_AMEX.number)` (`370000000000002`); Cardholder: `Maria Garcia`; Expiration: `06 / 30`; Security code: **`123`** (3 digits).
4. Observe the Security code field state and the **Place order** button.
5. Click **Place order**.

## Expected vs Actual
- **Expected:** Security code field is invalid for an Amex card with a 3-digit CVV ("Amex security code is 4 digits"); **Place order** stays disabled. The CVV constraints (mask/maxlength/placeholder) reflect the detected brand.
- **Actual:** field shows **valid**, **Place order ENABLES**; clicking pre-creates an unpaid order and only then does Accept.js load and reject the malformed CVV (`E_WC_15`). Repro left ghost order **CO260623-00011** (`d61bc267-…`, status "Payment required"). 4-digit CVV on Visa `4007000000027` also passes validation + enables Place order (mirror asymmetry).

## Evidence (live repro 2026-06-23, real-user UI interaction)
- `reports/bugs/screenshots/BUG-AN-cvv-brand-amex-3digit-enabled.png` — Amex + 3-digit CVV valid, Place order enabled (core proof)
- `reports/bugs/screenshots/BUG-AN-cvv-brand-visa-4digit-enabled.png` — Visa + 4-digit CVV valid + enabled (mirror)
- `reports/bugs/screenshots/BUG-AN-cvv-brand-ghost-order-payment.png` — `/checkout/payment` after submit, exposing the pre-created order
- Accept.js (`jstest.authorize.net/v1/AcceptCore.js`) loads **only after** Place order is clicked → confirms the client form forwarded the malformed CVV downstream. The `E_WC_15` toast was transient before the redirect; the ghost order is the stronger downstream proof.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | 3-digit CVV + Amex passes client validation; Place order enables; no brand detection |
| 2. Backend Admin | N/A | order shows unpaid — not the defect locus |
| 3. GraphQL xAPI | N/A | `createOrderFromCart` behaves as designed |
| 4. Platform REST / Accept.js | PASS | Accept.js correctly rejects the malformed CVV (`E_WC_15`) — downstream, after the order exists |

**Owning layer:** Layer 1 — Storefront (client-side validation in the shared card form)

## Root Cause Analysis
`client-app/shared/payment/components/bank-card-form.vue`:
```
const securityCodeMaskOptions = { mask: "####" };           // 4-digit mask, brand-agnostic
securityCode: yup.string().required().min(3).max(4)...      // accepts 3 OR 4 for ANY brand
// VcInput: minlength="3" maxlength="4" placeholder="111"   // static, never brand-conditional
```
The component has **no BIN/IIN brand detection** — it never derives the required CVV length from the card number. So Amex (needs 4) accepts 3, and Visa/Mastercard (need 3) accept 4. Card-number Luhn is likewise delegated downstream (see sibling `BUG-AN-cart-card-number-no-luhn-ghost-order.md`). Combined with the VCST-5162 cart flow (`createOrderFromCart` runs before tokenization), each validation miss also yields an unpaid ghost order.

**Fix direction (for `/qa-fix` Gate 0 to weigh):** add brand detection from the card-number prefix (Amex `34`/`37` → 4-digit CVV, all others → 3) and make the `securityCode` yup rule + mask + `maxlength`/`placeholder` brand-conditional. Note: unlike VCST-5202 there is **no SDK** here supplying the brand — the fix must introduce the detection itself.

## Regression coverage
Suite `040b-payment-authorizenet.csv` has the cart-embedded cases (PAY-AN-010…013) but **no per-brand CVV case** (gap analogous to Skyflow's PAY-SKY-015). Add `PAY-AN-0xx` asserting per-brand CVV gating once fixed. Existing component test `bank-card-form.test.ts` covers card-number + expiry only — no CVV tests, so coverage can be added without touching it.

## Notes
- Ghost order **CO260623-00011** is an orphan unpaid order from this repro — cancel in the orphan-order sweep.
- Credential var is `USER_PASSWORD` (not `USER_PASSWORD_VCST`).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Component / module:** shared payment form `client-app/shared/payment/components/bank-card-form.vue` (used by Authorize.Net `BankCardForm`)
- **RCA anchor:** `securityCode: yup.string().required().min(3).max(4)` + `securityCodeMaskOptions = { mask: "####" }` + the absence of any card-brand detection in `bank-card-form.vue`
- **Routing confidence:** HIGH — repo + exact locus confirmed against `dev`. Gate-0 caveat: the fix is *additive* (introduce brand detection), not a one-line tweak — `/qa-fix` must judge whether it stays minimal/localized enough to auto-fix.
