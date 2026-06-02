# BUG-011-001 — Address Popup Search Input Has Wrong aria-label

**Run**: REG-2026-05-04-1527
**Suite**: 011 — Checkout Flow
**Test Case**: CHK-099 (Defect #3 verification)
**Severity**: Medium (a11y)
**Priority**: P2
**Status**: NEW (verifies pre-existing Defect #3)
**Environment**: https://vcst-qa-storefront.govirto.com (vc-frontend 2.48.0-pr-2274-0307-0307f38b)
**Browser**: Chromium 1920x1080
**Date**: 2026-05-05

## Summary
The search input field inside the **address selection popup** (opened from cart Shipping Details > Shipping address pencil icon) has an `aria-label` of **"Search pickup locations"** — incorrect context. This popup is for selecting a shipping/saved address, not a pickup location.

## Steps to Reproduce
1. Sign in as `qa-agent-slot1@virtocommerce.com` on vcst-qa-storefront
2. Add any product to cart (e.g. Erdinger Dunkel × 1)
3. Go to `/cart`
4. In the Shipping Details panel, click the pencil/edit icon next to the Shipping Address field
5. The "Select address" modal opens
6. Inspect the search input box (top-right of facet bar)

## Expected
`aria-label="Search addresses"` (or "Search saved addresses"), matching the modal context.

## Actual
`aria-label="Search pickup locations"`

```html
<input type="search" aria-label="Search pickup locations" placeholder="Search " ...>
```

## Impact
- **A11y**: Screen reader users hear "Search pickup locations" when this is actually an address search — misleading and breaks WCAG 2.1 success criterion 4.1.2 Name, Role, Value (Level A) for proper programmatic naming in context.
- The same component is reused for both pickup-location selection and address selection but the aria-label was not contextualized when reused.

## Evidence
- Screenshot: `reports/regression/REG-2026-05-04-1527/011-evidence/chk-087-address-popup.png`
- DOM snapshot:
```js
{
  "hasSearch": true,
  "searchAriaLabel": "Search pickup locations",
  "searchPlaceholder": "Search "
}
```

## Suggested Fix
Pass a context-appropriate `aria-label` prop to the shared search component. For the address popup, use a different localization key, e.g. `addressPicker.searchAddresses`.

## References
- BL-CHK-008 (address popup spec)
- ECL-14.3 (a11y edge case category)
- This bug was previously identified as **Defect #3** in the address popup feature; this run confirms it is still present in production.
