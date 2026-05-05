# BUG-014-002 (Preliminary)

**Title:** I18n: 'Search orders' button label renders raw i18n key 'commmon.buttons.search_orders' (typo: 'commmon' has 3 m's)

| Field | Value |
|-------|-------|
| Severity | Low |
| Confirmed | false (preliminary) |
| Suite | 014 - Orders Frontend |
| Test case | ORD-049 |
| Business rule | BL-ORD-001 |
| Edge case | n/a |
| Environment | https://vcst-qa-storefront.govirto.com |
| Browser | playwright-chrome (Chromium) |
| User | qa-agent-slot1@virtocommerce.com |
| Run ID | REG-2026-05-04-1527 |
| Frontend version | 2.48.0-pr-2274-0307-0307f38b |
| Date | 2026-05-05 |

## Steps to reproduce
1. Sign in to storefront.
2. Navigate to `/account/orders`.
3. Inspect the icon button immediately to the right of the order search textbox.
4. Read accessible name (button name is exposed via aria-label / title).

## Expected
Button accessible name resolves to a localized string such as `Search orders` or has icon-only treatment with `aria-label="Search"`.

## Actual
Accessible name is the literal i18n key `commmon.buttons.search_orders` — note the typo `commmon` (three m's). Captured in Playwright snapshot: `button "commmon.buttons.search_orders" [ref=e316] [cursor=pointer]`.

## Root cause analysis (likely)
The typo in the key strongly suggests a developer typo in the source code (`commmon.*` instead of `common.*`). The translation lookup falls back to the raw key when no entry is found. This is a code-side bug, not a missing-locale-entry bug.

## Failed assertion
`[DOM] All UI text localized (no raw i18n keys exposed)`

## Impact
- Sighted users see `commmon.buttons.search_orders` as the button label/tooltip — looks unprofessional.
- Screen reader users hear `c-o-m-m-m-o-n dot buttons dot search underscore orders` verbatim — poor a11y.
- Scope: orders list page only (1 button). Functionality unaffected.

## Console / Network
- Console errors: none
- Network: n/a

## Notes for triage
Search vc-frontend repo for the literal `commmon.buttons.search_orders` to find the offending source location, then fix the typo to `common.buttons.search_orders` and ensure the locale JSON has the entry.
