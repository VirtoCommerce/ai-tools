# Checkout focus order skips Place Order + low-contrast focus outline — P3

**Severity:** P3 · **Type:** Accessibility (WCAG 2.4.3 Focus Order, WCAG 1.4.11 Non-text Contrast)

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
On single-page checkout, keyboard Tab order routes through the ~16-stop "Recently browsed" carousel before reaching "Place order" (tab index 55 → 72), so submit is not the next logical stop after the form. Separately, the focus-outline token renders at 40% opacity and alpha-blends to ~1.55:1 against the cream header — below the 3:1 minimum for a focus indicator.

## Steps to Reproduce
1. Sign in and reach single-page checkout with a seeded cart.
2. Tab from the last checkout form field and count stops to "Place order".
3. Separately, Tab to a focusable control on the cream header and inspect the computed focus-outline color.

## Expected vs Actual
- **Expected (2.4.3):** After the checkout form, focus lands on "Place order" (or a nearby logical control), not through a 16-item recommendations carousel.
- **Actual:** Focus passes through the entire "Recently browsed" carousel; "Place order" is reached at idx 72 (form ends ~idx 55).
- **Expected (1.4.11):** Focus indicator ≥ 3:1 contrast against its background.
- **Actual:** Outline token `color(srgb 0.6 0.4235 0.353 / 0.4)` at 40% alpha blends to ~1.55:1 on the cream header.

![Low-contrast focus outline](screenshots/A11Y-CC-002-focus-outline-low-contrast.png)

## Root Cause
Checkout DOM source order places the recommendations carousel before the submit action; the focus-outline design token carries a 0.4 alpha that fails contrast once composited over the light header.

## Fix Routing
- **Repo:** `vc-frontend` — reorder checkout DOM so "Place order" follows the form (or set `tabindex`/`order` accordingly); raise the focus-outline token to full opacity / a color that meets ≥3:1 on all theme surfaces.
- **Kind:** frontend
