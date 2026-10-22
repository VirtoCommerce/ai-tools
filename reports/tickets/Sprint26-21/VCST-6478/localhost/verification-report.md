# VCST-6478 — fix verification (GA4 select_item / view_item item fields)

**Verdict: FIXED** for currency and list id/name on every path checked; `index` on the select_item item is still absent (expected, deliberately out of scope of PR #2598).

| | Build | Proof |
|---|---|---|
| RED | vcst-qa storefront (`FRONT_URL` in `.env.vcst`), theme `2.61.0-pr-2570-2fc9-2fc9261a` | version string in main bundle `assets/index-*.js` |
| GREEN | http://localhost, theme `2.61.0-pr-2598-fd57-fd578365` | `X-VC-Local-Theme: fe-ce38a854b655` on `/`; same version string in bundle |

Lane: playwright-chrome, 1920x1080, sequential. Data: vcst-qa backend (B2B-store) on both.
Capture method: the storefront is an SPA, so a card click is a client-side route change and `window.dataLayer`
survives it. Before each action I noted `dataLayer.length` and read `dataLayer.slice(n)` filtered to
gtag `['event', name, payload]` objects (the shape this build pushes). No beforeunload hook was needed.
Recently-browsed opens a new tab; select_item was read in the originating tab.
Raw JSON: `evidence/` (one file per check/run). HAR: `test-results/chrome/har/session.har` (lane default).

## Results

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | RED baseline on vcst-qa `/printers` | PASS (bug reproduced) | `red-select_item-view_item.json`, `red-view_item_list.json` |
| 2 | GREEN STR x3 (Canon idx0, Brother, Epson WF-2750) | PASS 3/3 | `green-run{1,2,3}-select_item-view_item.json` |
| 3 | `index` on select_item item (localhost) | ABSENT (recorded; ticket Expected not met, known/deferred) | same files |
| 4 | add_to_wishlist item currency = event currency (signed in) | PASS (RED: item had no currency) | `green-check4-add_to_wishlist.json`, `red-check4-add_to_wishlist.json` |
| 5 | view_item_list items keep index/currency/list id/name | PASS (13/13 items, index 0..12) | `green-check5-view_item_list.json` |
| 6 | Header search dropdown select_item | PASS (RED: no currency/list fields) | `green-check6-*.json`, `red-check6-*.json` |
| 7 | PDP "Customers bought together" select_item | PASS (RED: no currency/list fields) | `green-check7-*.json`, `red-check7-*.json` |
| 8 | Cart "Recently browsed" select_item (signed in) | PASS (RED: no currency/list fields) | `green-check8-*.json`, `red-check8-*.json` |
| 9 | Currency switch USD -> EUR | PASS (items and events EUR; switched back to USD) | `green-check9-EUR-select_item-view_item.json` |
| 10 | Console / network, new on localhost | No product regression; 1 env artefact (below) | console logs in `test-results/chrome/` |

Check 8 used Recently browsed only: the user's cart was empty, so no item was added (no cart mutation to clean up).
Other item fields (item_id, item_name, affiliation, price, discount, item_category1-4) are present on every GREEN item
(item_brand appears only where the source list supplies it, same as RED).

## Example items (Canon Imageclass MF232W, /printers card 1)

RED select_item item (event has `item_list_id: category_printers_page_1`):
```json
{"item_id":"566903892","item_name":"Canon Imageclass WiFi MF232W Monochrome Laser Printer/Scanner/Copier","affiliation":"B2B-store","price":189,"discount":0,"item_category":"Catalog","item_category2":"Printers","item_category3":"Laser Printers","item_category4":"Laser Monochrome"}
```
RED view_item (event `{"currency":"USD","value":189}`) item: identical to the above, no `currency`.

GREEN select_item item:
```json
{"item_id":"566903892","item_name":"Canon Imageclass WiFi MF232W Monochrome Laser Printer/Scanner/Copier","affiliation":"B2B-store","currency":"USD","item_list_id":"category_printers_page_1","item_list_name":"Category \"Printers\" (page 1)","price":189,"discount":0,"item_category":"Catalog","item_category2":"Printers","item_category3":"Laser Printers","item_category4":"Laser Monochrome"}
```
GREEN view_item (event `{"currency":"USD","value":189}`) item:
```json
{"item_id":"566903892","item_name":"Canon Imageclass WiFi MF232W Monochrome Laser Printer/Scanner/Copier","affiliation":"B2B-store","currency":"USD","price":189,"discount":0,"item_category":"Catalog","item_category2":"Printers","item_category3":"Laser Printers","item_category4":"Laser Monochrome"}
```

## Check 10 — console / network
- localhost only: `GET /modules/$(VirtoCommerce.SalesRep)/plugins/vc-frontend/mf-manifest.json` -> 404 on every load
  (200 on vcst-qa). **Environment artefact**: the local container proxies only `/graphql` and `/connect/token`,
  not module plugin assets. Not a product bug.
- Both envs: `/api/files/<id>_sm` 404 on the Canon PDP; third-party image 404 (`images.netdirector.co.uk`);
  `starmarket-platform.demo.govirto.com` ERR_NAME_NOT_RESOLVED on the WF-2750 PDP (catalog data points at a dead host).
- All `/graphql` POSTs on localhost returned 200; no new JS exceptions.

## Incidental findings (not filed; all reproduce on vcst-qa, so pre-existing, not caused by PR #2598)
1. **begin_checkout / view_cart fire on loading an empty /cart** (signed in): `begin_checkout {value:0, items_count:0}`.
   The storefront GA events doc names "Proceed to checkout" as the begin_checkout trigger. Known in kb (KB-EA61E19F).
2. **Recommended-products list items omit `discount`**: Epson WF-3640 in "Customers bought together" is sent with
   `price: 199.99` and no `discount`, while the widget shows $100.00 and the category/search lists send
   `price 199.99, discount 99.99`. Revenue analytics on that list over-states the price. Same in RED.
3. **Carousel images on multi-image product cards do not navigate**: clicking the card image changes the slide but
   neither opens the PDP nor pushes select_item (both envs). Single-image cards wrap the image in a link and do
   navigate. `cursor: pointer` on a non-link image. Candidate UX inconsistency; needs a product decision.
4. **Doc vs build field name**: the GA events doc lists the item field as `brand`; the build sends `item_brand`
   (the GA4 standard name). Doc nit.

## Cleanup
- Wishlist: Brother MFC-L6700DW added to and removed from shared list "List3-89" on both envs (card back to "Add to list").
- Currency switched back to USD on localhost. No orders, carts or accounts created.

## kb
Confirmed KB-F70D6D0A, KB-EA61E19F; captured KB-9D50E60B (pre/post-fix item fields, defect VCST-6478).
