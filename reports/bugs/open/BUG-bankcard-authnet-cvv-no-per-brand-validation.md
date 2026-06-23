# BUG: Bank card form has no per-brand CVV length validation — 3-digit CVV on Amex enables Place order (Authorize.Net) `[Low / P3-ux]`

## Status: DRAFT (not filed)
**JIRA:** none yet — draft for `/qa-bug` → `/qa-fix`. Sibling of VCST-5202 (Skyflow), different code site.

**Env:** vcst-qa @ vc-frontend `dev` (Authorize.Net cart-embedded AllowCartPayment flow / VCST-5162)

## Summary
The shared manual-entry card form `bank-card-form.vue` (used by the Authorize.Net processor) validates the security code with a brand-agnostic rule `min(3).max(4)` and has **no card-brand detection at all**. A 3-digit CVV on an American Express card (which requires 4 digits) passes client validation and enables Place order; the malformed CVV is only rejected later by Accept.js tokenization (error `E_WC_15`). Mirror asymmetry: a 4-digit CVV on Visa/Mastercard (which require 3) also passes. This is the same class of defect as VCST-5202 (Skyflow), but a separate component and mechanism.

## STR (cart-embedded Authorize.Net form, signed in, 1 item in cart)
1. /cart → payment method `Bank card (Authorize.Net)` → manual card form renders (`bank-card-form.vue`)
2. Card number: Amex test card `@td(AUTHNET_AMEX.number)` (Amex prefix 34/37)
3. Cardholder: any; Expiration: a valid future date; Security code: **`123`** (3 digits)
4. Observe field state and `Place order` button
5. (optional) Click `Place order` → Accept.js returns `E_WC_15` (invalid CVV) inline

## Expected vs Actual
- **Expected:** Security code marks invalid for an Amex card with a 3-digit CVV; `Place order` stays disabled. CVV input reflects the detected brand (4-digit for Amex).
- **Actual:** field shows valid (`min(3)` satisfied), `Place order` ENABLES; the malformed CVV is only caught server-side by Accept.js at tokenization. 4-digit CVV on Visa/MC also passes client validation.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | `bank-card-form.vue` accepts 3–4 digit CVV regardless of brand; button enables |
| 2. Backend Admin | N/A | not admin-visible |
| 3. GraphQL xAPI | N/A | tokenization is Accept.js client→processor |
| 4. Platform REST API | N/A | processor-side (E_WC_15) behaves correctly |

**Owning layer:** Layer 1 — Storefront (client-side validation, no brand detection)

## Root Cause Analysis
`client-app/shared/payment/components/bank-card-form.vue` validates the CVV with:
```js
securityCode: yup.string().required().min(3).max(4).label(labels.value.securityCode)
```
plus the `VcInput` has `minlength="3" maxlength="4"` and `securityCodeMaskOptions = { mask: "####" }`. The rule is static and brand-agnostic. Crucially, **this form does no card-brand detection** — the card number is only masked + length-checked (`min(12).max(19)`); there is no `cardType` to condition the CVV rule on. The component is imported only by `payment-processing-authorize-net.vue` (via `BankCardForm`), so the live impact is the Authorize.Net flow.

**Fix (larger than VCST-5202):** Because there is no SDK supplying the brand here, the fix must (1) add card-brand detection from the entered card number (BIN/IIN prefix — Amex `34`/`37` → 4-digit CVV; others → 3-digit), then (2) make the `securityCode` yup rule conditional on the detected brand (Amex → exactly 4, else exactly 3) and adjust the input `maxlength`/mask/placeholder accordingly. The existing `bank-card-form.test.ts` must stay green (add a brand-conditional case alongside).

## Difference from VCST-5202 (why this is a separate ticket)
- VCST-5202 = `payment-processing-skyflow.vue`, brand supplied by the Skyflow SDK; fixed by swapping the SDK element's validation via `update()`.
- This bug = `bank-card-form.vue`, **no brand source** — requires adding brand detection, so it is a distinct, slightly larger fix in a different component. Bundling it into VCST-5202 would break the "minimal & localized" gate.

## Other processors (checked, for completeness)
- **CyberSource** (`payment-processing-cyber-source.vue`): CVV validity comes from the Microform SDK (`data.valid`); likely brand-aware — verify live before filing.
- **Datatrans Secure Fields** (`payment-processing-datatrans-secure-fields.vue`): CVV validity owned by the SecureFields SDK; almost certainly brand-aware — no code rule on our side.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Component / module:** shared bank card form (`client-app/shared/payment/components/bank-card-form.vue`); consumer `payment-processing-authorize-net.vue`
- **RCA anchor:** `securityCode: yup.string().required().min(3).max(4)` in bank-card-form.vue (+ `minlength`/`maxlength`/mask) + absence of brand detection
- **Routing confidence:** HIGH (root cause), MEDIUM on Gate-0 simplicity (adds brand detection — confirm it stays minimal/localized before auto-fixing)
