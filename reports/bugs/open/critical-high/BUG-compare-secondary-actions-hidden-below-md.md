# Compare v2 — the entire secondary-action set is hidden below `md`, so a phone user cannot clear their list — P1

## Status: FILED — VCST-5871
**Tracker:** [VCST-5871](https://virtocommerce.atlassian.net/browse/VCST-5871) — Sub-task of VCST-5735
**Found by:** VCST-5735 `/qa-test` FULL run · suite 098 (CMP-003, CMP-031) · triaged REAL_BUG · IN-SCOPE
**Archetype:** `RENDER`

**Severity:** P1 · **Type:** Responsive visibility (BL-UI-004 reachability; WCAG 1.4.10 reflow)

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
One stylesheet rule hides **the whole secondary-action set** below the `md` breakpoint — `Clear all`,
`Clear category` and every row **Pin** control vanish together. The overflow (⋯) menu the ticket says
should hold them was never built, so **a phone user has no way to clear their compare list at all**;
the only remaining path is removing products one at a time. The same rule is reached on a desktop by
**browser zoom**, which crosses `md`: at 200% the clear controls go, at 400% all 9 pins and every
tooltip trigger go with them.

The controls are **present in the DOM and computed `display:none`** — this is a responsive-visibility
defect in a stylesheet, not an unimplemented feature. That distinction drives the fix size.

## Steps to Reproduce
1. On `{{FRONT_URL}}`, add 3+ products in one category to compare, open `/compare`.
2. At **1280 px** — `Clear all`, `Clear category` and the per-row pin controls are all present.
3. Resize to **375 px**. All three are gone. Search the DOM for an overflow/⋯ trigger — there is none.
4. Return to 1280 px and set **browser zoom to 200%** — `Clear all` and `Clear category` disappear.
5. Zoom to **400%** — all 9 pin controls and every info-tooltip trigger disappear.

## Expected vs Actual
- **Expected:** every list-management control reachable at 1280 px is reachable at 375 px and at zoom —
  directly, or through the overflow menu the description specifies (bullet 9).
- **Actual:** `div.compare-products__actions` (wrapping `Clear all`) computes `display:none`; the
  `Clear category` button computes `display:none` while its wrapper stays visible; `__row-pin` and
  `__row-info` are hidden by the same `md` guard. No overflow menu exists anywhere in the DOM.

Per-product remove **does** survive at 375 px, so the list is emptiable one product at a time — which is
why this is P1 and not P0.

Evidence: `reports/tickets/Sprint26-17/VCST-5735/screenshots/CMP-003-FAIL-375px-no-clear-controls.png`,
`CMP-031-FAIL-zoom200-clear-all-hidden.png`, `CMP-031-FAIL-zoom400-pin-info-hidden.png`

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | computed-style probe at 375/1280 + zoom; screenshots above |
| 2. Backend Admin | N/A | no admin surface — pure client-side CSS |
| 3. GraphQL xAPI | N/A | no request involved; controls are static markup |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 1 — Storefront

## Root Cause
A `@media (width < theme("screens.md"))` guard applies `display:none` to the secondary-action controls
in `compare-table.vue` / `compare-products.vue`. Browser zoom reduces the CSS-px viewport, so it crosses
the same breakpoint — one rule, two triggers. The ticket's bullet 9 specifies that these actions move
into an overflow (⋯) menu at mobile; that menu is absent, so hiding them removes them outright.

## Notes for the fix
`VC-UI-004` (state-dependent layout bugs are not duplicates) does **not** split this into two reports:
that rule is about different *states*, and 375 px and 400%-zoom are the same state reached two ways.
One stylesheet fix closes both. Filing separately would produce two half-fixes and a duplicate.

The accessibility dimension (WCAG 1.4.10 reflow, recorded as A11Y-8) is **folded into this report
deliberately** rather than filed as a standalone a11y ticket: a control the user cannot reach because it
is clipped is a reachability failure, not a cross-cutting accessibility property.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform (no `project-profile.json` — native deployment)
- **Component / module:** `client-app/shared/compare/components/compare-table.vue`, `client-app/pages/compare-products.vue`
- **RCA anchor:** the `md` media guard applying `display:none` to `compare-products__actions`, `compare-table__clear-category`, `compare-table__row-pin`, `compare-table__row-info`
- **Routing confidence:** HIGH
