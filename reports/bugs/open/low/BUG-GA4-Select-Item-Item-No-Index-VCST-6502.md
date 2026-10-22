# BUG: [GA4][Catalog] select_item item has no index (list position) — Low

## Status: FILED
**Found by:** agent, while verifying VCST-6478
**Tracker:** [VCST-6502](https://virtocommerce.atlassian.net/browse/VCST-6502) (Bug, Low, labels found-by-agent + found-in-testing; filed below the floor at the operator's request). **Relates to:** VCST-6478. Its PR, vc-frontend#2598, fixed `currency` and the list id/name but deliberately left `index` out.

**Severity:** Low (P3) · **Type:** Functional / analytics payload
**Env:** vcst-qa data. The theme is `2.61.0-pr-2598-fd57-fd578365` (local frontend-only stand proxied to vcst-qa) and the baseline is vcst-qa theme `2.61.0-pr-2570-2fc9-2fc9261a`. Guest, playwright-chrome 1920x1080, 2026-10-22.
**Oracle:** StorefrontDeveloperGuide → Google Analytics Events → Item fields: `index` is "the zero-based position of the product in the list". BL-GA4-001.

## Summary
When a shopper clicks a product in a list, the `select_item` event's item has no `index`. The `view_item_list` pushed for the same list gives every item its position (0..n), so GA4 cannot tie a click to the position the product was shown at, and list-position reports are empty for clicks.

## Steps to reproduce
1. Open `/printers` as a guest.
2. Click the 3rd product card.
3. In `window.dataLayer`, compare the `select_item` item with the same product in the page's `view_item_list`.

## Expected
The `select_item` item carries `index` equal to the product's position in that list. For the 3rd card that is `2`, the value `view_item_list` gives it.

## Actual
- `view_item_list` (`category_printers_page_1`): Brother MFC-L6700DW (`564698896`) has `index: 2`.
- `select_item` after a click on that card: the item has `currency`, `item_list_id` and `item_list_name`, but no `index` key.
- Same for card 0 (Canon `566903892`) and card 6 (Epson `555929564`). This is the same on the pre-fix vcst-qa theme and on the PR #2598 build.
- The evidence is the dataLayer payload, not a screenshot: `reports/tickets/Sprint26-21/VCST-6478/localhost/evidence/green-run{1,2,3}-select_item-view_item.json` and `green-check5-view_item_list.json`.

## Root Cause Analysis (vc-frontend `dev`)
- The event contract has no slot for a position: `core/types/analytics.ts` `selectItem: [item, params?: EventParamsType & ListPropertiesType]`.
- `modules/google-analytics/events.ts` `selectItem()` calls `productToGtagItem(item, undefined, {...})`, which passes the index as `undefined`. `utils.ts` `productToGtagItem` already accepts `index` as its 2nd argument.
- Callers know the position but drop it. Category grid clicks go through `core/plugins/dom-analytics/rules.ts` (rule `selectItem`, target `product-link`, from `product-card`). The search dropdown calls `analytics("selectItem", product, searchBarListProperties)` in `search-dropdown.vue`. The other callers are cart, compare, lists and saved-for-later.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1, Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component:** `client-app/modules/google-analytics/events.ts` `selectItem`, plus the place the position comes from: `core/plugins/dom-analytics/rules.ts` / the product-card attributes, and `search-dropdown.vue`.
- **Fix shape:** carry the position in the event params (e.g. `index` in `ListPropertiesType`), pass it to `productToGtagItem(item, params.index, ...)`, and have the DOM rule and the search dropdown supply it. The event's signature is used by `extendEvents` consumers, so add the position without breaking it.
- **Routing confidence:** HIGH
