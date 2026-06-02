# PR #114 — Cart Configuration-Item Selection Mutations — Context Briefing

> Source: https://github.com/VirtoCommerce/vc-module-x-cart/pull/114
> Status: open (against `dev`), Author: alexeyshibanov, Created 2026-05-03
> Build artifact: `VirtoCommerce.XCart_3.1013.0-pr-114-8518.zip` (vc3prerelease blob)

## What this PR adds

Five GraphQL mutations on the `Mutation` root that toggle `ConfigurationItem.SelectedForCheckout` on configured (a.k.a. configurable-product) line items. Mirrors the existing **lineItem** selection family (`changeCartItemSelected` / `selectCartItems` / `unSelectCartItems` / `selectAllCartItems` / `unSelectAllCartItems`) for the **nested configuration-item** layer.

### Mutation registrations (Command Builders → field names)

| Field name | Builder file | Selection state |
|---|---|---|
| `changeCartConfigurationItemSelected` | `ChangeCartConfigurationItemSelectedCommandBuilder` | from input `selectedForCheckout` |
| `selectCartConfigurationItems` | `SelectCartConfigurationItemsCommandBuilder` | hardcoded `true` (overridden in `GetRequest`) |
| `unSelectCartConfigurationItems` | `UnSelectCartConfigurationItemsCommandBuilder` | default `false` |
| `selectAllCartConfigurationItems` | `SelectAllCartConfigurationItemsCommandBuilder` | hardcoded `true` (overridden in `GetRequest`) |
| `unSelectAllCartConfigurationItems` | `UnSelectAllCartConfigurationItemsCommandBuilder` | default `false` |

All five register via the modern `CommandBuilder` auto-discovery path (`AddSchemaBuilders` scans `ISchemaBuilder` implementations). `PurchaseSchema.cs` was NOT touched — that file remains the legacy `FieldBuilder` flow, and migrating its existing `changeCartItemSelected` family is intentionally out of scope.

All five inherit `CartCommandBuilder` and therefore reuse the same:
- Authorization (cart-policy authorization service)
- Distributed locking (`IDistributedLockService` — prevents racing concurrent cart mutations)
- Cart aggregate repository hydration

### GraphQL Input Types (new)

#### `InputChangeCartConfigurationItemSelectedType` (for `changeCartConfigurationItemSelected`)
Inherits `InputCartBaseType` → adds:
- `lineItemId: String!` — Line item Id (parent configurable lineItem)
- `configurationSection: ConfigurationSectionKeyInput!` — identifies WHICH config item to toggle
- `selectedForCheckout: Boolean!` — explicit target state

#### `InputChangeCartConfigurationItemsSelectedType` (for `selectCartConfigurationItems` + `unSelectCartConfigurationItems`)
Inherits `InputCartBaseType` → adds:
- `lineItemId: String!`
- `configurationSections: [ConfigurationSectionKeyInput!]!` — batch keys
- (NO `selectedForCheckout` field — set by command builder, hardcoded true/false)

#### `InputChangeAllCartConfigurationItemsSelectedType` (for `selectAllCartConfigurationItems` + `unSelectAllCartConfigurationItems`)
Inherits `InputCartBaseType` → adds:
- `lineItemId: String!`
- (NO selection list, NO `selectedForCheckout` — operates on every configuration item under the lineItem)

### Inherited fields from `InputCartBaseType` (all 5 mutations)

| Field | Required | Description |
|---|---|---|
| `storeId: String!` | Yes | Store the cart belongs to |
| `userId: String!` | Yes | Cart owner user id |
| `cartId: String` | No | Specific cart id (optional — falls back to default cart by name+type) |
| `cartName: String` | No | Cart name (e.g. "default", "Wishlist") |
| `cartType: String` | No | Cart type (e.g. "ShoppingCart", "Wishlist") |
| `currencyCode: String` | No | Currency code (e.g. "USD") |
| `cultureName: String` | No | Culture (e.g. "en-US") |

### `ConfigurationSectionKeyInput` (shared key type — new)

Lightweight identifier sufficient to find an existing `ConfigurationItem` on a line item:

