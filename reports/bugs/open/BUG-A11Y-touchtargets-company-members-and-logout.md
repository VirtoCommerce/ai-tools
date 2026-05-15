# BUG-A11Y-003: Undersized touch targets — `/company/members` row actions + account-dropdown Logout (desktop AND mobile)

## Status: CONFIRMED

## Severity: High
## Category: Accessibility (A11y) / Design System
## WCAG Criterion: 2.5.5 Target Size (Level AAA) / 2.5.8 Target Size Minimum (Level AA, WCAG 2.2)

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com
- **Browser:** Chrome DevTools MCP (Chromium)
- **Viewports tested:** 375 / 768 / 1280
- **Theme:** Coffee, vc-frontend pr-2280 (`2.49.0-pr-2280-80690ef2`)
- **Auth:** `test-john.mitchell-20260310@test-agent.com` (SUPPORT_AGENT, CanImpersonate)
- **Date:** 2026-05-14
- **Reported By:** `/qa-design /company/members LoginOnBehalf flow` audit (Finding F-03)
- **Report:** `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/report.md`

## Summary

Two control surfaces fail WCAG 2.5.5 / 2.5.8 (44 × 44 px target minimum) at **every viewport including 1280 px desktop**:

1. **Per-row Actions icon button on `/company/members`** — the dropdown trigger that opens the row-level action menu (which itself includes the **`Login on behalf`** entry, i.e. the impersonation entry point used by support staff).
2. **`data-test-id="sign-out-button"` (Logout) in the account dropdown** — the only documented logout affordance and one of two stop-impersonation paths in impersonation mode.

Both render at **32 × 32 px** across 1280 / 768 / 375 viewports. This is not a "mobile-only" instance of [BUG-A11Y-undersized-touch-targets](BUG-A11Y-undersized-touch-targets.md) — these targets remain undersized even on desktop.

Adjacent undersized elements on the same page (Notifications bell 28 × 28, mobile Search 38 × 38) are also flagged but lower priority.

## Reproduction Results

### `/company/members` row actions

| Element | Dimensions (WxH) | Viewport | Passes 44×44? | Notes |
|---------|------------------|----------|---------------|-------|
| Per-row Actions trigger (`DIV[role="button"]`) | 20 × 20 px | 1280 | NO | VCST-4906 re-verify: 20 px not 32 px |
| Per-row Actions trigger (`DIV[role="button"]`) | 20 × 20 px | 768 | NO | Same element, same size |
| Per-row Actions trigger (`DIV[role="button"]`) | 20 × 21 px | 375 | NO | Varies by row |
| Notifications bell | 28 × 28 px | all | NO | |
| Mobile Search button | 38 × 38 px | 375 | NO | |
| Invite Members button | 155 × 44 px | all | YES | |
| Filters button | 88 × 44 px | all | YES | |

**Note (VCST-4906 re-verification, 2026-05-14):** The row action trigger measured at **20×20 px** at 1280px desktop, not 32×32 px as originally reported. The element is a `DIV[role="button"]` (class `vc-popover__trigger`) with no `tabindex` and no `aria-label`. This is a regression from the earlier measurement or the element structure changed in build `2.49.0-pr-2280-8069-80690ef2`. See related report BUG-UIUX-A for the full ARIA / keyboard-access analysis.

### Account dropdown (any authenticated page, including under impersonation)

| Element | Dimensions (WxH) | Viewport | Passes 44×44? |
|---------|------------------|----------|---------------|
| `data-test-id="sign-out-button"` (Logout) | 32 × 32 px | 1280 | NO |
| `data-test-id="back-to-operator-row"` (Stop Impersonation, when impersonating) | 256 × 49 px | 1280 | YES |
| `data-test-id="mobile-back-to-operator-button"` (mobile, in hamburger panel) | varies, ≥ 44 px tall | 375 | YES |

## Steps to Reproduce

