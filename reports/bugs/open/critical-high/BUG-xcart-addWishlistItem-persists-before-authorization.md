# `addWishlistItem` / `updateWishListItems` persist the change BEFORE authorization — anyone can modify another user's list — [High]

**Env:** vcptcore-qa · XCart 3.1037.0-pr-141-fb27 (resolver code identical on `vc-module-x-cart@dev`) · 2026-09-29
**Found by:** /qa-test VCST-5707 (step 4a backend, E10) · **Provenance:** OUT-OF-SCOPE incidental, PRE-EXISTING (not introduced by VCST-5707) · **Archetype:** SCOPE / SILENT

## Summary
A caller with no write access — a Read-only share recipient, a member of an unrelated org, or an anonymous caller — calls `addWishlistItem` on someone else's list. The response is `Access denied.` / `Anonymous access denied…` with `data: null`, **but the quantity change is saved**. The `listId` is exposed to every share reader via `sharedWishlist { id }`.

## STR
1. As @td(SR_REP_PRIMARY): create a list, add a product with quantity 2, share it (Customer scope) with @td(ORG_ACME).
2. Call `addWishlistItem(command:{ listId, productId: <same product>, quantity: 1 })` as @td(ACME_BUYER) (Read), as @td(SR_REP_EXCLUSIVE_TECHFLOW) (no access), and anonymously.
3. Read the list as the owner, also via an uncached read (different `cultureName`), again ~10 min later.

## Expected vs Actual
- Expected: refused and nothing written — quantity stays 2.
- Actual: every call returns the auth error, yet quantity goes 2 → 3 → 4 → 5 → 6 and stays 6 in storage.

## Root cause (source)
`vc-module-x-cart` `src/VirtoCommerce.XCart.Data/Schemas/PurchaseSchema.cs` (dev, ≈ L1427–1455):
```csharp
var cartAggregate = await context.GetMediator().Send(command);   // persists
context.UserContext["storeId"] = cartAggregate.Cart.StoreId;
await AuthorizeByListIdAsync(context, command);                  // authorizes AFTER
```
Only `addWishlistItem` and `updateWishListItems` use this order; every other list mutation (`createWishlist`, `changeWishlist`, `removeWishlist`, `addWishlistItems`, `removeWishlistItem(s)`, `moveWishlistItem`, `addWishlistBulkItem`) authorizes before `Send`. Not verified: adding a NEW product line (only an existing line was tested); `updateWishListItems` is source-only.

## Evidence
`reports/tickets/Sprint26-19/VCST-5707/screenshots/4a-be-BUG-refused-addWishlistItem-persists.json`, `4a-be-E10-refused-add-quantity.json`, `4a-be-E10-reader-writes.json`.

## Fix Routing
`vc-module-x-cart` `PurchaseSchema` — move `AuthorizeByListIdAsync` before `Send` in both resolvers (the store id is resolvable from the list id). Add a regression test for an unauthorized add/update.
