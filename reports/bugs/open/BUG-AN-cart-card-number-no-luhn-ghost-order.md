# BUG: Authorize.Net cart form accepts a Luhn-invalid (length-valid) card number and creates a ghost unpaid order

## Status: CONFIRMED

**Severity: Low** (UX consistency + minor data hygiene — no charge, recoverable). **By-design candidate — product decision needed.**

**Env:** vcst-qa @ Platform 3.1037.0 · Theme 2.51.0-pr-2315-3425 · VirtoCommerce.AuthorizeNetPayment 3.1002.0

## Summary
On the Authorize.Net cart-inline payment form, a card number that passes length validation (12–19 digits) but **fails the Luhn check** (e.g. `1234567890123456`) does not produce a client-side error: "Place order" enables, and clicking it creates an order via `createOrderFromCart`, fires GA4 `place_order`, and redirects to `/checkout/payment`. The card is **never charged** (Accept.js blocks tokenization — no `api2.authorize.net` POST), but an unpaid "Payment required" order is left behind. CyberSource and Skyflow (hosted-iframe processors) block this client-side and create no order.

## Steps to Reproduce
1. Sign in; add an in-stock item to cart; go to `/cart`.
2. Select **Bank card (Authorize.Net)**; wait for the inline Accept.js form.
3. Card number `1234567890123456` (length-valid, Luhn-invalid), expiry `12/29`, CVV `123`, cardholder name.
4. Observe "Place order" becomes **enabled**; click it.

**Expected (consistency with CyberSource/Skyflow):** inline "invalid card number" error, "Place order" stays disabled, no order created — user remains on `/cart`.
**Actual:** order `c92e2e8f-9a15-4353-a8c7-3706c6d1e08b` created (unpaid), GA4 `place_order` fired, redirect to `/checkout/payment`. No charge (no `api2.authorize.net` POST). No `purchase` event (correct).

Evidence: `reports/regression/REG-2026-06-15-1845/PAY-AN-012-FAIL-luhn-no-client-validation.png`

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | `bank-card-form.vue` number rule is length-only; order created before tokenization |
| 2. Backend Admin | N/A | order would show unpaid — not the defect locus |
| 3. GraphQL xAPI | N/A | `createOrderFromCart` behaves as designed (creating the order is intended) |
| 4. Platform REST API | N/A | — |

**Owning layer:** Layer 1 — Storefront (vc-frontend)

## Root Cause Analysis
`client-app/shared/payment/components/bank-card-form.vue` validation schema (the **shared** form used by Authorize.Net):
```
number: yup.string().required().min(12).max(19).label(...)   // length only — NO Luhn check
```
Luhn validation is intentionally delegated to Accept.js at tokenization time (same design note the team added for the expiry `not-expired` test in PR #2309). In the cart flow, `useCheckout.ts` runs `createOrderFromCart` **before** `finalizePayment`/tokenization, so a length-valid-but-Luhn-invalid number passes the form, creates the order, then fails tokenization → unpaid order + `/checkout/payment` redirect.

By contrast, CyberSource (Microform) and Skyflow (Skyflow Elements) render **hosted iframe** card fields that validate the number client-side and keep "Place order" disabled — so PAY-CS-004 / PAY-SKY-003 expect "no order created". Authorize.Net uses the plain `VcInput`-based shared form, hence the divergence.

**Why "by-design candidate":** the shared form deliberately defers card-number validation to the processor SDK. PR #2309 added expiry gating but not number Luhn gating. This may be intentional (Accept.js owns number validation) — but the user-visible result (ghost unpaid order + confusing redirect on a typo) is inconsistent with the iframe processors. Needs a product call: add Luhn to the shared form's number rule, or gate `createOrderFromCart` on successful tokenization for AN.

## Related
- Likely the same root area as the historical `BUG-AN-cart-no-client-card-validation` (expiry portion fixed by VCST-5162 PR #2309; card-number Luhn portion not addressed).
- Surfaced by regression REG-2026-06-15-1845, case PAY-AN-012. **PAY-AN-012's expected result is itself incorrect** (it assumed iframe-style client validation) and should be corrected to match the by-design behavior regardless of the product decision here.

## Notes
- Sandbox order `c92e2e8f-9a15-4353-a8c7-3706c6d1e08b` is an orphan unpaid order from this repro — cancel in the orphan-order sweep.
- Not filed to JIRA pending the by-design decision. Do NOT file as High — no charge occurs, the order is recoverable.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Component / module:** `shared/payment/components/bank-card-form.vue` (number yup rule) + `shared/checkout/composables/useCheckout.ts` (create-order-before-tokenize sequence)
- **RCA anchor:** `bank-card-form.vue` `number: yup.string().required().min(12).max(19)` — no Luhn
- **Routing confidence:** MEDIUM — repo/locus are certain; whether it's a defect vs. intended (Accept.js owns Luhn) is a product decision, so this may be Gate-0 BAIL (by-design) at `/qa-fix`.
