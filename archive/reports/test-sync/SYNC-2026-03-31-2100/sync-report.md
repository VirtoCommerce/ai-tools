# Test Sync Report — SYNC-2026-03-31-2100

## Summary
- **Source:** VCST-4830 + VirtoCommerce/vc-module-x-cart#106
- **Date:** 2026-03-31
- **Bug:** Address created on every API call — cart shipment address duplication in DB
- **Changed modules:** XCart (vc-module-x-cart)
- **Affected suites:** 050b (GraphQL xCart), 011 (Checkout Flow), 042 (Smoke), 028 (Cart Core)
- **PR Status:** Open (not merged), artifact available: `VirtoCommerce.XCart_3.1005.0-pr-106-ad89.zip`
- **JIRA Status:** Ready for test

## Change Inventory

| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|---------------|----------|--------------|
| XCart | Backend (GraphQL) | `CartAggregate.cs` (+43/-35), `AddOrUpdateCartShipmentCommandHandler.cs` (+5/-0) | Address key preservation logic changed | Address key preserved on update to prevent DB duplication |

### Code Changes Detail
1. **`CartAggregate.AddShipmentAsync`** — Address key now only reset when it doesn't belong to an existing shipment in the cart (was unconditionally nulled). `RemoveExistingShipmentAsync` moved after address key logic.
2. **`AddOrUpdateCartShipmentCommandHandler`** — Saves `previousDeliveryAddressKey` before mapping and restores it after, ensuring the one-to-one relationship between Shipment and DeliveryAddress is preserved.
3. **`ApplyConfigurationSectionAsync` + `CreateConfiguredLineItemContainer`** — Non-functional switch block indentation changes only.

## Impact Matrix

| Suite | Total Cases | Stale | Broken | Incomplete | New Needed | Valid |
|-------|------------|-------|--------|------------|------------|-------|
| 050b (GraphQL xCart) | 2 in scope | 0 | 0 | 0 | 1 | 2 |
| 011 (Checkout Flow) | 2 in scope | 0 | 0 | 0 | 1 | 2 |
| 042 (Smoke) | 2 in scope | 0 | 0 | 0 | 0 | 2 |
| 028 (Cart Core) | 1 in scope | 0 | 0 | 0 | 0 | 1 |
| **Totals** | **7** | **0** | **0** | **0** | **2** | **7** |

### Assessment Details

| Case | Suite | Original Classification | Finding | Final |
|------|-------|------------------------|---------|-------|
| GQL-009 | 050b | POTENTIALLY_STALE | First-time address set — key still nulled for non-existing shipment addresses | VALID |
| GQL-017 | 050b | UNAFFECTED | Full checkout flow sets address once, doesn't re-edit | VALID |
| CHK-002 | 011 | UNAFFECTED | Enter new address — first time, not re-edit | VALID |
| CHK-003 | 011 | POTENTIALLY_STALE | Profile address key still nulled correctly (not in existing shipments) | VALID |
| SMK-012 | 042 | UNAFFECTED | Sets address once during checkout | VALID |
| SMK-025 | 042 | UNAFFECTED | XSS regression — different concern | VALID |
| CART-017 | 028 | UNAFFECTED | Tax calculation reference to shipping address — unchanged | VALID |

## Cases Updated
None — all existing cases remain VALID.

## Cases Deprecated
None.

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|
| GQL-098 | 050b (GraphQL xCart) | xCart - Shipment Address Update Preserves Key (No DB Duplication) | Backend/GraphQL | Critical |
| CHK-086 | 011 (Checkout Flow) | Checkout - Edit Shipping Address Does Not Create Duplicate (VCST-4830) | Frontend/Storefront | Critical |

### GQL-098 — xCart - Shipment Address Update Preserves Key (No DB Duplication)
- **Layer:** GraphQL xAPI
- **Approach:** Calls `addOrUpdateCartShipment` three times with different addresses on the same cart, verifying:
  - Shipment count stays at 1 after each update
  - `deliveryAddress.key` is preserved across updates (no new DB row)
  - Address values reflect latest update
  - Cart remains valid throughout

### CHK-086 — Checkout - Edit Shipping Address Does Not Create Duplicate (VCST-4830)
- **Layer:** Storefront UI
- **Approach:** Completes checkout through address entry, then edits the address twice:
  - Verifies address form pre-populates with previous values on re-edit
  - Verifies address summary updates to show new values
  - Verifies shipping methods recalculate for new location
  - Cross-checks via GraphQL that `cart.shipments` count stays at 1

## Environment Verification
Skipped — static analysis sufficient. The fix logic is clear from code review:
- First-time address sets still null the key (no regression on existing behavior)
- Only re-edits of existing shipment addresses preserve the key (the fix)

## Quality Gate

| Check | Status |
|-------|--------|
| All STALE cases updated | PASS (0 stale) |
| All BROKEN cases addressed | PASS (0 broken) |
| New behavior has coverage | PASS (2 new cases) |
| No ID conflicts | PASS (GQL-098, CHK-086 are unique) |
| CSV structure valid | PASS |
| testCount updated in manifest | PASS (050b: 63→64, 011: 41→42) |

## Recommended Next Steps
- [ ] Review new cases: `git diff regression/suites/`
- [ ] Deploy PR #106 artifact to QA environment
- [ ] Run `/qa-test VCST-4830` to execute both new test cases against QA with the fix deployed
- [ ] Run `/qa-regression purchase-flow` to verify no regressions in cart/checkout/payment flows
- [ ] Transition VCST-4830 in JIRA after verification
