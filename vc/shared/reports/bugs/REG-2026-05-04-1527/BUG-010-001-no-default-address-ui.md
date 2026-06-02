# BUG-010-001: No 'Set as Default' UI for personal addresses

**Suite:** 010 — B2C Bulk Ship Dashboard  
**Test Cases:** B2C-SHIP-005 (FAIL), B2C-SHIP-006 (caveat), B2C-SHIP-007 (caveat)  
**Severity:** Medium  
**Priority:** P2  
**Type:** Functional / UX gap  
**Discovered:** 2026-05-05 during run REG-2026-05-04-1527  
**Browser:** Edge (Chromium 138 via playwright-edge MCP)  
**Environment:** vcst-qa-storefront.govirto.com  
**Account:** milamuller2024@yahoo.com (personal account, no org)

## Summary

The personal-account `/account/addresses` page does NOT expose any UI to designate an address as the **default**. The row Actions menu offers only **Edit** and **Delete** — no "Set as Default" item. There is no "Default" badge/marker rendered next to any address, even though the underlying `MemberAddressType` schema has an `isDefault` boolean field that returns `false` for every address.

As a downstream consequence, the checkout shipping selector and the header "Ship to" selector both load with **NO address pre-selected** (state shows "Please select a shipping address" / "Select address"). Users must manually pick an address every checkout session.

## Steps to Reproduce

1. Sign in as a personal-account user (`milamuller2024@yahoo.com / Password2!`)
2. Navigate to `/account/addresses`
3. Click the gear/Actions icon on any address row
4. Observe the Actions menu

## Expected

- Actions menu contains "Set as Default" option (or similar mechanism)
- A "Default" badge is shown on whichever address is currently the default
- Setting default updates `isDefault: true` on the chosen address (and `false` on the previous default)
- Checkout pre-selects the default address on cart load
- Header Ship-to selector shows the default address by default

## Actual

- Actions menu has only **Edit** and **Delete**
- No "Default" badge appears on any address
- GraphQL `currentCustomerAddresses` / `updateMemberAddresses` response shows `isDefault: false` for ALL stored addresses (verified via response-body of mutation index 119)
- Checkout `/cart` shows "Please select a shipping address" — no pre-fill
- Header Ship-to button shows "Select address" until the user manually picks one

## Evidence

- `reports/regression/REG-2026-05-04-1527/010-evidence/SHIP-001-addresses-list.png` — list with no default badge
- `reports/regression/REG-2026-05-04-1527/010-evidence/SHIP-004-actions-menu.png` — only Edit/Delete in Actions
- `reports/regression/REG-2026-05-04-1527/010-evidence/SHIP-006-checkout-address-selector.png` — checkout selector with no pre-selected address
- `reports/regression/REG-2026-05-04-1527/010-evidence/SHIP-007-header-shipto.png` — header dropdown showing "Select address"

## GraphQL Response Sample (response of `updateMemberAddresses`)

```json
"items":[
  { "firstName":"mila", "isDefault": false, "isFavorite": false, ... },
  { "firstName":"Jane", "isDefault": false, "isFavorite": false, ... }
]
```

## Impact

- Repetitive friction at checkout — users must select address every session
- Inconsistent with `BL-B2C-003` (default-address pre-fill is part of the standard checkout pattern)
- Mobile users lose more time typing/picking on small screens
- Header Ship-to ergonomics broken for region-specific browsing pricing

## Suggested Fix

Add "Set as Default" item to the per-row Actions menu and surface a `Default` badge next to the chosen address. Wire to `isDefault` flag in the `updateMemberAddresses` mutation. Make checkout / header Ship-to read `isDefault: true` to pre-fill.

## Cross-Layer Verification

| Layer | Result |
|---|---|
| STOREFRONT | UI lacks Set-Default action (confirmed) |
| GRAPHQL | `isDefault` field exists in schema, returns `false` for all (confirmed via mutation response) |
| CHECKOUT | No pre-selected address on `/cart` (confirmed) |
| ADMIN | Not verified — out of scope for this run |

## References

- BL-B2C-003 (default-address pre-fill at checkout)
- VCST-4575 (Ship To suite root)
