# Compare table body cannot be scrolled by keyboard below 768 px — P1 (WCAG 2.1.1)

## Status: FILED — VCST-5878
**Tracker:** [VCST-5878](https://virtocommerce.atlassian.net/browse/VCST-5878) — standalone Bug (accessibility: never a Sub-task, does not block VCST-5735)
**Found by:** VCST-5735 `/qa-test` FULL run · visual axis A11Y-1 · IN-SCOPE
**Archetype:** `A11Y`

**Severity:** High/P1 · **Type:** Accessibility — keyboard operability
**Standalone ticket, NOT a Sub-task of VCST-5735** — see *Why this is filed on its own* below.

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
At <=767 px the compare table body scrolls horizontally (`scrollWidth 560` > `clientWidth 361`) but is
**unreachable by keyboard**: the scroller has **0 focusable descendants**, no `tabindex`, no `role` and no
accessible name. A keyboard-only or switch user cannot see any column past the first — roughly a third of
the comparison is unreachable.

## Steps to Reproduce
1. Open `/compare` at 375 px with 3+ products in one category.
2. `Tab` through the page. The table body scroller never receives focus.
3. With focus anywhere on the page, press the right-arrow or `End` — the body does not scroll.

## Expected vs Actual
- **Expected (WCAG 2.1.1 Keyboard):** a scrollable region is either focusable (`tabindex="0"` plus a `role`
  and an accessible name) or its content is reachable by focusing controls inside it.
- **Actual:** neither. The region is mouse/touch-only.

Measured: `scrollWidth 560`, `clientWidth 361`, `focusableDescendants 0`, `tabindex null`, `role null`,
`aria-label null`.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | DOM + computed-style probe at 375 px |
| 2. Backend Admin | N/A | presentation only |
| 3. GraphQL xAPI | N/A | no request involved |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 1 — Storefront

## Why this is filed on its own, not as a Sub-task of VCST-5735
Accessibility is a **cross-cutting property of a surface**, not an acceptance criterion of the story that
touched it. A Sub-task asserts the parent caused the defect; filing it there fails a story for something it
did not introduce, and the predictable response is that the axis gets switched off or the severity gets
re-graded down to clear the gate. It keeps its **real severity** and does **not** block VCST-5735.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend` · **repoKind:** frontend · **Ownership hint:** platform
- **Component / module:** `client-app/shared/compare/components/compare-table.vue`
- **RCA anchor:** the body scroll container (`.compare-table__scroll`) carries no `tabindex` / `role` / accessible name
- **Routing confidence:** HIGH
