# A Write co-owner of an Organization-scope list takes ownership through `changeWishlist(scope)` — the owner loses the list, and it can be made public — [High]

**Env:** vcptcore-qa · theme 2.59.0-pr-2476-0604 · XCart 3.1037.0-pr-141-fb27 · Cart 3.1011.0-pr-194-8331 · SalesRep 3.1012.0-pr-21-f681 · 2026-09-30
**Found by:** /qa-test VCST-5707 (non-owner Write scenario) · **Provenance:** PRE-EXISTING by source (`vc-module-x-cart@dev` has the same logic); no control run on a build without the PRs · **Archetype:** SCOPE / LIFECYCLE

## Summary
On an Organization-scope ("My organization") list, every member of that organization gets `access: Write`. `changeWishlist` only requires Write, and every scope write calls `SetOwner(cart, CurrentUserId, …)`. So any co-owner who sends a `scope` — even the same value — becomes the list's owner: `customerId` / `customerName` switch to them, the original owner gets "Access denied." and the list disappears from their lists. With `AnyoneAnonymous`, the list becomes readable by anyone who has the key. The storefront hides Share from non-owners, so this is reachable through the API only.

## STR
1. Sales rep @td(SR_REP_PRIMARY), token scoped to AcmeCorp: create a list, add an item, `changeWishlist(scope: "Organization")`.
2. AcmeCorp buyer @td(ACME_BUYER): `wishlists()` shows the list with `isOwner: false, access: Write`.
3. The buyer calls `changeWishlist(command: { listId, scope: "AnyoneAnonymous" })` (or `"Organization"`, or `"Private"`).

## Expected vs Actual
- Expected: refused (sharing/ownership belongs to the owner — PR #2476 "Sharing is offered to the list's owner only"); owner unchanged.
- Actual: HTTP 200, no errors; `customerId`/`customerName` become the buyer's; the rep's `wishlist(listId)` → "Access denied.", the list leaves the rep's `wishlists()`; with AnyoneAnonymous, anonymous callers and another org's member read it via `sharedWishlist(key)` (1 item). The buyer's storefront menu on the hijacked list now offers Share.
- Refused only where a different gate applies: Customer scope + `addSharedWithIds` (served-org check).
- Related product question: a Write co-owner can also `removeWishlist` the owner's list (the storefront offers "Remove list" to Write members).

## Root cause (source)
- `vc-module-x-cart@dev` `src/VirtoCommerce.XCart.Data/Services/CartSharingService.cs` `ApplyScope` (≈ L146–166): every branch calls `SetOwner(cart, context.CurrentUserId, context.CustomerName, …)`.
- PR #141 moves the same `SetOwner` into each scope policy's `ApplyAsync` (`CartSharingScopePolicyBase`, Organization / Private / AnyoneAnonymous policies; sales-rep's Customer policy).
- No check that the caller is the owner before a scope write. A rename-only command skips scope handling, so the storefront Rename is safe.

## Evidence
`reports/tickets/Sprint26-19/VCST-5707/screenshots/5c-coowner-step3c-c1-anyone.json`, `5c-coowner-step3f-coowner-same-scope-organization.json`, `5c-coowner-step3f-rep-reclaim-then-coowner-anyone-exposure.json`, `5c-coowner-ui-card-menu.png`, `5c-coowner-ui-hijacked-list-share-offered.png`.

## Fix Routing
`vc-module-x-cart` — require the caller to be the list owner (not merely Write) for any `changeWishlist` that carries `scope` / sharing fields, and do not re-assign the owner on a scope change by someone else.

## Status: FIXED

## Resolution
- **Tracker:** VCST-6125 → Tested (2026-10-05, comment 111358)
- **Fixed in:** vc-module-x-cart PR #141 @ `b40455e` (XCart `3.1038.0-pr-141-b404`; commits `690aa50` owner check on scope/sharing writes, `5a046d5` removeWishlist owner-only) + vc-frontend PR #2476 @ `0abbf21` (theme `2.59.0-pr-2476-0abb`; non-owner menu offers Rename only)
- **Verified:** 2026-10-05 on vcptcore-qa, /qa-verify-fix — same xAPI requests as this report's RED, 3/3 runs: every co-owner scope/sharing write and removeWishlist → `Access denied.` [Forbidden], owner unchanged; rename + item edits still allowed. Evidence: `reports/tickets/Sprint26-19/VCST-6125/evidence.html`
- **Product question answered:** co-owner `removeWishlist` is now refused (owner-only); admins can still remove any list.
