# BUG: Saved For Later Account Page Returns 403 Access Denied

> **UPDATE (2026-02-26):** Follow-up testing with a brand new company account revealed that the 403 bug is **account-specific, not universal**. A newly created account can access `/account/saved-for-later` without issues. See [BUG-Saved-For-Later-403-Account-Specific-Not-Universal.md](BUG-Saved-For-Later-403-Account-Specific-Not-Universal.md) for full details.

## Summary

Navigating to the `/account/saved-for-later` page on the storefront always results in a **403 Access Denied** error, even when the user is fully authenticated and has saved items. The page is completely inaccessible. The root cause is a `GetWishlist` GraphQL query returning a "Forbidden" error when called with the SavedForLater list ID.

## Severity: High

## Priority: P1

## Environment

| Field | Value |
|-------|-------|
| **URL** | https://vcst-qa-storefront.govirto.com/account/saved-for-later |
| **Redirects to** | https://vcst-qa-storefront.govirto.com/403 |
| **Browser** | Google Chrome 145.0.7632.76 (Chromium) |
| **Viewport** | 1920x1080 (Desktop) |
| **Store** | B2B-store |
| **Storefront Version** | 2.43.0-pr-2188-c129-c1290c2d |
| **User** | mutykovaelena@gmail.com (B2B user, Coffee shop organization) |
| **Date** | 2026-02-26 |

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Log in with valid B2B credentials (mutykovaelena@gmail.com / Password2!)
3. Confirm login is successful (header shows "Coffee shop / Elena Mutykova")
4. Navigate to the cart page (/cart)
5. If cart has items, click "Save for later" on a product -- this works correctly
6. Confirm the item appears in the "SAVED FOR LATER" section on the cart page
7. Attempt to access the saved-for-later account page via ANY of these paths:
   - **Path A:** Click the "See all" link in the cart's "Saved for later" section
   - **Path B:** Navigate to Account Dashboard -> Click "Saved for later" in the sidebar
   - **Path C:** Directly navigate to https://vcst-qa-storefront.govirto.com/account/saved-for-later

**All three paths redirect to /403 with "Access denied" error.**

## Expected Result

The `/account/saved-for-later` page should load successfully and display:
- A list of all items the user has saved for later
- Product details for each saved item (name, image, price)
- "Move to cart" and "Remove" action buttons for each item
- Pagination if there are many items
- The page should use data from the successful `GetSavedForLater` GraphQL query

## Actual Result

- The page **immediately redirects** to `/403`
- A "403 Access denied" error page is displayed
- The message reads: "You do not have permissions to access the requested page"
- The user has NO way to view their full saved-for-later list from the account section
- The sidebar navigation, "See all" link on cart, and direct URL all fail identically

## Root Cause Analysis (GraphQL Trace)

Two GraphQL queries are fired when the page loads:

### Query 1: `GetSavedForLater` -- SUCCEEDS

```graphql
query GetSavedForLater($storeId: String!, $userId: String!, $organizationId: String, $currencyCode: String, $cultureName: String) {
  getSavedForLater(storeId: $storeId, userId: $userId, ...)
}
```

**Variables:**
```json
{
  "storeId": "B2B-store",
  "userId": "42765f34-51cf-4994-806b-e82e65fd5c14",
  "cultureName": "en-US",
  "currencyCode": "USD"
}
```

**Response:** HTTP 200, no errors. Returns valid data:
- List ID: `92a589a0-2408-4981-896b-02bdd4ab087c`
- List name: "Saved for later"
- List type: "SavedForLater"
- Items quantity: 2
- Items include: "UNTUCKit eGift Card" (GC982620), "Vintage Wedding Cake"

### Query 2: `GetWishlist` -- FAILS with Forbidden

```graphql
query GetWishlist($listId: String!, $cultureName: String) {
  wishlist(listId: $listId, cultureName: $cultureName) {
    name, description, scope, id, modifiedDate, items { ... }
  }
}
```

**Variables:**
```json
{
  "cultureName": "en-US",
  "listId": "92a589a0-2408-4981-896b-02bdd4ab087c"
}
```

**Response:** HTTP 200, but contains GraphQL error:
```json
{
  "errors": [
    {
      "message": "Access denied.",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["wishlist"],
      "extensions": {
        "code": "Forbidden",
        "codes": ["Forbidden"]
      }
    }
  ],
  "data": { "wishlist": null }
}
```

