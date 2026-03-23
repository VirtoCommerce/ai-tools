# BUG: Account "Saved for later" Page Returns 403 Due to Incorrect GraphQL Query Chaining

> **UPDATE (2026-02-26):** Follow-up testing with a brand new company account revealed that the 403 bug is **account-specific, not universal**. A newly created account can access `/account/saved-for-later` without issues. See [BUG-Saved-For-Later-403-Account-Specific-Not-Universal.md](BUG-Saved-For-Later-403-Account-Specific-Not-Universal.md) for full details.

## Summary

The `/account/saved-for-later` page on the B2B storefront returns a **403 Access Denied** error for specific authenticated users (not all, as originally reported). The root cause is a **data model mismatch** in the frontend: the page first calls `GetSavedForLater` (which succeeds and returns a CartType entity), then incorrectly passes its ID to `GetWishlist` (a wishlist-domain query that rejects cart-type IDs with "Forbidden").

## Severity: **High (P1)**

## Environment

| Field | Value |
|-------|-------|
| Frontend URL | https://vcst-qa-storefront.govirto.com |
| Backend URL | https://vcst-qa.govirto.com |
| Frontend Version | 2.43.0-pr-2188-c129-c1290c2d |
| Browser | Microsoft Edge 145.0.3800.70 (Chromium 145.0.7632.110) |
| User | mutykovaelena@gmail.com (ACME Store 3 / Elena Mutykova) |
| Store | B2B-store |
| Date Tested | 2026-02-26 |

## Impact

- **Complete page breakage**: The `/account/saved-for-later` page is 100% inaccessible for ALL users
- **Feature degradation**: Users cannot view their full saved-for-later list from the account section
- **Navigation dead end**: The sidebar link "Saved for later" and the cart "See all" link both lead to a 403 page
- **Cart page unaffected**: The "Saved for later" section on `/cart` works correctly (uses only `GetSavedForLater`)

## Steps to Reproduce

1. Log in to the storefront as any authenticated user
2. Navigate to `/account/saved-for-later` (either directly or via sidebar link from Dashboard)
3. Observe the page redirects to `/403` with "Access denied" message

## Expected Behavior

The page should display the user's saved-for-later items list (same data visible in the cart page's "Saved for later" section), with options to move items back to cart or remove them.

## Actual Behavior

The page immediately redirects to `/403` with the message "You do not have permissions to access the requested page."

## Root Cause Analysis

### Sequence of GraphQL Requests on `/account/saved-for-later`

The page makes TWO sequential GraphQL requests:

**Request 1: `GetSavedForLater` -- SUCCEEDS (HTTP 200, no errors)**

```graphql
query GetSavedForLater($storeId: String!, $userId: String!, ...) {
  getSavedForLater(storeId: $storeId, userId: $userId, ...) {
    ...savedForLaterList   # Returns CartType
  }
}
```

Response:
```json
{
  "data": {
    "getSavedForLater": {
      "id": "92a589a0-2408-4981-896b-02bdd4ab087c",
      "name": "Saved for later",
      "type": "SavedForLater",      // <-- This is a CART entity, not a wishlist
      "itemsQuantity": 2,
      "items": [
        { "id": "6afb437e-...", "name": "UNTUCKit eGift Card", "sku": "GC982620" },
        { "id": "a7c228b5-...", "name": "Vintage Wedding Cake", "sku": "UEC-62429095" }
      ],
      "__typename": "CartType"       // <-- CartType, NOT WishlistType
    }
  }
}
```

**Request 2: `GetWishlist` -- FAILS (HTTP 200, but GraphQL error: Forbidden)**

The page takes the `id` from Request 1 and passes it to the wishlist query:

```graphql
query GetWishlist($listId: String!, $cultureName: String) {
  wishlist(listId: $listId, cultureName: $cultureName) {
    name
    description
    scope
    id
    modifiedDate
    items { ...wishlistLineItemFields }
    sharingSetting { id scope access isOwner }
  }
}
```

Variables:
```json
{
  "cultureName": "en-US",
  "listId": "92a589a0-2408-4981-896b-02bdd4ab087c"   // <-- Cart ID, NOT a wishlist ID!
}
```

Response:
```json
{
  "errors": [
    {
      "message": "Access denied.",
      "path": ["wishlist"],
      "extensions": { "code": "Forbidden", "codes": ["Forbidden"] }
    }
  ],
  "data": { "wishlist": null }
}
```

