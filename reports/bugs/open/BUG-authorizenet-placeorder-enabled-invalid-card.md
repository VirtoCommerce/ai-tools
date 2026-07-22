# Place Order stays enabled with a Luhn-invalid Authorize.Net card `[P1]`

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Ref:** REG-2026-07-14-0018 / PAY-AN-012 · BL-PAY-001

## Summary
On the Authorize.Net inline card form (rendered directly on `/cart`, USD), entering a Luhn-invalid card number produces **no inline card-number error** and leaves the **"Place order" button enabled**. Per BL-PAY-001 the submit control must stay disabled until the PAN is Luhn-valid, so an invalid card can be submitted to the processor.

## STR
1. Sign in and build a USD cart with a shippable item at `{{FRONT_URL}}/cart`.
2. Select the **Authorize.Net** payment method (inline card form renders on the cart page).
3. Card number: `1234 5678 9012 3456` (fails Luhn); Expiry: `12/29`; CVV: `900`.
4. Blur the card-number field and observe validation + the "Place order" button.

## Expected vs Actual
- **Expected:** Inline "invalid card number" error under the field; "Place order" disabled until the PAN passes Luhn (BL-PAY-001).
- **Actual:** No inline card-number error; "Place order" is enabled (`cursor: pointer`, no `[disabled]` attribute) and submittable.

![Place order enabled with invalid card](screenshots/PAY-AN-012-CONFIRMED-invalid-card-placeorder-enabled.png)

## Root Cause (suspected)
The Accept.js / bank-card inline form does not gate the submit control on client-side card-number (Luhn) validity; only the native required-field checks run.

## Fix Routing
- **Repo:** vc-frontend (`bank-card-form.vue` / Accept.js inline card form)
- **Kind:** frontend
