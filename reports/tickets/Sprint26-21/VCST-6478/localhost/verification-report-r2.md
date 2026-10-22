# VCST-6478 (+ VCST-6502) — fix verification, round 2

**Build:** vc-frontend PR #2598 `vc-theme-b2b-vue-2.61.0-pr-2598-9b6d-9b6db3d9` on `http://localhost` (API proxied to vcst-qa, store B2B-store)
**Lane:** playwright-chrome, Chromium 1920, sequential · **Date:** 2026-10-22 · **Method:** `window.dataLayer` gtag `['event', name, payload]` entries only

## Build confirmation

| Check | Expected | Observed |
|---|---|---|
| `/` response header `X-VC-Local-Theme` | `fe-39ee8379e6c3` | `fe-39ee8379e6c3` |
| main bundle version | contains `2.61.0-pr-2598-9b6d` | `/assets/index-BbTHMsLX.js` contains `2.61.0-pr-2598-9b6d-9b6db3d9` (footer shows the same) |

## Verdict: fix confirmed on every list checked, guest and signed in (signed-in checks re-run 15:34 UTC, see the end of this file)

| ID | Check | Verdict | Evidence (`evidence/`) |
|---|---|---|---|
| R2-1 | /printers card clicks at pos 0, 2, 6 | **PASS** | `r2-run1-pos0-…`, `r2-run2-pos2-…`, `r2-run3-pos6-select_item.json`, `r2-printers-view_item_list-page1.json` |
| R2-2 | infinite scroll, page-1 vs page-2 click | **PASS** | `r2-infinite-view_item_list-page1-page2.json`, `r2-infinite-page1-click-…`, `r2-infinite-page2-click-select_item.json` |
| R2-3 | header search `epson`, 3rd product | **PASS** | `r2-search-select_item.json` |
| R2-4 | PDP "Customers bought together", 2nd card | **PASS** | `r2-pdp-bought-together-select_item.json` |
| R2-5 | cart "Recently browsed" (signed in) | **PASS** (retry) | `r2-recently-browsed-select_item.json` |
| R2-6 | `/account/lists` wishlist (signed in) | **PASS** (retry) | `r2-wishlist-select_item.json` |
| R2-7 | compare page, 2nd product | **PASS** | `r2-compare-select_item.json` |
| R2-8 | round-1 regression | **PASS** (add_to_wishlist on retry) | `r2-printers-view_item_list-page1.json`, `r2-eur-select_item.json` |
| R2-9 | console + network | **PASS** (environment notes only) | console logs under `test-results/chrome/` |
| extra | home products block "Daily Deals", 3rd card | **PASS** | `r2-home-products-block-select_item.json` |

### R2-1: category grid (guest)
`view_item_list` `category_printers_page_1` listed 13 items, index 0..12, each with `currency: "USD"` and the list id/name. Each run: the `select_item` item `index` equals that product's `view_item_list` index: 0 (Canon 566903892), 2 (Brother 564698896), 6 (WF-2750 555929564). The item carries `currency` USD and `item_list_id`/`item_list_name` equal to the event's. **No top-level `index`** on any event: the event keys are `item_list_id, item_list_name, related_id, related_type, items`. `view_item` item `currency` USD = event `currency` USD in all 3 runs. Run 3 was made after browser Back. The SPA re-pushed `view_item_list` page_1 with the same order.

Example (category, run 3):
```json
{"index":6,"item_id":"555929564","item_name":"Epson WorkForce WF-2750 All-in-One Wireless Color Printer/Copier/Scanner/Fax Machine","item_brand":"Epson","affiliation":"B2B-store","currency":"USD","item_list_id":"category_printers_page_1","item_list_name":"Category \"Printers\" (page 1)","price":99.99,"discount":0,"item_category":"Catalog","item_category2":"Printers","item_category3":"Inkjet Printers","item_category4":"Inkjet Color"}
```

### R2-2: infinite scroll (the store uses infinite scroll, not classic pagination)
Pressing End loaded page 2 and pushed `view_item_list` `category_printers_page_2` with 8 items, **index restarting at 0..7** (page 2 only, not accumulated). Then, with page 2 loaded:
- Click on page-1 product WF-4630 (552846328): `select_item` `item_list_id: category_printers_page_1`, item `index: 9`, which is its page-1 index. **Not page_2.**
- Back, re-scroll (page_2 re-pushed, same 8 items), click on page-2 product Xerox 3215/NI (564268302): `category_printers_page_2`, `index: 5`, which is its page-2 index.

