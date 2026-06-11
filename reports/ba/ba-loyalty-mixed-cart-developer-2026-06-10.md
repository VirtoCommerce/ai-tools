# Mixed-Currency Line Items in xCart — Developer Guide & Change Summary

## Overview

This change adds **mixed-currency line items** to the xAPI Cart module (`vc-module-x-cart`). The same product can now appear more than once in a single cart when priced in different currencies, and a cart can hold line items in several currencies at once (e.g. a money-priced item plus a loyalty-points item). The cart still has **one primary currency**; checkout eligibility, promotions, and tax are scoped to the primary-currency lines, while per-line money is rendered in each line's own currency.

- **Repo / PR:** `VirtoCommerce/vc-module-x-cart` — PR [#120](https://github.com/VirtoCommerce/vc-module-x-cart/pull/120) (`feat/VCST-5101`, branch base `dev`), artifact `VirtoCommerce.XCart_3.1018.0-pr-120`.
- **Jira:** VCST-5101 · **Layer:** xAPI (L3) · **Risk:** High (touches cart aggregation, pricing keys, promotion/tax scope, currency-change migration).
- **New dependency:** bumped `VirtoCommerce.CartModule.Core` (alpha) for multi-total cart support.

## Prerequisites

- **.NET 10** SDK (xCart targets the current platform runtime).
- A platform/store where the loyalty (points) currency is registered alongside the primary currency, and the loyalty catalog is priced in that currency.
- Basic familiarity with the xAPI GraphQL cart schema (`cart`, `addItem`, `updateCartItems`) and MediatR command handlers.

## What changed (change surface)

30 files in `src/`. Grouped by concern:

### 1. Cart product loading is now currency-aware
- `CartProducts` is keyed by **`{productId}:{currencyCode}`** instead of product id alone, so the same product resolves independently per currency.
- Resolution moved from `GetCartProductsByIdsAsync` to **`GetCartProductsAsync((currencyCode, productId)[])`** (`ICartProductService.cs`), threaded through add / merge / configurable-item / validation handlers.
- A currency-aware GraphQL **DataLoader** (`DataLoaderContextAccessorExtensions.cs`, +75) batches product loads by the new composite key.

### 2. `itemCurrencyCode` wired end-to-end
Optional **`itemCurrencyCode`** flows through the add/update path: `AddCartItemCommand`, `UpdateCartQuantityCommand` / `UpdateCartQuantityItem`, `NewCartItem`, and the GraphQL inputs `InputAddItemType`, `InputNewCartItemType`, `InputUpdateCartQuantityItemType`. When omitted, the line defaults to the cart's primary currency.

### 3. Checkout / promotion / tax scope vs. display
- **Checkout, promotions, tax mapping, and `HasSelectedLineItems`** use **`CartCurrencySelectedLineItems`** — selected lines whose currency equals the cart's primary currency (or is empty). Defined in `CartAggregate.cs` (+135/-36).
- **Per-line money** in GraphQL uses the line's own currency via `GetLineItemCurrency` / configuration-item currency helpers (`LineItemType.cs`, `CartConfigurationItemType.cs`, `ResolveFieldContextExtensions.cs`).

### 4. New `cartTotals` GraphQL field
`cart.cartTotals` (`CartType.cs` → new `CartTotalType.cs`, backed by `CartTotalAggregate.cs`) exposes **per-currency totals** so a client can render a separate money total and points total.

### 5. Dedup, bulk update, currency change
- Adding a line **dedups by product *and* currency**; bulk quantity updates remove by product *and* currency (`AddCartItemsCommandHandler.cs`, `ChangeCartItemsQuantityCommandHandler.cs`, `UpdateCartQuantityCommandHandler.cs`).
- **`ChangeCartCurrencyCommandHandler.cs`** converts items in the old base currency and keeps items already in a non-base currency.
- Validators (`CartLineItemValidator.cs`, `CartLineItemPriceChangedValidator.cs`) carry the currency through validation context.

## GraphQL API surface (new / changed)

Endpoint: `{{BACK_URL}}/graphql`.

### Schema (SDL)

PR #120 adds a new `CartTotalType` and a `cartTotals` field on `CartType`, plus an optional `itemCurrencyCode` on the add input:

```graphql
"One total bucket for a single currency present in the cart."
type CartTotalType {
  "True when this bucket is the cart's default (primary) total currency."
  isDefaultTotalCurrency: Boolean!
  total: MoneyType!
  subTotal: MoneyType!
  taxTotal: MoneyType!
  discountTotal: MoneyType!
}

extend type CartType {
  "Per-currency totals — one element per currency present in the cart."
  cartTotals: [CartTotalType]
}

extend input InputAddItemType {
  "Add the product in a different currency (defaults to the cart currency)."
  itemCurrencyCode: String
}
```

> The scalar cart fields (`total`, `subTotal`, `discountTotal`, and now `extendedPriceTotal`/`extendedPriceTotalWithTax`) are resolved over `CartCurrencySelectedLineItems` — i.e. **primary currency only**. `cartTotals[]` is the only field that returns every currency.

### Query the new field

**Add an item in a specific currency** — pass `itemCurrencyCode` on the add input:

```graphql
mutation AddPointsItem($command: InputAddItemType!) {
  addItem(command: $command) {
    id
    cartTotals { isDefaultTotalCurrency subTotal { amount currency { code } } total { amount currency { code } } }
  }
}
```
```json
{
  "command": {
    "cartName": "default", "storeId": "B2B-store", "currencyCode": "USD",
    "productId": "<loyalty-product-id>", "quantity": 1,
    "itemCurrencyCode": "PTS"
  }
}
```

**Read per-currency totals** — the new `cartTotals` array returns one element per currency present:

```graphql
query Cart($storeId: String!, $cartName: String!, $currencyCode: String!) {
  cart(storeId: $storeId, cartName: $cartName, currencyCode: $currencyCode) {
    currency { code }
    # primary-currency-only scalar totals
    total { amount }
    subTotal { amount }
    discountTotal { amount }
    # one bucket per currency present in the cart
    cartTotals {
      isDefaultTotalCurrency
      subTotal { amount currency { code } }
      discountTotal { amount currency { code } }
      taxTotal { amount currency { code } }
      total { amount currency { code } }
    }
    items { id sku quantity extendedPrice { amount currency { code } } }
  }
}
```

Example response for a cart holding a `USD` line and a `PTS` loyalty line (the `USD` bucket carries `isDefaultTotalCurrency: true`; the points bucket is separate and never absorbs the money discount):

```json
{
  "data": { "cart": {
    "currency": { "code": "USD" },
    "total": { "amount": 154.80 },
    "subTotal": { "amount": 160.00 },
    "discountTotal": { "amount": 16.00 },
    "cartTotals": [
      { "isDefaultTotalCurrency": true,
        "subTotal": { "amount": 160.00, "currency": { "code": "USD" } },
        "discountTotal": { "amount": 16.00, "currency": { "code": "USD" } },
        "taxTotal": { "amount": 10.80, "currency": { "code": "USD" } },
        "total": { "amount": 154.80, "currency": { "code": "USD" } } },
      { "isDefaultTotalCurrency": false,
        "subTotal": { "amount": 240.00, "currency": { "code": "PTS" } },
        "discountTotal": { "amount": 0.00, "currency": { "code": "PTS" } },
        "taxTotal": { "amount": 0.00, "currency": { "code": "PTS" } },
        "total": { "amount": 240.00, "currency": { "code": "PTS" } } }
    ],
    "items": [ /* one USD line, one PTS line */ ]
  } }
}
```

> **Server-side:** `cartTotals` resolves from `Cart.CartTotals`, each element wrapped in a `CartTotalAggregate` (`{ isDefaultTotalCurrency, Currency, CartTotal }`); the money amounts come from `CartTotal.*.ToMoney(Currency)`. The cart-level `total`/`subTotal`/`discountTotal` remain **primary-currency only** (sum over `CartCurrencySelectedLineItems`). Always read `cartTotals[]` when a cart may be mixed-currency — the scalar cart totals describe only the primary currency, and there is no `currencyCode` scalar on `CartTotalType` (read the currency from any `MoneyType.currency.code`, or branch on `isDefaultTotalCurrency`).

!!! warning "Validate field names against the live schema"
    `itemCurrencyCode`, `cartTotals`, and `CartTotalType` are introduced by PR #120 and ship in the alpha artifact only. Confirm presence via introspection on your deployment before integrating (`.claude/agents/knowledge/graphql-schema.md`).

## What was done for VCST-5101 (the QA-confirmed fix)

QA found one defect on top of the feature: in a mixed cart, a **cart-subtotal percentage coupon** over-discounted the primary (USD) bucket because the discount base summed **all** selected lines across currencies and booked the result in the cart currency — folding the points line's value into the money discount.

**Fix — `src/VirtoCommerce.XCart.Core/Extensions/RewardExtensions.cs` (+1/-1):** the `subTotalExcludeDiscount` sum that feeds `CartSubtotalReward` now iterates `aggregate.CartCurrencySelectedLineItems` (primary-currency selected lines) instead of every `SelectedForCheckout` line across currencies:

```diff
- var subTotalExcludeDiscount = shoppingCart.Items.Where(li => li.SelectedForCheckout)
-     .Sum(li => (li.ListPrice - li.DiscountAmount) * li.Quantity);
+ var subTotalExcludeDiscount = aggregate.CartCurrencySelectedLineItems
+     .Sum(li => (li.ListPrice - li.DiscountAmount) * li.Quantity);
```

where the property (added on `CartAggregate.cs`) is the single source of the primary-currency scope reused by checkout, tax, and promotions:

```csharp
public IEnumerable<LineItem> CartCurrencySelectedLineItems =>
    SelectedLineItems.Where(x => x.Currency.EqualsIgnoreCase(Cart.Currency) || x.Currency.IsNullOrEmpty());
```

**Result (verified on vcst-qa, both layers):** the coupon = 10% × primary-currency subtotal only, invariant to points-line presence, quantity, selection, and deletion; the points bucket carries no money-derived discount. Fixed-$ coupons, the automatic per-line promotion, and `mergeCart` were unaffected and confirmed unregressed. Permanent regression guards added as suite `050b4` (GQL-MC-007..011). See `reports/bugs/fixed/BUG-mixed-cart-coupon-pts-leaks-into-usd-discount.md` and `reports/regression/REG-2026-06-10-1645/regression-2026-06-10.md`.

## Migration & compatibility notes

- **`CartProducts` key change** (`{productId}:{currencyCode}`) and the `GetCartProductsAsync` signature are breaking for any code that called `GetCartProductsByIdsAsync` or assumed product-id-only keys — audit custom resolvers/handlers.
- **Scalar cart totals semantics narrowed** to the primary currency. Integrations that summed `cart.total` expecting an all-currency figure must switch to `cartTotals[]`.
- Requires the bumped **`VirtoCommerce.CartModule.Core`** alpha; deploy them together.
- Changing a cart's currency now migrates only old-base-currency lines and preserves non-base lines — verify downstream consumers of `ChangeCartCurrency`.

## Conclusion

PR #120 makes xCart currency-aware at the line level: products key by product+currency, `itemCurrencyCode` selects a line's currency, checkout/promotion/tax stay scoped to the primary currency via `CartCurrencySelectedLineItems`, and `cartTotals` exposes per-currency totals for display. The VCST-5101 coupon-leak fix is the one-line currency filter in `RewardExtensions.cs`, QA-verified across UI and GraphQL. Next: confirm the alpha dependencies before promoting off the prerelease artifact, and re-run introspection to lock the new schema fields.
