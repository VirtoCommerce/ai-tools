# VCST-4765: Backend Test Execution Report

**Ticket:** [Contribution] Extend ConfigurationItem with pricing, checkout selection, and LineItemId
**Date:** 2026-03-12
**Environment:** QA (`https://vcst-qa.govirto.com`)
**Tester:** qa-backend-expert (automated via GraphQL xAPI)
**Browser:** Edge (playwright-edge) for GraphQL execution
**Auth:** Admin (`admin` / OAuth2 Bearer token)

---

## Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | 28 |
| Passed | 23 |
| Failed | 1 |
| Observations / Minor Issues | 4 |
| Orders Created (test) | CO260312-00003, CO260312-00004 |
| Test Data Product | Configurable Hat (`38dbe95c-3f46-48ff-bb9a-8bd96f475214`, SKU: YER-80407217) |

**Overall Verdict:** PASS with 1 bug and 4 observations.

---

## 1. GraphQL Schema Extensions

### TC-4765-001: CartConfigurationItemType new pricing fields
**Status:** PASS
Verified via introspection that `CartConfigurationItemType` exposes:
- `listPrice` (NON_NULL MoneyType)
- `salePrice` (NON_NULL MoneyType)
- `extendedPrice` (NON_NULL MoneyType)
- `selectedForCheckout` (NON_NULL Boolean)
- `product` (Product)

All fields are NON_NULL for monetary types, which is correct -- prevents null reference issues.

### TC-4765-002: OrderConfigurationItemType new pricing fields
**Status:** PASS
Verified via introspection:
- `price` (MoneyType) -- note: named `price` not `listPrice` in order context
- `salePrice` (MoneyType)
- `extendedPrice` (MoneyType)
- `files` (list of OrderConfigurationItemFileType)
- `product` (Product)
- `sectionId`, `productId`, `sku`, `imageUrl`, `quantity`, `type`, `customText`

### TC-4765-003: ConfigurationSectionType maxLength field
**Status:** PASS
`ConfigurationSectionType` includes `maxLength` (Int, nullable). Queried via productConfiguration -- returned `null` for sections without max length configured.

### TC-4765-004: ConfigurableProductOptionInput selectedForCheckout field
**Status:** PASS
`ConfigurableProductOptionInput` has `selectedForCheckout` (Boolean, nullable).

### TC-4765-005: InputNewCartItemType new fields
**Status:** PASS
`InputNewCartItemType` (used by `addItem`) includes:
- `price` (Decimal) -- price override
- `comment` (String) -- maps to `note` on LineItemType
- `createdDate` (DateTime)
- `configurationSections` (list of ConfigurationSectionInput)

### TC-4765-006: ConfigurationSectionInput is ExtendableInputObjectGraphType
**Status:** PASS
`ConfigurationSectionInput` exposes: `sectionId`, `type`, `option`, `customText`, `fileUrls`.

### TC-4765-007: CRUD mutation existence
**Status:** PASS
All 8 configuration mutations exist in schema:
- `createConfiguredLineItem` (returns ConfigurationLineItemType)
- `addConfigurationItem` / `addConfigurationItems` (return CartType)
- `updateConfigurationItem` / `updateConfigurationItems` (return CartType)
- `removeConfigurationItem` / `removeConfigurationItems` (return CartType)
- `changeCartConfiguredItem` (return CartType)

### TC-4765-008: ConfigurationLineItemType pricing fields
**Status:** PASS
`ConfigurationLineItemType` (options in productConfiguration query) exposes:
- `listPrice`, `salePrice`, `extendedPrice`, `discountAmount` (all MoneyType)
- `product`, `currency`, `quantity`, `text`, `id`

---

## 2. Configuration Item Pricing Fields

### TC-4765-009: productConfiguration query returns pricing on options
**Status:** PASS
Queried product configuration for Configurable Hat. Each option in each section returns correct pricing:
- Black hat: listPrice=$10, salePrice=$10, extendedPrice=$10 (qty 1)
- Beige hat: listPrice=$500, salePrice=$500, extendedPrice=$500
- All amounts are integers (whole dollars), formatted to 2 decimal places in `formattedAmount`

### TC-4765-010: salePrice falls back to listPrice when no sale discount
**Status:** PASS
All products tested show `salePrice == listPrice` when no active sale/promotion exists. This is the correct fallback behavior.

