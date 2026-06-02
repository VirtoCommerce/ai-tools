# PR #114 — Cart Configuration-Item Selection — API Reference

> **PR**: https://github.com/VirtoCommerce/vc-module-x-cart/pull/114
> **Build**: `VirtoCommerce.XCart_3.1013.0-pr-114-8518.zip` (deployed to QA 2026-05-07)
> **Endpoint**: `POST {BACK_URL}/graphql`

## What this PR adds

Five GraphQL mutations to toggle `selectedForCheckout` on a configuration item nested inside a configurable lineItem. Before PR #114, the only way to flip that flag was `updateConfigurationItem`, which reloads the catalog product and re-runs full validation just to change a boolean. The new mutations take a lightweight key (`sectionId`, `type`, optional `option.productId`) plus the target state — nothing else.

**The asymmetry that matters:** these mutations change `lineItem.listPrice`. The lineItem-level family (`changeCartItemSelected`, `selectCartItems`, …) does not — it only controls whether a line counts toward the checkout total.

## Quick reference

| Mutation | Scope | Target state |
|---|---|---|
| `changeCartConfigurationItemSelected` | one config item | caller passes `selectedForCheckout: Boolean!` |
| `selectCartConfigurationItems` | a list | hardcoded `true` |
| `unSelectCartConfigurationItems` | a list | hardcoded `false` |
| `selectAllCartConfigurationItems` | every config item under one lineItem | hardcoded `true` |
| `unSelectAllCartConfigurationItems` | every config item under one lineItem | hardcoded `false` |

All five are scoped to **one** `lineItemId` per call. There is no cart-wide variant.

## Common setup

```http
POST {BACK_URL}/graphql
Authorization: Bearer <storefront-token>
Content-Type: application/json
```

Auth is the standard cart authorization (`CartAuthorizationRequirement`) — cart owner or admin. Token endpoint: see [api-auth.md](.claude/agents/knowledge/api-auth.md).

All five inputs inherit `InputCartBaseType`:

| Field | Required | Notes |
|---|---|---|
| `storeId` | Yes | |
| `userId` | Yes | Cart owner |
| `cartId` | No | Falls back to default cart by `cartName` + `cartType` |
| `cartName` | No | Usually `"default"` |
| `cartType` | No | Usually `"ShoppingCart"` |
| `currencyCode`, `cultureName` | No | |

## Shared input types

`ConfigurationSectionKeyInput` is a lightweight identifier — no quantity, customText, or fileUrls (those belong to `addConfigurationItem` / `updateConfigurationItem`).

```graphql
input ConfigurationSectionKeyInput {
  sectionId: String!
  type: String!                                 # "Product" | "Variation" | "Text" | "File"
  option: ConfigurableProductOptionKeyInput     # required only when type = "Variation"
}

input ConfigurableProductOptionKeyInput {
  productId: String!
}
```

When is `option` needed?

| `type` | Pass `option`? | Why |
|---|---|---|
| `"Text"` / `"File"` | No | `(sectionId, type)` is already unique within the lineItem |
| `"Product"` | No | productId resolves through the section itself |
| `"Variation"` | **Yes** | Multiple variations of one section can coexist; `option.productId` discriminates |

## Recommended response selection

GraphQL returns only what you select. Minimum useful selection (matches what regression tests use):

```graphql
{
  id
  itemsCount
  items {
    id
    productId
    quantity
    listPrice { amount currency { code } }
    extendedPrice { amount currency { code } }
    configurationItems {
      id
      sectionId
      type
      productId
      customText
      selectedForCheckout
    }
  }
  subTotal { amount currency { code } }
  total { amount currency { code } }
}
```

For tax-inclusive UI, also select `subTotalWithTax`, `listPriceWithTax`, `extendedPriceWithTax`.

---

## Scenarios

The five mutations make sense as part of flows. Each scenario below shows the actual mutation chain and what changes server-side.

### 1. Build a configurable product and check out (happy path)

`PDP "Customize" → Add to cart → /cart → Place Order`

