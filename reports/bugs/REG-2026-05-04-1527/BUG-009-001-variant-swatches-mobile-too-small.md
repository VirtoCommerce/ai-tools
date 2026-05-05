# BUG-009-001 — Variation color swatches too small on mobile (32×32px, below WCAG 44×44px)

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Priority** | P2 |
| **Type** | Accessibility / UX |
| **Test Case** | B2C-VAR-006 (Product Variations - Mobile Variant Selection) |
| **Business Rule** | BL-B2C-001 |
| **Edge Case** | — |
| **Run** | REG-2026-05-04-1527 |
| **Browser** | playwright-firefox |
| **Environment** | https://vcst-qa-storefront.govirto.com |
| **Tester** | qa-frontend-expert (Emily Johnson, slot 2 / TechFlow) |
| **Date** | 2026-05-05 |
| **Confirmed** | false (preliminary — needs qa-testing-expert verification) |
| **PR / Ticket Hint** | Likely a vc-frontend `VcVariantPicker` styling issue |

## Summary

On the storefront PDP, when viewport is set to mobile size (375×667), variation **Color swatches** measure **32×32px**. WCAG 2.1 AA Success Criterion 2.5.5 (Target Size) requires touch targets to be **at least 44×44px** unless an exception applies. These swatches are critical interactive controls (variant selection) and should meet the minimum.

## Steps to Reproduce

1. Sign in as the slot-2 B2B user (`test-emily.johnson-20260310@test-agent.com` / `TestPass123!`).
2. Resize the browser viewport to **375×667** (iPhone SE / standard mobile portrait).
3. Navigate to `https://vcst-qa-storefront.govirto.com/products-with-options/variations-of-jeans/jeans/vintage-california-beach-pullover-hoodie`.
4. Scroll the page to the **OPTIONS** block on the PDP.
5. Inspect the seven Color swatches under the `Color` group.
6. Measure their bounding-box dimensions (e.g., `getBoundingClientRect()` or browser DevTools rulers).

## Expected

- Color/variant swatches render with bounding box **≥ 44×44px** per WCAG 2.1 AA SC 2.5.5.
- Either the visual swatch itself is enlarged on mobile, **or** the surrounding interactive padding/`button.vc-variant-picker__trigger` container is enlarged so the actual hit-target is ≥ 44×44.

## Actual

- Color swatches render at **32×32px** on the mobile viewport.
- Programmatic measurement (`getBoundingClientRect`) for `[data-test-id^="variant-picker--Color--*"]` returns `{ w: 32, h: 32 }` for all sampled colours (Plum, Navy Blue, Emerald green, Black, Blue).
- No horizontal scroll observed (`document.documentElement.scrollWidth === window.innerWidth === 375`).

## Evidence

- Screenshot — full PDP at mobile 375×667: `reports/regression/REG-2026-05-04-1527/009-evidence/var006-mobile-variant-picker.png`
- Initial mobile PDP layout: `reports/regression/REG-2026-05-04-1527/009-evidence/var006-mobile-touch-target.png`
- Console: 0 errors during test.

## Console / Network

- Console: 0 errors throughout the test session.
- Network: no failures observed.

## Suspected Cause

`vc-variant-picker--size--xs` modifier from `VcVariantPicker` is applied at mobile breakpoints with no scaled-up `xs-mobile` variant. The component likely needs a media-query-scoped size bump (or an enlarged hit area achieved via padding while preserving the visual swatch).

## Workaround

None for end users. Users with motor impairments or larger fingers may struggle to tap the correct color.

## Notes

- Same pattern likely applies to `Size`, `Size_chart`, and `Fabric` pill buttons within the same picker family — verify across all variant attribute types before scoping the fix.
- This is a regression-baseline observation, not a release blocker. Mobile users **can** still tap (just imprecisely), and there is no horizontal scroll. Logged for accessibility hygiene.
