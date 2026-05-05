# BUG-011-002 — Address Popup City Facet Clipped on Mobile 375px Viewport

**Run**: REG-2026-05-04-1527
**Suite**: 011 — Checkout Flow
**Test Case**: CHK-100 (Defect #4 verification)
**Severity**: Medium (mobile UX / a11y)
**Priority**: P2
**Status**: NEW (verifies pre-existing Defect #4)
**Environment**: https://vcst-qa-storefront.govirto.com (vc-frontend 2.48.0-pr-2274-0307-0307f38b)
**Browser**: Chromium 375x812 (mobile viewport)
**Date**: 2026-05-05

## Summary
On mobile viewport (375px wide), the **City facet button** in the cart address-selection popup is clipped at the right edge — its right boundary is at x=401.88px, which is 26.88px outside the 375px viewport. User must horizontally scroll inside the facet bar to access the City filter. Test cases CHK-100 explicitly call this out as Defect #4 verification.

## Steps to Reproduce
1. Resize browser to 375x812 (or use a real iPhone)
2. Sign in as `qa-agent-slot1@virtocommerce.com`
3. Navigate to `/cart` with at least one item
4. Tap the pencil/edit icon next to Shipping Address in Shipping Details
5. Address popup opens
6. Observe the facet bar at the top: Country, State/Province, City buttons

## Expected
All three facet buttons (Country, State/Province, City) should be fully visible without horizontal scrolling, OR the bar should wrap to a second row, OR a swipe affordance with a partial-visibility indicator should be shown for discoverability.

## Actual
City facet button extends past the right edge of the 375px viewport:
```js
{
  "cityRect": { "x": 318.34, "y": 135, "w": 83.53, "right": 401.88 },
  "viewportWidth": 375,
  "clipped": true,
  "partiallyVisible": true
}
```
The button is partially visible — the user can see the start of the "CITY" label but the chevron/dropdown affordance is off-screen.

## Impact
- **Discoverability**: Users may not realize they can filter by City because the affordance is hidden.
- **A11y**: WCAG 2.1 SC 1.4.10 Reflow (Level AA) requires content to be presentable at 320 CSS pixels wide without horizontal scrolling. The facet bar fails this at 375px.
- **Consistency**: City facet IS available on desktop without scroll — feature parity broken on mobile.

## Evidence
- Screenshot: `reports/regression/REG-2026-05-04-1527/011-evidence/chk-100-mobile-375.png`

## Suggested Fix
- **Option A**: Wrap the facet bar to a second row when it overflows (`flex-wrap: wrap`).
- **Option B**: Compress facet button labels on small viewports (icon + tooltip instead of text).
- **Option C**: Convert the three facets into a single "Filters" button that opens a bottom sheet with the three facets stacked vertically.

## References
- BL-CHK-008 (address popup spec)
- ECL-14.3 (a11y edge case category — touch UX)
- WCAG 2.1 SC 1.4.10 Reflow
- Previously identified as Defect #4 in the address popup feature.
