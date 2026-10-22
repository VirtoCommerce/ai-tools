# VCST-6478 — verification checklist

Flow: `verify-fix` (Bug × Ready for test), run inline from `/qa-test VCST-6478 localhost`.
Fix: [vc-frontend#2598](https://github.com/VirtoCommerce/vc-frontend/pull/2598), build `2.61.0-pr-2598-fd57-fd578365` (PR head `fd57836`).
After the fix (GREEN): `http://localhost`, a frontend-only stack whose API is proxied to vcst-qa `B2B-store`.
Before the fix (RED): the vcst-qa storefront (`FRONT_URL` of `.env.vcst`).
Oracle: `BL-GA4-001`. StorefrontDeveloperGuide → Google Analytics Events → Item fields (`index`, `currency`, `item_list_id`, and `item_list_name` matching the event).

| # | Check | Expected |
|---|---|---|
| 1 | **RED, vcst-qa:** on `/printers` as a guest, click a product card | The `select_item` item has no `currency`, `index` or `item_list_id`. The `view_item` item has no `currency`. |
| 2 | **GREEN, localhost, 3 runs:** the same STR | The `select_item` item has `currency` (the store currency) and an `item_list_id`/`item_list_name` equal to the event's. The `view_item` item's `currency` equals the event's `currency`. |
| 3 | The `select_item` item `index` | The ticket expects it. The PR leaves it out on purpose. Record what is observed. |
| 4 | The `add_to_wishlist` item `currency` (signed in) | Equals the event's `currency`. |
| 5 | The `view_item_list` items on `/printers` | Unchanged: `index`, `currency`, `item_list_id`/`item_list_name` are present. |
| 6 | `select_item` from the header search dropdown | The item has `currency`, and the list id/name equal the event's. |
| 7 | `select_item` from a PDP recommendation/related widget | Same as #6. |
| 8 | `select_item` from a line item (cart, signed in), which goes through the unchanged `lineItemToGtagItem` path | No regression compared with vcst-qa. |
| 9 | Currency switch (if the store offers more than one currency) | The item `currency` follows the selected currency, and so does the event `currency`. |
| 10 | Console / network | The fix introduces no new console errors and no failed requests. |
