# BUG — "Add all to cart" / "Buy now" from a list silently drops configurable products and reports false success

## Status: READY_TO_SUBMIT

**JIRA:** [VCST-5175](https://virtocommerce.atlassian.net/browse/VCST-5175)
**Severity:** High
**Env:** vcst-qa @ Platform `3.1032.0`, Theme `2.50.0-alpha.2359` (`XCart 3.1016.0`, `Catalog 3.1025.0`, `ProfileExperienceApi 3.1007.0`)
**Component:** vc-frontend — `pages/account/list-details.vue` (Lists / wishlist buy paths)
**Owning layer:** Layer 1 (storefront frontend)
**Discovered:** `/qa-exploratory lists` 2026-06-01 — `reports/exploratory/SBTM-lists-2026-06-01.md`

## Summary
On `/account/lists`, adding a **configurable** product to a cart via either **"Add all to cart"** or **"Buy now"** silently fails: the frontend sends `addItemsCart` / `createCartFromWishlist` **without `configurationItems`**, the server rejects the line (`CONFIGURATION_SECTION_REQUIRED`), and the item never enters the cart — yet the UI shows a green **"Successfully added"** result dialog (Add all) or navigates to an **empty** secure-checkout cart (Buy now). A B2B buyer is told their configured item is in the cart when it is not. Reorder-from-list is broken for any configurable SKU with required sections.

## Steps to Reproduce
Preconditions: signed-in user; a list containing a configurable product (`@td(CFG_LAPTOP)`, CFG-013, 2 required Product sections) saved with a **non-default** configuration (e.g. 32 GB RAM + 1 TB → $1,399).

**Path A — Add all to cart**
1. Open the list at `{{FRONT_URL}}/account/lists` → open the list.
2. Click **"Add all to cart"**.
3. Observe the **"Adding products to cart result"** dialog → it lists the configured laptop under **"Successfully added"**.
4. Click **OK** (or **View cart**) → navigate to `/cart`.
5. **Actual:** the configurable laptop is NOT in the cart (simple SKUs from the list are; only the CFG line is missing).

**Path B — Buy now**
1. From the same list, click **"Buy now"**.
2. **Actual:** redirected to the secure-checkout cart (`/cart/{id}`) showing **"Your cart is empty"** — silent dead-end, no error.

## Expected vs Actual
| | Expected | Actual |
|---|---|---|
| Add all (CFG item) | Configured line added to cart **with its configuration**, OR a clear "could not add" message | Dialog reports **"Successfully added"**; cart has no CFG line |
| Buy now (list w/ CFG) | Cart created with the configured item, proceed to checkout | Lands on an **empty** cart, no feedback |
| OK button | n/a | Fires **no** network request — only dismisses the false-success dialog; no corrective add |

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `addAllListItemsToCart` omits `configurationItems`; result modal reports success off list input. `screenshots/SBTM-lists-cfg-addall-silentfail.png`, `…-postOK-cart.png` |
| 2. Backend Admin | N/A | not an admin scenario |
| 3. GraphQL xAPI | **PASS** | `addItemsCart` correctly returned `itemsQuantity:0, items:[], validationErrors:[CONFIGURATION_SECTION_REQUIRED "Required sections are missing"]` — server rejected the malformed command as designed |
| 4. Platform REST API | N/A | — |

**Owning layer:** Layer 1 (vc-frontend) — the storefront sends an invalid command and misreports the result. xAPI behaves correctly.

## Root Cause Analysis
`client-app/pages/account/list-details.vue`:

```js
async function addAllListItemsToCart() {
  const items = wishlistItems.value.map(({ productId, quantity }) => ({ productId, quantity }));
  await addItemsToCart(items);          // ← configurationItems never included
  ...
  showResultModal(wishlistItems.value); // ← reports success from list input, not cart result
}

async function buyNow() {
  const result = await createCartFromWishlist(list.value.id);
  ...
  router.push({ name: ROUTES.CART_ID.NAME, params: { cartId: result.data.createCartFromWishlist.id } });
  // ← navigates regardless of whether the configurable line survived validation
}
```

1. **Add all:** `items` is mapped to `{ productId, quantity }` only — `configurationItems` is dropped, so a CFG product with required sections is rejected server-side.
2. **False success:** `showResultModal(wishlistItems.value)` / `getItemsForAddBulkItemsToCartResultsModal` classify success from the list payload, not from the server's `validationErrors[]` / `itemsQuantity`, so the rejected line shows under "Successfully added".
3. **Buy now:** `createCartFromWishlist` does not carry the saved configuration; the frontend pushes to the cart route without checking item count, dead-ending on an empty cart.
4. Same gap affects the **per-line "Add to cart"** on a list line (`addOrUpdateCartItem` → `addToCart(productId, quantity)` with no config) — likely fails identically; not separately reproduced.

## Related
- `BUG-Update-Cart-Toast-Missing-Cart-Level-Validation-Errors.md` (open) — same "UI ignores server `validationErrors[]`" pattern on a different surface; the false-success classifier here may be the same class of defect (could also mask OOS / disabled-inventory adds).
- `reference_configurations_post_body` (memory) — configurable lines require their configuration payload; omitting it is silently dropped.
- BL refs: BL-CART (line add integrity), BL-CHK-006.

## Risk
Configured products are unrecoverable from the Lists buy paths and the false-success dialog actively hides the loss — a core B2B reorder-from-list journey. The success-from-intent classifier is a candidate to mask other add failures (OOS, disabled inventory) on Bulk order / reorder surfaces.