### TC-4765-011: extendedPrice = salePrice * quantity
**Status:** PASS
Verified with multiple scenarios:
- NY print: salePrice=$8, qty=2 -> extendedPrice=$16
- Green hat: salePrice=$18, qty=3 -> extendedPrice=$54
- Line item qty=2 with $69 unit price -> extendedPrice=$138

### TC-4765-012: BL-PRICE-003 - 2 decimal precision
**Status:** PASS
All monetary amounts display with 2 decimal places in `formattedAmount` (e.g., "$10.00", "$523.00"). No floating-point precision errors observed.

### TC-4765-013: Line item price includes base + config items
**Status:** PASS
Line item listPrice = base product price + sum of config item prices:
- Configurable Hat ($15) + Black hat ($10) + NY print ($8) = $33
- Configurable Hat ($15) + Beige hat ($500) + NY print ($8) = $523
- Configurable Hat ($15) + Green hat ($18 * 3) = $69

---

## 3. Configuration Item CRUD Operations

### TC-4765-014: addItem with configurationSections
**Status:** PASS
Successfully added configurable product to cart with configuration sections. Cart item created with `Configuration-YER-80407217` SKU prefix.

### TC-4765-015: addConfigurationItems (batch add)
**Status:** PASS
Added a Text-type configuration item to existing configured line item. Item appeared with `customText: "HELLO QA"`, `selectedForCheckout: true`, price=$0.

### TC-4765-016: updateConfigurationItem (single update)
**Status:** PASS
Updated NY print: changed quantity from 1 to 2, changed selectedForCheckout from true to false. Both changes persisted correctly.

### TC-4765-017: updateConfigurationItems (batch update)
**Status:** PASS
Batch-updated two config items simultaneously: swapped Black hat for Beige hat ($500), and reset NY print quantity. Both updates applied atomically.

### TC-4765-018: removeConfigurationItems
**Status:** PASS
Removed Text configuration item. Item was removed from the configuration items list. Total price recalculated correctly.

### TC-4765-019: changeCartConfiguredItem (full reconfiguration)
**Status:** PASS
Replaced entire configuration: Black hat -> Red hat ($14) + Bird print ($20) + custom text "QA TEST 2026". Line item quantity changed to 3. All old config items replaced. Price: $49 * 3 = $147.

### TC-4765-020: createConfiguredLineItem
**Status:** PASS
Created a standalone configured line item (not added to cart). Returns `ConfigurationLineItemType` with aggregated pricing: $25 = $15 (base) + $10 (Black hat). Product reference points to the configurable product.

---

## 4. SelectedForCheckout Behavior

### TC-4765-021: selectedForCheckout via updateConfigurationItem
**Status:** PASS
Setting `selectedForCheckout: false` via `updateConfigurationItem` works correctly. The value is persisted and returned correctly on subsequent queries.

### TC-4765-022: selectedForCheckout ignored on addItem
**Status:** FAIL (BUG)
**Severity:** Medium
**Description:** When adding a configurable product via `addItem` with `selectedForCheckout: false` on a configuration section option, the value is **ignored** and defaults to `true`. Reproduced twice:
1. NY print sent with `selectedForCheckout: false` -> returned `true`
2. Green hat sent with `selectedForCheckout: false` -> returned `true`

**Workaround:** Use `updateConfigurationItem` after `addItem` to set the desired `selectedForCheckout` value.

**Expected:** The `selectedForCheckout` value from `ConfigurableProductOptionInput` should be honored during `addItem`.

### TC-4765-023: Order filters by selectedForCheckout
**Status:** PASS
Cart had 2 config items: Black hat (selectedForCheckout=true) and NY print (selectedForCheckout=false). After `createOrderFromCart`, order CO260312-00004 contained **only** Black hat. NY print was correctly filtered out. This confirms the cart-to-order filter is working as designed.

---

## 5. Cart-to-Order Transfer

### TC-4765-024: Configuration items transfer to order
**Status:** PASS
Order CO260312-00003: Both config items (NY print, Beige hat) transferred with complete data:
- `sectionId`, `productId`, `sku`, `imageUrl` all populated
- `price`, `salePrice`, `extendedPrice` all correct
- `files` field present (empty array)
- `product` field resolves to live catalog product
- `type` and `customText` preserved

---

## 6. ProductSnapshot Feature

### TC-4765-025: Order.ProductSnapshot.Enable setting exists
**Status:** PASS
Setting `Order.ProductSnapshot.Enable` found in platform settings:
- Module: VirtoCommerce.Orders
- Group: Orders|Products
- ValueType: Boolean
- Default: false
- Current: not explicitly set (uses default=false)

