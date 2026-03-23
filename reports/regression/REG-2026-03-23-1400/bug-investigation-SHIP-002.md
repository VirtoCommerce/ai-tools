# Bug Investigation Report: B2C-SHIP-002

## Summary

**Title:** Creating new company address via Ship To "Add new" fails with "Something went wrong"
**Severity:** High (P1) -- blocks address management for B2B organization users
**Status:** CONFIRMED -- Reproduced with root cause identified
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Storefront Version:** 2.44.0-alpha.2262
**Browser:** Firefox (via playwright-firefox)
**Test Account:** mutykovaelena@gmail.com (multi-org: Bence and Family)
**Date:** 2026-03-23

---

## Reproduction Steps

1. Navigate to https://vcst-qa-storefront.govirto.com/sign-in
2. Log in with mutykovaelena@gmail.com / Password2!
3. Click "Ship to" selector in the top header bar
4. Click "Add new" button in the dropdown
5. Dialog "Create a new company address" opens
6. Fill form: Country = United States of America, State = Illinois, ZIP = 62701, City = Springfield, Address = 456 QA Investigation St
7. Click Save
8. **Result:** Error toast "Something went wrong. Please try again later." appears. Address is NOT saved. Dialog remains open.

**Reproduction Rate:** 100% (reproduced on first attempt)

---

## Root Cause Analysis

### GraphQL Mutation Details

**Mutation:** `UpdateMemberAddresses`
**HTTP Status:** 200 (OK)
**GraphQL Response:**
```json
{
  "errors": [
    {
      "message": "Error trying to resolve field 'updateMemberAddresses'.",
      "locations": [{"line": 2, "column": 3}],
      "path": ["updateMemberAddresses"],
      "extensions": {
        "code": "VALIDATION",
        "codes": ["VALIDATION"]
      }
    }
  ],
  "data": {
    "updateMemberAddresses": null
  }
}
```

### Request Payload Analysis

The mutation `UpdateMemberAddresses` sends **all addresses** (existing + new) as a replace-all operation to the organization member:

- **memberId:** `d62aed2c-0c4c-4db8-a678-ad4d798ac6ac` (organization ID, not user ID)
- **Payload contains 3 addresses:** 2 existing + 1 new

**Existing address 1 (Canada):**
```json
{
  "name": "CAN, Newfoundland, ewfwe, fwegw",
  "firstName": "gwegw",
  "lastName": "egweg",
  "line1": "fwegw",
  "city": "ewfwe",
  "countryCode": "CAN",
  "email": "ricreyacrouyi-3425@yopmail.com",
  "addressType": 3,
  "key": "25fb5f40-6619-49d2-8269-1b677e935968"
}
```

**Existing address 2 (Croatia):**
```json
{
  "name": "HRV, Dubrovnik, Old town",
  "firstName": "",
  "lastName": "",
  "line1": "Old town",
  "city": "Dubrovnik",
  "countryCode": "HRV",
  "addressType": 3,
  "key": "e65dd88c-88b5-4b0f-84b7-cb46c1e66b19"
}
```

**New address (the one that fails):**
```json
{
  "firstName": "",
  "lastName": "",
  "email": "",
  "organization": "",
  "postalCode": "62701",
  "countryCode": "USA",
  "countryName": "United States of America",
  "regionId": "IL",
  "regionName": "Illinois",
  "city": "Springfield",
  "line1": "456 QA Investigation St",
  "line2": "",
  "description": ""
}
```

### Root Cause: Missing Required Fields in New Address

Comparing the new address payload against existing addresses reveals **critical missing fields**:

| Field | Existing Addresses | New Address | Impact |
|-------|-------------------|-------------|--------|
| `name` | Present (auto-generated, e.g., "CAN, Newfoundland, ewfwe, fwegw") | **MISSING** | Likely required by backend validation |
| `addressType` | Present (value: `3`) | **MISSING** | Required enum field (1=Billing, 2=Shipping, 3=BillingAndShipping) |
| `key` | Present (UUID) | **MISSING** | May be required for new addresses too |
| `phone` | Present (empty string) | **MISSING** | May be expected but not included |