The frontend then interprets this "Forbidden" error and redirects to the 403 page.

### Why the Wishlist Query Rejects the Cart ID

In the Virto Commerce GraphQL schema, there are two completely separate domains:

| Domain | Query | Entity Type | Data Source |
|--------|-------|-------------|-------------|
| **Saved for Later** | `getSavedForLater` | `CartType` (type: "SavedForLater") | xCart module |
| **Wishlists** | `wishlist` / `wishlists` | `WishlistType` | Wishlist module |

The `wishlist(listId:)` query validates that the given ID belongs to a wishlist entity owned by the current user. When given a cart-type ID (`92a589a0-...`), it does not find a matching wishlist and returns "Access denied."

### Comparison: Cart Page vs Account Page

| Aspect | Cart Page (`/cart`) | Account Page (`/account/saved-for-later`) |
|--------|--------------------|--------------------------------------------|
| GraphQL query used | `GetSavedForLater` only | `GetSavedForLater` + `GetWishlist` |
| Second query? | No | Yes -- incorrectly chains to `GetWishlist` |
| Result | Works correctly | 403 Access Denied |
| Items displayed | Shows saved items with "Move to cart" | Nothing (403 error page) |

### Available GraphQL Operations (from Schema Introspection)

**Queries:**
- `getSavedForLater(storeId, userId, ...)` -- Dedicated saved-for-later query (works correctly)
- `wishlist(listId, cultureName)` -- Wishlist-only query (rejects cart IDs)
- `wishlists(storeId, userId, ...)` -- Lists all wishlists (does NOT include saved-for-later)

**Mutations:**
- `moveToSavedForLater` -- Moves cart item to saved-for-later
- `moveFromSavedForLater` -- Moves saved-for-later item back to cart

The schema provides a clean, separate API for saved-for-later management. The account page should use ONLY `GetSavedForLater` and the move mutations -- it should NOT use `GetWishlist`.

## Evidence

### Screenshots

1. `saved-for-later-403-access-denied.png` -- Direct navigation to `/account/saved-for-later` shows 403
2. `saved-for-later-403-after-spa-navigation.png` -- SPA navigation from Dashboard sidebar also shows 403
3. `cart-saved-for-later-section-working.png` -- Cart page "Saved for later" section works correctly

### GraphQL API Verification

| Test | Query | Input | Result |
|------|-------|-------|--------|
| GetSavedForLater | `getSavedForLater(storeId, userId)` | storeId="B2B-store" | **SUCCESS** -- Returns CartType with items |
| GetWishlist with cart ID | `wishlist(listId)` | listId="92a589a0-..." (cart ID) | **FORBIDDEN** -- "Access denied." |
| GetWishlist with real wishlist ID | `wishlist(listId)` | listId="c8e4aa3d-..." (wishlist ID) | **SUCCESS** -- Returns wishlist data |
| GetWishlists | `wishlists(storeId, userId)` | storeId="B2B-store" | **SUCCESS** -- Returns 8 wishlists, none with the saved-for-later ID |

## Suggested Fix

The `/account/saved-for-later` Vue component should:

1. **Remove** the `GetWishlist` query call entirely for this page
2. **Use only** the `GetSavedForLater` query to fetch and display items
3. **Use** `moveFromSavedForLater` mutation for the "Move to cart" action
4. The `GetSavedForLater` response already contains all necessary data (`id`, `name`, `items` with `productId`, `quantity`, `salePrice`, `listPrice`, `product` details)

The issue is likely in the Vue router guard or the page component that treats the saved-for-later list as a wishlist and reuses the wishlist detail component/query.

## Workaround

Users can view and manage their saved-for-later items through the cart page's "Saved for later" section at `/cart`. The "Move to cart" functionality works from the cart page.

## Affected Components

- **Frontend route:** `/account/saved-for-later`
- **Frontend component:** Likely `SavedForLater.vue` or similar account page component
- **GraphQL operations:** `GetSavedForLater` (correct), `GetWishlist` (incorrectly used)
- **Backend API:** Not affected -- the GraphQL backend correctly distinguishes between cart and wishlist entities

## Additional Finding: Orphaned Items

During testing, one item in the saved-for-later list ("Vintage Wedding Cake", SKU: UEC-62429095) has `product: null` in the API response, indicating the product was deleted from the catalog. The cart page correctly filters out such items from display. The account page should also handle this gracefully when the fix is implemented.