1. Sign in as a user with B2B organisation membership (e.g. SUPPORT_AGENT John Mitchell from VCST-4905 fixtures).
2. Navigate to `/company/members`.
3. Hover/tap any member row's right-most icon button (the per-row actions trigger).
4. Open DevTools, inspect the button, run:
   ```javascript
   const r = document.activeElement.getBoundingClientRect();
   console.log({ w: r.width, h: r.height, fails44: r.width < 44 || r.height < 44 });
   ```
5. **Result:** `{ w: 32, h: 32, fails44: true }`.

Repeat at 768 and 375 viewports — identical 32 × 32 px result.

For the Logout button:

6. Open the account dropdown (`data-test-id="account-button"` in header).
7. Inspect the `data-test-id="sign-out-button"` element at 1280 px viewport.
8. **Result:** 32 × 32 px — fails 44×44 on desktop.

## Expected Behavior

All interactive elements should meet WCAG 2.5.5 (Level AAA) / 2.5.8 (Level AA, WCAG 2.2) minimum target size of **44 × 44 CSS pixels**, including the visible icon hit-area OR the padded tappable region surrounding a smaller visual icon.

## Actual Behavior

Per-row Actions icon and account-dropdown Logout button render as bare 32 × 32 px hit-areas with no padding extension — undersized by 12 px / target side (27% short). The pattern affects the most actionable controls on the page (member management → impersonate trigger; account dropdown → logout).

## Impact

- **Critical-path interactions:** the impersonate trigger is now the only documented in-storefront entry into the LoginOnBehalf flow (per VCST-4905 scope, the Admin SPA "Back Office" button is in scope but not in this build's storefront surface). Support staff using mobile lose accuracy on a privileged action.
- **WCAG conformance:** undersized targets on desktop fail the WCAG 2.5.8 Level-AA criterion that became normative with WCAG 2.2 — affects any compliance audit of the storefront.
- **Mobile error rate:** taps near densely-packed row icons increase mis-tap probability.

## Recommended Fix

1. Increase the per-row Actions trigger's tappable area to 44 × 44 px via padding on the wrapping `<button>` (visual icon can remain at 32 px). Apply consistently across all row-action triggers in the Members table.
2. Same fix for `data-test-id="sign-out-button"` — add padding to the wrapping element.
3. Audit the rest of the header chrome (Notifications bell 28 × 28, Search 38 × 38) for the same pattern — likely a shared `VcButton size="icon"` token that's undersized.
4. Verify that `data-test-id="back-to-operator-row"` (the Stop-Impersonation control) keeps its 256 × 49 px PASS dimensions during any shared-token refactor.

## Evidence

- Audit report: `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/report.md` (Finding F-03)
- Measurements: `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/01-company-members/measurements.json`
- FAIL screenshot: `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/01-company-members/01-mobile-BL-UI-006-FAIL.png`
- Account-dropdown FAIL: `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/04-banner-persistence/04-375-BL-UI-006-logout-inaccessible-FAIL.png`

## Related

- [BUG-A11Y-undersized-touch-targets.md](BUG-A11Y-undersized-touch-targets.md) — broader mobile-only sweep (375×812) covering home, catalog, product cards. The instances here extend the same shared-token defect to desktop viewports on `/company/members` and the account dropdown specifically.
- [VCST-4905](https://virtocommerce.atlassian.net/browse/VCST-4905) — LoginOnBehalf UX. The impersonation trigger lives in the affected Actions dropdown; the Logout button is one of two stop-impersonation paths on desktop.
- [BUG-UIUX-A-members-dropdown-missing-aria-roles-VCST-4906.md](BUG-UIUX-A-members-dropdown-missing-aria-roles-VCST-4906.md) — VCST-4906 a11y audit follow-up: same row trigger also has no `tabindex`, no accessible name, and the popup has no `role="menu"`. That report covers keyboard/ARIA failures; this report covers the touch-target size failure.
