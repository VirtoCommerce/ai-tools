# Compare v2 — two configuration sections sharing a display label collapse into one row, hiding a choice the customer is charged for — P2

## Status: FILED — VCST-5876
**Tracker:** [VCST-5876](https://virtocommerce.atlassian.net/browse/VCST-5876) — Sub-task of VCST-5735
**Found by:** VCST-5735 `/qa-test` FULL run · suite 098 (CMP-017) · triaged REAL_BUG · IN-SCOPE
**Archetype:** `SILENT`

**Severity:** P2 · **Type:** Rendering / data mapping

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
Compare's configuration rows are keyed by the section's **display label**, so a configurable product with
two sections sharing a label renders **one row instead of two** and one configured value never appears.
The price cell still includes the hidden choice, so the customer sees a total they cannot account for
from the comparison in front of them.

## Steps to Reproduce
1. Configure `@td(CFG_DUPLABEL.name)` — a product with two sections **both labelled "Finish"**
   (exterior and interior), selecting a priced option in each.
2. Add it to compare and open `/compare`.
3. Read the configuration rows and the price cell.

## Expected vs Actual
- **Expected:** two configuration rows, one per configured section, each showing its own selection.
- **Actual:** **one** row rendered for two configured sections. `Exterior Gloss` shows; **`Interior
  Walnut` is absent from the table entirely.**

The price is the proof it is a *display* defect rather than a configuration failure:
**$180.00 = base $140 + Gloss $15 + Walnut $25.** The customer is priced for Walnut and never shown it.

Evidence: `reports/tickets/Sprint26-17/VCST-5735/screenshots/CMP-017-FAIL-duplicate-label-collapses-row.png`

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | one row rendered for two configured sections; price includes both |
| 2. Backend Admin | PASS | both sections exist and are distinct in the product's configuration |
| 3. GraphQL xAPI | PASS | `productConfiguration` returns **two** sections, both named "Finish", with distinct ids and options |
| 4. Platform REST API | N/A | not exercised — xAPI already returns correct data |

**Owning layer:** Layer 1 — Storefront. The data is correct at every layer below; only the render collapses it.

## Root Cause
`useCompareProductsPage` builds configuration rows keyed by the section's **label**. `add-to-compare-catalog.vue`
dropped `id` from the properties payload it emits (it previously sent `{id, label, value}` and now sends
`{label, value}`), so the section id is no longer available to disambiguate. Two sections with the same
display name therefore produce one key and one row.

The row-key prefixes (`field:` / `property:` / `config:`) exist precisely to stop a catalog property
shadowing a built-in row — the same collision class, one level down, which is guarded there and not here.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform (no `project-profile.json` — native deployment)
- **Component / module:** `client-app/shared/compare/composables/useCompareProductsPage.ts`, `client-app/shared/compare/components/add-to-compare-catalog.vue`
- **RCA anchor:** configuration rows keyed by section label after `id` was dropped from the properties payload
- **Routing confidence:** HIGH
