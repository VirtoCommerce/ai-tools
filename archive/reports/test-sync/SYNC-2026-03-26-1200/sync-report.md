# Test Sync Report — SYNC-2026-03-26-1200

## Summary
- **Source:** PR #104 VirtoCommerce/vc-module-x-cart — "Fix empty options validation and refactor config item pricing"
- **Date:** 2026-03-26
- **Changed modules:** Cart (xAPI) — `vc-module-x-cart`
- **Affected suites:** 028, 029, 030, 052, 072, 072b, 072c
- **PR status:** Open (not yet merged)

## Change Inventory

| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|
| Cart (xAPI) | Backend | `ConfigurationItemValidator.cs` | No | Validator now allows empty options sections |
| Cart (xAPI) | Backend | `ConfiguredLineItemContainer.cs` | **Yes (behavioral)** | `UpdatePrice` filters by `SelectedForCheckout`; new `SyncConfigurationPrices` method; new `CreateLineItem`/`AddProductSectionLineItem` overloads |
| Cart (xAPI) | Backend | `CartAggregate.cs` | No | Uses new container methods; `SyncConfigurationItemPrices` marked `[Obsolete]` |
| Cart (xAPI) | Backend | `ChangeCartCurrencyCommandHandler.cs` | No | Uses new overload propagating `SelectedForCheckout` |

### Key Behavioral Changes
1. **Validator fix (vacuous truth):** `ConfigurationItemValidator.ValidateSectionTypeProduct()` now has `Options.Count > 0` guard — sections with no predefined options no longer reject dynamically-resolved products
2. **Pricing change:** `ConfiguredLineItemContainer.UpdatePrice()` filters `Items.Where(x => x.Item is { SelectedForCheckout: true })` — unselected config items excluded from line item totals
3. **Currency change:** `ChangeCartCurrencyCommandHandler` propagates `SelectedForCheckout` to config items via new `AddProductSectionLineItem(CartProduct, ConfigurationItem)` overload

## Impact Matrix

| Suite | Total Cases | Stale | Broken | Incomplete | New Needed | Valid |
|-------|------------|-------|--------|------------|------------|-------|
| 052 (Config Products Admin) | 3 scoped | 0 | 0 | 0 | 0 | 3 |
| 072b (Config Products E2E) | 8 scoped | 0 | 0 | 0 | 1 | 8 |
| 072c (Config Products Cross) | 2 scoped | 0 | 0 | 0 | 2 | 2 |
| 028 (Cart Core) | 2 scoped | 0 | 0 | 0 | 0 | 2 |
| 030 (Cart Merge) | 8 scoped | 0 | 0 | 0 | 0 | 8 |
| **Total** | **23** | **0** | **0** | **0** | **3** | **23** |

## Cases Updated

No existing cases required updates. All analyzed cases are VALID — the PR changes are backward-compatible for existing happy-path scenarios.

## Cases Deprecated

None.

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|
| CFG-E2E-055 | 072b | E2E: Add-to-Cart Succeeds for Product Section with No Predefined Options (Dynamic Resolution) | Frontend/E2E | Critical |
| CFG-GQL-009 | 072c | Configurable Product Price Excludes Unselected-for-Checkout Config Items | GraphQL xAPI | Critical |
| CFG-EDGE-002 | 072c | Currency Change Preserves SelectedForCheckout State on Config Items | Cross-Cutting | High |

### New Case Details

**CFG-E2E-055** — Covers the validator fix: tests that adding a configurable product to cart succeeds when a Product-type section has empty `options[]` (dynamically resolved products). Previously, `Options.All(x => x.ProductId != ...)` returned `true` on empty collection, causing false rejection.

**CFG-GQL-009** — Covers the pricing behavioral change: tests that deselecting a config item (`selectedForCheckout=false`) excludes its price from the configurable line item total. Validates `UpdatePrice` filtering.

**CFG-EDGE-002** — Covers the currency change handler: tests that `SelectedForCheckout` state on config items is preserved after `changeCartCurrency` mutation, and prices are correctly recalculated in the new currency.

## Environment Verification

Skipped — PR #104 is still open (not merged/deployed to QA).

## Quality Gate

| Check | Status |
|-------|--------|
| All STALE cases updated | PASS (0 stale) |
| All BROKEN cases addressed | PASS (0 broken) |
| New behavior has coverage | PASS (3 cases generated) |
| No ID conflicts | PASS |
| CSV structure valid | PASS |
| testCount updated in manifest | PASS (072b: 54→55, 072c: 24→26) |

## Recommended Next Steps
- [ ] Review new cases: `git diff regression/suites/Frontend/configurable-products/`
- [ ] Once PR #104 is merged and deployed to QA, run `/qa-test-lifecycle suite 072b,072c --skip-generate` to validate
- [ ] Run `/qa-regression configurable-products` after deployment to verify on environment
- [ ] Monitor for `ProductUnavailableForSection` errors in production after fix deployment
