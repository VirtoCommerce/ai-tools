# VCST-6100 — Fix verification: search-bar `view_item_list` on page load

**Verdict: VERIFIED** — RED reproduced on the pre-fix build, GREEN 3/3 on the fixed build, checklist 10/10 PASS.
No regression found. One pre-existing Low observation (identical on both builds), not caused by the fix.

| | Pre-fix (RED) | Fixed (GREEN) |
|---|---|---|
| Storefront | `{{FRONT_URL}}` (TEST_ENV=vcst) | `http://localhost` (`X-VC-Local-Theme: fe-62832fa1b19a`), /graphql proxied to vcst-qa |
| Theme (footer) | `Ver. 2.59.0-pr-2524-3069-30691594` | `Ver. 2.59.0-pr-2529-bc4b-bc4b9a08` |
| Store / user | B2B-store, anonymous | B2B-store, anonymous |

Browser: playwright-chrome (Chromium 150), 1920x1080, fresh tab per run, 2026-10-05 16:11–16:19 UTC.
Evidence = `window.dataLayer` read after a 4–6 s wait (GA4 dataLayer read; DOM presence measured with `getBoundingClientRect` on `.search-dropdown`).

## Phase A — RED baseline (pre-fix, vcst-qa)

`/search?q=tablet`, search box not touched, `.search-dropdown` count = 0. dataLayer (gtag `event` entries):

```
view_item_list  item_list_id=search_bar                 search_term=tablet  items=8   <- the bug
view_item_list  item_list_id=category_undefined_page_1                      items=16
view_search_results                                     search_term=tablet
```

Matches KB-6F0094B3 (confirmed, deployment vcst_qa). Screenshot: `screenshots/A-vcst-prefix-search-q-tablet-dropdown-closed.png`.

## Phase B — STR on the fixed build (localhost), 3 consecutive fresh tabs

| Run | `.search-dropdown` | search_bar impressions | Other events |
|---|---|---|---|
| 1 | 0 | **0** | grid `view_item_list` category_undefined_page_1 (16) + `view_search_results` tablet |
| 2 | 0 | **0** | same |
| 3 | 0 | **0** | same |

The hidden prefetch is kept: 7 `/graphql` calls on load on both builds. Screenshot: `screenshots/B-localhost-fixed-search-q-tablet-dropdown-closed-run1.png`.

## Checklist

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | RED reproduced pre-fix | PASS | Phase A: 1 search_bar impression, dropdown absent |
| 2 | GREEN 3/3 on localhost | PASS | Phase B: 0/0/0 |
| 3 | Opening the dropdown sends exactly one impression, items = dropdown | PASS | click prefilled box: dropdown 484 px, +1 `view_item_list` search_bar, 8 items; the 8 names, prices and order match the dropdown Products list (TB-001 "AGENT-TEST-Tablet 10-inch" $399.99 … ALCOE9866 $129.00) |
| 4 | Typing a new phrase | PASS | Escape cleared the box, then typed "laptop": +1 impression (search_term laptop, 8 items) on both builds; no duplicates |
| 5 | Results-page events unchanged | PASS | grid `view_item_list` (category_undefined_page_1, 16 SKUs, same list) + `view_search_results` (tablet; GA hit carries results_count 80, the same 16 visible_items) identical on both builds |
| 6 | No new console errors / failed requests | PASS | 0 console errors and 0 warnings on both builds; every request 200/204 (localhost: 0 non-2xx in the full log); no WebSocket /graphql errors seen |
| 7 | Close and reopen | PASS | click outside + reopen with the phrase: +1 per open on both builds. Escape + reopen with an empty box: +0 on both builds |
| 8 | `?barcode=0000000000000&q=tablet`, box not touched | PASS | localhost: 0 search_bar impressions (pre-fix: 1, search_term tablet). Screenshot `screenshots/B-localhost-barcode-plus-q-dropdown-closed.png` |
| 9 | 390 px, `/search?q=tablet` on load | PASS | localhost: 0 search_bar impressions (pre-fix: also 0). Extra: tapping *Toggle search bar* opens the overlay and pushes 1 impression on both builds. Viewport set back to 1920 |
| 10 | BL-GA4-001 schema on the item-3 impression | PASS | `items` is an array; each item has `item_id` (SKU), `item_name`, `affiliation` "B2B-store", `currency` "USD", `price`, `discount`, `index`, `item_list_id/name`, `item_category`..`item_category3/5`; no `items_skus`. `item_brand` key is present with an undefined value on every item on BOTH builds (these products have no brand), so it is not a fix delta |

### Item-3 impression payload (fixed build, trimmed)

```json
{"event":"view_item_list","search_term":"tablet","item_list_id":"search_bar",
 "item_list_name":"Search phrase 'tablet'","items_count":8,"items":[
 {"index":0,"item_id":"TB-001","item_name":"AGENT-TEST-Tablet 10-inch","affiliation":"B2B-store",
  "currency":"USD","price":399.99,"discount":0,"item_category":"Catalog",
  "item_category2":"Electronics — B2B Store","item_category3":"Tablets"},
 {"index":1,"item_id":"ALCOE9797","affiliation":"B2B-store","currency":"USD","price":47,
  "item_category":"Catalog","item_category2":"Accessories","item_category3":"Aliexpress",
  "item_category4":"Computer, Office, Education","item_category5":"Notes and tablets"},
 "... 6 more: ALCOE1858, ALCOE6367, ALCOE4191, ALCOE0129, ALCOE1819, ALCOE9866"]}
```

Screenshot: `screenshots/B-localhost-fixed-dropdown-open-one-search-bar-impression.png`.

## Behaviour comparison (impressions per action)

| Action | Pre-fix | Fixed |
|---|---|---|
| Load `/search?q=tablet`, dropdown closed (1920) | 1 | **0** |
| First open of the dropdown (prefilled phrase) | +1 (so 2 for one view) | +1 (1 in total) |
| Escape (clears the box), reopen with empty box | +0 | +0 |
| Type "laptop" | +1 | +1 |
| Click outside, reopen with the phrase | +1 | +1 |
| Load `?barcode=…&q=tablet` | 1 | **0** |
| Load at 390 px / open the overlay | 0 / +1 | 0 / +1 |

## Observations (not filed)

- **Low, pre-existing, both builds:** Escape closes the dropdown and clears the search box, but reopening it with the
  box empty still lists the previous phrase's Pages, Categories and 8 Products. No impression is sent for them. Screenshot:
  `screenshots/B-localhost-escape-cleared-box-reopen-shows-stale-tablet-results.png`.
- On both builds, `/search?barcode=0000000000000&q=tablet` ran a keyword search for "tablet" (16 grid items,
  `view_search_results` search_term tablet). KB-71011C1F and KB-B41CE06E (barcode wins) were recorded on a PR-2501
  build, so this may be a build or config difference and not a regression. Not disputed. Worth a look by whoever owns barcode search.
- One anomaly: the first load, in a tab that already existed in the session, had no ecommerce events at all, and
  GA `js` ran about 11 s after navigation. It did not happen again in any of the 10 or more later fresh-tab loads. Tabs also closed
  while the run was in progress (8 tabs became 2), which suggests that **another agent was using the playwright-chrome server at the
  same time**. Every verdict above comes from a page's own dataLayer, read right after that page loaded.

## KB

- Confirmed **KB-6F0094B3** (vcst_qa): search_bar was pushed on load with the dropdown never opened.
- Captured **KB-8A1B3406** (vcst_qa): one search_bar impression per dropdown open. Escape clears the box, and reopening it empty shows stale results with no impression.
  Nothing about the localhost build was recorded as a vcst_qa fact.
