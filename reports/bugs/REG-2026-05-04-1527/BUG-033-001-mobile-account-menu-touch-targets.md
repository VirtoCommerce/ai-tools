# BUG-033-001 — Mobile account menu touch targets below 44x44px minimum

**Status**: Preliminary (confirmed: false)
**Severity**: Medium
**Priority**: Medium
**Suite**: 033 — Auth Company & Account Menu
**Test Case**: AUTH-034 — Account Menu - Mobile Responsive Layout
**Business Rule**: BL-AUTH-001
**Edge Case**: A11y/mobile, WCAG 2.5.5 Target Size

## Summary

On mobile viewport (375x667), the storefront mobile menu drawer renders all account-section group toggles and sub-links at 40px tall. WCAG 2.5.5 (Level AAA) and iOS Human Interface Guidelines specify a 44x44px minimum touch target for accessibility. Several drawer controls (logout, close) measure even smaller (25x62, 38x38).

This is a platform-wide mobile menu pattern, not specific to the Account section, but Account menu navigation is a Critical/High-priority surface that should meet a11y thresholds.

## Steps to Reproduce

1. Set browser viewport to 375x667.
2. Navigate to `https://vcst-qa-storefront.govirto.com/sign-in`.
3. Sign in as B2B user (test-john.mitchell-20260310@test-agent.com / TestPass123!).
4. Navigate to `/account/dashboard`.
5. Tap the hamburger icon (button with `aria-label="Main menu"`) in the header.
6. In the opened mobile drawer, inspect (DevTools or `getBoundingClientRect`) any of:
   - Group toggle buttons: "Purchasing", "Marketing", "Corporate", "User"
   - Sub-links: "Dashboard", "Orders", "Lists", "Quote requests", "Saved for later", "Back-in-stock list", etc.
   - "Logout" button at bottom of drawer
   - Close drawer button at top

## Expected

All touch targets reachable through the account/menu navigation flow are >= 44x44px (WCAG 2.5.5 Target Size minimum, iOS HIG).

## Actual

Measured bounding boxes (px):

| Element | Width × Height | Meets 44x44? |
|---|---|---|
| Group toggle "Purchasing" / "Marketing" / "Corporate" / "User" | 288 × 40 | NO (height 40) |
| Sub-link "Dashboard", "Orders", "Lists", … | 288 × 40 | NO (height 40) |
| "Logout" button | 62 × 25 | NO (both dimensions) |
| Top close button | 38 × 38 | NO |
| Language selector "Language: en" | 36 × 64 | NO (width 36) |

## Cross-Layer Checks

- [x] CONSOLE: no JS errors (clean)
- [x] NETWORK: no 4xx/5xx (200 OK on /account/orders)
- [x] FUNCTIONAL: drawer opens, group structure preserved, navigation routes correctly
- [ ] A11Y: touch target minimum NOT met

## Evidence

- Screenshot (mobile Orders page after navigation): `reports/regression/REG-2026-05-04-1527/033-evidence/AUTH-034-mobile-orders-page.png`

## Notes

- Functional behavior of mobile drawer is correct: tapping group toggles expands/collapses sub-items, tapping sub-links navigates correctly, drawer close works.
- Per memory `feedback_a11y_coffee_only.md`: Coffee theme is the only WCAG-compliant theme. This bug exists across themes since it is a layout/sizing issue, not a contrast issue.
- This bug surface area is broader than just Account menu — fix should evaluate the entire mobile-menu component height.

## Suggested Fix Direction

Increase mobile drawer item min-height from `40px` to `44px` (or use `min-height: 2.75rem` matching iOS HIG). Audit `Logout` button to ensure it meets the same minimum. Consider adding `padding: 0.5rem` inside the close button to expand its hit area to >= 44x44 without increasing the visual icon size.
