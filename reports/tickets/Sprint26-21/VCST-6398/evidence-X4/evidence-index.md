# Evidence index — VCST-6398 X4: category infinite-scroll view_item_list repeats earlier pages

| Field | Value |
|---|---|
| TEST_ENV | `vcst` (deployment `vcst_qa`), ENV_RISK low (QA) |
| Storefront | `{{FRONT_URL}}` · footer `Ver. 3.1.0-pr-11-d67b-d67b0e0a` (vc-frontend-next PR #11 head `d67b0e0a`, merges vc-frontend 2.60.0) — see `screenshots/dom-home.md` line 733 |
| Browser / role | playwright-firefox 1920, **guest** (no sign-in) |
| Date (UTC) | 2026-10-20 15:25–15:28 |
| Reproduction rate | **3/3** — /printers End key (A1), /printers PageDown×4 (A2), /accessories End×2 to page 3 (A3) |
| Trace id (page-2 SearchProducts) | `traceparent 00-d8c5f47cfa1d43e9baa306ab03fa4892-3823a81faf0b4139-01` — server answered correctly (200, no `errors[]`); App Insights not required (client-only defect) |

## Mandatory artifacts (Part A)

| # | Artifact | File |
|---|---|---|
| 1 | Failure-state screenshot | `screenshots/X4-printers-page2-loaded.png`, `screenshots/X4-accessories-page3-loaded.png` |
| 2 | DOM snapshot (build footer, guest state) | `screenshots/dom-home.md` |
| 3 | Network list (attempt 1) | `network/requests.txt` |
| 4 | Request feeding page 2 (headers, cookie redacted) + bodies | `network/page2-searchProducts.txt`, `network/page2-searchProducts-{request,response}.json`; page 1: `network/page1-searchProducts-{request,response}.json` |
| 4b | The defective payload (window.dataLayer, read-only) | `network/datalayer-view_item_list-attempt1.json`, `-attempt2.json`, `-attempt3-accessories.json` |
| 5 | Trace id | above |
| 6 | Console (warnings+errors; 0 errors) | `console/console.txt` |
| 7 | HAR | `results/VCST-6398/har/X4-investigate-firefox.har` (39 MB; all 3 attempts) · prior exploratory `results/VCST-6398/har/X-exploratory-firefox.har` |
| 12 | Deployed theme version | footer (row above) |
| 13 | Source evidence | `root-cause.md` §Source |

## Observed (attempt 1, /printers, guest)

| Event | item_list_id | items | Content |
|---|---|---|---|
| view_item_list | `category_printers_page_1` | 15 | = page-1 API items (`SearchProducts first:18 after:0`, 15 returned) |
| view_item_list | `category_printers_page_2` | **21** | index 0–14 = the 15 page-1 ids again, index 15–20 = the 6 page-2 API items (`after:"18"`) |

A3 /accessories: page_1 18 items · page_2 36 (prefix == page_1) · page_3 54 (prefix == page_2). Every page-N event carries the whole grid, index restarting at 0.

Incidental (not this defect, not investigated): page-2 API response repeats a page-1 product (`555929564` A1, `555929578` A2; 10 repeats on /accessories page 3) and `totalCount` moves 21→24 between pages with `sort:""` — unstable pagination of `SearchProducts` with the `inStock_variations` filter.
