# Skyflow Payment Failure -- GraphQL `authorizePayment` NOT_IMPLEMENTED Error

**Date:** 2026-02-23
**Environment:** QA
**Frontend:** https://vcst-qa-storefront.govirto.com (v2.42.0-alpha.2241)
**Backend:** https://vcst-qa.govirto.com
**Browser:** Microsoft Edge 145.0.3800.70 (Chromium 145.0.7632.110)
**Severity:** Critical / P0 -- Payment flow completely blocked
**Payment Method:** Bank card (Skyflow)

---

## Summary

When attempting to pay with Skyflow using a saved card, the `AuthorizePayment` GraphQL mutation returns an `errors[]` array with code `NOT_IMPLEMENTED`. The user sees a generic "Something went wrong. Please try again later." toast notification. The payment cannot be completed.

---

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Log in with test user credentials
3. Add any product to cart (e.g., UNTUCKit eGift Card)
4. Go to Cart page
5. Set shipping address (pre-filled: Andrassy 223, Budapest)
6. Select delivery method: Fixed Rate (Ground)
7. Select payment method: Bank card (Skyflow)
8. Click "Place order"
9. Page redirects to `/checkout/payment` (Skyflow payment step)
10. From "Saved cards" dropdown, select a saved card (e.g., .... 0015 (09/27))
11. Enter Security code (CVV): 900
12. Click "Pay now"
13. **RESULT:** Error toast "Something went wrong. Please try again later." appears. Payment fails.

---

## GraphQL Request/Response Flow

### Request 1: InitializePayment (SUCCESS)

This mutation succeeds and returns Skyflow vault credentials for the card form.

**Mutation:**
```graphql
mutation InitializePayment($command: InputInitializePaymentType!) {
  initializePayment(command: $command) {
    isSuccess
    errorMessage
    actionHtmlForm
    actionRedirectUrl
    paymentActionType
    publicParameters {
      key
      value
      __typename
    }
    __typename
  }
}
```

**Variables:**
```json
{
  "command": {
    "orderId": "b7e04973-d417-48a7-b163-9abcfea43a3a",
    "paymentId": "1f4986ae-106a-4053-929f-1a91fd675b98"
  }
}
```

**Response (HTTP 200):**
```json
{
  "data": {
    "initializePayment": {
      "isSuccess": true,
      "errorMessage": null,
      "actionHtmlForm": null,
      "actionRedirectUrl": null,
      "paymentActionType": "PreparedForm",
      "publicParameters": [
        {
          "key": "accessToken",
          "value": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...[REDACTED]",
          "__typename": "KeyValueType"
        },
        {
          "key": "vaultID",
          "value": "c1aeec61ad7c46c2b724f004a7658b2f",
          "__typename": "KeyValueType"
        },
        {
          "key": "vaultURL",
          "value": "https://ebfc9bee4242.vault.skyflowapis.com",
          "__typename": "KeyValueType"
        },
        {
          "key": "tableName",
          "value": "credit_cards",
          "__typename": "KeyValueType"
        }
      ],
      "__typename": "InitializePaymentResultType"
    }
  }
}
```

**Analysis:** InitializePayment works correctly. It returns a Skyflow access token and vault configuration.

---

### Skyflow Vault CVV Update (SUCCESS)

After the user enters the CVV for the saved card, the storefront sends a PUT request to the Skyflow vault to update the CVV for the saved card record.

```
[PUT] https://ebfc9bee4242.vault.skyflowapis.com/v1/vaults/c1aeec61ad7c46c2b724f004a7658b2f/credit_cards/96242f9e-9eea-4fae-ad9e-7b9587e81f01 => [200]
```

**Analysis:** The CVV update to Skyflow's vault succeeds (HTTP 200).

---

### Request 2: AuthorizePayment (FAILURE -- THE BUG)

This is the mutation that fails with `NOT_IMPLEMENTED`.

**Mutation:**
```graphql
mutation AuthorizePayment($command: InputAuthorizePaymentType!) {
  authorizePayment(command: $command) {
    isSuccess
    errorMessage
    __typename
  }
}
```

**Variables:**
```json
{
  "command": {
    "orderId": "b7e04973-d417-48a7-b163-9abcfea43a3a",
    "paymentId": "1f4986ae-106a-4053-929f-1a91fd675b98",
    "parameters": [
      {
        "key": "skyflow_id",
        "value": "96242f9e-9eea-4fae-ad9e-7b9587e81f01"
      }
    ]
  }
}
```

**Complete Response Body (HTTP 200):**
```json
{
  "errors": [
    {
      "message": "Error trying to resolve field 'authorizePayment'.",
      "locations": [
        {
          "line": 2,
          "column": 3
        }
      ],
      "path": [
        "authorizePayment"
      ],
      "extensions": {
        "code": "NOT_IMPLEMENTED",
        "codes": [
          "NOT_IMPLEMENTED"
        ]
      }
    }
  ],
  "data": {
    "authorizePayment": null
  }
}
```

**HTTP Status Code:** 200 (GraphQL errors are returned within a 200 response per GraphQL spec)

**Response Headers:**
```
alt-svc: h3=":443"; ma=86400
cf-cache-status: DYNAMIC
cf-ray: 9d28cadf1f725a86-VIE
content-security-policy: object-src 'none'; form-action 'self'; frame-ancestors localhost:8080 vcst-qa.govirto.com
content-type: application/graphql-response+json; charset=utf-8
cross-origin-embedder-policy: unsafe-none
cross-origin-opener-policy: unsafe-none
cross-origin-resource-policy: cross-origin
date: Mon, 23 Feb 2026 18:30:06 GMT
referrer-policy: strict-origin-when-cross-origin
request-context: appId=cid-v1:7d07a5e2-1346-45b8-8b3c-2117c72a3f7b
server: cloudflare
strict-transport-security: max-age=31536000; includeSubDomains
x-content-type-options: nosniff
x-frame-options: ALLOW-FROM localhost:8080 vcst-qa.govirto.com
x-response-time: 0.807
```

