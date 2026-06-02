# BUG: Checkout Address Accepts XSS via addOrUpdateCartShipment (Stored XSS)

**Severity:** Critical
**Component:** Checkout / Cart Shipment Address
**Browser:** Firefox (playwright-firefox)
**Environment:** QA (`FRONT_URL`)
**USER_EMAIL:** .env
**USER_PASSWORD:** .env
**Date:** 2026-03-21
**Reported By:** QA Agent (automated regression — SYNC-2026-03-21-1600)

## Steps to Reproduce

1. Log in to the storefront as a registered user
2. Add any product to the cart
3. Proceed to checkout → Shipping step
4. Enter a new shipping address with XSS payload in the street address field:
   - Street: `<script>alert('xss')</script>`
   - City: `TestCity`
   - Fill remaining required fields normally
5. Submit the address / proceed to next checkout step
6. Observe that the address is accepted and stored with the XSS payload

**Alternative (API-level reproduction):**

```graphql
mutation {
  addOrUpdateCartShipment(command: {
    storeId: "B2B-store"
    cartId: "<cart-id>"
    shipment: {
      deliveryAddress: {
        line1: "<script>alert('xss')</script>"
        city: "TestCity"
        countryCode: "US"
        postalCode: "12345"
        firstName: "Test"
        lastName: "User"
      }
    }
  }) {
    id
  }
}
```

## Expected Result

The checkout address fields should reject HTML tags and script injection patterns, returning a validation error — consistent with the `InputValidationOptions` behavior applied to `updateMemberAddresses` in the profile module (PR #130).

## Actual Result

The `addOrUpdateCartShipment` mutation accepts and stores arbitrary HTML/XSS payloads in address fields (line1, line2, city). The `<script>` tag is persisted in the shipment address. This is a **Stored XSS** vulnerability — the payload appears in order confirmations, admin order views, and shipping labels.

## Evidence

- **Regression test:** SEC-XSS-001 (`XSS in Address Street`) — FAIL
- Console errors: None (mutation succeeds)
- Network errors: None — mutation returns 200 OK
- HAR file: Captured during regression run

## Root Cause Analysis

- **Source file:** `VirtoCommerce/vc-module-experience-api` → `src/XPurchase/PurchaseSchema.cs` (defines the `addOrUpdateCartShipment` mutation)
- **Suspected cause:** **Module boundary gap.** PR #130 added `InputValidationOptions` to `vc-module-profile-experience-api` (xProfile), which covers `updateMemberAddresses`. However, checkout addresses go through `vc-module-experience-api` (XPurchase), which is a **different module** with **no InputValidationOptions integration**.
  - `updateMemberAddresses` (xProfile) → `AddressValidator.cs` with `NoHtmlTags()` → **VALIDATES** ✓
  - `addOrUpdateCartShipment` (XPurchase) → No equivalent validator → **DOES NOT VALIDATE** ✗
- **Key distinction:** The `AddressValidator` in `vc-module-profile-experience-api` correctly rejects HTML in city, line1, line2, phone. But cart/checkout addresses are processed by `vc-module-experience-api`, which has no corresponding validation.
- **Recent changes:** PR #130 introduced validation in xProfile only. The XPurchase module was not updated.
- **App Insights:** No server-side errors (mutation succeeds — the problem is the **absence** of validation in the XPurchase module).

## Impact

- **Stored XSS** — malicious HTML/JavaScript persisted in order shipment addresses
- **Blast radius:**
  - Admin order detail pages rendering the shipping address
  - Order confirmation emails containing the shipping address
  - Shipping label generation / ERP integrations consuming the address
  - Any storefront page displaying order history with addresses
- **OWASP A03:2021 — Injection** / **A07:2021 — XSS**
- **Affected users:** All authenticated users who can place orders (checkout flow is a critical revenue path)

## Suggested Fix

Add `InputValidationOptions` integration to `vc-module-experience-api` (XPurchase module):

1. Register `InputValidationOptions` in the XPurchase module's DI container
2. Create an `AddressValidator` (or reuse from xProfile as a shared package) for cart shipment addresses
3. Apply `NoHtmlTags()` to `line1`, `line2`, `city`, `phone` fields in `addOrUpdateCartShipment`
4. Apply `NoScriptInjection()` to free-text address fields

This should be a follow-up PR to `VirtoCommerce/vc-module-experience-api`.

## References

- JIRA: [VCST-4804](https://virtocommerce.atlassian.net/browse/VCST-4804)
- PR #130 (xProfile only): https://github.com/VirtoCommerce/vc-module-profile-experience-api/pull/130
- Sync run: SYNC-2026-03-21-1600
- Related test cases: SEC-XSS-001, GQL-032 (passed — confirms xProfile validation works; gap is in XPurchase)
