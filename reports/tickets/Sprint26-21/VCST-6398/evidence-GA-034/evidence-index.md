# Evidence index — GA-034 (suite 043), VCST-6398 triage, REG-2026-10-20-1418

- Env: TEST_ENV=vcst (vcst_qa), storefront theme `Ver. 3.1.0-pr-11-d67b-d67b0e0a` (footer, read from the page snapshot), guest, playwright-firefox 1920x1080, 2026-10-20 ~15:33 UTC
- Cache-busted URLs: `/agent-test-ga4-product-lists?cb=1760974400`, `/?cb=1760974500`
- Trace/operation id: N/A — pure client-side analytics path, no server request is involved in the verdict

| # | Artifact | What it shows |
|---|---|---|
| 1 | `screenshots/ga034-01-pb-test-page.png`, `screenshots/pb-test-page-snapshot.yml` | Page Builder test page on the Next build; snapshot carries the footer build string |
| 2 | (dataLayer read, inline below) | Test page, scrollY 0: 5 `view_item_list` = favorite_products 4, products_block 4 + 3, products_carousel 5 (titled) / 4 (untitled, no item_list_name); 5 `data-vc-track="product-list"` containers, 20 cards |
| 3 | `screenshots/ga034-02-home-demo-home-footer.png`, `screenshots/home-snapshot.yml` | Home `/` = `div.matcher > div.demo-home` (hero, categories, popular, suppliers, why-buy, changes, brands, cta) |
| 4 | (dataLayer read, inline below) | Home: 10 product-card elements, 0 product-list / data-list-id; dataLayer events gtm.js, gtm.dom, gtm.load only |
| 5 | `network/ga034-home-ga-requests.txt` | GA collect on `/`: `page_view`, `scroll` (90%) only — no view_item_list, also after End |
| 6 | `console/ga034-console.txt` | 0 errors |
| 7 | HAR `results/VCST-6398/har/GA-034-investigate-firefox.har` | Full session |

Source (gh, read-only), vc-frontend-next @ d67b0e0a87b1 (PR #11, OPEN) and `dev`:
- `client-app/pages/matcher/matcher.vue` L61-62: priorities forced `internal: 0` — "'internal' always wins so the built-in main page is never replaced by Builder.io or page builder content"
- `client-app/pages/matcher/internal.vue` L22: `"/"` → `pages/demo-home/demo-home.vue` (since a9f509b2, VCST-6048 #2508, 2026-09-24)
- `client-app/pages/demo-home/popular-section.vue`: `<ProductCard v-for>` ×10 from a fixed category, no `data-vc-track="product-list"` wrapper, no `analytics()` call; identical on dev and head (not in the dev...head diff)
- `client-app/core/plugins/dom-analytics/rules.ts` L3: "a card outside a `product-list` container sends nothing"
- Tracked Next blocks, e.g. `shared/static-content/components/recommended-products.vue` L9-13: `data-vc-track="product-list"` + `data-list-id`
- PR #11 body §"Analytics list roles — VCST-6017": scope = category, PDP variations, bought together, recently browsed (home not listed)
- Upstream vc-frontend 2.60.0 `matcher.vue`: no `internal: 0` override; `internal.vue` maps `/` to `pages/home.vue`, so PB content for `/` wins there (basis of KB-85F9B1ED "Daily Deals")
