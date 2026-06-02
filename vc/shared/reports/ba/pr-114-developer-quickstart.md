# xAPI Cart Configuration-Item Selection — Developer Quick Start

> **Build:** VirtoCommerce.XCart 3.1013.0 (PR #114 — open against `dev`)
> **Artifact:** `VirtoCommerce.XCart_3.1013.0-pr-114-8518.zip` (vc3prerelease blob)
> **New surface:** 5 GraphQL mutations, 2 shared input types
> **Full mutation reference:** [pr-114-api-docs.md](./pr-114-api-docs.md)
> **System analysis and business invariants:** [pr-114-system-analysis.md](./pr-114-system-analysis.md)
> **PR:** https://github.com/VirtoCommerce/vc-module-x-cart/pull/114

---

## TL;DR

- **Five new xAPI mutations** let a storefront toggle whether individual configuration sections of a configurable cart line item are included in the checkout price.
- **Toggling a config item's inclusion reprices the parent line item immediately** — `listPrice` changes. This is different from the existing line-item–level selection family, which does not reprice.
- **All five mutations are scoped to one `lineItemId` per call.** "Select all" means all config items on that one line item, not the whole cart.
- **The server is authoritative.** Always read `selectedForCheckout` and `listPrice` back from the mutation response — do not assume the toggle succeeded based on the request alone.
- **Shippable today** against the pre-release build artifact above. The vc-frontend UI integration is a follow-up PR.

---

## Key terms

**Configurable product** — a catalog product that is built from named sections, each contributing a separate price placement (product variant, custom text, uploaded file, etc.). When added to the cart it becomes a configurable line item.

**Configuration section** — one named part of a configurable product (e.g. "RAM", "Engraving", "Logo File"). A section has a `sectionId` string, a `type` (`"Product"`, `"Variation"`, `"Text"`, or `"File"`), and optionally a specific option (for `"Variation"` sections).

**Configuration item** (`ConfigurationItem`) — the server-side record that binds one configured section to a specific cart line item. It holds the chosen product/variation/text/file and the `selectedForCheckout` flag that controls whether its price contribution is included in `lineItem.listPrice`.

**`selectedForCheckout`** — a boolean flag on each `ConfigurationItem`. When `true`, the placement's price is included in the parent `lineItem.listPrice`. When `false`, the placement is deselected and its price is excluded from the line's cost. Toggling this flag triggers server-side repricing.

---

## When to use which mutation

| Intent | Use |
|--------|-----|
| Toggle one section to an explicit `true` or `false` | `changeCartConfigurationItemSelected` |
| Include a known subset of sections (all set to selected) | `selectCartConfigurationItems` |
| Exclude a known subset of sections (all set to unselected) | `unSelectCartConfigurationItems` |
| Include ALL sections on a line item in one call | `selectAllCartConfigurationItems` |
| Exclude ALL sections on a line item in one call | `unSelectAllCartConfigurationItems` |

**Decision flow:**

```
Do you know the target boolean at call time?
  YES → use changeCartConfigurationItemSelected (single section only)
  NO  → use a directional mutation:
        Scope: one section at a time → changeCartConfigurationItemSelected
        Scope: a specific list of sections, all ON  → selectCartConfigurationItems
        Scope: a specific list of sections, all OFF → unSelectCartConfigurationItems
        Scope: every section on the line item, ON   → selectAllCartConfigurationItems
        Scope: every section on the line item, OFF  → unSelectAllCartConfigurationItems
```

There is intentionally no "batch with explicit per-section boolean" mutation. For mixed-state batch updates (some ON, some OFF in the same call), fire one `selectCartConfigurationItems` call for the ON subset and one `unSelectCartConfigurationItems` call for the OFF subset.

For full schema, field tables, and annotated request/response examples, see [pr-114-api-docs.md](./pr-114-api-docs.md).

---

## End-to-end example: cart page with section checkboxes

The scenario: a cart page renders an expanded configurable line item with per-section checkboxes. The user unchecks one section, then clicks "Select all."

### Stage 1 — Load the cart and read initial section states

```graphql
query GetCart($storeId: String!, $userId: String!, $cartName: String) {
  cart(storeId: $storeId, userId: $userId, cartName: $cartName) {
    id
    items {
      id
      name
      listPrice { amount currency { code } }
      extendedPrice { amount currency { code } }
      configurationItems {
        id
        sectionId
        type
        selectedForCheckout
      }
    }
    subTotal { amount currency { code } }
    total { amount currency { code } }
  }
}
```

Variables:
```json
{
  "storeId": "B2B-store",
  "userId": "{{userId}}",
  "cartName": "default"
}
```

Render each `configurationItems[]` entry as a checkbox. The initial `selectedForCheckout` value is authoritative — do not infer it from any local state.

---

### Stage 2 — User unchecks one section

The user unchecks the "RAM" Variation section. Fire `changeCartConfigurationItemSelected` with `selectedForCheckout: false`.

```graphql
mutation ChangeCartConfigurationItemSelected(
  $command: InputChangeCartConfigurationItemSelectedType!
) {
  changeCartConfigurationItemSelected(command: $command) {
    items {
      id
      listPrice { amount currency { code } }
      extendedPrice { amount currency { code } }
      configurationItems {
        id
        sectionId
        type
        selectedForCheckout
      }
    }
    subTotal { amount currency { code } }
    total { amount currency { code } }
  }
}
```

Variables:
```json
{
  "command": {
    "storeId": "B2B-store",
    "userId": "{{userId}}",
    "cartName": "default",
    "cartType": "ShoppingCart",
    "lineItemId": "{{lineItemId}}",
    "configurationSection": {
      "sectionId": "RAM",
      "type": "Variation",
      "option": { "productId": "{{ramVariationProductId}}" }
    },
    "selectedForCheckout": false
  }
}
```

---

### Stage 3 — Reconcile UI from the response (server-authoritative)

After the mutation returns, **replace your local cart state entirely with the server response** — never apply an optimistic delta. Key fields to read:

```typescript
// Minimal TypeScript fetch wrapper — adapt to your Apollo/urql/fetch setup
async function changeConfigItemSelected(params: {
  storeId: string;
  userId: string;
  cartName: string;
  cartType: string;
  lineItemId: string;
  sectionId: string;
  sectionType: "Product" | "Variation" | "Text" | "File";
  optionProductId?: string;
  selectedForCheckout: boolean;
}): Promise<CartItem[]> {
  const response = await graphqlClient.mutate({
    mutation: CHANGE_CART_CONFIGURATION_ITEM_SELECTED,
    variables: {
      command: {
        storeId: params.storeId,
        userId: params.userId,
        cartName: params.cartName,
        cartType: params.cartType,
        lineItemId: params.lineItemId,
        configurationSection: {
          sectionId: params.sectionId,
          type: params.sectionType,
          ...(params.optionProductId && {
            option: { productId: params.optionProductId },
          }),
        },
        selectedForCheckout: params.selectedForCheckout,
      },
    },
  });

  // The server is authoritative — always replace local state from response
  const items = response.data?.changeCartConfigurationItemSelected?.items ?? [];
  updateCartStore(items); // replace, don't patch
  return items;
}
```

**Important:** `listPrice` on the affected line item WILL change after a successful config-item toggle. Any component that cached `listPrice` before the mutation must re-render from the response. See [Repricing asymmetry](#1-repricing-asymmetry) under Pitfalls below.

---

### Stage 4 — User clicks "Select all"

```graphql
mutation SelectAllCartConfigurationItems(
  $command: InputChangeAllCartConfigurationItemsSelectedType!
) {
  selectAllCartConfigurationItems(command: $command) {
    items {
      id
      listPrice { amount currency { code } }
      extendedPrice { amount currency { code } }
      configurationItems {
        id
        sectionId
        type
        selectedForCheckout
      }
    }
    subTotal { amount currency { code } }
    total { amount currency { code } }
  }
}
```

Variables:
```json
{
  "command": {
    "storeId": "B2B-store",
    "userId": "{{userId}}",
    "cartName": "default",
    "cartType": "ShoppingCart",
    "lineItemId": "{{lineItemId}}"
  }
}
```

No `configurationSections` array needed — the server flips every config item on the specified `lineItemId`. Replace cart state from the response as in Stage 3.

---

## Reading the response

Always select these fields to correctly detect price changes and confirm toggles landed:

| Field | Why |
|-------|-----|
| `items[].listPrice.amount` | Config-item toggles change `listPrice` — always re-render from this value |
| `items[].extendedPrice.amount` | Quantity-adjusted price; also recalculated |
| `items[].configurationItems[].selectedForCheckout` | Confirm the toggle actually landed on the server |
| `subTotal.amount` | Recalculated after every reprice |
| `total.amount` | Includes taxes and shipping — these cascade from the reprice |

**GraphQL errors live inside the response, not as HTTP errors.** A 200 HTTP status does NOT mean the operation succeeded. Always check `response.errors[]` for `ConfiguredLineItemNotFound` and validation errors:

```typescript
if (response.errors && response.errors.length > 0) {
  // Handle: lineItemId not found, lineItem is not a configurable product,
  // or lineItemId was null/empty
  console.error("Mutation failed:", response.errors);
}
```

---

## Pitfalls and gotchas

### 1. Repricing asymmetry

The existing lineItem-level selection mutations (`changeCartItemSelected`, `selectCartItems`, etc.) toggle `lineItem.selectedForCheckout`. This does NOT change `lineItem.listPrice` — it only includes or excludes the line from the checkout rollup total.

The new config-item–level mutations toggle `configItem.selectedForCheckout`. This DOES change `lineItem.listPrice` — the server re-sums only the placements whose `selectedForCheckout = true` into the line's list price.

**Impact on your frontend:** Any price-display component that reads `listPrice` and does not re-render after a config-item toggle will show a stale number. After calling any of the five new mutations, always refresh `listPrice` from the mutation response before rendering.

Summary:

| Mutation family | Toggles | Changes `lineItem.listPrice`? | Changes cart `total`? |
|-----------------|---------|-------------------------------|----------------------|
| `changeCartItemSelected` (existing) | `lineItem.selectedForCheckout` | No | Yes (via checkout rollup) |
| `changeCartConfigurationItemSelected` (new) | `configItem.selectedForCheckout` | **Yes** — reprices the line | Yes (via reprice cascade) |

---

### 2. No-change short-circuit

If the requested `selectedForCheckout` value is already equal to the current value on the server, the server skips the reprice path entirely. This is safe — you can resend the full selection state on every UI interaction without triggering redundant repricing. The response will still be a valid cart snapshot.

---

### 3. Unmatched section keys silently no-op

If a `configurationSection` key you send does not match any `ConfigurationItem` on the target `lineItemId`, the server silently skips it. The mutation returns HTTP 200 with `errors[]` empty, and no trace of the unmatched key appears in the response.

**This means:** if `selectedForCheckout` does not change for the section you intended to toggle, the call simply had no effect — it was not an error. Always verify by reading `configurationItems[].selectedForCheckout` back from the response and cross-checking against your intent.

**When this surfaces:**
- The admin modifies a product's configuration sections while a user has the cart open in another tab. The UI holds the old `sectionId` value.
- A `sectionId` normalization discrepancy (casing, whitespace) between the client and server causes a permanent lookup mismatch.

---

### 4. The `option.productId` discriminator for Variation sections

For `"Text"` and `"File"` section types, `(sectionId, type)` alone uniquely identifies the config item. Omit `option`.

For `"Variation"` sections, `option.productId` is **required**. A configurable product can have multiple variation options from the same section (different RAM speeds, different colors, etc.) coexisting on a single line item. Without `option.productId`, the server cannot determine which variation to toggle — the key is treated as unmatched and the call no-ops silently (see pitfall 3 above).

For `"Product"` sections, `option` is also omitted — one product option per section is the model, so `(sectionId, type)` is sufficient.

Quick reference:

| Section type | Needs `option.productId`? |
|---|---|
| `"Product"` | No |
| `"Variation"` | **Yes** |
| `"Text"` | No |
| `"File"` | No |

---

### 5. Distributed lock — do not parallelize mutations for one cart

Each of the five mutations acquires a cart-scoped distributed lock (`IDistributedLockService`). Concurrent mutation calls for the same cart serialize on the server. Firing multiple parallel toggles for one user's cart is safe (no corruption) but inefficient — the calls queue up behind the lock. Use the batch mutations (`selectCartConfigurationItems`, `unSelectCartConfigurationItems`) or the all-item mutations when you need to toggle multiple sections in response to one user interaction, instead of firing individual mutations in parallel.

---

### 6. Legacy `PurchaseSchema.cs` is untouched

The five new mutations are registered via the modern `ISchemaBuilder` auto-discovery path (`AddSchemaBuilders` scanning). The legacy `PurchaseSchema.cs` `FieldBuilder` flow (which registers `changeCartItemSelected`, `selectCartItems`, etc.) was intentionally not modified. The two registration paths coexist. There is no behavioral difference for API consumers, but if you are extending or patching schema registration code, be aware of the two separate registration mechanisms.

---

## Migrating from `updateConfigurationItem` for selection-only changes

If your current integration uses `updateConfigurationItem` solely to flip `selectedForCheckout` (without changing `productId`, `quantity`, or configuration text/files), migrate to the appropriate selection mutation.

| Old pattern | New pattern | Benefit |
|---|---|---|
| `updateConfigurationItem` with same `productId`, same `quantity`, only `selectedForCheckout` changed | `changeCartConfigurationItemSelected` | No catalog product fetch, no full validation pipeline, no `productId`/`quantity` NonNull requirement |
| N calls to `updateConfigurationItem` to flip N sections (e.g., "Select all" loop) | `selectAllCartConfigurationItems` or `selectCartConfigurationItems` | N-to-1 round trips, single distributed lock, single reprice execution |
| Client-side query + enumerate + N serial `updateConfigurationItem` calls for "Unselect all" | `unSelectAllCartConfigurationItems` | Eliminates client enumeration; server operates on authoritative list; no stale-list race condition |

`updateConfigurationItem` continues to be the correct mutation when you need to change the configured option itself (different variant, different custom text, different file) — the selection mutations only toggle the inclusion flag and do not touch any other fields.

---

## Reference

- Full mutation reference (input types, field tables, curl-ready examples, error codes): [pr-114-api-docs.md](./pr-114-api-docs.md)
- System analysis, flow diagrams, pain-point analysis, business invariant proposals, suite mapping: [pr-114-system-analysis.md](./pr-114-system-analysis.md)
- PR diff and unit test context: https://github.com/VirtoCommerce/vc-module-x-cart/pull/114
- GraphQL endpoint: `POST {{BACK_URL}}/graphql`
- Authentication: OAuth2 bearer token — see `.claude/agents/knowledge/api-auth.md` for the token endpoint and header format
- xAPI schema snapshot: `.claude/agents/knowledge/graphql-schema.md` (live introspection — consult for authoritative field names before writing queries)
- Runner-native GraphQL test cases for QA coverage: `regression/suites/Backend/graphql/050i-graphql-configurations.csv` — authoring contract at `.claude/agents/knowledge/graphql-test-cases-runner.md`
