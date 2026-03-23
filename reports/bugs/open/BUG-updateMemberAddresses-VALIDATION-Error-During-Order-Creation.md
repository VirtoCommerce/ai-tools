# BUG: `updateMemberAddresses` GraphQL VALIDATION Error During Order Creation with New Shipping Address

## Summary

When a user adds a new shipping address during the cart/checkout flow and clicks "Place Order", the `UpdateMemberAddresses` GraphQL mutation fails with a VALIDATION error. The order is still created successfully (the error is non-blocking), but the new address is **not saved** to the member's address book. This results in a confusing error toast ("Something went wrong. Please try again later.") shown to the user during an otherwise successful order placement.

## Severity: **High (P1)**

- Revenue flow affected (checkout)
- User-visible error message during order placement
- Data loss: new address not persisted to member profile
- Confusing UX: error shown but order actually succeeds

**Severity:** High
**Component:** Checkout / Address Management
**Browser:** Chromium 146.0.7680.154 (Playwright)
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1009.0
**Theme Version:** vc-theme-b2b-vue-2.44.0-pr-2212-9072-9072853e
**Module Versions:** Customer 3.1002.0, ProfileExperienceApi 3.1002.0, XCart 3.1003.0, Xapi 3.1005.0, Orders 3.1002.0
**USER_EMAIL:** .env (mutykovaelena@gmail.com — B2B org: Coffee shop)
**USER_PASSWORD:** .env
**Date:** 2026-03-23
**Reported By:** QA Agent

## Steps to Reproduce

1. Log in as a B2B organization user (mutykovaelena@gmail.com)
2. Add any product to cart (e.g., UNTUCKit eGift Card)
3. Navigate to `/cart`
4. In Shipping Details, click the edit (pencil) button next to Shipping Address
5. In the "Select address" dialog, click "Add new"
6. Fill in a valid US address:
   - First Name: Test
   - Last Name: QABug
   - Email: test.qabug@example.com
   - Phone: 555-123-4567
   - Country: United States of America
   - State: New York
   - City: New York
   - ZIP: 10001
   - Address: 123 Test Street
   - Apt: Suite 100
7. Click "Create" -- address is added to cart shipment (no error)
8. Select a delivery method (e.g., Fixed Rate Ground)
9. Select a payment method (e.g., Manual)
10. Click "Place Order"

## Expected Result

- Order is created successfully
- New address is saved to the member's address book for future use
- No error messages shown to the user
- The "Ship to" dropdown in the header includes the new address

## Actual Result

- Order IS created successfully (order CO260323-00011)
- **`UpdateMemberAddresses` mutation FAILS** with a VALIDATION error
- **Error toast displayed**: "Something went wrong. Please try again later."
- New address is **NOT saved** to the member's address book
- The "Ship to" header dropdown still only shows the old Bulgarian address
- Page navigates to `/checkout/completed` after ~8 seconds (delayed by the error)

## Root Cause Analysis

### Mutation Sequence During "Place Order"

The "Place Order" button triggers three GraphQL mutations in sequence:

| # | Mutation | Status | Timestamp |
|---|---------|--------|-----------|
| 1 | `AddOrUpdateCartPayment` | SUCCESS | 18:25:18.021Z |
| 2 | `UpdateMemberAddresses` | **FAILED (VALIDATION)** | 18:25:18.401Z |
| 3 | `CreateOrderFromCart` | SUCCESS | 18:25:26.296Z |

### `UpdateMemberAddresses` Error Response

