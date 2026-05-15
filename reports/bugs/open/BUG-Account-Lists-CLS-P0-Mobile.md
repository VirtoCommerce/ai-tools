# BUG: /account/lists CLS exceeds budget at mobile (P0) and tablet

## Status: READY_TO_SUBMIT (filed as VCST-5110)

**Severity:** Critical (P0 at mobile, High at tablet)
**Component:** Storefront — Account / Wishlists (VcWidgetSkeleton on `/account/lists`)
**Browser:** Chromium via Chrome DevTools MCP (audit), reproducible on any browser
**Environment:** `${FRONT_URL}` — vcst-qa (https://vcst-qa-storefront.govirto.com)
**Storefront Version:** 2.49.0-alpha.2342
**Platform Version:** (read from vc-deploy-dev/vcst-qa branch — fetch before submission)
**Module Versions:** (relevant: vc-module-marketing for wishlists, vc-module-x-cart for GetWishlists xAPI)
**USER_EMAIL:** `.env` (USER_EMAIL on vcst-qa)
**USER_PASSWORD:** `.env`
**Date:** 2026-05-15
**Reported By:** QA Agent (`/qa-design` audit, `ui-ux-expert`)
**Audit ID:** `tests/Sprint-current/qa-design/account-lists-2026-05-15/`

## Summary

The `/account/lists` page exceeds the BL-UI-001 Cumulative Layout Shift budget at mobile and tablet viewports. Skeleton placeholder height does not match the final rendered card height, producing a series of large layout shifts when the skeleton swaps to populated list cards.

- **375 px (eff. 485 px after Chrome MCP chrome reservation):** CLS = **0.483** with 4 shifts — **P0** (5× the 0.25 threshold)
- **768 px:** CLS = **0.137** with 3 shifts — **FAIL** (above 0.10 threshold)
- **1280 px:** CLS = 0.064 with 5 shifts — PASS

## Steps to Reproduce

1. Sign in to `${FRONT_URL}` as `USER_EMAIL` (any account with ≥ 1 wishlist — test account on vcst-qa has 9 lists).
2. Set viewport to 375 px (mobile) or 768 px (tablet) — DevTools device emulation or browser resize.
3. Navigate directly to `${FRONT_URL}/account/lists` (or reload an already-open lists page).
4. Observe the skeleton grid render briefly, then swap to the populated list cards.
5. Measure CLS via Performance API (`PerformanceObserver` on `layout-shift` entries, sum non-input shifts up to network-idle + 1s) or via Chrome DevTools Performance panel.

## Expected Result

CLS ≤ 0.10 (PASS threshold per BL-UI-001 in `business-logic.md` Domain 15). Skeleton height should match the final card height so the swap produces no visible reflow.

## Actual Result

CLS = 0.483 at 375 px (P0 — 5× budget) and CLS = 0.137 at 768 px (above PASS threshold). Visible "jump" as skeleton swaps to taller mobile-stacked cards.

## Evidence

- Screenshot (375 px FAIL): `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/375/LAYOUT-PAGE-CLS-LISTS-001-375-FAIL.png`
- Screenshot (768 px FAIL): `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/768/LAYOUT-PAGE-CLS-LISTS-001-768-FAIL.png`
- Measurement JSON (375 px): `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/375/LAYOUT-PAGE-CLS-LISTS-001-375.json`
- Measurement JSON (768 px): `tests/Sprint-current/qa-design/account-lists-2026-05-15/storefront/768/LAYOUT-PAGE-CLS-LISTS-001-768.json`
- Console errors: none
- Network errors: none

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend (vc-frontend) | **FAIL** | CLS measurements + screenshots above; bug originates in the skeleton component rendered by `client-app/pages/account/lists.vue` |
| 2. Backend Admin (Admin SPA) | N/A | Layout/CLS is a frontend-rendering concern; admin SPA does not render the storefront wishlist UI |
| 3. GraphQL xAPI | N/A (related but not causal) | GetWishlists xAPI returns correctly; query latency amplifies the CLS window but does not cause it. See VCST-4617 (slow GetWishlists). |
| 4. Platform REST API | N/A | No REST endpoint involvement in the rendering path |

**Owning layer:** Layer 1 — `vc-frontend` theme / components.

## Root Cause Analysis

- **Source page:** `client-app/pages/account/lists.vue` (vc-frontend `dc1d39b`)
- **Suspected cause:** The skeleton widget used while the GetWishlists query resolves uses a fixed-height placeholder calibrated for the desktop flex-row card layout (~64 px). At narrow viewports the lists reflow to a stacked-content layout (taller card height), so the swap delta grows proportionally and the cumulative shift score escalates.
- **Why mobile is worse:** The CLS impact fraction = (impacted region area / viewport area). On mobile, the affected region spans the full width and a larger share of the viewport, so per-shift score grows; combined with multiple cards swapping, total CLS multiplies.
- **Related ticket:** VCST-4617 (slow GetWishlists query, 4+ s) is not the root cause but is a contributing factor — slower API extends the skeleton-visible window and gives the user more time to perceive the shift. Fixing VCST-4617 reduces severity but does not remove the underlying skeleton-mismatch bug.
- **Recent changes:** No specific commit identified during pre-flight; recommend the assignee inspect git blame on `client-app/pages/account/lists.vue` and any imported skeleton helper for the skeleton template.
- **App Insights:** No correlated server-side exceptions for the timeframe (CLS is client-rendering, not server-error).

## Suggested Fix

Three approaches (any one is sufficient; pick by effort/impact tradeoff):

1. **Viewport-aware skeleton height (preferred — least invasive)** — give the skeleton placeholder a `min-height` that matches the actual card-rendered height per breakpoint. Match the mobile stacked-content height at < `md`, the flex-row height at ≥ `md`.
2. **Aspect-ratio reservation** — wrap the skeleton in a container with `aspect-ratio: <w>/<h>` matching the final card so the reserved space adapts to viewport width automatically.
3. **SSR / inline initial state** — render the list grid server-side on first paint so no skeleton swap occurs (largest change; best CLS outcome).

## Affected Suite / Regression Coverage

- Suite: `regression/suites/Frontend/cross-cutting/048b-layout-stability.csv`
- Test ID: `LAYOUT-PAGE-CLS-LISTS-001`
- Invariant: BL-UI-001 (Cumulative Layout Shift) — `business-logic.md` Domain 15

## References

- JIRA: **VCST-5110** — https://virtocommerce.atlassian.net/browse/VCST-5110
- Related JIRA: **VCST-4617** — GetWishlists GraphQL query intermittently takes 4+ seconds on /account/lists page (Medium, To Do) — amplifies but does not cause this bug
- Audit report: `tests/Sprint-current/qa-design/account-lists-2026-05-15/report.md`
- Critical UI scope: `.claude/agents/knowledge/critical-ui-scope.md` (Pages matrix row `/account/lists`)
