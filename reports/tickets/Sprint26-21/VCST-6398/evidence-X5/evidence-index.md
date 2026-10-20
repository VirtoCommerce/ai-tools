# Evidence index — VCST-6398 X5 (empty `view_item_list` on a zero-result grid)

**Env:** TEST_ENV=vcst (vcst_qa) · storefront `{{FRONT_URL}}` · theme footer `Ver. 3.1.0-pr-11-d67b-d67b0e0a` (vc-frontend-next PR #11 head d67b0e0a — matches the brief) · role **guest** · browser `playwright-edge` 1920 · 2026-10-20 15:53–15:55 UTC
**Result:** REPRODUCED 3/3 (two categories + /search)

| # | Slot | Artifact | What it shows |
|---|---|---|---|
| 1 | Failure screenshot | `screenshots/X5-attempt1-printers-no-results.png` | /printers?q=zzqxnomatch — "no results" empty grid |
| 2 | dataLayer read | `network/datalayer-attempt1-printers.json` | i5 `view_item_list` category_printers_page_1 (15) → i7 `search` items_count 0 → **i8 `view_item_list` category_printers_page_1 `items: []`, items_count 0** → i9 `view_search_results` results_count 0 |
| 3 | API response | `network/req213-response.json` | `products.totalCount: 0, items: []` — backend correct |
| 4 | API response | `network/req214-response.json` | search-dropdown query, all three connections totalCount 0 |
| 5 | Network list | `network/requests-attempt1-printers.txt` | all GraphQL 200, no 4xx/5xx |
| 6 | Trace ID | `traceparent 00-c00d44a6df27411fa64678952892f87c-1340d4979756423a-01` (req 213) | join key; no server-side fault, App Insights not needed (API correct) |
| 7 | Failure screenshot | `screenshots/X5-attempt2-search-no-results.png` | /search?q=zzqxnomatch2 — 0 results |
| 8 | dataLayer read | `network/datalayer-attempt2-search.json` | **`view_item_list` category_undefined_page_1 `items: []`** + view_search_results 0 (also re-shows KB-456FD813 `category_undefined`) |
| 9 | Failure screenshot | `screenshots/X5-attempt3-accessories-no-results.png` | /accessories?q=zzqxnomatch3 — 0 results |
| 10 | dataLayer read | `network/datalayer-attempt3-accessories.json` | page_1 (18) → search 0 → **view_item_list page_1 items_count 0** → view_search_results 0 |
| 11 | Console | `console/console-all-warnings.log` | 0 errors, 0 warnings |
| 12 | HAR | `results/VCST-6398/har/X5-edge.har` (gitignored) | whole session, all three attempts |
| 13 | Source | vc-frontend-next @ d67b0e0a — `client-app/shared/catalog/components/category.vue` L656 (`fetchProducts`), L628 (`changeProductsPage`); `client-app/modules/google-analytics/events.ts` L15–35 | see root-cause.md |