```json
{
  "errors": [
    {
      "message": "Error trying to resolve field 'updateMemberAddresses'.",
      "locations": [{ "line": 2, "column": 3 }],
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

### `UpdateMemberAddresses` Request Variables

```json
{
  "command": {
    "memberId": "cfe0eaef-ad57-40e4-9276-522297345d37",
    "addresses": [
      {
        "name": "BGR, rgrgr, gregerwg",
        "firstName": "t",
        "lastName": "t",
        "line1": "gregerwg",
        "city": "rgrgr",
        "countryCode": "BGR",
        "countryName": "Bulgaria",
        "postalCode": "4543",
        "email": "t@fr.rr",
        "addressType": 3,
        "key": "3c0c21f8-9881-4a7c-b0ea-37ae906b5f57"
      },
      {
        "name": "USA, New York, New York, 123 Test Street",
        "firstName": "Test",
        "lastName": "QABug",
        "line1": "123 Test Street",
        "line2": "Suite 100",
        "city": "New York",
        "countryCode": "USA",
        "countryName": "United States of America",
        "regionId": "NY",
        "regionName": "New York",
        "postalCode": "10001",
        "phone": "555-123-4567",
        "email": "test.qabug@example.com",
        "addressType": 3,
        "outerId": null,
        "key": "e3e0be8e-895f-4295-a8ac-13f5af0bd911"
      }
    ]
  }
}
```

### Key Observations

1. **The `memberId` (`cfe0eaef-ad57-40e4-9276-522297345d37`) is the ORGANIZATION ID**, not the user's contact ID. This is a B2B user logged in under the "Coffee shop" organization. The mutation is attempting to update the organization's addresses, which may require different permissions or have different validation rules.

2. **The existing Bulgarian address has minimal/invalid data** (firstName: "t", lastName: "t", email: "t@fr.rr") -- this could be triggering the VALIDATION error when the system tries to validate ALL addresses in the array, not just the new one.

3. **The mutation sends ALL addresses** (both existing and new) in a single array to `updateMemberAddresses`, which is a "replace all" operation. If any address in the array fails validation, the entire operation fails.

4. **The `addressType: 3` (BillingAndShipping)** is used for both addresses -- this is the combined type.

5. **The error does not block order creation** -- `CreateOrderFromCart` proceeds despite the address save failure. This is a design decision (fire-and-forget for address book update) but results in poor UX.

### Source Code Analysis (vc-frontend)

**Call chain during "Place Order":**

1. `useCheckout.ts` → `createOrderFromCart()` calls `prepareOrderData()`
2. `prepareOrderData()` (line ~290) fires `saveNewAddresses()` with **`void`** (fire-and-forget, no `await`):
   ```typescript
   // Parallel saving of new addresses in account. Before cleaning shopping cart
   if (isAuthenticated.value) {
     void saveNewAddresses({
       shippingAddress: ...,
       billingAddress: ...,
     });
   }
   ```
3. `saveNewAddresses()` detects `isCorporateMember` → calls `addOrUpdateOrganizationAddresses(newAddresses)`
4. `useOrganizationAddresses.ts` → `addOrUpdateAddresses()` merges new address into existing addresses array, calls `updateAddresses()`
5. `updateAddresses()` sends **all addresses** (existing + new) to `updateMemberAddresses(organizationId, inputAddresses)`
6. The mutation uses the **organization ID** as `memberId` (correct for B2B)
7. The error is thrown but the `void` in step 2 means it becomes an **unhandled promise rejection**, which triggers the global error toast

**Key files:**
- `client-app/shared/checkout/composables/useCheckout.ts` — orchestrates the place order flow
- `client-app/shared/company/composables/useOrganizationAddresses.ts` — organization address CRUD
- `client-app/shared/account/composables/useUserAddresses.ts` — personal address CRUD
- `client-app/core/api/graphql/account/mutations/updateMemberAddresses/index.ts` — GraphQL mutation

### Likely Root Cause

**Two issues compound:**

1. **Backend VALIDATION error** — The `updateMemberAddresses` mutation fails when re-submitting ALL organization addresses. The existing Bulgarian address has minimal data (`firstName: "t"`, `email: "t@fr.rr"`, no phone, no region) which likely fails server-side validation when re-sent alongside the new address. The backend validates the entire address array, not just the delta.

2. **Frontend error handling gap** — `useCheckout.ts` fires `saveNewAddresses()` with `void` (fire-and-forget), but `useOrganizationAddresses.ts` re-throws the error (`throw e`). This unhandled rejection triggers the global error handler, showing a generic toast during an otherwise successful order placement.

**Contributing factors:**
- The mutation is a "replace all" operation — if ANY address in the array fails validation, the entire operation fails
- The `memberId` is the organization ID (correct for B2B), but organization-level address updates may have stricter validation or permission requirements
- Error is generic (`"Error trying to resolve field 'updateMemberAddresses'."`) — no specific field-level validation details returned

## Console Errors

```
ApolloError: Error trying to resolve field 'updateMemberAddresses'.
    at new t (vendor-GH7P-2sI.js:57:153)
    at vendor-GH7P-2sI.js:61:70911
    ...
