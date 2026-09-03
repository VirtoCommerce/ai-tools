# Rep-shared wishlist is accepted but grants the customer's organization no access at all — [High]

**Env:** vcst-qa @ Platform 3.1061.0, Theme 2.56.0 (`vc-module-x-cart` 3.1030.0)

## Summary

A Sales Rep can share a wishlist with a customer organization — `changeWishlist(scope: "Customer",
sharedWithId: <orgId>)` returns 200 with `sharingSetting { access: "Write" }` and no errors. But a
member of that exact organization then sees nothing: the list is absent from their own
`wishlists()` result, and both `wishlist(listId)` (read) and `removeWishlistItem` (edit) return
`Access denied.` The share is persisted and reported as granted, yet grants nothing.

This is the whole customer half of VCST-5335, whose AC reads *"if the Rep shares with my
organization … See this list in my shopping lists with the sign it was recommended by my Rep …
Lists can be edited."* Both VCST-5332 and VCST-5335 are **Done**.

## STR

Starting from an authenticated Sales Rep (`SALES_REP`) and a buyer in Acme
(`ACME_BUYER`, live `me.contact.organizationId` = `105c2c4e-23be-4258-8691-568a0ff190be`):

1. As the rep, `createWishlist(storeId, userId: <repId>, listName: "…")` → capture `listId`.
2. `addWishlistItem(listId, productId, quantity: 1)` → 1 item.
3. Share it with the buyer's organization:
   ```graphql
   mutation { changeWishlist(command: {
     listId: "<listId>"  scope: "Customer"  sharedWithId: "105c2c4e-23be-4258-8691-568a0ff190be"
   }) { id scope sharingSetting { sharedWithId scope access isOwner } } }
   ```
   → **200**, `errors: []`, `scope: "Customer"`, `sharingSetting { sharedWithId: "105c2c4e-…",
   scope: "Customer", access: "Write", isOwner: true }`.
4. Re-auth as `ACME_BUYER`, then `wishlists(storeId, userId: <buyerId>)`.
5. Also `wishlist(listId: "<listId>")` and `removeWishlistItem(listId, lineItemId)`.

## Expected vs Actual

| | Expected (VCST-5335) | Actual |
|---|---|---|
| Step 4 — buyer's own lists | shared list present, `sharingSetting.isOwner: false` | `wishlists.totalCount: 0`, `items: []` |
| Step 5 — buyer reads it | list returned | `errors: ["Access denied."]` (`Forbidden`), `data.wishlist: null` |
| Step 5 — buyer edits it | edit succeeds (`access: "Write"`) | `errors: ["Access denied."]`, `data.removeWishlistItem: null` |

## Alternatives ruled out

- **Wrong fixture org.** The buyer's live `organizationId` is byte-identical to the `sharedWithId`.
- **`sharedWithId` wants a user/contact id, not an org id.** Sharing with the buyer's *user* id is
  **rejected** (`changeWishlist` → `Access denied.`); the org id is accepted. The server itself
  treats the org id as the valid form.
- **`scope` literal casing** (`"Customer"` vs `"customer"`). The server echoed `"Customer"` back in
  both `changeWishlist.scope` and `sharingSetting.scope`.
- **Flaky / one build.** Reproduced identically on 2026-08-25 (`REG-2026-08-25-1128`) and twice on
  2026-08-26 (`REG-2026-08-26-1600`, `REG-2026-08-26-1640`), a different list id each time.
- **The caller's token carried no organization grant.** Ruled out: repeated with `TECHFLOW_ADMIN`,
  whose alias declares an explicit `organization_id`, sharing to TechFlow so `sharedWithId` and the
  caller's org are the same GUID (`96f109a7-9010-4691-b6a1-bef25cca3d04`) — **still denied**
  (`REG-2026-08-26-1640`, `PROBE-TF-*.json`). Its `wishlists()` returned its 3 other lists and not
  the shared one.
- **Module version lag (feature not deployed).** Ruled out — see Root cause.

## Not affected

