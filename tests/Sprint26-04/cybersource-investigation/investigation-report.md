# CyberSource Payment Bug Investigation Report

**Date:** 2026-03-04
**Investigator:** qa-backend-expert
**Environment:** QA (https://vcst-qa-storefront.govirto.com)
**Platform Version:** 3.1007.0
**Storefront Version:** 2.43.0-pr-2200-cbd4-cbd47d7f
**CyberSource Module:** VirtoCommerce.CyberSourcePayment v3.1000.0
**Store:** B2B-store
**Test User:** mutykovaelena@gmail.com (ACME Store 3 / Elena Mutykova)

---

## Executive Summary

CyberSource payment method is **completely non-functional** on the QA storefront. Selecting "Bank card (CyberSource)" in the cart triggers a `NullReferenceException` on the backend during the `initializeCartPayment` GraphQL mutation. The CyberSource Flex Microform SDK never loads, leaving card number and security code fields empty. The root cause is a **NULL_REFERENCE error** in the backend CyberSource module, most likely due to missing API credentials (Merchant ID, API Key ID, Secret Key) in the server-side `appsettings.json`.

**Severity:** High (P0) -- payment method completely broken, blocks checkout via CyberSource.

---

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Sign in as test user (mutykovaelena@gmail.com)
3. Ensure cart has items (test cart: 3 items, $639.60 total)
4. On the cart page, select billing address (e.g., 220 W Congress St, Detroit, MI)
5. Open Payment method dropdown
6. Select "Bank card (CyberSource)"
7. **Result:** Error notification appears: "Something went wrong. Please try again later."

**Expected:** CyberSource Flex Microform iframes load in the Card number and Security code fields, allowing secure card entry.

**Actual:** Error notification appears. Card number field (`#cardNumber-container`) and Security code field (`#securityCode-container`) remain empty divs with no iframes injected. No CyberSource JavaScript (flex.cybersource.com or testflex.cybersource.com) is loaded.

---

## Root Cause Analysis

### The Failing GraphQL Call

When CyberSource is selected, the storefront makes two GraphQL mutations:

1. **`AddOrUpdateCartPayment`** -- SUCCEEDS (sets CyberSource as payment method on cart)
2. **`InitializeCartPayment`** -- FAILS with:

```json
{
  "message": "Error trying to resolve field 'initializeCartPayment'.",
  "path": ["initializeCartPayment"],
  "extensions": {
    "code": "NULL_REFERENCE",
    "codes": ["NULL_REFERENCE"]
  }
}
```

The `NULL_REFERENCE` error code indicates the backend CyberSource module throws a `NullReferenceException` during payment initialization. This is the point where the module should:
1. Call CyberSource's REST API to generate a Flex capture context (JWT token)
2. Return the capture context to the storefront
3. The storefront then uses the capture context to load the Flex Microform JS SDK
4. The SDK injects secure iframes into `#cardNumber-container` and `#securityCode-container`

Since step 1 fails with a null reference, steps 2-4 never happen.

### Missing API Credentials

Investigation of the Admin panel confirmed that the CyberSource module only exposes **3 settings** through the platform settings system:

| Setting | Value |
|---------|-------|
| `VirtoCommerce.Payment.CyberSourcePayment.CartTypes` | VISA, MASTERCARD, AMEX, DISCOVER, DINERSCLUB, JCB, CARTESBANCAIRES, MAESTRO, CUP |
| `VirtoCommerce.Payment.CyberSourcePayment.PaymentMode` | Single Message |
| `VirtoCommerce.Payment.CyberSourcePayment.Sandbox` | true (enabled) |

**No API credential fields** (Merchant ID, API Key ID, Secret Key, Shared Secret) are exposed in the Admin UI -- neither in the global Settings > Payment > CyberSource blade, nor in the per-store payment method settings. These credentials must be configured in the server-side `appsettings.json` file.

The `NullReferenceException` is consistent with the module attempting to read credentials that are null/missing from the configuration.

### Additional Finding: Swagger 500

The CyberSource module's Swagger endpoint (`/docs/VirtoCommerce.CyberSourcePayment/swagger.json`) returns HTTP 500, which may indicate the module has initialization problems beyond just missing credentials.

---

## Admin Configuration Verified

### Store-Level (B2B-store > Payment methods > CyberSource)
- **Is active:** ON (enabled)
- **Is partial payment available:** OFF
- **Apply status for terminated payment:** ON
- **Sandbox:** ON
- **Payment mode:** Single Message
- **Card types:** Configured (VISA, MASTERCARD, AMEX, etc.)

### Module Status (Admin > Modules)
- **Module ID:** VirtoCommerce.CyberSourcePayment
- **Version:** 3.1000.0
- **Status:** Installed (isInstalled: true)
- **Required Platform:** 3.1002.0 (compatible with current 3.1007.0)

---

## Impact Assessment

- **CyberSource payments are 100% blocked** on the QA storefront
- Other payment methods are unaffected (Manual, Authorize.Net, Datatrans, Skyflow, Pay with points all appear functional)
- The error is a backend/configuration issue, not a frontend bug
- The storefront correctly handles the error by showing a notification and disabling the Place Order button

---

## Recommended Actions

1. **Immediate:** Check the QA server's `appsettings.json` for CyberSource API credentials:
   ```json
   "Payments": {
     "CyberSource": {
       "MerchantId": "<merchant_id>",
       "ApiKeyId": "<api_key_id>",
       "SecretKey": "<secret_key>"
     }
   }
   ```
   If missing or empty, configure with valid CyberSource sandbox credentials.

2. **Investigate** why the CyberSource module's Swagger endpoint returns 500 -- this may indicate a deeper module initialization issue.

3. **After credentials are configured:** Verify by selecting CyberSource payment method in the cart -- the Flex Microform iframes should load in the Card number and Security code fields.

4. **Consider:** Adding credential validation on module startup -- the module should log a clear warning if API credentials are missing, rather than failing with a generic NullReferenceException at payment initialization time.

---

## Evidence

### Screenshots
| # | Description | File |
|---|-------------|------|
| 01 | QA storefront homepage | `screenshots/01-homepage.png` |
| 02 | Cart page with items | `screenshots/02-cart-page.png` |
| 03 | Payment methods dropdown | `screenshots/03-payment-methods-dropdown.png` |
| 04 | Error notification after selecting CyberSource | `screenshots/04-cybersource-error-notification.png` |
| 05 | Empty card number and security code containers | `screenshots/05-cybersource-empty-containers.png` |
| 06 | Partial form fill (cardholder + expiry work, card number + CVV empty) | `screenshots/06-partial-form-fill.png` |
| 07 | Admin: Payment methods list for B2B-store | `screenshots/07-admin-payment-methods-list.png` |
| 08 | Admin: CyberSource payment method details | `screenshots/08-cybersource-payment-method-details.png` |
| 09 | Admin: CyberSource store-level settings | `screenshots/09-cybersource-store-settings.png` |
| 10 | Admin: CyberSource global settings (no credentials) | `screenshots/10-cybersource-global-settings.png` |
| 11 | Final error state with CyberSource selected | `screenshots/11-cybersource-error-with-notification.png` |

### Network Capture
- `network-requests.txt` -- Full network requests during CyberSource selection flow

### Key GraphQL Error Response
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

### DOM Evidence
- `#cardNumber-container`: Empty `<div>` with class `cyber-source-input-wrap form-control` -- should contain CyberSource Flex iframe
- `#securityCode-container`: Empty `<div>` with class `form-control cyber-source-input-wrap` -- should contain CyberSource Flex iframe
- Zero CyberSource scripts loaded (no flex.cybersource.com or testflex.cybersource.com in DOM)
- Zero iframes on the page

---

## Classification

| Dimension | Value |
|-----------|-------|
| **Category** | API Contract / Module Configuration |
| **Severity** | High (P0) -- payment method completely broken |
| **Component** | VirtoCommerce.CyberSourcePayment v3.1000.0 |
| **Root Cause** | NullReferenceException in initializeCartPayment -- likely missing API credentials in appsettings.json |
| **Reproducibility** | 100% -- fails every time CyberSource is selected |
| **Workaround** | Use alternative payment methods (Manual, Authorize.Net, Skyflow, Datatrans) |
