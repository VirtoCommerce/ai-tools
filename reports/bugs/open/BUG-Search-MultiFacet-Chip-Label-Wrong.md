# BUG-SRCH-002: Second active-filter chip shows wrong facet name as prefix when multiple facets applied

## Status: CONFIRMED

**Severity:** Low | **Priority:** P3
**Env:** vcst-qa @ Platform 3.1028.0, Theme 2.50.0-pr-2291, XCatalog 3.1005.0
**Component:** Storefront — `active-filter-chips.vue` / `prepareFilters` in `useProducts.ts`
**Detected:** REG-2026-05-22-1650, Suite 005 (SRCH-NEW-043)

---

## Summary

When two or more facets are active simultaneously, each chip after the first displays the first facet's name as its prefix label instead of its own facet name. The value portion is also wrong — it shows the second facet's name rather than its selected value. Single-facet and sort-only states render correctly. Adding or changing the sort parameter does not affect this bug.

---

## Steps to Reproduce

1. Navigate to `/search?q=laptop&facets=%22COLOR%22%3A%22Black%22%2C%22FUNCTION%22%3A%22Gaming%22`
2. Observe the active filter chip bar.

**Result:** Two chips appear: `COLOR: Black` and `COLOR: FUNCTION`

**Expected:** `COLOR: Black` and `FUNCTION: Gaming`

Also reproducible with sort applied:
`/search?q=laptop&facets=%22COLOR%22%3A%22Black%22%2C%22FUNCTION%22%3A%22Gaming%22&sort=price-ascending` — same wrong chip labels.

---

## Expected vs Actual

| Chip | Expected | Actual |
|------|----------|--------|
| Chip 1 | `COLOR: Black` | `COLOR: Black` — correct |
| Chip 2 | `FUNCTION: Gaming` | `COLOR: FUNCTION` — wrong prefix AND wrong value |

---

## Evidence

- Screenshot (two-facet, no sort): `reports/bugs/screenshots/BUG-SRCH-002-multifacet-chip-label.png`
- Screenshot (two-facet + sort): `reports/bugs/screenshots/BUG-SRCH-002-multifacet-chip-with-sort.png`
- Live DOM: `.active-filter-chips .vc-chip` innerText = `["COLOR: Black", "COLOR: FUNCTION", "Show in stock", "Reset filters"]`

---

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | Chip label renders `COLOR: FUNCTION` — wrong facet name prefix and value |
| 2. Backend Admin | N/A | Filter chips are a pure frontend presentation component |
| 3. GraphQL xAPI | N/A | xAPI returns correct facet data; chip rendering is client-side only |
| 4. Platform REST API | N/A | No REST layer involved in chip label rendering |

**Owning layer:** Layer 1 — `vc-frontend` only.

---

## Root Cause

`active-filter-chips.vue` renders each chip as:

```typescript
`${formatFilterLabel(filterItem.label)}${getFormattedLabel(term.label || term.value)}`
```

The chip label prefix comes from `filterItem.label`. When the page loads with a multi-facet URL (`facets="COLOR":"Black","FUNCTION":"Gaming"`), `prepareFilters` in `useProducts.ts` reconstructs `SearchProductFilterResult[]` from the `filters` array returned by `searchProducts`. The `label` field of the second filter object is being set to the first filter's `name` value (`COLOR`) instead of the second filter's own label (`FUNCTION`). As a result both the prefix and the displayed value of the second chip are wrong.

The value shown (`FUNCTION`) is the second facet's `name` key being surfaced as the `term.label || term.value` rather than the selected value (`Gaming`).

**File:** `client-app/shared/catalog/components/active-filter-chips.vue`
**Supporting utility:** `client-app/core/utilities/search/facets.ts` (`generateFilterExpressionFromFilters` / parse path)
