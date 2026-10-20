# Source findings — V11 (read via `gh api`, GitHub MCP down)

Refs read: vc-frontend-next @ d67b0e0a (PR #11 head, deployed theme 3.1.0-pr-11-d67b), vc-frontend @ 2.60.0, @ 2.59.0, @ 17ad3e6f6 (#2452).

| What | Where (d67b0e0a) | Quote |
|---|---|---|
| Counter N | `client-app/shared/compare/composables/useCompareProductsPage.ts:464` | `const differRowsCount = computed(() => tableRows.value.filter((row) => row.differs).length);` |
| Counter M | `client-app/pages/compare-products.vue:149` | `:total-rows="tableRows.length"` |
| Row `differs` | `useCompareProductsPage.ts:354` (+429, 452) | `differs: new Set(values).size > 1` — Availability values are `getAvailabilitySignature(product)` (l.76-87, 387) |
| Permanent rows | `client-app/shared/compare/components/compare-table.vue:360-361` | `// Always shown even under the "Differences" filter, regardless of row.differs.` / `const PERMANENT_ROW_KEYS = [PRICE_ROW_KEY, AVAILABILITY_ROW_KEY];` |
| Differences filter | `compare-table.vue:426-432` | `unpinnedRows.value.filter((row) => row.differs \|\| PERMANENT_ROW_KEYS.includes(row.key))` then `[...pinnedRows.value, ...rest]` |
| Intent | `client-app/shared/compare/constants.ts:16-20` | `// Keys of the rows that must always stay visible in compare-table.vue, even when the "Differences" filter is on.` |
| Label | vc-frontend 2.60.0 `locales/en.json:1138` | `"differ_rows": "Differ: {count} of {total} rows"` |

Upstream: identical `PERMANENT_ROW_KEYS` + filter in vc-frontend 2.60.0 (`compare-table.vue:355-356,421-424`), 2.59.0 (`:413-419`) and the feature commit 17ad3e6f6 `feat(VCST-5735): Compare products (#2452)` (`:347,411`). `constants.ts` has one commit only (17ad3e6f6). #2518 (8c788b038, VCST-5880 one native table) did not touch this logic.
PR #2452 body: Differences "hides rows that are identical across every product in view"; "Row pinning — any row can be pinned to stay visible ... including under the Differences filter." (Price/Availability exemption not in the body; only in code comments.)
No unit test pins the shown-vs-counted relation (`compare-table.test.ts`, `compare-products.test.ts` grep: no `PERMANENT`/differences-row-count assertion).
