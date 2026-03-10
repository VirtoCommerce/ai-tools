# BUG: Skyflow Form Input Border Clipped on Payment Page

## Status: CONFIRMED

## Summary

On the Skyflow payment form (both saved card CVV re-entry and new card entry), the input field borders are clipped/cut on the left edge. The parent container wrapping the Skyflow iframe uses Tailwind's `-mx-1` class (`margin: 0px -4px`), which extends the iframe 4px beyond its grandparent container on each side. This causes the left border (and potentially right border) of form inputs to be visually cut off.

Additionally, on the "Add new card" form, the bottom row fields (Expiration date + Security code) have their **bottom borders clipped** when validation error messages appear, because the iframe has a fixed height of `150px` that doesn't dynamically resize to accommodate validation text.

## Severity: Low

- **Category:** UI / Visual / CSS
- **Priority:** P3
- **Impact:** Cosmetic issue. Users can still interact with all fields. The clipped border is subtle (~4px) but noticeable on focus/validation states where the border color changes (e.g., red for validation errors).

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/checkout/payment
- **Browser:** Firefox (via Playwright), also reproduced visually in other browsers
- **Store Version:** 2.43.0-alpha.2254
- **Date:** 2026-03-10

## Steps to Reproduce

### Scenario 1: Saved card CVV re-entry (primary report)
1. Sign in to storefront
2. Add item to cart, navigate to `/cart`
3. Select "Bank card (Skyflow)" as payment method
4. Click "Place order" to go to checkout/payment page
5. Select a saved card (e.g., •••• 0015)
6. Click on the "Security code" field to focus it
7. **Observe:** the left border of the CVV input is slightly clipped
8. Type a partial value (e.g., "1") and click away to trigger validation
9. **Observe:** the red validation border is clipped on the left edge

### Scenario 2: Add new card form
1. On the same payment page, select "Add new card" from dropdown
2. Click on the "Security code" field, then click away
3. **Observe:** validation error "Security code is required." appears, and the bottom border of both Expiration date and Security code fields is cut by the iframe boundary

## Expected Result

- All input field borders should be fully visible without clipping
- Focus outlines and validation error borders (red) should render completely
- The iframe should dynamically resize to accommodate validation error messages

## Actual Result

- **Left border clipped** (~4px) on all Skyflow iframe inputs due to `-mx-1` negative margin on parent container
- **Bottom border clipped** on the last row (Expiration date + Security code) when validation messages appear, because the iframe height is fixed at `150px`
- The clipping is most visible on focus (light border) and validation error states (red border)

## Root Cause Analysis

```
DOM structure:
<div class="">                    ← grandparent: width 1046px, left 283px
  <div class="-mx-1">            ← parent: width 1054px, left 279px (margin: 0 -4px)
    <iframe src="skyflow...">    ← iframe: width 1054px, left 279px, height 150px (FIXED)
```

Two issues:

1. **`-mx-1` negative margin**: The Tailwind class `-mx-1` applies `margin-left: -0.25rem; margin-right: -0.25rem` (-4px each side). This makes the iframe 8px wider than its grandparent container, positioning it 4px outside the container boundary on both sides. The Skyflow iframe's internal input fields have their borders right at the edge, so the leftmost ~4px of the border gets cut.

2. **Fixed iframe height (150px)**: The Skyflow iframe is set to a static `height: 150px` regardless of content. When validation messages appear below input fields (adding ~20px of text), the content overflows the iframe boundary, clipping the bottom of the last row's input borders.

## Suggested Fix

1. **Remove `-mx-1`** from the Skyflow iframe wrapper, or add `px-1` padding to the iframe's parent to compensate for the negative margin
2. **Set iframe height to `auto`** or increase the minimum height to accommodate validation messages (e.g., `min-height: 180px` for saved card view, `min-height: 220px` for new card form)
3. Alternative: Add `overflow: visible` on the iframe container (though this won't help since the iframe itself clips)

## Evidence

| File | Description |
|------|-------------|
| `screenshots/skyflow-payment-initial.png` | Payment page initial state |
| `screenshots/skyflow-saved-card-selected.png` | Saved card selected, CVV field unfocused |
| `screenshots/skyflow-cvv-focused-cut-border.png` | CVV field focused — left border clipped |
| `screenshots/skyflow-cvv-border-cut-zoomed.png` | Zoomed iframe screenshot — left border cut visible |
| `screenshots/skyflow-cvv-validation-error-clipped.png` | Zoomed: CVV with validation error, red border |
| `screenshots/skyflow-cvv-validation-error-full.png` | Full page with CVV validation error |
| `screenshots/skyflow-newcard-cvv-focused.png` | New card form, CVV focused |
| `screenshots/skyflow-newcard-cvv-focused-zoomed.png` | Zoomed: new card form — bottom border of last row cut |
| `screenshots/skyflow-cardnumber-focused-zoomed.png` | Zoomed: card number focused (border OK at top, bottom row cut) |

## Console Errors

```
JavaScript Error: "Failed to execute 'postMessage' on 'DOMWindow'"
(2+ occurrences — Skyflow iframe cross-origin messaging issue)

JavaScript Warning: "Feature Policy: Skipping unsupported feature name 'publickey-credentials-get'"
(10+ occurrences from Skyflow SDK)

JavaScript Warning: "Layout was forced before the page was fully loaded"
(from Skyflow elements/index.html)
```

## References

- Related: BUG-PAY-001 (CyberSource CVV not masked — separate iframe issue)
- Component: Skyflow payment module, Vue.js storefront checkout
- Skyflow SDK version: v2.7.3 (`https://js.skyflow.com/v2.7.3/elements/index.html`)
