# BUG — vc-shell app-switcher icons return 404 [Low]

**Env:** vcmp-dev Vendor Portal — `@vc-shell/framework` 2.6.0-rc.0, build `98032` (2026-09-02 11:23 GMT), Chrome, Light theme.

## Summary
Opening the app-hub popover requests three app logos that do not exist, so the app switcher renders broken images. Cosmetic, but user-visible.

## STR
1. Sign in to the Vendor Portal.
2. Open the **app hub** popover in the app bar.
3. Watch the network panel.

## Expected vs actual
**Expected:** every app tile's logo resolves.
**Actual:** three `404`s —
- `/apps/builderio/logo.svg`
- `/apps/app_search/logo.svg`
- `/apps/page-builder-shell/assets/images/logo-only.svg`

## Notes
Below the `/qa-test` 5d severity floor (`Low`), so deliberately **not** filed to the tracker — recorded here instead.
Found incidentally during the VCST-5632 / VCST-5670 re-verification; unrelated to either fix.