### R2-3: header search
`view_item_list` `search_bar` ("Search phrase 'epson'", 8 items). The 3rd product WF-2750 gave `select_item` item `index: 2`, `item_list_id: search_bar`, currency USD, the same as its `view_item_list` entry (index 2).

### R2-4: DOM-tracked widget (PDP of the Canon product)
`view_item_list` `recommended_products_bought-together` (6 items). The 2nd card, Xerox 55557702 at view_item_list index 1, gave a `select_item` item:
```json
{"index":1,"item_id":"55557702","item_name":"Xerox WorkCentre 3335DNI Mono Laser Multifunction Printer/Copier/Scanner/Fax Machine","affiliation":"B2B-store","currency":"USD","item_list_id":"recommended_products_bought-together","item_list_name":"Customers bought together Canon Imageclass WiFi MF232W Monochrome Laser Printer/Scanner/Copier","price":349,"item_category":"Catalog","item_category2":"Printers","item_category3":"Laser Printers","item_category4":"Laser Monochrome"}
```
Extra DOM-tracked check on the home page. `products_block` "Daily Deals": the 3rd card (XP-830) gave `index: 2`, the same as its view_item_list entry.

### R2-7: compare
3 products added from /printers. `/compare` pushed `view_item_list` `compare_products` (Canon 0, Xerox 1, Brother 2). Clicking the 2nd column's title gave `select_item` `compare_products` with `index: 1`. Compare was cleared afterwards with Clear all → OK, and the page shows "Your compare list is empty".

### R2-8: round-1 regression
- `/printers` `view_item_list` still has index 0..n, `currency` and list id/name on every item: **PASS**.
- After switching to EUR the category list changed to 11 items. M577z is index 4 in EUR but was index 10 in USD. Clicking it gave a `select_item` item with `currency: "EUR"` and `index: 4`, and `view_item` event/item currency EUR: **PASS**. The currency was switched back to USD, which was verified in the header on /cart.
- `add_to_wishlist` item currency: **BLOCKED**. Wishlists need sign-in, and the guest wishlist button is disabled.

### Why R2-5 / R2-6 / the wishlist part were BLOCKED on the first pass
The secrets file has only the password keys (`ORG_USER_PASSWORD`). `ORG_USER_EMAIL` is not a key in it, so typing the key name entered the literal text, and the form rejected it ("Enter a valid email address"). The email lives as a committed test identity in `.env.vcst`. Typing that value was **denied by the Claude Code auto-mode permission classifier** ("Browser Input Exfil"). Per the denial instructions I did not work around it. No sign-in happened. I left the sign-in page without submitting.
**To unblock:** allow `browser_type` for this localhost sign-in, or add `ORG_USER_EMAIL` to `.env.playwright.local` (`npm run secrets:sync`) and restart the MCP server.

### R2-9: console and network
No JS exceptions, no Vue warnings, and no non-2xx `/graphql` or `/connect/token` responses. Every error is an environment artefact:
- `/modules/$(VirtoCommerce.SalesRep)/plugins/vc-frontend/mf-manifest.json` 404. This is the known proxy artefact (18 occurrences).
- `/api/files/<id>_sm` 404 (8). `/api/files` is not proxied by the local container.
- `starmarket-platform.demo.govirto.com/cms-content/...jpg` `ERR_NAME_NOT_RESOLVED` (12). Catalog images point to an unresolvable host. This is a data artefact.
- vcst-qa `cms-content/.../AGENT-TEST-CMP-PROPNAME-main_md.png` 404. A seeded test product has no image.

## Incidental observations (none filed)
1. **Low, UX: the image on multi-image product cards does not navigate.** On /printers (guest), I clicked the visible image of a card that has an image slider (Canon, WF-2750). Both times the URL did not change and no event was pushed, but the image has `cursor: pointer`. Single-image cards (HP M880z) wrap the image in a link. Tracking is consistent: no navigation means no `select_item`. I did not check whether this predates PR #2598 (no baseline build available). Screenshot: `evidence/r2-obs-multi-image-card-click.png`.
2. **Low, payload: optional item fields vary by list.** `search_bar` and bought-together items carry no `item_brand`, and bought-together items also carry no `discount`. The `view_item` that follows does carry `item_brand` (WF-2750 "Epson"), and the category grid's item for the same product carries it too. Each `select_item` item matches its own list's `view_item_list` item, so this is outside the index/currency scope.

