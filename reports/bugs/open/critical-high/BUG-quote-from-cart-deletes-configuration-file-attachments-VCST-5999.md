# Quote from cart: the attachment the quote points at is **deleted by the conversion itself** `[P1]`

## Status: CONFIRMED

**Tracker:** VCST-5999 (Bug, High, Draft) — found during `/qa-test` on VCST-5924
**Env (this run):** vcptcore-qa · `Quote 3.1003.0` · `XCart 3.1036.0` · `Xapi 3.1023.0` · `XOrder 3.1012.0` · `Orders 3.1016.0` · `FileExperienceApi 3.1004.0`
**Reproduced from scratch:** 2026-09-23, buyer `test-john.mitchell-20260310@test-agent.com`, quote `RFQ260923-00002`

**Summary:** `createQuoteFromCart` copies the configuration file's URL into the quote **verbatim**, then clears the
source cart — and clearing a cart **deletes** its configuration files. The quote is therefore born pointing at a file
that the same mutation just destroyed: every caller gets **404**, including an administrator. A buyer who attaches an
ID Proof and requests a quote leaves the reviewing sales rep with a filename and a dead link, and no error is raised
anywhere.

## ⚠️ This corrects the ticket's stated mechanism

The ticket says the conversion *"records file references pointing at **new** file ids — and those files do not exist"*
(copy-that-was-never-created). **That is not what happens.** Measured on vcptcore-qa: the quote's URL is
`/api/files/ee4e4428…` — **byte-identical to the cart's**, same id, no copy. Source agrees:
`QuoteConverter.FromCartConfigurationItemFile` does `result.Url = file.Url`
(`QuoteModule.Data/Services/QuoteConverter.cs:553`) and the entity stores it unchanged. The file is **deleted**, not
missing. This matters for the fix: "ensure the copies are created" would be implementing a copy path that does not and
need not exist; the actual bug is a destructive cleanup.

## STR
1. Sign in as a B2B buyer; upload a file to scope `product-configuration` (`POST /api/files/product-configuration`).
2. `addItem` a configurable product with a required File section (`agent-test-req-file-child-20260519`, "ID Proof"),
   passing the returned url in `configurationSections[].fileUrls`.
3. Read the url — **200**.
4. `createQuoteFromCart(command:{cartId})`.
5. Read `quote.items.configurationItems.files.url` — it is the **same** url — and fetch it.

## Expected vs Actual
- **Expected:** a quote's attachment URL resolves for the parties entitled to see the quote. Either the quote keeps
  the file alive, or the conversion re-owns it to the quote — but the document the buyer attached must survive.
- **Actual:** **404** for the owner, for an anonymous caller and for an administrator. The GraphQL response looks
  complete (name, size, contentType, url all present), so nothing surfaces the loss.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | reproduced at API level; the storefront renders whatever url the quote returns |
| 2. Backend Admin | N/A | not an admin surface |
| 3. GraphQL xAPI | **FAIL** | `createQuoteFromCart` returns a quote whose `files[].url` points at a file the same call deleted |
| 4. Platform REST API | PASS | `GET /api/files/{id}` → 404 is **correct** for a file that no longer exists — REST faithfully reports the data it was left with |

**Owning layer:** Layer 3 — GraphQL xAPI. This is the load-bearing difference from VCST-5995, where REST (the
authorization gate) was the defective layer; here REST behaves correctly and the mutation is at fault.

## Root Cause Analysis — measured, not inferred

`CreateQuoteFromCartCommandHandler.Handle` (`QuoteModule.ExperienceApi/Commands/CreateQuoteFromCartCommandHandler.cs`)
does three things in order: convert the cart to a quote, save the quote, then

```csharp
var cartAggregate = await _cartRepository.GetCartForShoppingCartAsync(cart);
await cartAggregate.ClearAsync();        // <-- the destructive step
await _cartRepository.SaveAsync(cartAggregate);
```

and `CartAggregate.ClearAsync()` begins with `await DeleteConfigurationFiles();`
(`vc-module-x-cart`, `XCart.Core/CartAggregate.cs:755` → `:2205`), which resolves every configuration file url in the
cart and calls `_fileUploadService.DeleteAsync(fileIds)` for those owned by that cart. The quote is already saved with
the **same** url, so it is left dangling.

**Isolated with a control — the deletion is `ClearAsync`, not the quote conversion.** Fresh file, fresh cart, no quote
involved, `clearCart` mutation alone:

| Step | Buyer | Admin |
|---|---|---|
| File attached to cart `cfbe339e…` | **200** | — |
| `clearCart(command:{cartId})` | — | — |
| Same url, immediately after | **404** | **404** |

One mutation, one file id, 200 → 404 for everyone. That is the whole mechanism.

**Why the order surface fails differently.** `CreateOrderFromCartCommandHandler` (`vc-module-x-order`) does **not**
call `ClearAsync()` — it uses `RemoveItemsAsync`, which removes line items without touching files, and then xOrder
re-owns the file to the order's configuration item. So the same attachment ends up **403** on an order (file alive,
grant missing — VCST-5995) and **404** on a quote (file destroyed). Two surfaces, two different halves of the same
missing design: configuration-file ownership was built for the cart and neither conversion inherited it properly.

**Trap for whoever fixes this.** The obvious symmetry — make the quote re-own the file the way xOrder does — would
move this bug straight into VCST-5995's failure mode: scope `product-configuration` has exactly one authorization
requirement factory (xCart's, cart-only), so a quote-owned configuration file would return **403** instead of 404.
`vc-module-quote`'s existing `QuoteAuthorizationRequirementFactory` covers the **`quote-attachments`** scope, not this
one. The two tickets therefore converge on one decision and are best solved together.

## Related observation (not this bug)
On the quote, the File configuration item's `name` is `null` and `QuoteConfigurationItemType` exposes no
`sectionName` at all, while cart and order both carry section identity — consistent with VCST-5431.

## Notes
- Test artifacts left on vcptcore-qa: quote `RFQ260923-00002`, carts `vcst5999-repro` and `vcst5999-control` (both now
  empty), and two deleted probe files.
- Sibling tickets from the same VCST-5924 run: **VCST-5995** (order 403) and **VCST-6000** (0-byte file satisfies a
  required section). Distinct defects, distinct fixes — see
  [`BUG-configurable-product-order-attachment-403-for-owner-VCST-5995.md`](BUG-configurable-product-order-attachment-403-for-owner-VCST-5995.md).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — GraphQL xAPI (`createQuoteFromCart`)
- **Suggested repo:** `VirtoCommerce/vc-module-quote`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Quote Experience API — cart→quote conversion cleanup
- **RCA anchor:** `src/VirtoCommerce.QuoteModule.ExperienceApi/Commands/CreateQuoteFromCartCommandHandler.cs`, the
  `await cartAggregate.ClearAsync()` call in `Handle`; the deletion itself is
  `vc-module-x-cart/src/VirtoCommerce.XCart.Core/CartAggregate.cs:755` (`ClearAsync` → `DeleteConfigurationFiles`)
- **Routing confidence:** HIGH — the quote module owns both the converter that preserves the url and the handler that
  chooses to clear the cart; the control run pins the deletion to `ClearAsync`. Caveat for the implementer, not for
  the routing: the *chosen remedy* (keep the file vs. re-own it to the quote) may pull in the same
  scope-factory decision as VCST-5995.
