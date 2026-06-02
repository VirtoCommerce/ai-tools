# BUG-010-003: Server inserts duplicate address instead of silently skipping (BL-PROFILE-001 violation)

**Suite:** 010 — B2C Bulk Ship Dashboard  
**Test Case:** B2C-SHIP-014 (FAIL)  
**Severity:** Medium  
**Priority:** P2  
**Type:** Functional — server-side dedupe  
**Discovered:** 2026-05-05 during run REG-2026-05-04-1527  
**Browser:** Edge  
**Environment:** vcst-qa-storefront.govirto.com  
**Account:** milamuller2024@yahoo.com (personal account)

## Summary

`updateMemberAddresses` does NOT silently skip a duplicate address when called with an address whose location fields (Country/State/City/Street/Apt/ZIP) match an existing saved address. Instead, the server **inserts** the duplicate row, increasing `totalCount` from N to N+1.

The expected invariant per `PROPOSED-BL-PROFILE-001` (referenced in test SHIP-014) is: when a duplicate is detected by location keys (line1, line2, city, regionId, postalCode, countryCode), the server should silently skip without raising an error and `totalCount` should stay at N.

## Steps to Reproduce

1. Sign in as `milamuller2024@yahoo.com / Password2!`
2. Navigate to `/account/addresses`. Note `totalCount = 2` (Jane Doe @ 456 Oak Avenue Apt 4B, NYC 10001 USA + mila mila @ Albania)
3. Click **ADD NEW ADDRESS**
4. Fill the form with the SAME location as Jane Doe (USA, NY, New York, 456 Oak Avenue, Apt 4B, 10001) but with DIFFERENT first/last/email:
   - First: `DupTest`
   - Last: `DupLast`
   - Email: `duplicate@test.com`
   - Phone: empty (intentionally different from Jane Doe's `+1-555-0102`)
5. Click **CREATE**

## Expected (per test SHIP-014)

- `totalCount` remains at 2 — server silently skips the duplicate
- Mutation `updateMemberAddresses` returns success with empty `errors[]` (no inserted item)
- No new row appears in the addresses list
- No error toast / blocking message

## Actual

- `totalCount` increments to 3
- Two addresses with **identical** `line1` (`456 Oak Avenue`), `line2` (`Apt 4B`), `city` (`New York`), `regionId` (`NY`), `postalCode` (`10001`), `countryCode` (`USA`), `name` (`USA, New York, New York, 456 Oak Avenue`) now coexist
- They differ only by `firstName/lastName/email/phone`

## Evidence

- `reports/regression/REG-2026-05-04-1527/010-evidence/SHIP-014-duplicate-inserted.png` — list showing both Jane Doe and DupTest DupLast at same address

## GraphQL Response Fragment (network request 119)

```json
"items": [
  { "id": "ef1bbeb4-...", "firstName": "mila", "line1": "Address 1", ... },
  { "id": "15045d21-...", "firstName": "Jane", "line1": "456 Oak Avenue", "line2": "Apt 4B", "city": "New York", "regionId": "NY", "postalCode": "10001", "countryCode": "USA" },
  { "id": "9e5ee724-...", "firstName": "DupTest", "line1": "456 Oak Avenue", "line2": "Apt 4B", "city": "New York", "regionId": "NY", "postalCode": "10001", "countryCode": "USA" }
]
```

## Impact

- Duplicate addresses clutter the user's address book
- Increased risk of selecting the wrong copy at checkout (different name/phone, same shipping endpoint)
- Inconsistent with the invariant documented in PR #129 / PROPOSED-BL-PROFILE-001

## Possible Root Cause

The server-side dedupe key likely includes `firstName/lastName/email` (or all fields) instead of only the location subset. The expected invariant compares only the address-location columns.

## Suggested Fix

- In `MemberAggregateRootBase.UpdateAddresses`, compare incoming addresses against existing items using location-only equality (line1, line2, city, regionId, postalCode, countryCode) and silently drop matches before persistence.
- Add a unit test asserting that `totalCount` stays constant when location-equal records are submitted with differing names/email/phone.

## Cross-Layer Verification

| Layer | Result |
|---|---|
| STOREFRONT | Duplicate row visible (confirmed) |
| GRAPHQL | `updateMemberAddresses` returned `errors[]` empty AND inserted the row (confirmed) |
| CONSOLE | No JS errors |

## References

- PROPOSED-BL-PROFILE-001 (silent-skip duplicate invariant)
- VCST-4710 PR #129 — `MemberAggregateRootBase.UpdateAddresses`
- TLC-2026-04-23-1700
