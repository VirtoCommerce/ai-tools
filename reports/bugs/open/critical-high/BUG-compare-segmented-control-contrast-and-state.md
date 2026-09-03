# Compare v2 — the All/Differences segmented control fails contrast AND exposes no selected state — P1

## Status: FILED — VCST-5879
**Tracker:** [VCST-5879](https://virtocommerce.atlassian.net/browse/VCST-5879) — standalone Bug (accessibility: never a Sub-task, does not block VCST-5735)
**Found by:** VCST-5735 `/qa-test` FULL run · visual axis A11Y-2 + A11Y-3 · IN-SCOPE
**Archetype:** `A11Y`

**Severity:** High/P1 · **Type:** Accessibility — contrast (1.4.3) + name/role/value (4.1.2)
**Standalone ticket, NOT a Sub-task of VCST-5735.**

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
Two defects on the same control, filed together because they share one component and one fix site.

**(a) Contrast — WCAG 1.4.3.** The **inactive** segment measures **4.34:1** against a 4.5:1 requirement at
14 px bold. Light mode only; dark mode passes.

**(b) Selected state is not exposed — WCAG 4.1.2.** The control reports `role: null`, `aria-pressed: null`,
`aria-checked: null`. A screen-reader user cannot tell which of All / Differences is active.

**The tell that (b) is an oversight rather than a design choice:** the **category tabs on the same page do
carry `aria-pressed`**. The pattern is understood in this codebase and was simply not applied here.

## Steps to Reproduce
1. Open `/compare` with 2+ products, light mode, Coffee theme.
2. Inspect the inactive segment's computed foreground/background — 4.34:1.
3. Inspect either segment's `role` / `aria-pressed` / `aria-checked` — all null.
4. Compare with a category tab in the same view — `aria-pressed` present.

## Expected vs Actual
- **Expected:** at least 4.5:1 on the inactive label; a `role="tab"` / `radiogroup`, or `aria-pressed` on
  each segment as the sibling tabs already do.
- **Actual:** 4.34:1, and no state exposed at all.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | computed contrast + ARIA property probe |
| 2. Backend Admin | N/A | presentation only |
| 3. GraphQL xAPI | N/A | no request involved |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 1 — Storefront

## Related — ALREADY FILED, do not raise again
A **separate** non-text-contrast defect (focus indicators: 1.47:1 on this page's pin, 1.40:1 on a neutral
ring over a grey field, 1.63:1 for 30% `#e52121` over white) is **already tracked** —
`reports/bugs/open/critical-high/BUG-storefront-focus-ring-token-cannot-reach-3to1.md`, attached to
**VCST-5653** *[UI-Kit] Focus indicators — WCAG 1.4.11 / 2.4.7*. It is not a component defect: the token
contract specifies the failure (`--outline-color` / `--focus-color` at 40% / 30% alpha cannot reach 3:1
against white for **any** mid-luminance hue), so the fix site is `preflight.scss` + `_colors.scss`, never a
component. **Do not file a third record of it** — the new sightings are an amendment to that report.

## Why this is filed on its own, not as a Sub-task
Same reasoning as the keyboard-scroll ticket: an accessibility defect is a property of the surface, not an
acceptance criterion of the story that edited it. Real severity kept; VCST-5735 is not blocked by it.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend` · **repoKind:** frontend · **Ownership hint:** platform
- **Component / module:** `client-app/shared/compare/components/` — the All/Differences segmented control
- **RCA anchor:** the segment renders as a plain button with a colour token below the 4.5:1 floor and no `aria-pressed`; the sibling tab component already sets it
- **Routing confidence:** HIGH
