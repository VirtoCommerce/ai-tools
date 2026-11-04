# BUG: Select branch modal — white square corners behind the pill-shaped search input

## Status: READY_TO_SUBMIT
**Found by:** human
**Tracker:** [VCST-6679](https://virtocommerce.atlassian.net/browse/VCST-6679)

**Severity:** Low (cosmetic) · **Priority:** P3 · **Type:** UI/Visual (regression) · **Root cause:** code logic (styles)

## Summary
In the **Select branch** modal the search input is a pill (Paprika theme, `--vc-input-radius: 9999px`), but its
wrapper keeps a square white background. White square corners show on the beige header strip at both ends of
the input, and the wrapper sticks out 2px past the input on the right.

## Environment
- **Stand:** vcptcore-qa storefront (`FRONT_URL`), B2B-store; also seen on virtostart (reported, not re-checked)
- **Theme:** vc-frontend-next 3.2.0 (vc-deploy-dev `vcptcore-qa` → `vc-frontend-next-3.2.0.zip`)
- **Browser:** Chromium (Playwright), 1920×1080, 2026-11-03
- **Account:** `ORG_USER_EMAIL` (any signed-in buyer)

## Steps to Reproduce
1. Sign in to the storefront and open **Catalog**.
2. Turn on the **Available at branches** toggle → the **Select branch** modal opens.
3. Look at the left and right ends of the **Search by address and name** input.

**Reproduction rate:** 100%

## Expected
- The area behind the input matches the header strip (`bg-neutral-50`) or follows the input's radius — no
  visible corners outside the pill.

## Actual
- White square corners at both ends of the pill input; on the right the white block extends 2px past it.

![modal](../../screenshots/Select-Branch-Search-White-Corners/01-select-branch-modal-vcptcore.png)

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | computed styles below; `01-select-branch-modal-vcptcore.png` |
| 2. Backend Admin | N/A | pure CSS |
| 3. GraphQL xAPI | N/A | pure CSS |
| 4. Platform REST API | N/A | pure CSS |

**Owning layer:** Layer 1 — Storefront

## Root Cause Analysis
Computed (live): `.vc-input__container` — `border-radius: 9999px`, bg white, 760px wide; its parent
`div.flex.h-11.grow.items-center.bg-additional-50.pr-2.5.sm:pr-0.5` — bg white, `border-radius: 0`, 762px wide;
the strip around it (`bg-neutral-50`) is beige.

- `vc-frontend-next/client-app/shared/fulfillmentCenters/components/branch-search.vue:3` — the wrapper carries
  `bg-additional-50` and `sm:pr-0.5` (unchanged since 2025-03).
- `vc-frontend-next/client-app/assets/styles/_paprika.scss:89` — `--vc-input-radius: 9999px` turned the input into
  a pill, which exposed the wrapper's square white background.
- Fix idea: drop `bg-additional-50` (and `sm:pr-0.5`) on the wrapper, or round it with `--vc-input-radius`.

**Need hotfixes:** not set — stable bundles v16/v15 pin classic `vc-frontend` (2.59.0 / 2.51.1), which has no
Paprika theme and no pill input radius.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend-next
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** shared/fulfillmentCenters — `branch-search.vue` (Select branch modal)
- **RCA anchor:** `client-app/shared/fulfillmentCenters/components/branch-search.vue:3`
- **Routing confidence:** HIGH
