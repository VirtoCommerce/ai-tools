# BUG: `removeConfigurationItem` and `removeConfigurationItems` silently no-op on configurable line items

## Status: OPEN

**Severity:** **High** (silent data integrity regression — mutation reports success but does not modify cart state)
**Component:** vc-module-x-cart / GraphQL xAPI / `CartAggregate.RemoveConfigurationItem*`
**Environment:** vcst-qa (https://vcst-qa-storefront.govirto.com)
**Platform / Build:** xCart **3.1013.0-pr-114-8518** (PR #114 pre-release artifact)
**Date observed:** 2026-05-07
**Reported by:** QA Agent (regression run `050i-batch-20260507-113906`, case CFG-GQL-011)
**Reproducibility:** Confirmed 2/2 — re-ran isolated case after batch, identical failure.
**Originating PR:** https://github.com/VirtoCommerce/vc-module-x-cart/pull/114 (configuration-item selection mutations — backend-only)

---

## Summary

`removeConfigurationItem` and `removeConfigurationItems` mutations on a configurable line item return HTTP 200 with `errors[]` empty, **but do not actually remove the targeted configuration items**. The mutation response itself shows the cart unchanged (both config items still present in `items[0].configurationItems`). A subsequent `configurationItems` query confirms the items remain in cart state. This is a silent failure — the API contract reports success, but the underlying state mutation never happens.

These mutations are NOT modified in PR #114, but the regression was observed against the PR #114 build. The PR's `ConfiguredLineItemContainer` refactor (new `Source` back-reference, new `SectionLineItem` factory, migration of read-path overloads) is a strong suspect — the read-path identification used by remove flows may have been disrupted by the section-line-item construction change.

---

## Steps to Reproduce

Run via canonical GraphQL runner against deployed PR #114 build:

```bash
npx tsx scripts/graphql-runner.ts --case "regression/suites/Backend/graphql/050i-graphql-configurations.csv:CFG-GQL-011"
```

Or manually via GraphiQL:

1. **Auth as ORG_USER** (e.g., `acme-store-maintainer-1`) → capture `userId` from `me { id }`.
2. **Clear cart**: `mutation { clearCart(command: { storeId: "B2B-store", userId: USER_ID }) { id } }`
3. **Add configurable item with both required sections** (`@td(CFG_LAPTOP.id)` from `test-data/aliases.json`):

```graphql
mutation AddItem($cs: [ConfigurationSectionInput]) {
  addItem(command: {
    storeId: "B2B-store"
    userId: USER_ID
    productId: CFG_LAPTOP_ID
    quantity: 1
    configurationSections: $cs
  }) { items { id configurationItems { id sectionId } } }
}
```
Variables:
```json
{ "cs": [
  { "sectionId": SECTION_RAM_ID, "type": "Product", "option": { "productId": OPT_RAM_BASE_ID, "quantity": 1 } },
  { "sectionId": SECTION_STORAGE_ID, "type": "Product", "option": { "productId": OPT_STORAGE_BASE_ID, "quantity": 1 } }
]}
```
✅ Response: `items[0].configurationItems.length = 2` (RAM + Storage). Capture `LINE_ITEM_ID`.

4. **Remove RAM section**:

```graphql
mutation RemoveOne($cs: ConfigurationSectionInput!) {
  removeConfigurationItem(command: {
    storeId: "B2B-store" userId: USER_ID lineItemId: LINE_ITEM_ID
    configurationSection: $cs
  }) { items { id configurationItems { id sectionId } } }
}
```
Variables:
```json
{ "cs": { "sectionId": SECTION_RAM_ID, "type": "Product" } }
```

5. **Read back via `configurationItems` query**:

```graphql
query { configurationItems(storeId: "B2B-store" currencyCode: "USD"
  lineItemId: LINE_ITEM_ID userId: USER_ID) {
  configurationItems { id sectionId }
}}
```

---

## Expected Result

After step 4 (`removeConfigurationItem(RAM)`):
- `removeConfigurationItem.items[0].configurationItems.length = 1` (only Storage remains)
- Step 5 read-back: `configurationItems.configurationItems.length = 1`

After a follow-up `removeConfigurationItems` with both sections (idempotent for the already-removed RAM):
- `removeConfigurationItems.items[0].configurationItems.length = 0`
- Read-back: `configurationItems.configurationItems.length = 0`

---

## Actual Result

| Step | `errors[]` | HTTP | Mutation response `configurationItems.length` | Read-back `configurationItems.length` |
|---|---|---|---|---|
| `add_item` | empty | 200 | **2** ✅ (RAM + Storage) | — |
| `remove_one(RAM)` | empty | 200 | **2** ❌ (RAM still present in response) | **2** ❌ |
| `remove_all([RAM, Storage])` | empty | 200 | **2** ❌ (neither removed) | **2** ❌ |
| `cleanup_post (clearCart)` | empty | 200 | — | — |

Both removal mutations return success-shaped responses but the cart's `items[0].configurationItems` array is unchanged across all three calls. **Both sections persist with their original IDs throughout.**

Failed assertions (suite 050i / CFG-GQL-011):
```
❌ [COUNT label=read_after_remove_one]
   expected: data.configurationItems.configurationItems.length = 1
   actual:   data.configurationItems.configurationItems.length = 2

❌ [COUNT label=read_after_remove_all]
   expected: data.configurationItems.configurationItems.length = 0
   actual:   data.configurationItems.configurationItems.length = 2
```

---

## Evidence

- Runner output: `reports/regression/050i-batch-20260507-113906/details.txt` (search "CFG-GQL-011")
- Per-step response capture: `reports/regression/graphql-evidence/CFG-GQL-011-1778146784124.json`
- Cart ID observed: `e60ab4c3-ce13-417b-a69c-a21b2d799565`
- Section IDs (CFG_LAPTOP):
  - RAM: `37e4d83b-3bb9-4ff8-bf69-6b5a1ba83630`
  - Storage: `29e873db-d5b2-4390-8016-3d2888bef27d`

---

## Root Cause Analysis (suspected)

PR #114 (https://github.com/VirtoCommerce/vc-module-x-cart/pull/114) does NOT modify `RemoveConfigurationItem*Async` directly. However, it DOES modify the `SectionLineItem` construction path (new `Source: ConfigurationItem` back-reference, new factory `CreateSectionLineItem(ConfigurationItem)`, migration of read-path callsites in `CartAggregate` Text/File branches and `ChangeCartCurrencyCommandHandler`).

Hypothesis: the load-path migration to source-aware overloads changed how `SectionLineItem` instances pair to `ConfigurationItem` instances when a configurable line is hydrated from persistence. If the `FindConfigurationItem` lookup used by `RemoveConfigurationItemAsync` relies on identity comparison or a specific construction shape, the refactor could have broken the identity chain — causing the lookup to silently miss the items it should be removing (no error raised because the "find or no-op" semantics treat a miss as a permitted batch case).

The new selection mutations (BL-CART-011 silent no-op on unmatched key) PASS this test — meaning the lookup path used by the **selection** family works. But removal uses a parallel lookup path (`Add/Update/RemoveConfigurationItem` predates the selection family). The two paths may now diverge after the `Source` refactor.

**Files to investigate:**
- `src/VirtoCommerce.XCart.Core/CartAggregate.cs` — `RemoveConfigurationItemAsync(string, ProductConfigurationSection)` and `RemoveConfigurationItemsAsync(string, IList<ProductConfigurationSection>)` lookup logic.
- `src/VirtoCommerce.XCart.Core/ConfiguredLineItemContainer.cs` — `Source` back-reference plumbing and the new `CreateSectionLineItem` factory; verify load-path `SectionLineItem` instances still match the `ConfigurationItem` instances stored on `lineItem.ConfigurationItems`.
- `FindConfigurationItem` callsite — whether it walks `lineItem.ConfigurationItems` (raw model) or `SectionLineItem` (post-refactor view).

**Quick reproducibility check the cart team can run:**
- Re-run on `dev` branch (without PR #114) — if PASSES, regression is confirmed introduced by PR #114.
- Re-run on the prior pre-release artifact (e.g., `3.1012.x`) — same purpose.

---

## Impact

- **Data integrity (High):** Storefront UI calls `removeConfigurationItem` to deselect/uninstall an optional placement; user sees confirmation, but the placement remains priced into the cart. Customer is charged for items they tried to remove.
- **Cart abandonment risk:** Users unable to remove unwanted configuration items will either retry repeatedly (wasted API calls + frustration) or abandon the cart entirely.
- **Silent failure:** No error toast, no console error, no network failure — the storefront UI has no signal that the mutation didn't take effect. Every existing client integration that calls these mutations is affected.
- **Coupon / total math:** Cart subtotal continues to include the not-removed config item's price contribution. Coupon eligibility, tax, and shipping all calculate against the wrong base.
- **Scope:** Affects any cart containing a configurable product with ≥1 configuration section. Does NOT affect simple line items (those use `removeCartItems`, untouched).

---

## Workaround

Until fixed, frontend can fall back to `clearCart` + re-add with the desired subset of sections. Heavy-handed but correct. Alternatively, use `changeCartConfiguredItem` to atomically replace the full configuration with the desired final state — note this requires the client to track which sections to keep and pass them all in the new payload.

---

## Recommended Action

1. **Cart team / PR #114 author:** verify on `dev` whether this is a pre-existing issue or a PR #114 regression. If pre-existing — separate ticket, pre-existing severity. If PR #114 introduced — block merge until fixed.
2. **Add a unit test** in `CartAggregateTests` covering `addItem(2 sections) → removeConfigurationItem(RAM) → assert lineItem.ConfigurationItems.Count == 1`. The 13 unit tests added in PR #114 cover the new selection family but apparently no test triggers the removal-after-add path that this case exercises.
3. **Update CFG-GQL-011** in suite 050i once fixed — keep current assertions; they are correct and caught the regression.

---

## References

- PR: https://github.com/VirtoCommerce/vc-module-x-cart/pull/114
- Test case: `regression/suites/Backend/graphql/050i-graphql-configurations.csv` row CFG-GQL-011
- Regression run: `reports/regression/050i-batch-20260507-113906/REPORT.md`
- Evidence: `reports/regression/graphql-evidence/CFG-GQL-011-1778146784124.json`
- VC docs (current expected behavior): https://github.com/virtocommerce/vc-docs — `Cart/mutations/removeConfigurationItem.md`, `removeConfigurationItems.md`
- JIRA ticket: not yet filed (awaiting user confirmation)
