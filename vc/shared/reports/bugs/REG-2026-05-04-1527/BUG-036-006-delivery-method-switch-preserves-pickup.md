# BUG-036-006 — Switching delivery method Shipping → Pickup preserves previously confirmed pickup location instead of clearing

**Severity:** Low (UX deviation from spec — may be intentional)
**Suite:** 036 — BOPIS Store Selector
**Test Case:** BOPIS-027
**Business Rule:** BL-BOPIS-002, BL-BOPIS-004
**Edge Case:** ECL-14.1, ECL-7.1
**Browser:** Firefox (playwright-firefox)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Build:** Frontend Ver. 2.48.0
**Status:** confirmed: false (preliminary)

## Summary

The test case BOPIS-027 specifies that switching delivery method from Pickup to Shipping should clear the previously confirmed pickup location, so switching back to Pickup prompts the user to re-select. Actual behavior preserves the pickup location across the toggle Pickup → Shipping → Pickup. The address (e.g., `32-01 Northern Blvd, New York, New York, 10025, United States of America`) is preserved unchanged.

May be intentional UX (avoid losing user input on accidental toggles), but it contradicts the documented business rule BL-BOPIS-004 and BOPIS-027 acceptance criteria — please clarify.

## Steps to Reproduce

1. Add product to cart, click Pickup
2. Open Pick points modal, select location X (e.g., Queens Crossing), click PICK UP HERE
3. Verify cart shows pickup location (X)
4. Click the Shipping radio button (delivery option)
5. Verify pickup section is hidden, shipping address section appears
6. Click Pickup radio button again

## Expected

Per BL-BOPIS-004 / BOPIS-027:
- After switching to Shipping → pickup location should be cleared internally
- After switching back to Pickup → empty pickup prompt, user must re-select

## Actual

- Switch to Shipping: pickup section hidden, shipping address section appears (correct)
- Switch back to Pickup: **previously confirmed location (Queens Crossing 32-01 Northern Blvd) is preserved** — `selected-address-label` still shows full address, no re-selection required

## Evidence

- Test result data:
  ```
  initial.pickupAddress: "32-01 Northern Blvd, New York, New York, 10025, United States of America"
  afterSwitchToShipping.pickupSectionGone: true
  afterSwitchBackToPickup.pickupAddress: "32-01 Northern Blvd, New York, New York, 10025, United States of America"
  afterSwitchBackToPickup.pickupCleared: false
  ```

## Console / Network

- Console errors: 0
- Network errors: 0
- `clearPickupLocation` mutation may not be firing on Shipping toggle — please verify GraphQL traffic

## Impact

- Spec deviation. May be intentional improvement or inadvertent behavior.
- User cannot easily reset pickup choice without a separate "clear" action

## Suggested Triage

Two paths:
1. **If spec is correct:** Implement `clearPickupLocation` mutation on Shipping radio click; update UI to show empty pickup prompt after toggle
2. **If current behavior is preferred:** Update BL-BOPIS-004 + BOPIS-027 acceptance criteria to reflect "pickup preserved across toggles"
