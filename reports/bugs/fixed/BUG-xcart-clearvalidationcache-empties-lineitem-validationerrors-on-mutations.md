# [XCart] Cart per-line validation errors disappear after any cart change (add/update/remove)

**JIRA:** VCST-5234 (Highest) · **Status:** FIXED — verified live 2026-06-11
**Owning layer:** GraphQL xAPI → `VirtoCommerce/vc-module-x-cart`
**Reproduced:** 2026-06-10/11 on XCart `3.1018.0-pr-120` / `3.1019.0-pr-123` · **Fixed in:** XCart `3.1019.0-pr-124-89a6` (PR #124)

## Resolution

- **Fixed in:** `VirtoCommerce.XCart 3.1019.0-pr-124-89a6` — PR #124 "VCST-5234: Fix line item validation errors lost after cart save" (open against `dev`, **pending human merge**; deployed to vcst-qa for verification).
- **Fix:** `LineItemType` `isValid`/`validationErrors` now async re-validate via the `items` ruleset (mirroring the cart-level resolver) instead of reading the sync store that `SaveAsync` clears; `ValidateAsync(ruleSet)` delegates to the virtual `ValidateAsync(CartValidationContext, string)`.
- **Verified:** 2026-06-11 — guard `CVAL-GQL-001` PASS 3/3 (11/11 assertions). Over-stock line now returns `isValid:false` + `validationErrors:[PRODUCT_QTY_CHANGED / LineItem]` (line-level code; cart-level remains `PRODUCT_QTY_INSUFFICIENT`).
- **Verification method:** `/qa-verify-fix VCST-5234` (GraphQL runner against vcst-qa).

After any cart change (add / update / remove), the **per-line** validation signal disappears: `items[].validationErrors` comes back empty and `items[].isValid` is `true` even when the line is actually invalid. The **cart-level** `validationErrors` still reports the failure correctly in the very same response. The storefront (`vc-frontend useCart`) reads the per-line fields, so out-of-stock / min-qty / configuration errors silently vanish on the customer's cart.

---

## How to reproduce

Endpoint `POST {BACK_URL}/graphql` (or GraphiQL at `{BACK_URL}/ui/graphiql`), signed in as a storefront user with a Bearer token. Use any inventory-tracked product with a small finite stock — this run used **ALCOE5037** (`ce4fcacb-9261-404d-bc08-43f381b3cf26`, in stock **606**).

> ⚠️ Two things that otherwise hide the bug:
> 1. Every `addItem` / `changeCartItemQuantity` / `cart` call **must** include `cartName: "default"`, `currencyCode` and `cultureName`. Leave any out and the call resolves a *different / empty* cart (`LINE_ITEM_NOT_FOUND`, or `itemsCount: 0`) and never touches your line.
> 2. The over-stock change must actually stick on the line (`itemsCount: 1`, quantity updated). If it returns `itemsCount: 0`, stock wasn't exceeded — pick a bigger quantity.

**Step 1 — add a valid line (quantity 1).**
```graphql
mutation {
  addItem(command: {
    storeId: "{{STORE_ID}}", cartName: "default", userId: "{{USER_ID}}",
    currencyCode: "USD", cultureName: "en-US",
    productId: "ce4fcacb-9261-404d-bc08-43f381b3cf26", quantity: 1
  }) { id itemsCount }
}
```

**Step 2 — get the line id.** (The `addItem` response `items[]` is empty due to async cart-projection settle, so re-query the cart.)
```graphql
query {
  cart(storeId: "{{STORE_ID}}", userId: "{{USER_ID}}", currencyCode: "USD", cultureName: "en-US") {
    items { id sku productId quantity inStockQuantity }
  }
}
```

**Step 3 — push the line over stock (quantity 5000 ≫ 606).** Ask for cart-level *and* per-line validation in the same response.
```graphql
mutation {
  changeCartItemQuantity(command: {
    storeId: "{{STORE_ID}}", cartName: "default", userId: "{{USER_ID}}",
    currencyCode: "USD", cultureName: "en-US",
    lineItemId: "<LINE_ID_FROM_STEP_2>", quantity: 5000
  }) {
    id itemsCount
    validationErrors { errorCode objectType errorMessage }                                  # CART-LEVEL
    items { id sku quantity isValid validationErrors { errorCode objectType errorMessage } } # PER-LINE
  }
}
```

**Step 4 — re-query the per-line fields only** (no cart-level `validationErrors` field → nothing re-validates; this is the decisive probe).
```graphql
query {
  cart(storeId: "{{STORE_ID}}", userId: "{{USER_ID}}", currencyCode: "USD", cultureName: "en-US") {
    items { id sku quantity isValid validationErrors { errorCode objectType errorMessage } }
  }
}
```

## Expected result

In Step 3 and Step 4 the over-stock line should report the failure at the **line** level, matching the cart level:
- `items[].isValid` = **false**
- `items[].validationErrors` contains **`PRODUCT_QTY_INSUFFICIENT`**

## Actual result

The cart level reports the failure, but the **same line in the same payload does not** — and Step 4 confirms it stays wrong:

```json
// Step 3 response
"validationErrors": [ { "errorCode": "PRODUCT_QTY_INSUFFICIENT", "objectType": "CartProduct",
  "errorMessage": "The product available quantity 606 is insufficient for requested 5000" } ],
"items": [ { "sku": "ALCOE5037", "quantity": 5000, "isValid": true, "validationErrors": [] } ]

// Step 4 response (per-line only)
"items": [ { "sku": "ALCOE5037", "quantity": 5000, "isValid": true, "validationErrors": [] } ]
```

Everything returns HTTP 200, no exceptions.

## Extra symptom — per-line state follows the last cart-level ruleSet queried

Varying only the cart-level `ruleSet` (no mutation between reads) shows the per-line fields aren't validated independently — they echo whatever ruleSet was last queried at cart level:

| Last cart-level query | cart-level `validationErrors` | per-line `isValid` / `validationErrors` |
| --- | --- | --- |
| `ruleSet: "*"` → then per-line re-query | `PRODUCT_QTY_CHANGED` (LineItem) | `false` / `[PRODUCT_QTY_CHANGED]` |
| `ruleSet: "default"` | `[]` (misses the over-stock condition) | stale `false` residue from `"*"` |
| `ruleSet: "shipments"` | `[]` | resets to `true` / `[]` |

So a line can read valid-when-invalid **and** stale-invalid-when-clean, and the **default** ruleSet doesn't even report the over-stock condition at cart level.

---

## Root cause

The PR #110 "cart aggregate validation" refactor (merged to `dev` 2026-05-01, commit `03e6bd3`) made `CartAggregateRepository.SaveAsync()` call `CartAggregate.ClearValidationCache()`, which clears **both** the new `ValidationErrorsByRuleSet` cache **and** the old `CartValidationErrors` list:

```csharp
ValidationErrorsByRuleSet.Clear();
CartValidationErrors = new List<ValidationFailure>();   // still read by the sync GetValidationErrors()
```

Re-validation was wired into **only** the cart-level resolver (`CartType.validationErrors` → `await ValidateAsync(ruleSet)`). The per-line consumers still read the cleared sync store:
- `Schemas/LineItemType.cs` — `validationErrors` / `isValid` via `GetCart().GetValidationErrors().GetEntityCartErrors(...)` (no re-validation).
- `Commands/AddCartItemsBulkCommandHandler.cs` — `BulkCartResult.errors` from `GetValidationErrors()` **after** the inner add saved.

Secondary: `IsValid => ValidationErrorsByRuleSet.IsEmpty || ...` returns `true` for a just-saved (cleared) cart that was never re-validated — a vacuous "valid".

## Impact

- Storefront loses the per-line "why is this line invalid" reason on every add/update/change. Out-of-stock / min-qty / configuration errors silently disappear (and can also show as stale-invalid).
- `BulkCartResult.errors` drops validator-sourced line errors.
- Checkout / order gating that trusts `cart.IsValid` or `GetValidationErrors()` right after a save can treat an invalid cart as valid.

## Suggested fix (single repo: `vc-module-x-cart`, target `dev`)

Make the per-line path re-validate the same way the cart-level resolver does, instead of reading the cleared sync store — either resolve `LineItemType` `validationErrors`/`isValid` from `await GetCart().ValidateAsync(ruleSet)` (mirror the `CartType` change), or re-validate lazily on read when the cache is empty. Keep it minimal-diff, don't edit existing tests, and add a unit test asserting `items[].validationErrors` / `isValid` survive a save.

## Regression guard

`regression/suites/Backend/graphql/050b5-graphql-xcart-validation.csv` → **`CVAL-GQL-001`** guards this bug (currently RED — fails only on the per-line `isValid` / `validationErrors` assertions). `CVAL-GQL-002`–`005` (ruleSet default / isolation / wildcard / stale-clear) PASS. All five `changeCartItemQuantity` steps were corrected on 2026-06-11 to include `cartName` + `currencyCode` + `cultureName` so the guard genuinely exercises the over-stock line; the three per-line assertions flip to PASS once the fix lands.
