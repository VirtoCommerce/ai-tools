# BUG-036-003 — Mobile PDP BOPIS CTA "Check pickup locations" below 44x44 touch target minimum

**Severity:** Medium
**Suite:** 036 — BOPIS Store Selector
**Test Case:** BOPIS-036
**Business Rule:** BL-BOPIS-004
**Edge Case:** ECL-14.1
**Browser:** Firefox (playwright-firefox), 375×667 mobile viewport
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Build:** Frontend Ver. 2.48.0
**JIRA Refs:** VCST-4584
**Status:** confirmed: false (preliminary)

## Summary

The "Check pickup locations" CTA on a BOPIS-eligible Product Detail Page (PDP) renders as a link-styled element with height 18px on mobile viewport (375×667), which is well below the 44×44 px touch target minimum specified by WCAG 2.1 AA, iOS Human Interface Guidelines, and Material Design guidelines.

## Steps to Reproduce

1. Resize browser to 375×667 viewport
2. Navigate to a BOPIS-eligible PDP (e.g., `/product/bee0d93a-cd70-4313-bc6c-716cb415b43a` — UNTUCKit eGift Card)
3. Wait for PDP to fully load (price/delivery sidebar visible)
4. Locate the "Check pickup locations" CTA in the shipping/pickup section
5. Measure its bounding rect via `getBoundingClientRect()`

## Expected

Per BL-BOPIS-004 and WCAG 2.5.5 (Target Size, Level AAA — recommended for mobile):
- CTA touch target ≥ 44 × 44 px minimum (or follows iOS HIG / Material 48dp)
- Button-styled (clearly tappable affordance)

## Actual

- CTA size: **158 × 18 px**
- Width adequate (158 px) but height (18 px) is **40% of the required minimum**
- Renders as a link-styled element rather than a button
- Difficult to tap reliably on touch devices, especially for users with motor impairments

## Evidence

- Screenshot: `reports/regression/REG-2026-05-04-1527/036-evidence/BOPIS-036-mobile-pdp.jpg`
  - Shows: PDP shipping section with link-styled CTA
- Test result data:
  - `ctaSize: { w: 158, h: 18, ok: false }`
  - `closeSize: { w: 68, h: 68, ok: true }` — for contrast, modal close button is fine
  - `horizontalScroll: false` — page layout is otherwise fine

## Console / Network

- Console errors: 0
- No console violations specifically for accessibility (Firefox doesn't emit them)

## Impact

- A11y compliance gap (WCAG 2.5.5)
- Increased mis-tap rate for B2B mobile users
- Affects users with motor impairments, larger fingers, or smaller phones

## Related Issue

- See BUG-036-004 for similar issue on cart pickup modal LIST/MAP toggle (38px height)
- Pattern: mobile touch targets in BOPIS UI consistently fail 44px minimum

## Suggested Fix

- Wrap the CTA in a button with vertical padding making total height ≥ 44 px (e.g., `py-3` Tailwind = 24 px padding + 20 px text-line = ~44 px)
- Or convert to button styling rather than text-link styling
