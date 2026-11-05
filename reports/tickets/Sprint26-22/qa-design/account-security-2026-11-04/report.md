# /qa-design — /account/security

**Date:** 2026-11-04
**Target type:** Page (off-matrix)
**Target:** `{FRONT_URL}/account/security` (TEST_ENV=vcst)
**Matrix scope:** off-matrix — default page invariants (BL-UI-001, 002, 004, 006)
**Build:** theme 2.62.0-pr-2622-caac275a, Red preset live (`--color-primary-500` = #e52121)
**Account:** ORG_USER_EMAIL, signed in by UI on lane `playwright-edge`; read-only
**Viewports:** 375 / 768 / 1280 (+ dark mode at 1280)

## Invariant Results

| Invariant | 375 | 768 | 1280 | Evidence |
|-----------|-----|-----|------|----------|
| BL-UI-001 layout shift (CLS ≤ 0.1) | PASS 0.040 | PASS 0.054 | PASS 0.000 | the account sidebar jumps 80 px at 773 ms at 768 (under the threshold) |
| BL-UI-002 spacing on the grid | PASS* | PASS* | PASS* | *the `vc-badge--size--sm` padding is 3.008 px, which is off the grid |
| BL-UI-004 no overflow / clipping | PASS | PASS | PASS | no horizontal scroll; only the decorative `vc-container__bg` is clipped |
| BL-UI-006 touch targets ≥ 24 px, gap ≥ 8 px | PASS | PASS | PASS | "Add passkey" 138×38, "Turn on" 80×38 |
| BL-UI-003 state shift / 005 alignment | skipped | skipped | skipped | not in the off-matrix page default |

Console: 0 errors. Network: no 4xx/5xx; GraphQL calls all 200.

## Findings

These are UX and accessibility findings. No layout invariant failed.

1. **[WCAG 1.3.1 / 2.4.6] The widget titles are not headings** (Medium). "Passkeys" and "Two-factor authentication" are rendered as `span.vc-widget__title`, so the page has one H1 and no H2. The `section` elements have no accessible name. All viewports.
2. **[Nielsen #6 / #7, severity 2] No account navigation at 375 px.** The `aside` is `display: contents` and all 18 account-menu links are hidden. There is no breadcrumb or back link either. Not checked: whether the hamburger menu contains these links.
3. **[WCAG 4.1.2, header-wide, incidental] Notifications button at 375 px.** The "10" badge wraps onto two lines (`white-space: normal`). The button has no `aria-label`, so its accessible name is just "10". Another 32×32 header button has no accessible name. Screenshot: `storefront/FAIL-header-notification-badge-wraps-375.png`.
4. **[BL-UI-002, Low] The small `vc-badge` (the "Off" status) has 3.008 px horizontal padding**, which is off the spacing grid.
5. **[BL-UI-001, Low] The account sidebar shifts 80 px at load at 768 px.** The widgets load with no loading skeleton (Nielsen #1). It stays under the CLS threshold.
6. **[FYI] Unexpanded build variables in the module manifest URLs.** They contain literal `$(VirtoCommerce.Passkeys)` / `$(VirtoCommerce.SalesRep)`. The requests still return 200.

Advisory (severity 1, not proposed for filing): the security settings are split between "Change password" and "Security"; there is no "What is a passkey?" help; the sign-in email code and the 2FA email code read alike.

Passed: the buttons use the live `--color-primary-500`; type is Lato 400/700 only; light-mode text contrast has 0 violations (lowest 4.59:1 on the buttons); dark mode renders correctly; the focus ring is 2 px accent-500 on every control.

## Not covered

- I did not open "Turn on" (it emails a code) or "Add passkey" (it opens the WebAuthn prompt). The form-error and disabled states are **BLOCKED**, so Nielsen #3, #5 and #9 and the status announcement (WCAG 4.1.3) were not evaluated.
- Only the Red preset is live, so only it was audited, not Coffee and Red.
- The HAR is in the lane's `test-results/edge/` folder.

## Design Spec Diff

SKIPPED — there is no ticket Prototype link and no `--design` was given. Fill `.design-source/<uuid>/` and re-run with `--design <uuid>`. This is not a PASS.

**Off-Matrix Note:** `/account/security` is not in `critical-ui-scope.md`. Consider promoting it.