### Root Cause

The saved-for-later account page component:
1. First calls `GetSavedForLater` which succeeds and returns the list ID
2. Then calls `GetWishlist` using that same list ID to fetch full item details
3. The `wishlist` GraphQL resolver rejects the request because the "SavedForLater" list type is not accessible via the standard wishlist API (different permissions model)
4. The frontend global error handler catches the `Forbidden` GraphQL error code and redirects to `/403`

**The bug is that the page uses `GetWishlist` (a wishlist-specific query) to load a "SavedForLater" list, but the backend treats SavedForLater lists differently from wishlist and denies access through the wishlist endpoint.**

## What DOES Work

| Feature | Status | Notes |
|---------|--------|-------|
| Save item from cart | WORKS | "Save for later" button on cart items functions correctly |
| Cart saved-for-later widget | WORKS | Items appear in the "SAVED FOR LATER" section on the cart page |
| Move to cart from widget | WORKS | "Move to cart" button in cart's saved-for-later section works |
| Account sidebar link | PRESENT | "Saved for later" link exists in sidebar under "Purchasing" |
| /account/saved-for-later page | **BROKEN** | 403 Access Denied |
| "See all" link from cart | **BROKEN** | Links to /account/saved-for-later which is broken |
| GetSavedForLater API | WORKS | Returns correct data with all saved items |
| GetWishlist API (with SavedForLater ID) | **BROKEN** | Returns Forbidden error |

## Additional Observation

The `GetSavedForLater` API returned `itemsQuantity: 2` (UNTUCKit eGift Card + Vintage Wedding Cake), but the cart page's "Saved for later" widget only displayed 1 item (UNTUCKit eGift Card). This may be a separate display/pagination issue in the cart widget, or intentional truncation with "See all" intended to show the full list.

## Impact

- **User Impact:** Users cannot view their complete saved-for-later list from the account area. They can only see a truncated preview on the cart page.
- **Functionality Lost:** No ability to manage (remove/bulk move) all saved items outside of the cart context
- **Navigation Dead-End:** The sidebar link and "See all" link both lead to an error page, creating a broken UX
- **Affected Users:** ALL logged-in B2B users (tested with organization member role)

## Screenshots

| Screenshot | Description |
|------------|-------------|
| `01-homepage-loaded.png` | Homepage with user logged in |
| `02-cart-page-full.png` | Cart page showing item before save-for-later |
| `03-item-saved-for-later-cart.png` | Cart page after saving item -- saved-for-later widget works |
| `04-403-access-denied.png` | 403 error from direct URL navigation |
| `05-account-dashboard-with-sidebar.png` | Account dashboard showing "Saved for later" in sidebar |
| `06-403-from-sidebar-click.png` | 403 error from sidebar link click |
| `07-403-from-cart-see-all.png` | 403 error from cart "See all" link |
| `08-item-moved-back-to-cart.png` | Item successfully moved back to cart (cart widget works) |

Screenshots path: `tests/Sprint26-04/VCST-4650-bopis-pickup-search-indexing/screenshots/saved-for-later-investigation/`

## Suggested Fix

The `/account/saved-for-later` page component should either:

1. **Use `GetSavedForLater` exclusively** instead of calling `GetWishlist` -- the `GetSavedForLater` query already returns all the needed data (items, prices, product details)

2. **Fix the backend `wishlist` resolver** to allow access to SavedForLater type lists when the requesting user owns the list

3. **Handle the Forbidden error gracefully** in the frontend -- if `GetWishlist` fails with Forbidden but `GetSavedForLater` succeeded, display the data from `GetSavedForLater` instead of redirecting to 403

## Reproduction Rate

100% -- Reproduced consistently across direct URL, sidebar click, and "See all" link.

## Type: Bug

## Labels

frontend, account, saved-for-later, wishlist, graphql, permissions, 403, access-denied, B2B

## Component

Account / Saved for Later

## References

- Storefront version: 2.43.0-pr-2188-c129-c1290c2d
- GraphQL operations: `GetSavedForLater`, `GetWishlist`
- List ID involved: 92a589a0-2408-4981-896b-02bdd4ab087c
- User ID: 42765f34-51cf-4994-806b-e82e65fd5c14
