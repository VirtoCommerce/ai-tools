# BUG: Cart line-item validation errors disappear after any cart change (add/update/remove) — High

**Severity:** High (functional regression — per-line cart validation signal is empty/stale after every cart mutation; **reproduced live on vcst-qa 2026-06-10**)
**Component:** Backend / xAPI — `vc-module-x-cart` (GraphQL cart schema + cart validation lifecycle)
**Env:** vcst-qa @ Platform 3.1035.0, **XCart `3.1018.0-pr-120-0311`** (PR #120 "VCST-5101 Mixed currency" — currently deployed to QA; the deployed head `0311d480` contains the `ClearValidationCache()` call). Originating refactor: commit `03e6bd3` ("Cart Validation Caching Refactor"). **Live on vcst-qa.**
**JIRA:** VCST-5234 (filed 2026-06-10, High, project VCST)
**Date:** 2026-06-10 · **Reported by:** QA Agent (`/qa-fix` source-review) · **Reported via:** developer-flagged commit + symptom

## Summary
The refactor caches validation per ruleset and makes `CartAggregateRepository.SaveAsync()` call `CartAggregate.ClearValidationCache()`, which clears **both** the new `ValidationErrorsByRuleSet` cache **and** the obsolete `CartValidationErrors` list. Re-validation was wired into only the cart-level `CartType.validationErrors` resolver; the per-line `LineItemType` resolvers and `AddCartItemsBulkCommandHandler` still read the synchronous `GetValidationErrors()` (backed by the now-cleared `CartValidationErrors`). Result: on every cart mutation response, `items[].validationErrors` is empty and `items[].isValid` is `true`, even when the cart/line is invalid. Live probing further showed the per-line fields are not independently validated — they reflect **whichever ruleSet was last queried at cart level**, so a line can read valid-when-invalid AND (from stale `"*"` residue) invalid-when-cart-says-clean.

## Steps to Reproduce (live — GraphQL xAPI at `{BACK_URL}/graphql`, authenticated as the storefront user)
No hardcoded IDs — resolve at runtime (`live-discover` / `@td()`); creds from `.env`.

1. **Find an inventory-limited product.** Query products in the store and pick one that tracks inventory with a small finite stock:
   ```graphql
   query { products(storeId:"{{STORE_ID}}", filter:"category.subtree:@td(VIRTUAL_CATALOG_B2B.id)", first:50) {
     items { id name sku availabilityData { isActive isInStock isTrackInventory availableQuantity } } } }
   ```
   Capture `productId = P` and `availableQuantity = Q` (Q small, isTrackInventory=true). If none, use any `isInStock:false` product.
2. **Start from a clean cart** for the storefront user (optional `clearCart`).
3. **Create an invalid-but-present line.** A flat over-stock `addItem` is *rejected* (adds no line: `itemsCount:0`), so instead add a valid qty then push it over stock with a save-triggering update — both requesting **both** levels in one response. (`addItem`/`cart` commands MUST include `currencyCode` + `cultureName` or the op silently no-ops with `itemsCount:0` — currency mismatch.)
   ```graphql
   # 3a: add a valid line
   mutation { addItem(command:{ storeId:"{{STORE_ID}}", cartName:"default", userId:"{{USER_ID}}",
                                currencyCode:"{{CURRENCY}}", cultureName:"en-US", productId:"P", quantity:1 }) { items { id } } }
   # 3b: push it over stock (capture lineItemId L from 3a)
   mutation { changeCartItemQuantity(command:{ storeId:"{{STORE_ID}}", cartName:"default", userId:"{{USER_ID}}",
                                               lineItemId:"L", quantity: Q_PLUS_1000 }) {
       id itemsCount
       validationErrors { errorCode objectType objectId errorMessage }                 # CART-LEVEL
       items { id sku quantity isValid validationErrors { errorCode objectType errorMessage } }  # PER-LINE
   } }
   ```
4. **Re-query the cart per-line fields only** (no cart-level `validationErrors` field, so nothing re-validates):
   ```graphql
   query { cart(storeId:"{{STORE_ID}}", cartName:"default", userId:"{{USER_ID}}", currencyCode:"{{CURRENCY}}", cultureName:"en-US") {
     itemsCount items { id sku isValid validationErrors { errorCode objectType } } } }
   ```

**Order note:** the cart-level `validationErrors` resolver now calls `ValidateAsync()` which *repopulates* `CartValidationErrors`, so in a single response the per-line emptiness can be masked if `validationErrors` resolves before `items`. **Step 4 (per-line-only re-query) is the unambiguous probe** — after the save cleared the cache and no field re-validates, the invalid line returns `isValid:true` and `validationErrors:[]`.

**Order-independent variant (bulk add):** run the bulk add-to-cart mutation (`AddCartItemsBulkCommand`) with an over-stock SKU and read `BulkCartResult.errors` — built in C# from `GetValidationErrors()` *after* the inner save, so validator-sourced line errors are dropped regardless of GraphQL field order.

## Live reproduction — CONFIRMED (vcst-qa, XCart `3.1018.0-pr-120-0311`, 2026-06-10)
Product `ALCOE5037` (avail 606), line pushed to 1606. Mutation response — cart-level reports the failure, **same line in the same payload does not**:
```jsonc
"validationErrors":[ { "errorCode":"PRODUCT_QTY_INSUFFICIENT", "objectType":"CartProduct", ... } ],
"items":[ { "sku":"ALCOE5037", "quantity":1606, "isValid":true, "validationErrors":[] } ]
```
**ruleSet cross-contamination (no mutation between reads — per-line state follows the last cart-level ruleSet queried):**
| Last cart-level query | cart-level `validationErrors` | per-line `isValid` / `validationErrors` |
|---|---|---|
| `ruleSet:"*"` (then per-line-only re-query) | `PRODUCT_QTY_CHANGED` (LineItem) | `false` / `[PRODUCT_QTY_CHANGED]` |
| `ruleSet:"default"` | `[]` (does **not** report the over-stock condition) | stale `false` residue from `"*"` |
| `ruleSet:"shipments"` | `[]` | resets to `true` / `[]` |

So per-line fields are not independently validated, and the **default** storefront ruleSet misses the over-stock condition even at cart level. All paths returned HTTP-200, no exceptions.

## Expected
`items[].validationErrors` lists the line's validation failures and `items[].isValid` is `false` when the line is invalid — consistent with the cart-level `validationErrors`.

## Actual
`items[].validationErrors` is `[]` and `items[].isValid` is `true` on the mutation response, despite the cart-level `validationErrors` reporting the failure. Validator-sourced errors written during the operation are discarded by the post-save cache clear; only `OperationValidationErrors` (e.g. "product unavailable") survive.

## Root Cause
In `CartAggregate.ClearValidationCache()` (new), called unconditionally by `CartAggregateRepository.SaveAsync()`:
```csharp
ValidationErrorsByRuleSet.Clear();
CartValidationErrors = new List<ValidationFailure>();   // obsolete store, still read by sync GetValidationErrors()
```
`GetValidationErrors()` returns `CartValidationErrors.Concat(OperationValidationErrors)`. The commit updated the **cart-level** resolver to re-validate (`CartType`: `await context.Source.ValidateAsync(ruleSet)`), but left these consumers reading the cleared sync path:
- `LineItemType.cs` — `validationErrors` and `isValid` resolve via `context.GetCart().GetValidationErrors().GetEntityCartErrors(...)` (no re-validation).
- `AddCartItemsBulkCommandHandler.cs` — `result.Errors` built from `cartAggregate.GetValidationErrors()` **after** the inner `AddCartItemsCommand` saved.

Secondary: `IsValid => ValidationErrorsByRuleSet.IsEmpty || ...` returns `true` for a just-saved (cleared) cart that was never re-validated — vacuous "valid".

## Impact
- Storefront loses per-line "why is this line invalid" signal on every add/update/change mutation response (`useCart` reads `items[].validationErrors` / `isValid`). Out-of-stock / min-qty / configuration errors silently vanish.
- `BulkCartResult.errors` drops validator-sourced line errors (keeps only operation errors).
- Checkout/order gating that trusts `cart.IsValid` or `GetValidationErrors()` post-save may treat an invalid cart as valid.

## Suggested Fix (single repo: `vc-module-x-cart`)
Make the line-level path re-validate consistently with the cart-level resolver, rather than reading the cleared sync store. Either:
1. Resolve `LineItemType` `validationErrors`/`isValid` from `await GetCart().ValidateAsync(ruleSet)` (mirror the `CartType` change), or
2. Have `ClearValidationCache()` not silently strip results the same-request response still needs — re-validate lazily on read (cache empty ⇒ revalidate) instead of returning empty.
Keep the minimal-diff + never-edit-existing-tests rules; add a unit test asserting `items[].validationErrors`/`isValid` survive a save.

## Fix Routing
- **Suggested repo:** `VirtoCommerce/vc-module-x-cart` · **repoKind:** `module` (xAPI `vc-module-x-*`)
- **RCA anchors:** `CartAggregateRepository.SaveAsync` → `CartAggregate.ClearValidationCache`; `CartAggregate.GetValidationErrors`/`IsValid`; `Schemas/LineItemType.cs` (`validationErrors`, `isValid` resolvers); `Commands/AddCartItemsBulkCommandHandler.cs`
- **Routing confidence:** HIGH
- **Note:** Originating PR #110 ("Feat/cart aggregate validation") is **already merged to `dev`** (merge commit `03e6bd3`, 2026-05-01) — fix must target `dev`, not an open PR. Now live on vcst-qa via the PR #120 build, so Gate 6 (E2E) is runnable now (regression guard `CVAL-GQL-001` in suite `050b5` currently RED).

## References
- Commit: `vc-module-x-cart@03e6bd3bace571c4e8feda0ca2e7e51fe6b85d75` ("Cart Validation Caching Refactor") = merge of **PR #110**; deployed via **PR #120** build `3.1018.0-pr-120-0311`
- Regression coverage: `regression/suites/Backend/graphql/050b5-graphql-xcart-validation.csv` — `CVAL-GQL-001` (VCST-5234 guard, expected RED), `002`–`005` (ruleSet API / isolation / wildcard / stale-clear)
- Not a dup of `reports/bugs/.../BUG-Update-Cart-Toast-Missing-Cart-Level-Validation-Errors.md` (that is a vc-frontend `add-to-cart.vue` filter dropping `ProductConfigurationSection` errors — different layer, different cause)
- BL/ECL: cart line-item validity invariant (cart must surface per-line validation state on mutation responses)