| Field | Type | Required | Notes |
|---|---|---|---|
| `sectionId` | `String!` | Yes | Configuration section ID (e.g. "Beverages") |
| `type` | `String!` | Yes | Section type — one of `"Product"`, `"Variation"`, `"Text"`, `"File"` |
| `option` | `ConfigurableProductOptionKeyInput` | No | Required for `Variation` type; omitted for `Product` / `Text` / `File` |

### `ConfigurableProductOptionKeyInput` (new)

| Field | Type | Required |
|---|---|---|
| `productId` | `String!` | Yes |

(Quantity and SelectedForCheckout intentionally omitted — selection mutations never modify them.)

## Key business behavior

### Repricing semantics — **critical asymmetry vs. lineItem-level selection**

The new methods explicitly call `UpdateConfiguredLineItemPrice` after a flag flip, because `configItem.SelectedForCheckout` is filtered inside `ConfiguredLineItemContainer.UpdatePrice` when summing into `lineItem.ListPrice`.

**Net effect:** toggling `SelectedForCheckout` on a configuration item **changes the parent lineItem's `listPrice`** (and downstream cart subtotal, totals, taxes, shipping rates). LineItem-level selection has no such effect — it only affects which lines roll into the checkout total, not the line's own listPrice.

A no-change short-circuit prevents the heavy reprice path from running when no flag actually flips — relevant for batch UIs that resend the entire selection state on every interaction.

### Identification — `(sectionId, type)` uniqueness; `option.productId` for Variation

Lookup uses the same `FindConfigurationItem` path as `Add/Update/RemoveConfigurationItem`. For `Text` and `File` sections, the `(sectionId, type)` pair alone is unique within a line item. For `Product`, `productId` resolves the option. For `Variation`, `option.productId` is mandatory because multiple variations of the same configurable section can coexist.

### Scoping — single `lineItemId` per call

All five mutations are scoped to one `LineItemId`. Reasons:
1. Scopes "select all" — all config items belonging to that one configurable lineItem only.
2. Gives the handler an exact reprice target — the parent configurable lineItem.

### Validation errors

- `lineItemId` not found / not a configurable lineItem → `CartErrorDescriber.ConfiguredLineItemNotFound`
- Section key (sectionId+type+option) does not match any config item on the lineItem → silent no-op (other matched items still flip; **unmatched section in batch list does NOT abort the whole batch**)
- Missing `lineItemId` → validation error

### Test coverage on the PR

- 13 new unit tests in `CartAggregateTests` — flag flip on matching items, Text-section discrimination via `(Type, SectionId)`, unmatched section no-op, lineItemId scoping, missing lineItemId, no-change short-circuit, empty section list, all-variant flip + idempotency
- 6 new unit tests in `ConfiguredLineItemContainerTests` — `Source` back-reference contract for Product / Text / File overloads
- 186/186 unit tests pass

## Side-effect changes in this PR

### `SectionLineItem.Source` back-reference

`SectionLineItem` now exposes `Source: ConfigurationItem` — back-reference to the originating `ConfigurationItem`. Read-path `Add*` overloads accept and propagate the source; creation-path overloads leave `Source = null` (no source exists at creation time).

New overloads:
- `AddProductSectionLineItem(CartProduct, ConfigurationItem)` — existing; now stores `Source`
- `AddTextSectionLineItem(ConfigurationItem)` — new; replaces denormalized `(CustomText, SectionId)` shape
- `AddFileSectionLineItem(ConfigurationItem, IList<ConfigurationItemFile> files = null)` — new; optional `files` override (used by `ChangeCartCurrencyCommandHandler` to copy files into a new currency context)

New factory:
- `protected virtual SectionLineItem CreateSectionLineItem(ConfigurationItem)`
- base `CreateSectionLineItem(string sectionId, string type)` — collapses 4× duplicated `AbstractTypeFactory<SectionLineItem>.TryCreateInstance() + property-set` pattern.

**Backward compatibility:** existing loose-params overloads preserved (used by `CreateConfiguredLineItemHandler` creation flow). No breaking change to public API surface.