| # | Mutation | Why |
|---|---|---|
| 1 | `createConfiguredLineItem` | New configurable lineItem on cart with default selections |
| 2 | `addConfigurationItem` (× N) | Add picked sections (full `ConfigurationSectionInput`) |
| 3 | `selectAllCartConfigurationItems` | **Idempotent safeguard** — guarantees every chosen section counts toward `listPrice`. No-op if already correct. |
| 4 | `cart` query | Read final totals for confirmation UI |
| 5 | `addOrUpdateCartShipment` → `addOrUpdateCartPayment` → `createOrderFromCart` | Standard checkout |

Step 3 is the cheap insurance: it costs nothing when the cart is already right and silently fixes it when it isn't — half-selected configurations don't leak into orders.

### 2. Toggle one section in the cart

User unchecks "Premium engraving" on `/cart`.

```graphql
mutation {
  changeCartConfigurationItemSelected(command: {
    storeId: "B2B-store"
    userId: "{{USER_ID}}"
    lineItemId: "{{CONFIGURABLE_LINE_ITEM_ID}}"
    configurationSection: { sectionId: "Engraving", type: "Text" }
    selectedForCheckout: false
  }) {
    id
    items {
      id
      listPrice { amount currency { code } }
      configurationItems { id sectionId type selectedForCheckout }
    }
    subTotal { amount currency { code } }
    total { amount currency { code } }
  }
}
```

Server flips the flag → runs `UpdateConfiguredLineItemPrice` → re-sums placements where `selectedForCheckout=true` → cascades through `subTotal` / `total` / taxes / shipping. The recalculated cart is in the response — no follow-up `cart` query needed.

Double-click? The second call sees the flag is already `false`, **skips repricing** (no-change short-circuit), returns the cart unchanged.

### 3. "Select all" / "Unselect all" header toggle

```graphql
# Master checkbox ON
mutation {
  selectAllCartConfigurationItems(command: {
    storeId: "B2B-store"
    userId: "{{USER_ID}}"
    lineItemId: "{{CONFIGURABLE_LINE_ITEM_ID}}"
  }) { id subTotal { amount currency { code } } }
}

# Master checkbox OFF
mutation {
  unSelectAllCartConfigurationItems(command: {
    storeId: "B2B-store"
    userId: "{{USER_ID}}"
    lineItemId: "{{CONFIGURABLE_LINE_ITEM_ID}}"
  }) { id subTotal { amount currency { code } } }
}
```

After `unSelectAll`, `lineItem.listPrice = 0`. The lineItem is **not removed** — re-toggling restores the prices.

**Anti-pattern:** do not loop `changeCartConfigurationItemSelected` from the client. Each call is cart-locked (distributed lock); N parallel calls serialize to N round-trips. The all-variants execute atomically in one server pass.

### 4. Restore a saved configuration (apply preset, restore from quote)

```graphql
# Step 1 — reset to a known baseline
mutation {
  unSelectAllCartConfigurationItems(command: {
    storeId: "B2B-store"
    userId: "{{USER_ID}}"
    lineItemId: "{{CONFIGURABLE_LINE_ITEM_ID}}"
  }) { id }
}

# Step 2 — apply only the saved set
mutation {
  selectCartConfigurationItems(command: {
    storeId: "B2B-store"
    userId: "{{USER_ID}}"
    lineItemId: "{{CONFIGURABLE_LINE_ITEM_ID}}"
    configurationSections: [
      { sectionId: "RAM",       type: "Variation", option: { productId: "var-32gb-ddr5" } }
      { sectionId: "Storage",   type: "Product" }
      { sectionId: "Engraving", type: "Text" }
    ]
  }) { id subTotal { amount currency { code } } }
}
```

**Why the reset?** If the saved preset is a *subset* of the current state, calling `selectCartConfigurationItems` alone would leave any currently-true-but-not-in-preset items still selected. The `unSelectAll → select(saved)` pattern guarantees the cart matches the snapshot exactly.

### 5. Edge case — lineItem removed in another tab

```json
{
  "data": null,
  "errors": [{
    "message": "Configured line item not found",
    "extensions": { "code": "ConfiguredLineItemNotFound" }
  }]
}
```

Catch by code → re-fetch the cart → tell the user the item was removed. Selection mutations do not auto-recover.

---

## Mutation reference

