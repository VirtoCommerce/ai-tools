# Testing Checklist — VCST-4830: Address Created on Every API Call

## Bug Summary
When a user edits an address from cart/checkout, a new CartAddress record is created in the DB every time instead of updating the existing one. Root cause: `AddShipmentAsync` unconditionally resets `DeliveryAddress.Key = null`.

## Fix Summary (PR #106)
1. `AddShipmentAsync` — only resets address key when it doesn't belong to an existing shipment in the cart
2. `AddOrUpdateCartShipmentCommandHandler` — preserves `previousDeliveryAddressKey` and restores it after mapping
3. `RemoveExistingShipmentAsync` moved after address key logic

## Test Scenarios

### A. Core Fix Verification (GraphQL Layer) — qa-backend-expert

- [ ] **A1.** Set shipping address via `addOrUpdateCartShipment` — verify address saved correctly (first time)
- [ ] **A2.** Update shipping address on same cart via `addOrUpdateCartShipment` with different street — verify address updated (not duplicated)
- [ ] **A3.** Update shipping address a third time — verify still only 1 shipment, address reflects latest values
- [ ] **A4.** Verify `deliveryAddress.key` is non-null and consistent across updates (same key preserved)
- [ ] **A5.** Verify cart remains valid after each address update (no validation errors)
- [ ] **A6.** Verify `availableShippingMethods` still populated after address updates

### B. Storefront UI Verification — qa-frontend-expert

- [ ] **B1.** Enter shipping address at checkout, save it, verify displayed in summary
- [ ] **B2.** Click Edit on address → verify form pre-populates with saved values
- [ ] **B3.** Modify street, save → verify summary shows new street
- [ ] **B4.** Edit again → verify form shows the updated value (not original)
- [ ] **B5.** Change city/state/zip, save → verify shipping methods recalculate
- [ ] **B6.** Verify no duplicate `addOrUpdateCartShipment` calls in network tab per edit

### C. Regression Guards

- [ ] **C1.** (BL-CHK-005) Changing address region updates available shipping methods
- [ ] **C2.** (BL-SHIP-004) If address change doesn't invalidate shipping method, selection persists
- [ ] **C3.** Multi-cart scenario: two different users with same profile address — each cart gets its own address (PK guard still works)
- [ ] **C4.** Guest checkout: new address entry still works (no saved address to conflict with)
- [ ] **C5.** Complete full checkout after multiple address edits — order placed successfully

### D. Exploratory — qa-testing-expert

- [ ] **D1.** Rapid address edits (change address 5+ times quickly)
- [ ] **D2.** Edit address, then navigate away and back to checkout
- [ ] **D3.** Edit address mid-checkout after shipping method selected
- [ ] **D4.** Browser back/forward during address editing
- [ ] **D5.** Console errors or network failures during address updates

## Business Rules to Verify
- **BL-CHK-005:** Shipping method depends on address — changing address must update available methods
- **BL-SHIP-001:** Ship-to address determines available methods
- **BL-SHIP-004:** Shipping method selection persists through checkout edits (unless invalidated)
- **BL-CART-007:** Analogous — same entity should update, not duplicate

## Edge Cases
- **ECL-8.1:** Address boundary — repeated updates to same entity
- **ECL-1.2:** State management — address state across navigation
- **ECL-14.1:** API contract — mutation return values match expectations
