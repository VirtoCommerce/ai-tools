# Targeted customer cannot use a Customer-scope list share: wishlist(listId) is Forbidden and the list is missing from their wishlists() — [High]
**Filed:** VCST-6147, 2026-10-01 (sub-task of VCST-5925; moved out 2026-10-06 to a standalone Bug, Relates VCST-5925 — needs a product decision, done separately)

**Env:** vcptcore-qa · XCart 3.1037.0-pr-141-fb27 · Cart 3.1011.0-pr-194-8331 · SalesRep 3.1012.0-pr-21-f681 · 2026-10-01 14:50 UTC
**Found by:** /qa-test VCST-5925 (WISH-33, 4a P-1, direct re-check) · **Provenance:** IN-SCOPE (VCST-5925 AC5, contract 3.1 + 3.2) · **Archetype:** SCOPE · kb: KB-2F64A447
**Predecessor:** `BUG-rep-shared-wishlist-grants-customer-no-access.md` (same defect, vcst-qa, older single `sharedWithId` model; never filed in Jira)

## Summary
A sales rep shares a list with a customer organization. A member of that organization can open the list only through the link, with `sharedWishlist(sharingKey)`. Two other paths fail:
- `wishlist(listId)` returns `Access denied.`.
- The list does not appear in the member's own `wishlists()`.

VCST-5925 AC5 requires both. None of x-cart#141, cart#194 or sales-rep#21 changes these paths.

## STR (`/graphql`)
Rep = @td(SR_REP_PRIMARY) (role SALES_REP). Reader = @td(ACME_BUYER), token with `storeId` + `organization_id=@td(ORG_ACME.platform_id)`. The reader's `me.contact.organizationId` equals the shared org.
1. Rep: `createWishlist(command: { storeId, userId: <repId>, listName })`, then
   `changeWishlist(command: { listId, scope: "Customer", addSharedWithIds: ["<ORG_ACME>"] })` → 200, `targets: [AcmeCorp]`.
2. Reader: `sharedWishlist(sharingKey: <sharingSetting.id>)`.
3. Reader: `wishlist(listId: <listId>)`.
4. Reader: `wishlists(storeId)`.

## Expected vs Actual
| Step | Expected (AC5) | Actual |
|---|---|---|
| 2 | list, `access: Read`, `isOwner: false` | ✅ as expected (control) |
| 3 | list returned, `access: Read`, `isOwner: false` | ❌ HTTP 200, `data.wishlist: null`, `errors: [{ "Access denied.", code Forbidden }]` |
| 4 | list present, `sharingSetting.isOwner: false` | ❌ `totalCount: 0` |

It reproduces for a second targeted org: an in-case TechFlow member (P-1). On the storefront, `/shared-list/<key>` opens, `/account/lists/<listId>` returns 403, and the list is not in "My lists". Seen identically in 5 kb sessions on vcst and vcptcore, 2026-09-29 to 2026-10-01.

## Root cause (from the VCST-5925 contract comment)
- **3.1:** `PurchaseSchema.InitializeWishlistUserContext` defaults `requestedAccess` to `Write`. A targeted customer holds `Read`, so a plain read by id is denied. `RequestedAccess.IsNullOrEmpty()` also denies.
- **3.2:** `wishlists(storeId, userId)` builds owner-only criteria and never consults `CartSharingSetting` targets. Traps:
  - Test the ACTIVE scope, or revoked shares come back.
  - `ClearSearchCache` must cover the target org.

## Fix Routing
vc-module-x-cart (`PurchaseSchema` wishlist auth + `SearchWishlistQueryHandler` criteria). The `Customer` target id space comes from the vc-module-sales-rep policy.
