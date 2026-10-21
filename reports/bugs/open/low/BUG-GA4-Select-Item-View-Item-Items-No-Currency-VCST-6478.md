# BUG: [GA4][Catalog] select_item and view_item items carry no currency (select_item items also no index) — Low

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6453
**Tracker:** [VCST-6478](https://virtocommerce.atlassian.net/browse/VCST-6478) (standalone Bug, relates to VCST-6453; filed below the /qa-test severity floor at the operator's request; labels found-by-agent, found-in-testing, vc-fix, qa-autofix)

**Severity:** Low (P3) · **Type:** Functional / analytics payload · **Relationship:** found while verifying VCST-6453; not introduced by it (same on the pre-fix build)
**Env:** vcst (`{{FRONT_URL}}`) and the local frontend-only stand bound to vcst-qa, guest, playwright-chrome 1920x1080, 2026-10-21
**Build:** theme vc-frontend `2.61.0-pr-2570-5cc5-5cc519ff` (vcst-qa) and `2.61.0-pr-2594-5ab1-5ab19015` (local); source checked on vc-frontend `dev`
**Oracle:** VirtoOZ StorefrontDeveloperGuide "Google Analytics Events" → Item fields (`index`, `currency` listed for every item; list/catalog contexts also carry `item_list_id`/`item_list_name`); BL-GA4-001 (catalog/discovery events' items carry `currency`)

## Summary
When a shopper clicks a product card in a category grid, `select_item` is pushed with one item that has no `currency` and no `index`. The `view_item` that follows also has items without `currency` (the event itself carries `currency` and `value`). `view_item_list` items on the same page carry both fields, so item-level reporting is inconsistent across the list → click → view funnel.

## Preconditions
Guest; GA4 tracking enabled on the store; a category with products (e.g. /printers).

## Steps to reproduce
1. Open `/printers`.
2. Click any product card.
3. In `window.dataLayer`, read the `select_item` event and the `view_item` event that follows.

## Expected
Each item in `select_item` and `view_item` follows the documented Item fields: `currency` set (as in `view_item_list` items); `select_item` items carry `index` (the card's position in the list) and the list id/name.

## Actual
- `select_item` (`item_list_id` `category_printers_page_2`): `items[0]` keys = item_id, item_name, affiliation, price, discount, item_category..4 — no `currency`, no `index`, no `item_list_id`.
- `view_item`: event has `currency` + `value`; `items[0]` has no `currency`.
- Same on vcst-qa (pre-fix theme) and the PR #2594 build.
- Not visual — evidence is the dataLayer payload: `reports/tickets/Sprint26-21/VCST-6453/network/green-printers-select-item-page2.json`, `red-printers-select-item-page2.json`.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | dataLayer captures above |
| 2. Backend Admin | N/A | not admin-visible |
| 3. GraphQL xAPI | N/A | currency comes from client globals, not the product payload |
| 4. Platform REST API | N/A | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
- `client-app/modules/google-analytics/events.ts` `selectItem()` calls `productToGtagItem(item)` with no `index` and no context, so `index`, `currency`, `item_list_id`, `item_list_name` are `undefined` (`utils.ts` `productToGtagItem` reads them from its 2nd/3rd args).
- `viewItem()` (and `addItemToWishList()`) also call `productToGtagItem(item)` without a context → item `currency` undefined; event-level `currency: currencyCode` is set.
- `viewItemList()` passes `index` and `{ itemListId, itemListName, currency }`, which is why list items are complete.
- GA4 impact is limited: select_item has no `value`, view_item has event-level currency.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** `client-app/modules/google-analytics/events.ts` (`selectItem`, `viewItem`, `addItemToWishList`)
- **RCA anchor:** `events.ts` `selectItem` → `productToGtagItem(item)` (no index/context)
- **Routing confidence:** HIGH — pass the current currency (and, for select_item, the list id/name and the card index the caller knows) into `productToGtagItem`
