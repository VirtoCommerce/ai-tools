# BUG-010-002: Address form accepts invalid ZIP and phone formats without validation

**Suite:** 010 — B2C Bulk Ship Dashboard  
**Test Case:** B2C-SHIP-009 (FAIL)  
**Severity:** High  
**Priority:** P1  
**Type:** Functional — input validation  
**Discovered:** 2026-05-05 during run REG-2026-05-04-1527  
**Browser:** Edge (Chromium 138 via playwright-edge MCP)  
**Environment:** vcst-qa-storefront.govirto.com  
**Account:** milamuller2024@yahoo.com (personal account, no org)

## Summary

The `/account/addresses` "New address" form accepts and successfully saves addresses with **invalid ZIP codes** (e.g. `999`, only 3 digits) and **invalid phone numbers** (e.g. `123`, only 3 digits). No client-side validation error is shown for these formats, the CREATE button enables, and the address is persisted to the backend.

This violates the SHIP-009 expected validation: "ZIP code validated: 5 or 9 digits for US" and "Phone number validated: 10 digits".

## Steps to Reproduce

1. Sign in as personal account (`milamuller2024@yahoo.com / Password2!`)
2. Navigate to `/account/addresses`
3. Click **ADD NEW ADDRESS**
4. Fill the form:
   - First name: `Test`
   - Last name: `User`
   - Email: `test@example.com`
   - Phone: `123` (only 3 digits — invalid)
   - Country: `United States of America`
   - ZIP: `999` (only 3 digits — invalid)
   - State: `California`
   - City: `TestCity`
   - Address: `123 Test St`
5. Click **CREATE**

## Expected

- Inline validation error on Phone: "Phone must be 10 digits" (or similar)
- Inline validation error on ZIP: "Invalid ZIP code" / "ZIP must be 5 or 9 digits"
- CREATE button disabled while invalid fields are present
- Form NOT submitted until both fields are valid

## Actual

- No inline error message for ZIP or phone
- Only required-field error shown when State left empty
- Once State is selected, CREATE button **enables** even with `999` ZIP and `123` phone
- Submit succeeds — address persisted as: `Test User | USA California TestCity 123 Test St 999 | phone: 123`
- The invalid record is now visible in the addresses list

## Evidence

- `reports/regression/REG-2026-05-04-1527/010-evidence/SHIP-009-bug-invalid-zip-phone-saved.png` — list showing "Test User" address with ZIP=999, Phone=123

## Impact

- Allows bad data into customer profiles → carrier / shipping label generation likely fails downstream
- No formatting hints visible to user (per assertion: "Formatting hints shown (e.g., ZIP: 12345 or 12345-6789)" — none present)
- Inconsistent with `BL-B2C-003` and standard e-commerce form-validation expectations
- Potential downstream cost: invalid phone numbers cannot be reached for delivery, invalid ZIPs likely fail rate-quote lookup

## Suggested Fix

- Add real-time validation:
  - US ZIP: `^\d{5}(-\d{4})?$`
  - Phone: 10-digit minimum (NANPA pattern), allow common separators
- Disable CREATE button while either field is invalid
- Show inline error text under each field (consistent with the existing State "This field is required" style)
- Also enforce server-side via `MemberAddressValidator` (currently appears to accept these per successful mutation response)

## Cross-Layer Verification

| Layer | Result |
|---|---|
| STOREFRONT | Form accepts and submits invalid input (confirmed) |
| GRAPHQL | `updateMemberAddresses` returned 200, address saved (no errors[] for invalid format) |
| CONSOLE | No JS errors |

## References

- BL-B2C-003 (address management)
- VCST-4575 (Ship To suite root)
- ECL-5.1 (input validation)
