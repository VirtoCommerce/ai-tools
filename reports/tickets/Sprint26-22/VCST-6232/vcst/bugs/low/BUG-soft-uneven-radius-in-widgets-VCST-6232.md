# [Soft] Radius is uneven inside one widget: 3–6px children in 16px widgets

**Severity:** Low (P3) · **Provenance:** IN-SCOPE (VCST-6232, vc-frontend#2600 @ a4f29534) · **Not filed:** below severity floor
**Found by:** agent, /qa-test FULL round 2 (checklist C-4; 3x B-1/B-2) · **Env:** local soft build → vcst backend · Chromium + Firefox 1920, light + dark

## Steps
1. Build vc-frontend#2600 with `settings.design = soft`, sign in as `{{ORG_USER_EMAIL}}` with one item in the cart.
2. Open `/cart`; open `/account/orders`.

## Expected
{SPEC} Goal/AC-2: soft radius applies per role, so a widget's children follow the soft radius consistently.

## Actual
- `/cart` Discount & coupons `.vc-widget` 16px holds 5 `div.coupon-card` at 4px (classic: 4px in 8px).
- `/cart` payment `.vc-widget` 16px holds `.cyber-source-input-wrap` card number + CVV at 3px (`rounded-[3px]`, `payment-processing-cyber-source.vue:432`), beside 16px Cardholder/Expiry inputs in the same row.
- `/account/orders` active nav item 6px inside a 16px widget.

## Root cause
Soft sets only `--vc-radius`; components reading it turn 16/14px, while Tailwind `rounded-*` read the unset `--vc-radius-*` scale and literals stay classic (KB-9BCB34C7, KB-7CAAD492, KB-9045E101).

## Evidence
`screenshots/4a-C-4-soft-cart-coupons-radius-light-chromium.png` · `screenshots/4a-C-4-soft-cart-cybersource-radius-light-chromium.png` · `screenshots/x-soft-cart-coupon-widget-radius-dark-1920.png` · `screenshots/x-soft-cart-cybersource-fields-radius-dark-1920.png` · `screenshots/x-soft-account-nav-active-item-radius-dark-1920.png`

## Fix Routing
vc-frontend — soft radius-per-role values (`--vc-radius-*`) with the design hand-off; card-field wrapper literal.