Cross-org isolation holds — a member of a *different* org (`TECHFLOW_BUYER`) correctly does not see
the shared list. No data leak.

## Root cause

**Two independent gaps. Not a version lag** — `SalesRepCartSharingService.cs` at the deployed tag
`3.1005.0` is sha-identical (`a46ad6ba`) to `dev`, so the whole VCST-5332 implementation is running.
The override is provably active: base `CartSharingService.ApplyScope` has no `Customer` branch and
would have thrown `Unsupported sharing scope 'Customer'`, yet the share persists.

**1 — A read is authorized as if it were a write, and targeted customers are granted read-only.**

- `vc-module-sales-rep` `SalesRepCartSharingService` grants a targeted customer
  `CartSharingAccess.Read` (`ApplyScope` persists `Read`; `GetSharingAccess` returns `Read` for any
  non-owner). Its own comment: *"targeted customers are read-only."*
- `vc-module-x-cart` `PurchaseSchema.InitializeWishlistUserContext(…, string requestedAccess =
  CartSharingAccess.Write)` — the default parameter is **`Write`**, so a plain `wishlist(listId)`
  **read** asks for `Write`.
- `vc-module-x-cart` `CanAccessCartAuthorizationRequirement.CheckSharedWishlistUserContext` then
  denies:

  ```csharp
  var isAuthorized = _cartSharingService.IsAuthorized(...);        // TRUE — org matches SharedWithId
  if (!isAuthorized) return false;
  var sharingAccess = _cartSharingService.GetSharingAccess(...);   // "Read" for a targeted customer
  if (context.RequestedAccess.IsNullOrEmpty()
      || context.RequestedAccess == CartSharingAccess.Write && sharingAccess != CartSharingAccess.Write)
      return false;                                               // Write asked, Read held -> DENIED
  ```

  `IsAuthorized` does its job and is then overruled one line later. That is why the denial is total —
  read *and* edit — for every targeted customer.

  Organization-scope sharing is unaffected because it grants `Write`, which is why WISH-021's
  same-org read passes and this one does not.

**2 — The customer's own list enumeration has no clause for a targeted share.** `ApplyScope` for
`Customer` calls `SetOwner(cart, rep, name, organizationId: null)`, so the cart's `CustomerId` is
the rep and its `OrganizationId` is null. `wishlists(storeId, userId)` filters on the caller's
user/org and nothing consults `CartSharingSetting.SharedWithId` — a repo-wide search for
`SharedWithId` in `vc-module-x-cart` returns nine files, none of them a query or search-criteria
class. So requirement #1 of VCST-5335 ("See this list in my shopping lists") needs a search change
even after the authorization gate is fixed.

**The spec conflict to resolve first.** VCST-5335's AC says *"Lists can be edited"*, so a targeted
customer is meant to hold **Write** — which contradicts VCST-5332's read-only implementation. Fixing
this by making the read path request `Read` would satisfy visibility but still leave editing broken
and still contradict the AC. Product needs to confirm the intended access level before either module
is changed.

## The App Insights 500 is this same denial, not a separate issue

The in-window `POST /graphql` → **HTTP 500** carrying
`VirtoCommerce.Xapi.Core.Security.Authorization.AuthorizationError` from
`XCart.Data.Schemas.PurchaseSchema.AuthorizeAsync:1746` is the throw site of exactly this gate —
`AuthorizeAsync` raises `AuthorizationError.Forbidden()` on the failed requirement, and line 1746
falls inside that method. Earlier noted as "possibly related, different code path"; that was wrong.
What remains genuinely open is narrower: why one such denial was mapped to a 500 while the others
returned 200 + `errors[]`.

## Refs

Cases WISH-33 / WISH-34 (`regression/suites/Backend/graphql/050h-graphql-wishlist.csv`) ·
VCST-5332, VCST-5335 · evidence
`reports/regression/REG-2026-08-26-1600/graphql-evidence/WISH-3{3,4}-*.json` plus the `VERIFY-*`
discriminators in the same folder.
