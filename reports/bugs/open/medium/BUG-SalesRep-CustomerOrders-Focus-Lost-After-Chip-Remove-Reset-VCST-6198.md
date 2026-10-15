# BUG: [Sales Rep][a11y] Removing a filter chip or pressing "Reset filters" by keyboard drops focus to <body> — Medium

**Env:** vcptcore-qa, theme `2.59.0-pr-2519-1d9b-1d9bc6dc` (also reproduced on control vcptcore-qa1 `2.59.0-pr-2540-710a-710ab0fa`, a build without vc-frontend#2519 ⇒ PRE-EXISTING). Found by agent during /qa-test VCST-6001 (2026-10-06); Filed as VCST-6198 on 2026-10-07 (operator decision).
**Relates:** VCST-6001 · BL-A11Y-001 (focus management) · WCAG 2.4.3 · related family VCST-5869
**Tracker:** [VCST-6198](https://virtocommerce.atlassian.net/browse/VCST-6198), superseded by [VCST-6220](https://virtocommerce.atlassian.net/browse/VCST-6220), the combined Sales Rep a11y bug (2026-10-08).

## Summary
On `/company/customer-orders`, activating a filter chip's close button ("Remove filter “…”") or the external "Reset filters" button with the keyboard removes the element and leaves focus on `<body>`; a keyboard/screen-reader user is thrown back to the top of the document and must re-navigate to the grid.

## STR
1. Sign in as a sales rep, apply any date range (two chips appear).
2. Tab to a chip's close button → Enter. Check `document.activeElement`.
3. Apply again, Tab to "Reset filters" → Enter. Check `document.activeElement`.

## Expected vs Actual
- **Expected:** focus moves to a defined element (the next chip, the Filters button, or the results region).
- **Actual:** `document.activeElement` is `<body>` in both cases (PR build: C1 SR-CO-051; control: A/B item 8).

Evidence: run `REG-2026-10-06-1457` SR-CO-051 trace (`reports/regression/REG-2026-10-06-1457/traces/`).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | document.activeElement = <body> after chip close / Reset filters; C1 SR-CO-051 (REG-2026-10-06-1457), control A/B item 8 |
| 2. Backend Admin | N/A | — |
| 3. GraphQL xAPI | N/A | — |
| 4. Platform REST API | N/A | — |

**Owning layer:** Layer 1 — Storefront

## Root Cause Analysis
`client-app/modules/sales-rep/pages/customer-orders.vue` — `removeFilterChip()` and `resetFilters()` call `applyFilters(...)`, which removes the focused chip / the Reset chip from the DOM (`v-for="chip in filterChips"`, `v-if="filterChips.length"`), and nothing moves focus to a surviving element, so the browser falls back to `<body>`. Expected fix shape: after removal, focus the next chip, else the Filters trigger or the results region heading.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend `client-app/modules/sales-rep` (customer orders filter)
- **RCA anchor:** customer-orders.vue `function removeFilterChip(` / `function resetFilters(`
- **Routing confidence:** HIGH
