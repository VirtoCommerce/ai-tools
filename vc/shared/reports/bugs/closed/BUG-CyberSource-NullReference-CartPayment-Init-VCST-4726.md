# BUG: CyberSource Payment Fails with NullReferenceException During Cart Payment Initialization

**Severity:** High
**Component:** Payment — CyberSource module (vc-module-cyber-source v3.1001.0)
**Browser:** All (reproduced in Firefox 134)
**Environment:** QA storefront
**Date:** 2026-03-04
**Reported By:** QA Agent

## Steps to Reproduce

1. Navigate to QA storefront and sign in with a test user
2. Add any product to the cart
3. Proceed to checkout
4. Select **"Bank card (CyberSource)"** as payment method
5. Observe error notification

## Expected Result

CyberSource Flex Microform iframes load inside `#cardNumber-container` and `#securityCode-container`, allowing the user to enter card details and complete payment.

## Actual Result

- `AddOrUpdateCartPayment` GraphQL mutation **succeeds**
- `InitializeCartPayment` GraphQL mutation **FAILS** with error code `NULL_REFERENCE` (NullReferenceException)
- CyberSource Flex JS SDK never loads — card input containers remain empty (no iframes)
- User sees toast: *"Something went wrong. Please try again later."*
- Place Order button stays disabled (form validation detects missing card fields)

## Root Cause Analysis

Investigation of the source code ([VirtoCommerce/vc-module-cyber-source](https://github.com/VirtoCommerce/vc-module-cyber-source), dev branch) reveals:

### 1. Missing credential validation in `CyberSourcePaymentMethodOptions.ToDictionary()`

The `ToDictionary()` method passes `MerchantId`, `MerchantKeyId`, and `MerchantSecretKey` directly into the CyberSource SDK config dictionary **without null/empty checks**:

```csharp
_configurationDictionary.TryAdd("merchantID", MerchantId);           // null if not configured
_configurationDictionary.TryAdd("merchantsecretKey", MerchantSecretKey); // null
_configurationDictionary.TryAdd("merchantKeyId", MerchantKeyId);      // null
```

When `GenerateCaptureContext()` is called with null credentials, the CyberSource SDK throws `NullReferenceException`.

### 2. No `InitializePayment` override in `CyberSourcePaymentMethod.cs`

The payment method class does not override initialization — credentials are never validated before use.

### 3. Admin UI does not expose credential settings

The module's `ModuleConstants.cs` only defines 3 admin-visible settings: Sandbox mode, Payment mode, Card types. **Merchant credentials must be configured in `appsettings.json`** under `Payments:CyberSource` — there is no UI for this.

### 4. CyberSource Swagger endpoint broken

`/docs/VirtoCommerce.CyberSourcePayment/swagger.json` returns HTTP 500, suggesting module-level initialization problems.

## Evidence

### GraphQL Error Response (InitializeCartPayment)

```json
{
  "operationName": "InitializeCartPayment",
  "hasErrors": true,
  "errors": [
    {
      "message": "Error trying to resolve field 'initializeCartPayment'.",
      "path": ["initializeCartPayment"],
      "extensions": {
        "code": "NULL_REFERENCE",
        "codes": ["NULL_REFERENCE"]
      }
    }
  ]
}
```

### Network Errors During Checkout Flow

| # | Request | Status | Notes |
|---|---------|--------|-------|
| 1 | `POST /graphql` — `AddOrUpdateCartPayment` | 200 OK | Succeeds — sets CyberSource as payment |
| 2 | `POST /graphql` — `InitializeCartPayment` | 200 (with GraphQL error) | **FAILS** — `NULL_REFERENCE` in response body |
| 3 | `POST dc.services.visualstudio.com/v2/track` | `net::ERR_ABORTED` | Application Insights telemetry aborted |
| 4 | `POST region1.google-analytics.com/g/collect` (add_payment_info) | 204 | GA4 records `payment_type=CyberSourcePaymentMethod` |
| 5 | `GET /docs/VirtoCommerce.CyberSourcePayment/swagger.json` | 500 | Module Swagger endpoint broken |

**Key observation:** The GraphQL endpoint returns HTTP 200 but the response body contains the `NULL_REFERENCE` error — the failure is in the GraphQL resolver, not at the HTTP transport level. GA4 tracking fires `add_payment_info` with `payment_type=CyberSourcePaymentMethod` before the initialization error occurs.

### DOM Evidence

- `#cardNumber-container`: Empty `<div>` with class `cyber-source-input-wrap form-control` — should contain CyberSource Flex iframe
- `#securityCode-container`: Empty `<div>` with class `form-control cyber-source-input-wrap` — should contain CyberSource Flex iframe
- Zero CyberSource scripts loaded (no `flex.cybersource.com` or `testflex.cybersource.com` in DOM)
- Zero iframes on the page

### Screenshots (11)

| # | Description | File |
|---|-------------|------|
| 01 | QA storefront homepage | `screenshots/01-homepage.png` |
| 02 | Cart page with items | `screenshots/02-cart-page.png` |
| 03 | Payment methods dropdown | `screenshots/03-payment-methods-dropdown.png` |
| 04 | Error notification after selecting CyberSource | `screenshots/04-cybersource-error-notification.png` |
| 05 | Empty card number and security code containers | `screenshots/05-cybersource-empty-containers.png` |
| 06 | Partial form fill (cardholder + expiry work, card# + CVV empty) | `screenshots/06-partial-form-fill.png` |
| 07 | Admin: Payment methods list for B2B-store | `screenshots/07-admin-payment-methods-list.png` |
| 08 | Admin: CyberSource payment method details | `screenshots/08-cybersource-payment-method-details.png` |
| 09 | Admin: CyberSource store-level settings | `screenshots/09-cybersource-store-settings.png` |
| 10 | Admin: CyberSource global settings (no credentials) | `screenshots/10-cybersource-global-settings.png` |
| 11 | Final error state with CyberSource selected | `screenshots/11-cybersource-error-with-notification.png` |

- Evidence path: `tests/Sprint26-04/cybersource-investigation/`
- Network capture: `tests/Sprint26-04/cybersource-investigation/network-requests.txt`

## Impact

- **Payment blocker**: Users cannot complete checkout with CyberSource on QA
- **Revenue flow affected**: Checkout and payment processing (Critical Flow #7)
- **Scope**: All users selecting CyberSource payment method

## Recommended Fix

1. **Immediate (config):** Add valid CyberSource sandbox credentials to QA server `appsettings.json`:
   ```json
   "Payments": {
     "CyberSource": {
       "MerchantId": "...",
       "MerchantKeyId": "...",
       "MerchantSecretKey": "..."
     }
   }
   ```
2. **Code fix:** Add null validation in `ToDictionary()` or `Module.PostInitialize()` to throw a descriptive error when credentials are missing instead of `NullReferenceException`
3. **UX improvement:** Consider exposing credential fields in Admin UI or adding a health-check endpoint

## References

- JIRA: [VCST-4726](https://virtocommerce.atlassian.net/browse/VCST-4726)
- Module repo: [VirtoCommerce/vc-module-cyber-source](https://github.com/VirtoCommerce/vc-module-cyber-source)
- Cart support PR: [#7 VCST-3387](https://github.com/VirtoCommerce/vc-module-cyber-source/pull/7) (merged Dec 10, 2025)
- .NET10 update: [#8 VCST-4328](https://github.com/VirtoCommerce/vc-module-cyber-source/pull/8) (merged Feb 26, 2026)
