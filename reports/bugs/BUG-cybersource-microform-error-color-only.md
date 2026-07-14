# CyberSource Microform fields signal errors by color only — no readable text `[P3]`

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Ref:** REG-2026-07-14-0018 / PAY-CS-004, PAY-CS-005, PAY-CS-010, PAY-CS-011 · WCAG 1.4.1 · BL-PAY-001 (error-message clause)

## Summary
The CyberSource Microform iframe fields (Card number, Security code) signal an invalid/empty state with a **red border / `aria-invalid` only** — no readable error text and nothing exposed to the accessibility tree — while the adjacent **native** field (Expiry) correctly renders "This field is required". This fails WCAG 1.4.1 (color as the sole error cue) and the BL-PAY-001 error-message requirement. The submission gate itself is correct (Place order stays disabled).

## STR
1. Select **CyberSource** payment on `/cart` (hosted Microform iframe fields render).
2. Leave **Card number** and **Security code** empty (or enter an invalid PAN); trigger validation (blur / attempt submit).
3. Compare the error presentation of the Microform fields vs the native **Expiry** field; inspect the a11y tree.

## Expected vs Actual
- **Expected:** Each invalid Microform field shows readable, programmatically-exposed error text (parity with the native Expiry field's "This field is required").
- **Actual:** Microform fields convey the error via red border / `aria-invalid` only — no visible message text, nothing in the a11y tree. Native Expiry field shows proper text. Place order correctly stays disabled.

![CyberSource card-number red border, no text](screenshots/PAY-CS-004-verify-cybersource-invalid-card.png)
![CyberSource CVV vs native Expiry error](screenshots/PAY-CS-010-011-cybersource-cvv-and-expiry-errors.png)

## Root Cause (suspected)
The storefront does not subscribe to the Microform SDK `change`/validation events to render its own field-level error text; it relies on the iframe's border styling, which is invisible to assistive tech.

## Fix Routing
- **Repo:** vc-frontend (subscribe to Microform validation events → render field-level error text)
- **Kind:** frontend
