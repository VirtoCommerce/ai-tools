# BUG: /account/lists off-grid spacing values at md+ breakpoints

## Status: FIXED

## Resolution

**Fixed in:** vc-frontend PR [#2292](https://github.com/VirtoCommerce/vc-frontend/pull/2292) — bundled fix for VCST-5110, VCST-5111, VCST-5066, VCST-5067
**Fixed theme version:** 2.49.0 (released; vcst-qa current deploy)
**Verified:** 2026-05-20 by Elena Mutykova
**JIRA:** [VCST-5111](https://virtocommerce.atlassian.net/browse/VCST-5111) — transitioned to **Done** (resolution: Done) on 2026-05-20T13:47
**Assignee at fix:** Maya Diachkovskaia
**Method:** User-driven verification on vcst-qa storefront after PR #2292 deploy.

**Fix scope (from bug surface):**
Replaced half-step Tailwind spacing utilities with on-grid (4 px) values across three elements:
- `.vc-container.account-shell` `pb-9` (36 px) → `pb-8` (32 px) or `pb-10` (40 px)
- `.link-lists__wrapper` `pl-2.5` (10 px) → `pl-2` (8 px) or `pl-3` (12 px)
- List card separator `md:space-y-2.5` (10 px) → `md:space-y-2` (8 px) or `md:space-y-3` (12 px)

Restores 4-px design-system grid rhythm at md+ breakpoints.

---

## Status (historical): READY_TO_SUBMIT (filed as VCST-5111)

**Severity:** Medium
**Component:** Storefront — Account layout (account-shell + sidebar nav + list cards)
**Browser:** Chromium via Chrome DevTools MCP (audit); design-system violation independent of browser
**Environment:** `${FRONT_URL}` — vcst-qa (https://vcst-qa-storefront.govirto.com)
**Storefront Version:** 2.49.0-alpha.2342
**Platform Version:** (read from vc-deploy-dev/vcst-qa branch — fetch before submission)
**Module Versions:** N/A — pure frontend Tailwind utility class issue
**USER_EMAIL:** `.env` (USER_EMAIL on vcst-qa)
**USER_PASSWORD:** `.env`
**Date:** 2026-05-15
**Reported By:** QA Agent (`/qa-design` audit, `ui-ux-expert`)
**Audit ID:** `tests/Sprint-current/qa-design/account-lists-2026-05-15/`

## Summary

Three Tailwind half-step utility classes on `/account/lists` produce off-grid spacing values at the `md` breakpoint and above. The site spacing convention is a 4-px grid (Tailwind step scale `0, 1, 2, 3, 4, …` = `0, 4, 8, 12, 16, …` px). Half-steps (`2.5`, `3.5`) yield 10 px / 14 px which are off-grid and produce visually inconsistent vertical / horizontal rhythm.

| Element | Property | Measured | Nearest grid value | Active viewports |
|---------|----------|----------|--------------------|------------------|
| `.vc-container.account-shell` | `padding-bottom` | **36 px** | 32 (Tailwind `pb-8`) or 40 (`pb-10`) | 768, 1280 (mobile uses 24 px — on-grid) |
| `.link-lists__wrapper` (sidebar sub-list indent) | `padding-left` | **10 px** | 8 (`pl-2`) or 12 (`pl-3`) | All breakpoints |
| List card separator (`md:space-y-2.5` → child `margin-top`) | `margin-top` | **10 px** | 8 (`md:space-y-2`) or 12 (`md:space-y-3`) | md+ only (mobile uses `space-y-3` = 12 px — already on-grid) |

Mobile path is correct (uses `space-y-3` = 12 px) — the regression is specifically the desktop / tablet branch.

## Steps to Reproduce

1. Sign in to `${FRONT_URL}` as `USER_EMAIL` (any account with ≥ 1 wishlist).
2. Set viewport to 768 px or 1280 px.
3. Navigate to `${FRONT_URL}/account/lists`.
4. Inspect element via DevTools:
   - `document.querySelector('.vc-container.account-shell').getBoundingClientRect()` and check computed `padding-bottom`.
   - `document.querySelector('.link-lists__wrapper')` → computed `padding-left`.
   - Inspect any list-card item under the list grid — its `margin-top` (applied via `space-y-2.5` parent) computes to 10 px.

## Expected Result

All spacing values align to the 4-px design-system grid. Tailwind half-step classes (`2.5`, `3.5`) should not appear in production code unless explicitly documented as an exception.

## Actual Result

Three half-step values measured (36 px, 10 px, 10 px) — off-grid.

## Evidence

- Screenshot (1280 px FAIL): `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/1280/LAYOUT-SPC-001-1280-FAIL.png`
- Measurement JSON (1280 px): `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/1280/LAYOUT-SPC-001-1280.json`
- Measurement JSON (768 px): `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/768/LAYOUT-SPC-001-768.json`
- Console errors: none
- Network errors: none

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend (vc-frontend) | **FAIL** | Tailwind utility classes in `lists.vue` and `link-lists.vue` use half-step values |
| 2. Backend Admin (Admin SPA) | N/A | Pure presentation issue, no admin involvement |
| 3. GraphQL xAPI | N/A | No data layer involvement |
| 4. Platform REST API | N/A | No REST involvement |

**Owning layer:** Layer 1 — `vc-frontend` theme / components.

## Root Cause Analysis

- **Source files:**
  - `client-app/pages/account/lists.vue` (vc-frontend `dc1d39b`) — owns the `account-shell` padding and `space-y-2.5` on the list grid
  - `client-app/shared/account/components/account-navigation-link-components/link-lists.vue` — owns the `pl-2.5` on the sidebar sub-list indent
- **Suspected cause:** Authors used Tailwind half-step utilities (`pb-9`, `pl-2.5`, `space-y-2.5`) without a design-system justification. These half-steps exist in Tailwind for fine-grained adjustments but should not appear in default storefront layout code unless the design spec explicitly calls for them.
- **Why mobile passes:** Mobile branch uses `space-y-3` (12 px) and `pb-6` (24 px) — both on-grid. The regression is specific to the `md:` responsive variants.
- **Token-system note:** vc-frontend does not define `--spacing-*` CSS custom properties on `:root`; spacing is applied via Tailwind utilities directly. The 4-px grid invariant is therefore enforced at the utility level (avoid `*.5` step classes in default layout code) rather than via token resolution.
- **Recent changes:** No specific regression-introducing commit identified during pre-flight; recommend git blame on the three lines in the two files above.
- **App Insights:** N/A — pure presentation, no server-side signal.

## Suggested Fix

| Element | Current class | Replace with |
|---------|---------------|--------------|
| `.account-shell` (`md`/`lg`) padding-bottom | `md:pb-9` (or equivalent) | `md:pb-8` (32 px) or `md:pb-10` (40 px) — pick by visual review |
| `.link-lists__wrapper` padding-left | `pl-2.5` | `pl-2` (8 px) or `pl-3` (12 px) |
| List-card separator (`md`+) | `md:space-y-2.5` | `md:space-y-2` (8 px) or `md:space-y-3` (12 px) — prefer matching the mobile value `space-y-3` for consistency |

Choosing the larger step (40 / 12 / 12) keeps the layout slightly airier; the smaller step (32 / 8 / 8) makes it slightly denser. Recommend matching mobile's `space-y-3` for the list separator to keep vertical rhythm consistent across breakpoints.

## Affected Suite / Regression Coverage

- Suite: `regression/suites/Frontend/cross-cutting/048b-layout-stability.csv`
- Test ID: `LAYOUT-SPC-001`
- Invariant: BL-UI-002 (Spacing grid alignment) — `business-logic.md` Domain 15

## References

- JIRA: **VCST-5111** — https://virtocommerce.atlassian.net/browse/VCST-5111
- Audit report: `tests/Sprint-current/qa-design/account-lists-2026-05-15/report.md`
- Critical UI scope: `.claude/agents/knowledge/critical-ui-scope.md` (Pages matrix row `/account/lists`)
