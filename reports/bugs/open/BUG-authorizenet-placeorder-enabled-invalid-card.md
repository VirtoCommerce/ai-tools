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

## Re-verification 2026-08-26 — still reproduces, confound ruled out

Backlog triage, Theme `2.56.0-pr-2451-8ba8-8ba8bd04` (draft: `2.53.0-pr-2368`), playwright-chrome, signed in,
`/cart` with a shippable item. Authorize.Net selected; inline card form rendered on the cart page.

Card number **`1234 5678 9012 3456`** (fails Luhn), name `QA Runner`, expiry `12/29`, CVV `900`, then blurred.

| Check | Result |
|---|---|
| inline card-number error | **none** — `aria-invalid: null`, `aria-describedby: null`, border still neutral grey, zero `role=alert` nodes |
| "Place order" | **enabled** — no `disabled` attribute, no `aria-disabled`, `cursor: pointer`, `pointer-events: auto` |

**The obvious confound was ruled out.** Before a delivery method was chosen, "Place order" was `[disabled]`
with *"Complete all required information to proceed."* — i.e. it correctly gates on missing required fields.
After selecting **Fixed Rate (Ground)** (total $234.00), leaving the Luhn-invalid PAN as the **only** invalid
input, the button became **enabled** and the hint disappeared. So the enablement is not a stale-state
artifact: the form simply does not treat card-number validity as a gate. BL-PAY-001 still unenforced.

**The order was deliberately NOT submitted.** The sibling draft
(`BUG-AN-cart-card-number-no-luhn-ghost-order`) documents that submitting this state produces an unpaid
**ghost order**; the missing gate is provable without creating one. Cart cleared afterwards.

**Merge still recommended.** Per the backlog audit, this draft and the ghost-order draft are one defect — no
client-side Luhn gate on the Authorize.Net inline cart form — seen from two ends. This pass re-confirms the
gate is absent; file them together as **P1** (the ghost order is the real impact), not as two tickets that
argue each other down.

**Still not filed to the tracker.**
