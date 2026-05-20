# BUG: selectedForCheckout flag ignored for configurable product items — pricing not recalculated

## Status: FIXED

## Resolution

**Fixed in:** vc-module-x-cart PR #119 — `VirtoCommerce.XCart 3.1015.0-pr-119-6a09`
**Verified:** 2026-05-20 on vcst-qa (Platform 3.1028.0, Theme 2.49.0)
**JIRA:** VCST-4961 — transitioned to Tested
**Method:** GraphQL via canonical `scripts/graphql-runner.ts` — 3 new runner-native cases (`CFG-GQL-VCST4961-A/B/C`) added to `regression/suites/Backend/graphql/050i-graphql-configurations.csv`. 3 consecutive end-to-end runs all PASS (84 operations, 0 errors).

**Fix scope:**
- `ChangeCartConfiguredLineItemCommandHandler` now snapshots OLD `ConfigurationItems` before mediator rebuild and copies `SelectedForCheckout` from matching old item (by `Type` + `SectionId`; for `Variation` type also by `ProductId`) — preserves per-config-item selection across Edit-Configuration → Update-Cart flows.
- `CreateConfiguredLineItemHandler` → `ConfiguredLineItemContainer.AddProductSectionLineItem` now passes `productOption.SelectedForCheckout` through (Issue-A: input flag no longer silently ignored on first add).
- Added `UpdateConfiguredLineItemPrice` call after configuration update to keep listPrice in sync with preserved selection.

**Evidence:** `tests/Sprint-current/VCST-4961/verification-2026-05-20/verification-report.md` + per-run JSON evidence.

---

## Status (historical): CONFIRMED

**Severity:** High
**Component:** Cart / GraphQL xAPI / Configurable Products
**Browser:** Edge (Chromium)
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1019.0
**Theme Version:** 2.46.0-pr-2225-572f-572f0087
**Module Versions:** VirtoCommerce.XCart 3.1007.0-pr-105-3ec5, VirtoCommerce.Cart 3.1003.0
**USER_EMAIL:** .env
**USER_PASSWORD:** .env
**Date:** 2026-04-17
**Reported By:** QA Agent (REG-2026-04-17-0900, test CFG-GQL-009)

## Steps to Reproduce
1. Add a configurable product (Bike with options, $350 base) to cart with two configuration options: Seat ($45) and Rear wheel ($22 x qty 2 = $44)
2. Note the total: $417 ($350 + $45 + $22)
3. Execute `changeCartConfiguredItem` mutation setting `selectedForCheckout: false` for the Rear wheel configuration item
4. Query the cart and check the `selectedForCheckout` flag on each configuration item
5. Check the line item total price

## Expected Result
- Rear wheel configuration item should show `selectedForCheckout: false`
- Cart line item price should recalculate to $395 ($350 + $45, excluding the deselected Rear wheel $22)
- Only selected-for-checkout items contribute to the order total

## Actual Result
- **Both** configuration items still show `selectedForCheckout: true` — the flag change was silently ignored
- Cart line item price remains **$417** (unchanged)
- The `selectedForCheckout` flag is not propagated through the `changeCartConfiguredItem` mutation for configurable product items

## Evidence

**Full reproduction:** `reports/bugs/evidence/bug-reproduction-2026-04-17.md` (Bug 3 section)

### Issue 3a: `selectedForCheckout: false` in option input silently ignored

```graphql
mutation changeCartConfiguredItem($command: InputChangeCartConfiguredItemType!) {
  changeCartConfiguredItem(command: $command) {
    id
    items { id name selectedForCheckout configurationItems { id quantity product { id name } } }
    validationErrors { errorCode errorMessage objectId objectType }
  }
}
```
```json
{
  "command": {
    "cartId": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US", "currencyCode": "USD",
    "lineItemId": "de529a87-26ba-41f0-aff9-875353e5cf36",
    "configurationSections": [{
      "sectionId": "29f2514c-51c6-43df-bba4-dd2db82240e4",
      "type": "Product",
      "option": {
        "productId": "e5df66a5-4fd5-48f4-a290-481f59807082",
        "quantity": 1,
        "selectedForCheckout": false
      }
    }]
  }
}
```

**Response:** Parent `selectedForCheckout: true` (unchanged). `selectedForCheckout: false` in option input silently ignored.

### Issue 3b: Parent deselect does NOT cascade to configurationItems

```graphql
mutation changeCartItemSelected($command: InputChangeCartItemSelectedType!) {
  changeCartItemSelected(command: $command) {
    id
    items { id name selectedForCheckout configurationItems { id name selectedForCheckout } }
    validationErrors { errorCode errorMessage }
  }
}
```
```json
{
  "command": {
    "cartId": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US", "currencyCode": "USD",
    "lineItemId": "de529a87-26ba-41f0-aff9-875353e5cf36",
    "selectedForCheckout": false
  }
}
```

