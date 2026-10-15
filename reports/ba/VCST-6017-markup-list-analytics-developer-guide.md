# Product list analytics from markup — Developer Guide

The storefront now reports product lists to Google Analytics 4 from page markup instead of from per-component code. A list sends one `view_item_list` when it renders, and a click on a product link sends one `select_item`. This covers the Page Builder product blocks, the product page lists and any plain HTML you add to a page. By the end of this guide you can read these events, know which list sends which id, and mark up your own HTML list.

## Prerequisites

- **A storefront build that includes vc-frontend PR #2543.** The behaviour was verified on a pre-release build while the PR was still open. Confirm your build includes it before relying on this guide.
- **GA4 configured on the store.** The events are pushed to `window.dataLayer` by the GA tracker.
- Basic knowledge of browser DevTools and the GA4 `window.dataLayer`.

## Quick Start

### Step 1: Read the events

Open the storefront page, open the browser console and run:

```js
window.dataLayer
  .filter(e => e[0] === 'event' && ['view_item_list', 'select_item', 'view_item'].includes(e[1]))
  .map(e => ({ event: e[1], params: e[2] }))
```

Each entry is one GA4 event. The same hit is delivered to `/g/collect` with `en=<event name>`.

### Step 2: See a list impression

Open a Page Builder page that contains a **products** block at `{FRONT_URL}/<page-permalink>`. Without scrolling you get exactly one `view_item_list` per marked block, with `items[]` holding that block's products.

### Step 3: See a click

Click a product **title** inside the block. You get exactly one `select_item`. Its `items` hold only the product you clicked and it carries the list id and name of that block.

## Which list sends which id

| Where on the storefront | `item_list_id` | Notes |
|---|---|---|
| Page Builder `products` and `predefined-product-list` blocks | `products_block` | One event per block, each with its own items, even when two blocks share the id |
| Page Builder `products-carousel` block | `products_carousel` | An untitled carousel omits `item_list_name` |
| Page Builder `favorite-products` block | `favorite_products` | A block whose filter matches nothing sends nothing |
| Product page, recommended products | `recommended_products_<model>` | For example `recommended_products_bought-together`; `related_id` is the product id and `related_type` is `product` |
| Product page, related products | `related_products` | |
| Product page, variations | `variations` | `view_item_list` only, never `select_item`; `related_id` is the parent product |
| Cart, recently browsed | `recently_browsed_products` | |
| Your own HTML list | the value of `data-list-id` | See the markup section below |

The Page Builder `demo-product-list` and `product-info` blocks send no events.

!!! note "Why does `product-info` send nothing?"
    The block is not marked by this change, so a product page built from it sends no `view_item`. Whether that is intended was an open question to the author when this was verified.

## When events send, and when they do not

| Situation | What you get |
|---|---|
| A list renders, in or out of view | One `view_item_list`. A block more than 6 000 px down the page sends at scroll position 0. |
| Window resize, add to cart, quantity change in the cart, a refetch of the same products | No second event. Resizing between 1920, 800 and 390 px keeps each list at one event. |
| The viewport shows fewer cards than the list holds | `items[]` still holds the whole list, for example 6 items at 390, 800 and 1920 px. |
| Variations table moves to page 2 | One new event with that page's items only, not the accumulated set. Going back to page 1 sends it again. |
| Click on a product title, press Enter on it, or ctrl-click it | One `select_item` each. **Customize** opening a new tab also sends one. |
| Click a card image or carousel arrow, change quantity, add to cart or list, compare | No `select_item`. Add to cart and add to list send their own business events. |
| Product page cold load | One `view_item` after `config`, with `value` set to the product price. |

These lists stay on manual calls and send one event per view or click, with no duplicate from the markup: category pages, the header search dropdown (`search_bar`), compare, the wishlist page and cart line items. **Show more** in saved-for-later sends nothing, and clicking a saved-for-later card sends one `select_item` under the shared id `recently_browsed_products`. A barcode search with a single hit redirects to the product page, sends no `view_item_list` and sends one `view_item` there, on a store with barcode search fields configured.

Each item in `items[]` carries `index`, `item_id`, `item_name`, `affiliation`, `currency`, `item_list_id`, `item_list_name`, `price` and `item_category` to `item_category5`. It carries `item_brand` when the source returns a brand; the recommended list's does not. There is no `items_skus`.

## Mark up your own HTML list

Add the markup to a Page Builder **Text** block. The data attributes reach the storefront unchanged.

```html
<div data-vc-track="product-list" data-list-id="my_list" data-list-name="My list">
  <div data-vc-track="product-card" data-product-id="example-id" data-product-sku="EXAMPLE-SKU" data-product-name="Example product" data-product-price="19.90">
    <a data-vc-track="product-link" href="/example-product">Example product</a>
    <span>$19.90</span>
  </div>
</div>
```

| Attribute | On | What it does |
|---|---|---|
| `data-vc-track="product-list"` | list container | Marks the list; `data-list-id` becomes `item_list_id` |
| `data-vc-track="product-card"` | each card | One item in `items[]` |
| `data-vc-track="product-link"` | link inside a card | The only element whose click sends `select_item` |
| `data-product-id`, `-sku`, `-name`, `-price` | card | The item fields |

A card with only `data-product-name` and `data-product-price` still works: its item has no `item_id`. Such a list is sent once and stays at one event through unrelated page changes. When you change a price on such a card, one new `view_item_list` is sent for that list. A list whose cards carry ids ignores a price edit.

## Conclusion

You can now read product list events in `window.dataLayer`, rely on one impression per list and one click per link, and mark up any plain HTML list yourself. For the event reference see the Storefront Developer Guide, Google Analytics Events, which does not yet describe these list ids or the markup.

Not documented: `addRules` and custom trackers (no shipped caller, unit tests only) · title click inside a Page Builder block while signed in (UNCOVERED; the signed-in impression passes) · observer cost under heavy page changes (UNCOVERED, no budget defined) · re-send on language or currency switch (UNCOVERED, not planned) · saved-for-later page and shared-list legs (UNCOVERED) · `select_item` item fields beyond the clicked product and list params, such as `currency` and `index` (FAIL, Low, not filed) · the new list ids are absent from the module README (FAIL, Low, not filed).

---
*VCST-6017 · verified on {FRONT_URL} · verdict PASS WITH NOTES · Evidence: `reports/tickets/Sprint26-20/VCST-6017/` (`R2-1-html-lists-after-churn-PASS-r2.png`, `R2-2-pb-product-lists-1-event-per-list-PASS-r2.png`) · Audiences derived from layer `storefront`; developer added on the plain-HTML and Page Builder PASS rows (A5-A8, R2-1, R2-7); no shopper or admin guide written, see the comment.*