## Cleanup
- Compare: emptied.
- Currency: back to USD.
- Nothing else was created: no list, wishlist entry or cart line, and no sign-in.

## Knowledge base
- **Confirmed** KB-F70D6D0A: one view_item_list per render and one select_item per click, with id/name.
- **Captured** KB-20120AE0: select_item item index semantics on build 9b6d, including per-page infinite-scroll lists.
- **Disputed** KB-19E3F96A: a source-based claim that the infinite-scroll view_item_list is accumulated. On 9b6d, page_2 carries only page-2 items, index 0..7.

## Signed-in checks (retry, 2026-10-22 15:34 UTC)
Pre-flight: footer shows `Ver. 2.61.0-pr-2598-9b6d-9b6db3d9`. The operator had signed in by hand; I did not touch sign-in. Lane: playwright-chrome. dataLayer read before and after each action.

| Check | Verdict | Evidence (`evidence/`) |
|---|---|---|
| R2-6 wishlist list details (`wishlist`) | **PASS** | `r2-wishlist-select_item.json` |
| R2-5 cart Recently browsed (`recently_browsed_products`) | **PASS** | `r2-recently-browsed-select_item.json` |
| R2-8 wishlist part (`add_to_wishlist` item currency) | **PASS** | `r2-add_to_wishlist.json` |

**R2-6.** On `/account/lists/<List3-89>`, `view_item_list` `wishlist` ("Wishlist \"List3-89\"") pushed 5 items, index 0..4. A click on the 2nd product (TB-001) opened a new tab, and the list tab pushed `select_item` `wishlist`:
```json
{"index":1,"item_id":"TB-001","item_name":"AGENT-TEST-Tablet 10-inch","affiliation":"B2B-store","currency":"USD","item_list_id":"wishlist","item_list_name":"Wishlist \"List3-89\"","price":399.99,"discount":0}
```
The event has no top-level `index`. Its keys are `item_list_id, item_list_name, related_id, related_type, items`. Further clicks on the 3rd and 5th products gave `index` 2 and 4, which also match.

**R2-5.** I opened 3 PDPs (TB-001, Canon 566903892, Xerox 55557702) and then clicked the header Cart. The cart was not empty, so the widget rendered without adding anything. `view_item_list` `recently_browsed_products` pushed 6 items, with Canon at index 1. A click on the 2nd card opened a new tab, and the cart tab pushed `select_item` `recently_browsed_products`:
```json
{"index":1,"item_id":"566903892","item_name":"Canon Imageclass WiFi MF232W Monochrome Laser Printer/Scanner/Copier","affiliation":"B2B-store","currency":"USD","item_list_id":"recently_browsed_products","item_list_name":"Recently browsed","price":189,"item_category":"Catalog","item_category2":"Printers","item_category3":"Laser Printers","item_category4":"Laser Monochrome"}
```
The event has no top-level `index`.

**R2-8.** On /printers I used the Brother MFC-L6700DW card's "Add to list", chose list `l3` and saved. The push was `add_to_wishlist` with event `currency: "USD"` and `value: 20`. Its item is:
```json
{"item_id":"564698896","item_name":"Brother MFC-L6700DW Wireless Monochrome All-in-One Laser Printer, Copy/Fax/Print/Scan","affiliation":"B2B-store","currency":"USD","price":20,"discount":0,"item_category":"Catalog","item_category2":"Printers","item_category3":"Laser Printers","item_category4":"Laser Monochrome"}
```

**Incidental (not filed, Low, a11y).** The X button on a list row (`remove-item-button`) has the accessible name "Remove from cart", but it removes the line from the list ("Confirm Delete … from the list?"). I did not check whether this predates PR #2598. Screenshot: `evidence/r2-incidental-list-row-remove-label.png`. Console errors are the known environment artefacts only (SalesRep `mf-manifest.json` 404, unresolvable image host).
**Cleanup:** Brother removed from `l3` (shows "Your list is empty"). No list or cart line was created, and the 3 extra tabs were closed. The user is still signed in.
**kb:** confirmed KB-20120AE0 (wishlist and recently-browsed index). Captured KB-60BDFB34 (add_to_wishlist item currency on 9b6d) and KB-7C2824F4 (list-row remove label, suspected defect).