Every mutation accepts the `InputCartBaseType` fields above plus the per-mutation fields below. Returns the recalculated `CartType`.

### `changeCartConfigurationItemSelected`

Set `selectedForCheckout` on **one** config item to a caller-supplied boolean.

| Field | Type |
|---|---|
| `lineItemId` | `String!` |
| `configurationSection` | `ConfigurationSectionKeyInput!` |
| `selectedForCheckout` | `Boolean!` |

Example: Scenario 2.

### `selectCartConfigurationItems` / `unSelectCartConfigurationItems`

Batch — set `true` (resp. `false`) on each item in a list. Both share `InputChangeCartConfigurationItemsSelectedType`.

| Field | Type |
|---|---|
| `lineItemId` | `String!` |
| `configurationSections` | `[ConfigurationSectionKeyInput!]!` |

The mutation name encodes the direction, which is why `selectedForCheckout` is not a field — having `unSelectCartConfigurationItems(selectedForCheckout: true)` would be self-contradictory. Unmatched keys silently no-op for those entries; matched keys still flip. Example: Scenario 4.

### `selectAllCartConfigurationItems` / `unSelectAllCartConfigurationItems`

Set `true` (resp. `false`) on **every** config item under one lineItem. Both share `InputChangeAllCartConfigurationItemsSelectedType`.

| Field | Type |
|---|---|
| `lineItemId` | `String!` |

No `configurationSections` array — the "all" scope is implicit. Example: Scenario 3.

---

## Errors and side effects (all five)

| Error code | When |
|---|---|
| `ConfiguredLineItemNotFound` | `lineItemId` doesn't exist on the cart, or the line is not a configurable product |
| Validation error | `lineItemId` is null/empty; or `configurationSections` is null/empty for the batch variants |
| (silent no-op) | Unmatched `(sectionId, type, option)` — call succeeds, cart returned unchanged for those entries |

Side effects:
- **Repricing**: when at least one flag actually flips, server calls `UpdateConfiguredLineItemPrice` once → re-sums placements with `selectedForCheckout=true` → cascades to `subTotal`, `total`, taxes, shipping rates.
- **No-change short-circuit**: if nothing flips, repricing is skipped.
- **Distributed lock**: cart-scoped (`IDistributedLockService`) — do not parallelize against the same cart.
- **Persistence**: every successful call ends with `SaveAsync → RecalculateAsync`.

---

## When to use what — vs. neighboring mutations

**vs. `updateConfigurationItem`** — `updateConfigurationItem` requires `productId` + `quantity`, reloads the catalog product, and runs full configuration validation. Migrate to the selection mutations whenever the only change is `selectedForCheckout`. Keep `updateConfigurationItem` for real reconfigurations (changing `productId`, `quantity`, `customText`, `fileUrls`).

**vs. `changeCartItemSelected` / `selectCartItems` family** — operates on `lineItem.SelectedForCheckout`, which controls whether the *whole line* rolls into the checkout total. Does NOT touch `lineItem.listPrice`. The PR #114 family operates one level deeper — on `configItem.SelectedForCheckout` — which DOES change `lineItem.listPrice`.

| | lineItem-level | config-item-level (PR #114) |
|---|---|---|
| Toggle target | `lineItem.SelectedForCheckout` | `configItem.SelectedForCheckout` |
| Affects `lineItem.listPrice`? | No | **Yes** — re-sums placements |
| Repricing call | None | `UpdateConfiguredLineItemPrice` |

---

## Endpoint inventory delta

All five fields live at `POST {BACK_URL}/graphql`. Confirmed in live introspection (`scripts/.graphql-schema.cache.json`, 2026-05-07).

| Field | Input type |
|---|---|
| `changeCartConfigurationItemSelected` | `InputChangeCartConfigurationItemSelectedType` |
| `selectCartConfigurationItems` | `InputChangeCartConfigurationItemsSelectedType` |
| `unSelectCartConfigurationItems` | `InputChangeCartConfigurationItemsSelectedType` |
| `selectAllCartConfigurationItems` | `InputChangeAllCartConfigurationItemsSelectedType` |
| `unSelectAllCartConfigurationItems` | `InputChangeAllCartConfigurationItemsSelectedType` |