```

## Network Summary

- All GraphQL requests returned HTTP 200 (no 4xx/5xx)
- The VALIDATION error is within the GraphQL response body (HTTP 200 with `errors[]`)
- No other network failures related to the checkout flow

## Impact

| Area | Impact |
|------|--------|
| **User Experience** | Confusing error toast during successful order placement |
| **Address Book** | New addresses created during checkout are lost/not saved |
| **Data Integrity** | The order has the correct shipping address, but the member profile does not |
| **Repeat Purchases** | User must re-enter the same address on next order |

## Evidence / Screenshots

| Screenshot | Description |
|------------|-------------|
| `cart-page-initial.png` | Cart page with product and existing Bulgarian address |
| `new-address-form.png` | Empty new address form dialog |
| `address-form-filled.png` | Filled address form before Create |
| `cart-after-address-create.png` | Cart after address creation (address applied to shipment) |
| `order-completed.png` | Order completed page (CO260323-00011) |

## Suggested Fix

### Backend (ProfileExperienceApi / Customer module)
1. **Return field-level validation details** — the generic `"Error trying to resolve field 'updateMemberAddresses'."` message makes debugging impossible. The backend should return which field(s) failed validation.
2. **Validate only the delta** — consider an `addMemberAddress` mutation that only adds the new address instead of replacing the entire array. This avoids re-validating existing (potentially legacy) data.
3. **Relax validation for existing addresses** — if the mutation must re-validate all addresses, skip validation for addresses that already exist unchanged in the database.

### Frontend (vc-frontend)
4. **Catch the error in `prepareOrderData()`** — wrap `saveNewAddresses()` in a try/catch so the error doesn't propagate to the global handler:
   ```typescript
   // In useCheckout.ts prepareOrderData()
   if (isAuthenticated.value) {
     void saveNewAddresses({...}).catch((e) => {
       Logger.warn("Failed to save address to member profile", e);
       // Optionally show a non-blocking info toast after order completes
     });
   }
   ```
5. **Save address at creation time** — call `addOrUpdateOrganizationAddresses` when the "Create" button is clicked in the address dialog, not at "Place Order" time. This provides immediate feedback if the save fails.

## References

- **Source files:**
  - `vc-frontend/client-app/shared/checkout/composables/useCheckout.ts` — `prepareOrderData()` fires `void saveNewAddresses()`
  - `vc-frontend/client-app/shared/company/composables/useOrganizationAddresses.ts` — `addOrUpdateAddresses()` / `updateAddresses()`
  - `vc-frontend/client-app/core/api/graphql/account/mutations/updateMemberAddresses/index.ts` — GraphQL mutation definition
- **xAPI docs:** `updateMemberAddresses` mutation requires `memberId` + full address array (replace-all semantics)
- **JIRA:** [VCST-4819](https://virtocommerce.atlassian.net/browse/VCST-4819)
- **Related:** [VCST-4802](https://virtocommerce.atlassian.net/browse/VCST-4802) (same root cause — Account > Addresses entry point), [VCST-4814](https://virtocommerce.atlassian.net/browse/VCST-4814) (Ship To header entry point), [VCST-4691](https://virtocommerce.atlassian.net/browse/VCST-4691) (PR #130 that introduced the validation)
