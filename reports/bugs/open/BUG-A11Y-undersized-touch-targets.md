# BUG-A11Y-002: Mobile Touch Targets Below 44x44px Minimum

## Status: CONFIRMED

## Severity: Medium (High for header navigation icons)
## Category: Accessibility (A11y)
## WCAG Criterion: 2.5.5 Target Size (Level AAA) / 2.5.8 Target Size Minimum (Level AA, WCAG 2.2)

## Environment
- **URL:** https://vcst-qa-storefront.govirto.com
- **Browser:** Firefox (Playwright)
- **Viewport:** 375x812 (iPhone mobile)
- **Date:** 2026-03-10

## Summary

At mobile viewport (375x812), 40 out of 52 visible interactive elements have touch targets smaller than the recommended 44x44px minimum. This includes critical navigation elements in the header (phone icon, search, notifications, cart) and product interaction controls (add-to-cart buttons, quantity inputs, wishlist icons).

## Reproduction Results

### Overall Statistics

| Metric | Count |
|--------|-------|
| Total interactive elements (visible) | 52 |
| Below 44x44px minimum | 40 (77%) |
| Meeting 44x44px minimum | 12 (23%) |

### Size Distribution

| Size Bucket (smallest dimension) | Count |
|----------------------------------|-------|
| Under 24px | 7 |
| 24px to 31px | 6 |
| 32px to 43px | 27 |
| 44px and above | 12 |

### Worst Offenders

| Element | Dimensions (WxH) | Location |
|---------|-------------------|----------|
| "Skip to main content" link | 143x19 | Top of page |
| "Skip to footer" link | 95x19 | Top of page |
| Product title links | 285x16 | Product cards |
| "Ship to: Select address" button | 161x25 | Top bar |
| Hamburger menu icon | 28x28 | Header |
| Phone/Search/Cart icons | 32x32 | Header |
| Wishlist/Compare buttons | 32x32 | Product cards |
| Quantity +/- buttons | 32x32 | Product cards |
| Quantity input fields | 213x30 | Product cards |
| Footer accordion buttons | 295x40 | Footer |

### Steps to Reproduce

1. Resize browser to 375x812 (iPhone viewport)
2. Navigate to https://vcst-qa-storefront.govirto.com
3. Open DevTools console
4. Run:
```javascript
Array.from(document.querySelectorAll('a, button, input, select, [role="button"], [tabindex]'))
  .map(el => {
    const rect = el.getBoundingClientRect();
    return { tag: el.tagName, text: (el.textContent || '').substring(0, 30),
             width: Math.round(rect.width), height: Math.round(rect.height),
             tooSmall: rect.width < 44 || rect.height < 44 };
  })
  .filter(el => el.width > 0 && el.height > 0 && el.tooSmall);
```
5. **Result:** 40 elements returned as undersized

## Expected Behavior

All interactive elements at mobile viewport should have a minimum touch target of 44x44 CSS pixels per WCAG 2.5.5 / 2.5.8. Elements may be visually smaller but should have adequate padding or spacing to ensure the tappable area meets the minimum.

## Actual Behavior

77% of interactive elements have touch targets below 44x44px. The most critical are header navigation icons at 32x32px and product card action buttons at 32x32px, which are frequently tapped by mobile users.

## Impact

- **Mobile usability:** Users with motor impairments or large fingers will struggle to accurately tap small targets
- **Error rate:** Undersized targets increase accidental taps on adjacent elements
- **Header icons (32x32px):** Phone, search, notifications, and cart are primary navigation -- being 27% smaller than minimum is significant
- **Product card buttons (32x32px):** Wishlist, compare, and quantity controls are densely packed, increasing mis-tap risk

## Recommended Fix

1. **Header icons:** Increase touch target to at least 44x44px using padding on the anchor/button elements (visual icon can remain 24px or 32px)
2. **Product card buttons:** Add padding to achieve 44x44px tap area; space buttons further apart
3. **Quantity inputs:** Increase height from 30px to at least 44px
4. **Footer accordion buttons:** Increase height from 40px to 44px (close -- 4px padding addition)
5. **Skip links:** These are acceptable as-is since they are only visible on keyboard focus, not typical touch targets

## Comparison to Original Report

The original finding reported "29/40 interactive elements below 44x44px." My independent reproduction found **40/52 elements below 44x44px**. The higher count is due to:
- More products loaded on the page (each product card adds ~6 interactive elements)
- Including all visible interactive elements (skip links, footer accordions)

If we exclude skip links (2) and count only user-facing interactive elements, the ratio is approximately 38/50 (76%), which is consistent with the original finding's pattern. The core issue is the same: the majority of mobile touch targets are undersized.

**Verdict:** Bug is real and confirmed. The actual situation may be slightly worse than originally reported.

## Evidence

- Screenshot: `reports/bugs/bug-a11y-002-mobile-homepage.png`
