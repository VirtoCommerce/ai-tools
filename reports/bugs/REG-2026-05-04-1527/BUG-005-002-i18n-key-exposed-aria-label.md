# BUG-005-002 — i18n translation key exposed as raw aria-label on mobile search backdrop

**Run**: REG-2026-05-04-1527
**Suite**: 005 (Search Filters & Advanced)
**Test Case**: SRCH-NEW-031, SRCH-NEW-026 (mobile search + ARIA)
**Browser**: playwright-chrome (375x812 mobile viewport)
**Environment**: https://vcst-qa-storefront.govirto.com
**Severity**: Medium (a11y / i18n leak — screen readers announce raw key)
**Priority**: P2

## Summary
On mobile viewport (375px), when the search bar overlay is opened, the backdrop close button has its `aria-label` set to the literal i18n translation key `common.labels.close` instead of the resolved localized string ("Close").

## Steps to Reproduce
1. Sign in as `qa-agent-slot1@virtocommerce.com`
2. Resize viewport to 375x812 (mobile)
3. Navigate to `https://vcst-qa-storefront.govirto.com/`
4. Click the "Toggle search bar" button (magnifier icon in mobile header)
5. Inspect the DOM

## Expected
The backdrop button has a localized aria-label such as `"Close"` (or the user's selected locale equivalent).

## Actual
```html
<button type="button" class="mobile-search-bar__backdrop" aria-label="common.labels.close"></button>
```

The literal i18n key `common.labels.close` leaks to assistive technology.

## Evidence
- DOM dump captured via `browser_evaluate`
- Console: no JS errors related to i18n
- Test data: locale is `en-US` (English)

## A11y Impact
- Screen readers will announce "common dot labels dot close" instead of "Close"
- WCAG 2.1 Level A — 4.1.2 Name, Role, Value — affected name is non-semantic

## BL References
- Implicit i18n contract — all aria-labels should be resolved keys

## Notes
- Likely caused by missing translation entry or incorrect i18n binding (`v-t` vs raw string) in `mobile-search-bar` component
- Only observed on mobile viewport; desktop search bar uses a different component path

## Status
NEW — needs frontend triage
