# VCST-5018 — Verification Report

**Verdict:** VERIFIED
**Date:** 2026-05-26
**Env:** vcst-qa @ Theme `vc-theme-b2b-vue-2.50.0-pr-2303-cc2d-cc2ddcdb` (PR #2303, OPEN)
**Browser:** playwright-chrome
**Tester:** Claude Code (qa-frontend-expert flow, inline)

## Bug Summary
Error message in `<CouponCard>` had no `role="alert"` / `aria-live` — screen readers gave no audible feedback when an invalid coupon was rejected. WCAG 2.1 AA 3.3.1 (Error Identification) + 4.1.3 (Status Messages).

## Fix Confirmed (commit cc2ddcdb)
`coupon-card.vue` line 30 — error `<p>` now declares `role="alert"`:
```vue
<p v-if="view === 'error' && !!error" role="alert" class="coupon-card__error">{{ error }}</p>
```

## STR Result — 3/3 (apply invalid coupon, observe error markup)

| Run | Code | view class | Error element | `role` attr | Text | Result |
|-----|------|-----------|---------------|-------------|------|--------|
| 1 | `BOGUS-XYZ` | `coupon-card--error` | `<p class="coupon-card__error">` | `alert` | "This code is not valid" | PASS |
| 2 | `CLEAN-RUN-2` (after page reload) | `coupon-card--error` | `<p class="coupon-card__error">` | `alert` | "This code is not valid" | PASS |
| 3 | `NOTACODE-RUN3` | `coupon-card--error` | `<p class="coupon-card__error">` | `alert` | "This code is not valid" | PASS |

**Observed outerHTML (identical across all 3 runs):**
```html
<p role="alert" class="coupon-card__error">This code is not valid</p>
```

## Checklist
- [x] Reproduce original bug (cannot — `role="alert"` is statically present on error `<p>`)
- [x] Fix resolves reported issue (assistive tech will announce error per ARIA spec for `role="alert"`)
- [x] Root cause addressed (static attribute, not dependent on async aria-live region wiring)
- [x] Adjacent: invalid-coupon visual error state still renders correctly
- [x] Adjacent: apply button disables in error state (matches `viewConfig.error.button.disabled = true`)
- [x] No new console errors (pre-existing external CDN 404s only)
- [x] Storefront reflects corrected behavior
- [x] BL: WCAG 2.1 AA 3.3.1 + 4.1.3 satisfied

## Evidence
- `screenshots/error-state-role-alert-run1.png` — error state with BOGUS-XYZ
- `screenshots/error-state-role-alert-clean-run.png` — error state after fresh reload (CLEAN-RUN-2)

## Side Effects
None observed. Cart, navigation, footer, applied-coupon state all functional.

## Build
- Theme: `vc-theme-b2b-vue-2.50.0-pr-2303-cc2d-cc2ddcdb`
- PR: https://github.com/VirtoCommerce/vc-frontend/pull/2303 (state: OPEN, mergeable)
- Branch: `fix/VCST-5017`, commit `cc2ddcdb`
- Deploy: vc-deploy-dev `vcst-qa` `theme/artifact.json` points at this build

## JIRA Transition
Testing → TESTED → DONE (recommended)