**Response:**
```json
{
  "data": {
    "changeCartItemSelected": {
      "items": [{
        "id": "de529a87-26ba-41f0-aff9-875353e5cf36",
        "name": "Bike with options",
        "selectedForCheckout": false,
        "configurationItems": [{
          "id": "4d56070a-bf54-4d64-a055-a418baefd23a",
          "name": "Seat",
          "selectedForCheckout": true
        }]
      }]
    }
  }
}
```

**Inconsistent state:** Parent=false, Child Seat=true. No cascade.

### Schema Introspection Evidence

**ConfigurableProductOptionInput (input):**
```
- productId: String! (required)
- quantity: Int! (required)
- selectedForCheckout: Boolean (OPTIONAL — field EXISTS but is SILENTLY IGNORED by backend)
```

**CartConfigurationItemType (output):**
```
- selectedForCheckout: Boolean! (NON-NULL — field is always returned, defaults to true)
```

**InputChangeCartItemSelectedType (input):**
```
- lineItemId: String! — targets parent line items ONLY
- selectedForCheckout: Boolean! — no mechanism to target individual configurationItems
```

The schema defines `selectedForCheckout` on both input and output types for configurationItems, but **no code path processes the input value** and **no mutation can target individual config items**.

## Root Cause Analysis
- `ConfigurableProductOptionInput.selectedForCheckout` exists in schema but the `ChangeCartConfiguredItem` handler in `CartAggregate.cs` does not map it to the persisted `ConfigurationItem.SelectedForCheckout`
- `changeCartItemSelected` mutation only supports `lineItemId` (parent level) — no `configurationItemId` parameter exists
- `CartValidator.ValidateConfiguredLineItems` (in PR #105) READS `SelectedForCheckout` from config items to determine required sections, proving the field is designed to be functional — but there's no write path
- **Not from PR #105** — PR only reads the field during validation, doesn't introduce the missing write path
- This is a **feature implementation gap**: the schema promises `selectedForCheckout` control on config items but the backend never processes it

## Impact
- **Checkout pricing:** Users cannot exclude individual configuration options from checkout. The entire configured product is all-or-nothing.
- **B2B workflows:** B2B buyers reviewing complex configurations cannot deselect optional components before submitting orders.
- **Feature gap vs bug:** If `selectedForCheckout` is intentionally not supported on configurationItems, the API should return an error or warning rather than silently ignoring the flag. Needs clarification from product team.

## References
- JIRA: **VCST-4961** (In Progress, Sprint 26-09, assignee Dmitry Grishin)
- VC Docs: changeCartConfiguredItem mutation (Cart/mutations/changeCartConfiguredItem.md)
- Related: `selectedForCheckout` is a property on `LineItemEntity` in `vc-module-cart`
- Regression: REG-2026-04-17-0900 suite-072c-results.json (CFG-GQL-009)
- Blocker for: CFG-EDGE-002 (currency change preserves selectedForCheckout state)

---

## Re-Verification — 2026-05-13

**Status: STILL CONFIRMED on newer build — bug has NOT been fixed (~26 days after original report).**

**Build verified live (2026-05-13):**
- Platform: 3.1026.0 (was 3.1019.0)
- VirtoCommerce.XCart: **3.1013.0** (was 3.1007.0-pr-105-3ec5 — moved off the pre-release PR-105 build to a released version, but the write path is still missing)
- VirtoCommerce.Cart: 3.1003.0 (unchanged)
- Theme: 2.49.0-pr-2279-3ce07383 (was 2.46.0-pr-2225-572f0087)

**Re-repro context:** cart `506f6878-586b-4493-9fc2-1da9f69c7293`, line item `96e40238-7707-4c8e-83f3-202c730073f1` (Bike with options, $394 = $350 base + $22 × 2 Rear wheel). Note: current vcst-qa "Bike with options" exposes ONE Product-type section (`29f2514c-…`), not two as in the original report — the bug still reproduces with a single option because the failure is in the write path, not in the section count.

### Issue A — REPRODUCED (still broken)
After `changeCartConfiguredItem` with `option.selectedForCheckout: false`:
```json
{"data":{"changeCartConfiguredItem":{"items":[{"name":"Bike with options",
  "selectedForCheckout":true,"salePrice":{"amount":394.00},
  "configurationItems":[{"name":"Rear wheel...","selectedForCheckout":true,"quantity":2}]}],
  "validationErrors":[]}}}
```
Flag stays `true`, price stays `$394`, no validation error — flag silently ignored.

### Issue B — REPRODUCED (still broken)
After `changeCartItemSelected` with parent `selectedForCheckout: false`:
```json
{"data":{"changeCartItemSelected":{"items":[{"name":"Bike with options",
  "selectedForCheckout":false,"salePrice":{"amount":394.00},
  "configurationItems":[{"name":"Rear wheel...","selectedForCheckout":true}]}]}}}
```
Parent flipped to `false`, child stays `true`, parent line price unchanged — inconsistent state (parent=false, child=true), no cascade.

### Schema check (2026-05-13 introspection)
- `ConfigurableProductOptionInput.selectedForCheckout: Boolean` — still advertised on input, still ignored by backend
- `InputChangeCartItemSelectedType` — still only `lineItemId` + `selectedForCheckout`; no `configurationItemId` parameter added
- Schema unchanged → the broken-by-design surface is still exposed

### Evidence (live)
- `tests/Sprint-current/VCST-4961/evidence/modules.json` — full module manifest
- `tests/Sprint-current/VCST-4961/evidence/03-product-config.json` — current Bike sections
- `tests/Sprint-current/VCST-4961/evidence/07-schema-introspection.json`
- `tests/Sprint-current/VCST-4961/evidence/08-issueA-payload.json` + `08-issueA-response.json`
- `tests/Sprint-current/VCST-4961/evidence/09-issueB-payload.json` + `09-issueB-response.json`
- `tests/Sprint-current/VCST-4961/evidence/10-teardown-clearcart.json`

**Verdict:** Bug stays in `reports/bugs/open/`. JIRA VCST-4961 remains "In Progress" — no fix has shipped in XCart 3.1013.0. Reproducible 100% via GraphQL against the current vcst-qa build.

---

## Reframing — 2026-05-13 (after discovering new mutation)

**Status update: PARTIALLY RESOLVED — supported write path exists, schema hygiene issue remains.**

XCart 3.1013.0 ships a **new mutation family** for per-config-item selection that the original report missed:

- `changeCartConfigurationItemSelected` (single)
- `selectCartConfigurationItems` / `unSelectCartConfigurationItems` (bulk)
- `selectAllCartConfigurationItems` / `unSelectAllCartConfigurationItems` (all-at-once)

**`InputChangeCartConfigurationItemSelectedType` signature:**
```
cartId: String
storeId: String!
cartName: String
userId: String!
currencyCode: String
cultureName: String
cartType: String
lineItemId: String!
configurationSection: ConfigurationSectionKeyInput!  # { sectionId, type, option { productId } }
selectedForCheckout: Boolean!
```

Targeting is **indirect** — no `configurationItemId` field; the configurationItem is identified by `lineItemId` + `configurationSection.sectionId` + `configurationSection.option.productId`.

### Third repro — NEW MUTATION WORKS
Baseline cart: Bike with options + Rear wheel ×2, line `salePrice: 394`, child `selectedForCheckout: true`.
After `changeCartConfigurationItemSelected` with `selectedForCheckout: false`:
- Child `selectedForCheckout: false`
- Line item **`salePrice: 350`** (Rear wheel $44 excluded — only base $350)
- Parent `selectedForCheckout: true` (parent intentionally separate)
- `validationErrors: []`

Evidence: `tests/Sprint-current/VCST-4961/evidence/11-…` through `18-teardown.json`.

### Reframed conclusions
- **Issue A** (silent ignore on `ConfigurableProductOptionInput.selectedForCheckout`) — likely **by design**: `changeCartConfiguredItem` is meant to *replace* the option set, not toggle selection. The selection flag belongs on the new mutation.
- **Issue B** (no parent→child cascade on `changeCartItemSelected`) — likely **by design**: parent and child selection are independent axes. The new mutation is the supported per-child toggle.
- **Remaining real bug (schema hygiene):** `ConfigurableProductOptionInput.selectedForCheckout` and `InputChangeCartItemSelectedType` are **not marked deprecated** (mutation-level `isDeprecated: false`). The silently-ignored Boolean on the option input is still a trap — any client reading the schema will believe it's wired up. Either:
  1. Remove `selectedForCheckout` from `ConfigurableProductOptionInput`, OR
  2. Mark it `@deprecated(reason: "Use changeCartConfigurationItemSelected mutation")`, OR
  3. Have `changeCartConfiguredItem` propagate the value when set (full fix).

### Storefront / client action
Switch any frontend code that currently sets `selectedForCheckout` on `ConfigurableProductOptionInput` (or expects `changeCartItemSelected` to cascade) to call `changeCartConfigurationItemSelected` instead. Update CFG-GQL-009 in `regression/suites/Frontend/configurable-products/072c-configurable-products-cross.csv` line 44 to use the new mutation as the supported path.

**Verdict:** Functionality exists. Report stays in `open/` until the schema is cleaned up (advertised-but-ignored field removed or deprecated). Severity drops from High to **Low (schema hygiene)** in terms of capability — but the trap value remains.
