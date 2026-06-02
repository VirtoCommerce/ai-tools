# VCST-5017 — Verification Report

**Verdict:** VERIFIED
**Date:** 2026-05-26
**Env:** vcst-qa @ Theme `vc-theme-b2b-vue-2.50.0-pr-2303-cc2d-cc2ddcdb` (PR #2303, OPEN)
**Browser:** playwright-chrome
**Tester:** Claude Code (qa-frontend-expert flow, inline)

## Bug Summary
5 icon-only buttons in `<CouponCard>` on `/cart` had `aria-label=null` — screen readers announced only "button". WCAG 2.1 AA 4.1.2 (Name, Role, Value).

## Fix Confirmed (commit cc2ddcdb)
`coupon-card.vue` now builds `viewConfig` as a computed and passes `ariaLabel` through `v-bind="viewConfig.button"` to `<VcButton>`. i18n keys added to all 13 locales:
- `shared.cart.coupons_section.apply_aria` = `"Apply coupon {code}"`
- `shared.cart.coupons_section.remove_aria` = `"Remove coupon"`

## STR Result — 3/3 (live DOM audit of all 5 buttons)

| # | Card view | Coupon | Button | `aria-label` (observed) | Expected | Result |
|---|-----------|--------|--------|-------------------------|----------|--------|
| 0 | default | THRESH50 (10% off cart) | apply (arrow-right) | `Apply coupon THRESH50` | `Apply coupon THRESH50` | PASS |
| 1 | applied | FIXED5 ($5) | trash (outline-trash) | `Remove coupon` | `Remove coupon` | PASS |
| 2 | default | QA (5% off subtotal) | apply | `Apply coupon QA` | `Apply coupon QA` | PASS |
| 3 | default | AIR (10% off shipping) | apply | `Apply coupon AIR` | `Apply coupon AIR` | PASS |
| 4 | default | Custom code (empty input) | apply | `Apply coupon ` | `Apply coupon {code}` interpolation | PASS |

**Reactive update:** Typing `BOGUS-XYZ` into Custom card → `aria-label` updated to `Apply coupon BOGUS-XYZ` immediately (computed reflows on `code.value` change). Confirms binding is live, not stale.

## Checklist
- [x] Reproduce original bug (cannot — buttons now have aria-label everywhere)
- [x] Fix resolves reported issue (5/5 buttons announce action)
- [x] Root cause addressed (`ariaLabel` in `viewConfig.button` passed via `v-bind`)
- [x] Adjacent feature: input typing/reactive aria-label OK
- [x] Adjacent feature: i18n locale key present in `en.json`
- [x] No new console errors (3 pre-existing image 404s from external CDNs, not from this fix)
- [x] Storefront reflects corrected behavior
- [x] BL: WCAG 2.1 AA 4.1.2 satisfied (programmatic name on each `<button>`)

## Evidence
- `screenshots/coupon-cards-aria-label.png` — /cart with all 5 cards visible

## Side Effects
None observed.

## Build
- Theme: `vc-theme-b2b-vue-2.50.0-pr-2303-cc2d-cc2ddcdb`
- PR: https://github.com/VirtoCommerce/vc-frontend/pull/2303 (state: OPEN, mergeable)
- Branch: `fix/VCST-5017`, commit `cc2ddcdb`
- Deploy: vc-deploy-dev `vcst-qa` `theme/artifact.json` points at this build

## JIRA Transition
Testing → TESTED → DONE (recommended)