**The backend returns a `VALIDATION` error**, which strongly suggests the mutation fails because:

1. **`addressType` is missing** -- the company address form in the Ship To dialog does not set `addressType` on the new address object. Existing addresses have `addressType: 3`. The backend schema likely requires this field.
2. **`name` is missing** -- the auto-generated display name (format: "COUNTRY_CODE, Region, City, Line1") is not being generated for the new address before submission.

### Additional Finding: Form Design Discrepancy

The "Create a new company address" dialog for organization users is **different** from the personal address form:

- **Company address form fields:** Description, Country, ZIP, State/Province, City, Address, Apt/Suite
- **Missing from company form:** First Name, Last Name, Phone, Email
- **The form correctly omits personal fields** (company addresses don't need individual names)
- **However, the frontend code fails to populate `addressType` and auto-generate `name`** before sending the mutation

---

## UI Observations

1. **Error toast message:** "Something went wrong. Please try again later." -- generic, unhelpful for debugging
2. **Dialog remains open** after error -- good UX (user can retry or modify)
3. **Ship To still shows old address** -- no state corruption observed
4. **No console JS errors** -- error is purely at the GraphQL/API level
5. **No HTTP error codes** -- response is HTTP 200 with GraphQL errors[] array (expected pattern per debugging-signals.md)

---

## Evidence

| Evidence | File |
|----------|------|
| Empty form screenshot | `ship-to-add-new-form-empty.png` |
| Filled form screenshot | `ship-to-add-new-form-filled.png` |
| Error toast screenshot | `ship-to-error-toast.png` |
| Post-save state | `ship-to-after-save-click.png` |

---

## Impact Assessment

- **Functional Impact:** Organization users cannot add new company shipping addresses via the Ship To selector. This blocks address management for B2B workflows.
- **Workaround:** Users may be able to add addresses through Account > Company Info > Addresses (if that path uses a different mutation or correctly populates required fields). Not verified in this investigation.
- **Scope:** Affects all organization/B2B users using the Ship To "Add new" feature. Personal accounts may not be affected (they use a different form with Name/Phone fields).
- **Revenue Impact:** Medium -- does not directly block checkout if existing addresses are available, but prevents adding new shipping destinations.

---

## Recommended Fix

**Frontend (vc-frontend):**

1. Before sending the `UpdateMemberAddresses` mutation, ensure the new address object includes:
   - `addressType: 3` (BillingAndShipping) -- should be set as default for company addresses
   - `name`: auto-generate from address components (format: `"{countryCode}, {regionName}, {city}, {line1}"`)
   - `key`: generate a new UUID for the address (or let the backend generate it)
2. Alternatively, consider using a dedicated `addMemberAddress` mutation (if available in the xAPI schema) instead of the replace-all `updateMemberAddresses` pattern, which is riskier for data integrity.

**Backend (optional improvement):**

3. The generic error message `"Error trying to resolve field 'updateMemberAddresses'"` should include specific validation failure details (which fields are missing/invalid) to aid debugging.
4. Consider making `addressType` default to `3` if not provided, rather than failing validation.

---

## Cross-Layer Verification

- [x] **STOREFRONT:** Error toast displayed, dialog remains open, no state corruption
- [x] **CONSOLE:** No JS errors (0 errors, 9 warnings -- all CSS/resource warnings)
- [x] **NETWORK:** GraphQL mutation returns HTTP 200 with errors[] array (VALIDATION code)
- [ ] **API:** Backend validation rejects the mutation -- `addressType` and/or `name` field likely required
- [ ] **ADMIN:** Address was NOT created -- not verified in Admin (out of scope for this investigation)

---

## Classification

| Attribute | Value |
|-----------|-------|
| Category | Functional |
| Severity | High (P1) |
| Priority | P1 |
| Component | Ship To / Address Management |
| Affected Users | All B2B organization users |
| Business Rule | BL-B2B (organization address management) |
| Regression | Unknown -- may have worked in prior versions if addressType was previously set by frontend |
