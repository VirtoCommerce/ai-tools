# Compare v2 — header and body are two separate tables, so no column header is associated with any cell — P1

## Status: FILED — VCST-5880
**Tracker:** [VCST-5880](https://virtocommerce.atlassian.net/browse/VCST-5880) — standalone Bug (accessibility: never a Sub-task, does not block VCST-5735)
**Found by:** VCST-5735 `/qa-test` FULL run · visual axis A11Y-5 · IN-SCOPE
**Archetype:** `A11Y`

**Severity:** High/P1 · **Type:** Accessibility — info and relationships (WCAG 1.3.1)
**Standalone ticket, NOT a Sub-task of VCST-5735.**

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
The comparison renders as **two separate `table` elements** — one for the product header row, one for the
attribute body — so `scope="col"` **cannot** associate a product with its own cells: the association
mechanism does not cross a table boundary. Compounding it, **every table element is overridden to
`display: block` / `flex`**, which strips the implicit table semantics the association would rely on.

For a screen-reader user the result is a flat list of values with no way to tell **which product** any
value belongs to. On a comparison table, that is the entire content of the page.

## Steps to Reproduce
1. Open `/compare` with 3 products.
2. Inspect the DOM: the header row and the attribute rows sit in two distinct `table` elements.
3. Check computed `display` on `table` / `thead` / `tr` / `td` — `block` or `flex`, not `table*`.
4. Navigate the table with a screen reader in table mode — no column header is announced with a cell.

## Expected vs Actual
- **Expected (WCAG 1.3.1):** each data cell is programmatically associated with its product column — one
  table with `scope="col"`, explicit `headers` / `id` pairing, or an ARIA grid carrying the relationship
  without relying on native table semantics.
- **Actual:** no association exists in either direction.

## A gap in our own oracles, recorded rather than glossed
`ECL-15.1` notes this shape and **no `BL-A11Y-*` invariant as written covers it** — `BL-A11Y-001..004`
cover keyboard, accessible names, contrast and axe Critical/Serious, and a split-table association failure
falls between them. This is a **PROPOSED-BL candidate** for `/qa-review-oracles`, not an invariant citation.
Filed against WCAG 1.3.1 directly rather than inventing a BL id.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | DOM structure + computed `display` probe |
| 2. Backend Admin | N/A | presentation only |
| 3. GraphQL xAPI | N/A | no request involved |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 1 — Storefront

## Why this is filed on its own, not as a Sub-task
Same reasoning as the sibling a11y tickets. Note additionally that the split-table structure is **what makes
the sticky header work at all**, so this is a design tension to resolve rather than a slip — which is a
second reason it needs its own ticket and its own conversation instead of riding a redesign story.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend` · **repoKind:** frontend · **Ownership hint:** platform
- **Component / module:** `client-app/shared/compare/components/compare-table.vue`
- **RCA anchor:** two sibling table roots (sticky header + scrolling body) with `display` overridden on every table element; no `headers` / `id` pairing and no ARIA grid roles
- **Routing confidence:** MEDIUM — the repo is certain; the fix shape is a design decision (ARIA grid vs a single table with a different sticky mechanism), so `/qa-fix` Gate 0 may well BAIL this as too-complex
