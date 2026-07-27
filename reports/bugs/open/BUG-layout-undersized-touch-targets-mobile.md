# Systemic undersized touch targets on mobile storefront (<44×44px) — P1/P2

**Severity:** P1 (revenue-critical qty stepper) / P2 (rest) · **Type:** Layout / Accessibility (BL-UI-006, WCAG 2.5.8)

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
Across the storefront at a 375px viewport, interactive controls render below the 44×44px minimum target size, driven by shared `VcInput` and `VcQuantityStepper` sizing. The most severe is the quantity stepper at 32×32px — the add-to-cart entry point on B2B PDPs, making it revenue-critical. Two alignment/spacing defects are folded in, including a suspected regression of VCST-5111 off-grid padding.

## Steps to Reproduce
1. Set viewport to 375px (mobile).
2. Visit a B2B PDP and measure the qty stepper +/− buttons.
3. Visit `/cart`, an address dialog, `/sign-in`, `/sign-up`, and the mobile account drawer; measure the labelled controls.

## Expected vs Actual
- **Expected:** Every interactive target ≥ 44×44px (WCAG 2.5.8 AA / BL-UI-006).
- **Actual (measured @375px):**
  - Qty stepper: **32×32** (TGT-001, VCQTY-002) — revenue-critical (add-to-cart on B2B PDP)
  - `VcInput` fields: **36px** height (VCINPUT-003, VCST auth/profile forms)
  - Address dialog buttons: **30×38** (VCDIALOG-002)
  - View/tab switch tabs: **38×38** (VCTABSWITCH-004)
  - Header icons: **28–36px** (HEADER-002)
  - Mobile account-drawer links: **288×40** (AUTH-034)
  - Sign-in / sign-up page targets below 44px (PAGE-TGT-SIGNIN-001, PAGE-TGT-SIGNUP-001), TGT-003
- **Alignment/spacing (folded in):**
  - **ALN-002** — cart qty-stepper center is 16px off the "remove" control center.
  - **SPC-004** — `/account/lists .vc-container.account-shell` `paddingBottom = 36px`, off the 4px grid; this is the pre-fix VCST-5111 value — **suspected regression**.

Qty stepper on PDP @375px:
![PDP touch targets](screenshots/TGT-001-VCQTY-002-pdp-mobile.png)

Cart @375px:
![Cart touch targets](screenshots/TGT-002-cart-mobile-touch-targets.png)

Mobile account drawer:
![Account drawer touch targets](screenshots/AUTH-034-mobile-drawer-touch-targets.png)

`VcInput` 36px on profile:
![VcInput 36px](screenshots/VCINPUT-36px-profile-mobile.png)

## Root Cause
Shared UI-kit components (`VcInput`, `VcQuantityStepper`) size below 44px on small viewports; the account-shell padding appears to have regressed to the pre-VCST-5111 off-grid value.

## Fix Routing
- **Repo:** `vc-frontend` — raise `VcInput`/`VcQuantityStepper` min target size to ≥44px on mobile; fix cart stepper vs remove alignment (ALN-002); restore VCST-5111 on-grid `paddingBottom` on `.account-shell` (SPC-004).
- **Kind:** frontend
