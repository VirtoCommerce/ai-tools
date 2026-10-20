# Root cause: VCST-5887 defect 1, requisition cart differs from the displayed cart

**Confidence:** HIGH (live repro, network bodies and source lines all agree)
**Owning layer:** punchout xAPI handler (backend), `vc-module-punchout` PR #2. The fix is inside this ticket's change set.
**repoKind:** module, `VirtoCommerce/vc-module-punchout`, branch `feat/VCST-5887-punchOutOrderMessage2`, head `f9403cb`

## Chain
1. **The storefront displays the result of `Query.cart` with no cartName** (`GetFullCart` / `GetShortCart`: no `cartId`, no `cartName`; see `network/GetFullCart-request.json`). In xCart, `CartAggregateRepository.GetCartAsync(ICartRequest)` sets `criteria.Name = cartRequest.CartName` (null), so the name is not filtered. `ShoppingCartSearchService.BuildSortExpression` defaults to **`CreatedDate DESC`**. The query therefore returns the **newest-created** cart whose `Type` is null (vc-module-x-cart `CartAggregateRepository.cs` ~L137–147; vc-module-cart `ShoppingCartSearchService.cs` L195–209).
2. **xCart mutations default to `"default"`.** `CartCommandBase.CartName { get; set; } = "default"` (vc-module-x-cart `CartCommandBase.cs` L9), so the cart page's own `AddOrUpdateCartShipment` wrote to the `default` cart (evidence #8).
3. **The punchout handler loads the cart by name `"default"`.** `DefaultPunchoutHandler.CreateGetCartQuery` sets `query.CartName = "default"` (`src/VirtoCommerce.Punchout.ExperienceApi/Services/DefaultPunchoutHandler.cs` L56–63 @ f9403cb). `CreatePunchoutRequisitionCommandType` exposes only `storeId, currencyCode, cultureName` (`network/schema-input-fields.txt`), so the client cannot name the cart it shows.
4. Result: the buyer reviewed and validated Y×2 = $24.00, and the cXML PunchOutOrderMessage carries X×3 = $72.00 (`network/cxml-punchoutordermessage.xml`).

**Lowest failing layer:** the handler (backend). It is the component that turns a cart into the order message, and it picks the cart by a rule (name = `default`) that differs from the rule the storefront uses to display it (no name, newest created). The client sends a correct request for the schema it was given.

## Alternatives ruled out
- **By design?** No. The handler's own doc comment says the message is "built from the 'default' cart", but the buyer is never shown that cart. Sending procurement goods the buyer did not review breaks the punchout contract: the PunchOutOrderMessage must reflect the shopping session. The storefront also validates and disables the button based on the displayed cart (lane B4, PNCR-003), which makes the gate meaningless.
- **Data drift or stale state?** No. The run started from a reset buyer with exactly 2 carts created on purpose, and both carts were byte-stable before and after (#4, #11). Five independent runs today with different products gave the same mismatch.
- **Cache?** No. `Query.cart` (no name) kept returning the named cart after `default` was modified later (#11), which is consistent with the `CreatedDate` sort and not with a stale cache.
- **Frontend bug only?** No. Even a corrected frontend cannot pass a cart id, because the input type has no such field.

## Suggested fix site
Primary, in vc-module-punchout (this PR): add `cartId` (optionally `cartName`) to `CreatePunchoutRequisitionCommand`/`Type`, and have `DefaultPunchoutHandler.CreateGetCartQuery` load the cart by id. The id must be checked against the session's user/org, because the handler already authorises on the punchout session. Without an id, it should resolve the cart **the same way `Query.cart` does** (no name filter), so it matches what the storefront displays, rather than hardcoding `"default"`. Paired change in vc-frontend (theme PR #2564): pass the displayed `cart.id` into `createRequisition`.

## Related, outside this defect
The cart page reads the newest-created cart but writes to `default` (#8). This is a general vc-frontend/xCart split between reads and writes when a user has a named, null-type cart. It also exists outside punchout mode and is a candidate for a separate investigation.

## kb
KB-2EDC661F ("Query.cart without cartName returns the most-recently-**touched** cart") is **partly contradicted**. It is right that `Query.cart` does not return `default`. It is wrong about the rule: the cart is the most recently **created** one (`CreatedDate DESC`), not the most recently modified. After `default` was modified at 11:25:46 (later than the named cart's 11:25:09), `Query.cart` still returned the named cart. Observed on vcptcore_qa1.