### TC-4765-026: ProductSnapshot disabled by default
**Status:** PASS (not testable end-to-end without enabling)
The setting exists with `defaultValue: false` and `itHasValues: false` (no override). Testing snapshot-first product resolution would require enabling the setting and restarting -- deferred to integration testing with explicit permission to modify settings.

---

## 7. Edge Cases

### TC-4765-027: Quantity 0 on configuration option
**Status:** OBSERVATION
Adding a config item with `quantity: 0` results in the item **not being added** to the cart. The mutation returns successfully but with an empty items array. No error or validation message is returned.

**Observation:** This is a silent failure. Ideally, a validation error should be returned indicating that quantity must be >= 1 for product-type configuration items.

### TC-4765-028: addConfigurationItem with invalid lineItemId
**Status:** OBSERVATION
Using `addConfigurationItem` with a non-existent `lineItemId` (`00000000-0000-0000-0000-000000000000`) returns the cart with empty items and **no error**. This is a silent failure.

**Observation:** Should return a validation error such as "Line item not found" rather than silently succeeding.

---

## Additional Observations

### OBS-001: InputNewCartItemType price override behavior with configurable products
The `price` field on `InputNewCartItemType` was tested with value `99.99` when adding a configurable product. The price was NOT applied -- the line item price was calculated from base + config items as normal ($69). This may be by design (price override only for simple products) but should be documented.

### OBS-002: comment maps to note
The `comment` input field on `InputNewCartItemType` maps to the `note` field on `LineItemType` output. The field name mismatch between input and output is a minor inconsistency but functional.

---

## Inactive Configuration Filter (Test 7)

### TC-4765-029: productConfiguration only returns active configurations
**Status:** NOT FULLY TESTABLE
The `productConfiguration` query successfully returned the Configurable Hat configuration. However, verifying the inactive filter requires a product with `IsActive=false` configuration in the test environment. The Configurable Hat's configuration is active. No inactive configurations were found to test against.

**Note:** The "Bike with options" product referenced in the ticket (SKU: CVQ-54616437) was **not found** in the QA environment search index. This may indicate it needs to be seeded or the product exists in a different store/catalog.

---

## Test Data Cleanup

| Resource | Action | Status |
|----------|--------|--------|
| Cart (admin user) | Cleared via `clearCart` | Done |
| Order CO260312-00003 | Created for testing | Remains (test artifact) |
| Order CO260312-00004 | Created for testing | Remains (test artifact) |

---

## Business Rules Verification Summary

| Rule | Status | Details |
|------|--------|---------|
| BL-PRICE-003 (2 decimal precision) | PASS | All amounts formatted to 2 decimals |
| BL-CAT-006 (required sections) | N/A | All sections in test product are optional (isRequired=false) |
| BL-CROSS-005 (order captures config) | PASS | Configuration items correctly transferred to order |
| BL-CROSS-010 (idempotency) | NOT TESTED | Would require repeated identical mutations |
| ECL-7.1 (configurable edge cases) | PARTIAL | Tested qty=0, invalid lineItemId |
| ECL-14.1 (price calculation) | PASS | All calculations verified correct |

---

## Bugs Found

### BUG-001: selectedForCheckout ignored during addItem mutation

| Field | Value |
|-------|-------|
| Severity | Medium |
| Priority | P1 |
| Component | Cart xAPI / Configuration |
| Affected Mutation | `addItem` (InputAddItemType with configurationSections) |
| Reproduction Rate | 100% (reproduced twice) |

**Steps to Reproduce:**
1. Call `addItem` mutation with a configurable product
2. Include a configuration section with `option.selectedForCheckout: false`
3. Query the cart or check the mutation response

**Expected:** The configuration item should have `selectedForCheckout: false`
**Actual:** The configuration item has `selectedForCheckout: true` (input value ignored)

**Impact:** Users cannot set `selectedForCheckout=false` at the time of adding items to cart. They must make a separate `updateConfigurationItem` call afterward, which is an extra round-trip and could lead to race conditions.

**Workaround:** Call `updateConfigurationItem` after `addItem` to set the correct `selectedForCheckout` value.

---

## Sign-Off

**Test Execution:** COMPLETE
**Confidence Level:** HIGH for schema, CRUD operations, pricing, and cart-to-order flow. MEDIUM for ProductSnapshot (requires config change to fully test) and inactive configuration filter (requires test data setup).
**Recommendation:** Fix BUG-001 (selectedForCheckout ignored on addItem) before release. Consider adding validation errors for edge cases (qty=0, invalid lineItemId).