### Drive-by cleanup

`AddConfigurationItemsAsync(string, ...)` and `UpdateConfigurationItemsAsync(string, ...)` lost their unnecessary `async/await` — single-line `Task<>` passthroughs (no state machine generated).

## Reviewer integration test (from PR body)

```graphql
mutation {
  changeCartConfigurationItemSelected(command: {
    storeId: "B2B-store",
    userId: "...",
    cartName: "default",
    cartType: "ShoppingCart",
    lineItemId: "...",
    configurationSection: {
      sectionId: "...",
      type: "Variation",
      option: { productId: "..." }
    },
    selectedForCheckout: false
  }) {
    items {
      id
      listPrice { amount }
      configurationItems { id selectedForCheckout }
    }
    total { amount }
  }
}
```

**Expected:** target flag flips; parent lineItem `listPrice` decreases by the placement's contribution; downstream recalc (totals, taxes) follows via `SaveAsync → RecalculateAsync`.

## Files changed (21 total)

**Core (Schemas + Commands):**
- `src/VirtoCommerce.XCart.Core/CartAggregate.cs` (+106/-8) — 5 new virtual selection methods
- `src/VirtoCommerce.XCart.Core/ConfiguredLineItemContainer.cs` (+89/-15) — `Source` back-reference, factory, new overloads
- `src/VirtoCommerce.XCart.Core/Commands/ChangeCartConfigurationItemSelectedCommand.cs` (new)
- `src/VirtoCommerce.XCart.Core/Commands/ChangeCartConfigurationItemsSelectedCommand.cs` (new)
- `src/VirtoCommerce.XCart.Core/Commands/ChangeAllCartConfigurationItemsSelectedCommand.cs` (new)
- `src/VirtoCommerce.XCart.Core/Schemas/InputChangeCartConfigurationItemSelectedType.cs` (new)
- `src/VirtoCommerce.XCart.Core/Schemas/InputChangeCartConfigurationItemsSelectedType.cs` (new)
- `src/VirtoCommerce.XCart.Core/Schemas/InputChangeAllCartConfigurationItemsSelectedType.cs` (new)
- `src/VirtoCommerce.XCart.Core/Schemas/ConfigurationSectionKeyInput.cs` (new)
- `src/VirtoCommerce.XCart.Core/Schemas/ConfigurableProductOptionKeyInput.cs` (new)

**Data (Builders + Handlers):**
- `src/VirtoCommerce.XCart.Data/Commands/ChangeCartConfigurationItemSelectedCommandBuilder.cs` (new)
- `src/VirtoCommerce.XCart.Data/Commands/SelectCartConfigurationItemsCommandBuilder.cs` (new)
- `src/VirtoCommerce.XCart.Data/Commands/UnSelectCartConfigurationItemsCommandBuilder.cs` (new)
- `src/VirtoCommerce.XCart.Data/Commands/SelectAllCartConfigurationItemsCommandBuilder.cs` (new)
- `src/VirtoCommerce.XCart.Data/Commands/UnSelectAllCartConfigurationItemsCommandBuilder.cs` (new)
- `src/VirtoCommerce.XCart.Data/Commands/ChangeCartConfigurationItemSelectedCommandHandler.cs` (new)
- `src/VirtoCommerce.XCart.Data/Commands/ChangeCartConfigurationItemsSelectedCommandHandler.cs` (new)
- `src/VirtoCommerce.XCart.Data/Commands/ChangeAllCartConfigurationItemsSelectedCommandHandler.cs` (new)
- `src/VirtoCommerce.XCart.Data/Commands/ChangeCartCurrencyCommandHandler.cs` (+3/-3) — adopt new `Add*SectionLineItem(ConfigurationItem)` overloads

**Tests:**
- `tests/VirtoCommerce.XCart.Tests/Aggregates/CartAggregateTests.cs` (+300) — 13 new tests
- `tests/VirtoCommerce.XCart.Tests/Aggregates/ConfiguredLineItemContainerTests.cs` (new, +153) — 6 new tests
