# BUG-036-004 — Mobile cart pickup modal LIST/MAP toggle below 44x44 touch target minimum

**Severity:** Medium
**Suite:** 036 — BOPIS Store Selector
**Test Case:** BOPIS-003
**Business Rule:** BL-BOPIS-004
**Edge Case:** ECL-14.1
**Browser:** Firefox (playwright-firefox), 375×667 mobile viewport
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Build:** Frontend Ver. 2.48.0
**Status:** confirmed: false (preliminary)

## Summary

The LIST/MAP toggle button at the bottom of the mobile Pick points modal (cart context, 375×667) renders at 80×38 px. Height (38 px) is below the 44×44 px touch target minimum specified by WCAG 2.1 AA / 2.5.5, iOS HIG, and Material Design.

## Steps to Reproduce

1. Resize browser to 375×667 viewport
2. Login as B2B user (slot 2)
3. Add product to cart, navigate to `/cart`
4. Click `Pickup`, then click pencil icon to open Pick points modal (mobile fullscreen modal opens)
5. Observe LIST/MAP toggle button at bottom of modal viewport
6. Measure bounding rect

## Expected

- Toggle button ≥ 44 × 44 px touch target (WCAG 2.5.5 AAA / iOS HIG)

## Actual

- Toggle button size: **80 × 38 px**
- Width OK (80 px), height 38 px — **6 px below minimum**
- Modal close button (X) is 68 × 68 px — passes target

## Evidence

- Screenshot: `reports/regression/REG-2026-05-04-1527/036-evidence/BOPIS-003-mobile-list.jpg`
- Screenshot: `reports/regression/REG-2026-05-04-1527/036-evidence/BOPIS-003-mobile-map.jpg`
- Test result: `toggleSize: { w: 80, h: 38, ok: false }`

## Console / Network

- Console errors: 0
- No accessibility violations explicitly emitted

## Impact

- WCAG 2.5.5 gap on a key navigational control
- Mobile mis-tap risk for switching list/map views

## Related Issue

- BUG-036-003 (PDP CTA also fails touch target — pattern across BOPIS mobile UI)

## Suggested Fix

- Increase vertical padding on `LIST` / `MAP` toggle button so total height ≥ 44 px