---

## Error Analysis

### What the error means

The `NOT_IMPLEMENTED` error code indicates that the `authorizePayment` GraphQL mutation **exists in the schema** but the **resolver function has no implementation** (or throws a `NotImplementedException`). This is a server-side issue in the xAPI layer.

### Root Cause Hypothesis

The `authorizePayment` mutation is defined in the GraphQL schema (likely in the `XOrder` or `XCart` xAPI module), but the corresponding resolver does not have a concrete implementation for the Skyflow payment method. Possible causes:

1. **Missing payment method handler:** The `SkyflowPaymentMethod` class may not implement the `AuthorizePaymentAsync` method, or the method throws `NotImplementedException`.

2. **xAPI module version mismatch:** The Skyflow payment module may have been updated to use a newer xAPI pattern (e.g., `authorizePayment` mutation) that the currently deployed xAPI version does not support.

3. **Module registration issue:** The Skyflow payment module's GraphQL mutation resolver may not be properly registered in the dependency injection container.

4. **Edge/Alpha version regression:** Since the QA environment runs Edge/Alpha versions (v2.42.0-alpha.2241), this could be a regression introduced in a recent alpha build.

### Key Observations

- The `initializePayment` mutation works correctly, returning Skyflow vault credentials.
- The Skyflow vault CVV update (PUT to skyflowapis.com) succeeds with HTTP 200.
- The failure is specifically in the backend `authorizePayment` resolver, not in Skyflow's API.
- The error is `NOT_IMPLEMENTED`, not a Skyflow API error or network issue.
- The storefront fires the mutation twice (duplicate detected in interceptor) -- this may be a separate minor bug (double-fire on click).

### Duplicate Request Note

The interceptor captured 2 identical `InitializePayment` requests and 2 identical `AuthorizePayment` requests. Both pairs have identical timestamps, suggesting a potential race condition or double-trigger in the storefront code. The `InitializePayment` pair was sent at `2026-02-23T18:28:53.749Z` and the `AuthorizePayment` pair at `2026-02-23T18:30:06.728Z`.

---

## Timeline of Events

| Time (UTC) | Event | Status |
|------------|-------|--------|
| 18:28:53 | `InitializePayment` mutation sent | 200 OK -- Success |
| 18:28:54 | Skyflow vault credentials received | accessToken + vaultID returned |
| 18:29:xx | User enters CVV (900) in Skyflow iframe | -- |
| 18:30:06 | User clicks "Pay now" | -- |
| 18:30:06 | Skyflow vault PUT (update CVV for saved card) | 200 OK |
| 18:30:06 | `AuthorizePayment` mutation sent | -- |
| 18:30:07 | `AuthorizePayment` response received | **FAILED: NOT_IMPLEMENTED** |
| 18:30:07 | Error toast displayed | "Something went wrong. Please try again later." |

---

## Impact

- **Critical:** Users cannot complete payment via Skyflow on the QA environment.
- All Skyflow payments (saved card and presumably new card) are blocked.
- The `authorizePayment` GraphQL resolver is non-functional.
- This blocks Skyflow payment regression testing entirely.

---

## Environment Details

- **Frontend Version:** 2.42.0-alpha.2241
- **Backend:** vcst-qa.govirto.com (behind Cloudflare, CF-RAY: 9d28cadf1f725a86-VIE)
- **Skyflow SDK:** v2.7.3 (iframe from js.skyflow.com/v2.7.3/elements/index.html)
- **Skyflow Vault:** ebfc9bee4242.vault.skyflowapis.com (vault ID: c1aeec61ad7c46c2b724f004a7658b2f)
- **Order ID:** b7e04973-d417-48a7-b163-9abcfea43a3a
- **Payment ID:** 1f4986ae-106a-4053-929f-1a91fd675b98
- **Saved Card Skyflow ID:** 96242f9e-9eea-4fae-ad9e-7b9587e81f01

---

## Screenshots

| Screenshot | Description |
|-----------|-------------|
| `screenshots/skyflow-cart-before-pay.png` | Cart page with Skyflow selected, before clicking Place order |
| `screenshots/skyflow-payment-page.png` | Payment page after order creation (step 1/2) |
| `screenshots/skyflow-card-form.png` | Skyflow card form (Add new card option) |
| `screenshots/skyflow-cvv-entered.png` | Saved card selected with CVV entered |
| `screenshots/skyflow-payment-error.png` | "Something went wrong" error toast after clicking Pay now |

---

## Suggested Investigation

1. Check the `authorizePayment` resolver implementation in the XOrder or payment xAPI module.
2. Check if the Skyflow payment module implements the `IPaymentMethod.AuthorizePaymentAsync()` interface.
3. Review recent alpha deployments to vcst-qa for changes to the xAPI or Skyflow payment module.
4. Check application logs on the backend for the full .NET stack trace at the time of the error (2026-02-23 18:30:06-07 UTC).
5. Verify module compatibility between the deployed Skyflow payment module version and the xAPI/XOrder module version.

---

## Workaround

None available. Skyflow payment is completely non-functional. Users should use an alternative payment method (Authorize.Net, CyberSource, Datatrans, or Manual) until this is resolved.
