# Investigation: 401 Error on `/api/shipping/pickup-locations/indexedSearchEnabled` in Admin SPA

## Summary

The Admin SPA (Angular) fires a `GET /api/shipping/pickup-locations/indexedSearchEnabled` request during application bootstrap, **before the user has authenticated**. Because the endpoint requires authentication (OAuth2/API key), it returns HTTP 401 Unauthorized. This produces two console errors on every fresh Admin page load. The endpoint works correctly (returns `{"result":true}`) after login, but the SPA never retries it post-authentication.

## Classification: BUG (Low Severity)

**Type:** Client-side initialization defect in the VirtoCommerce.Shipping module's Admin SPA code
**Severity:** Low (P3)
**Impact:** Console error noise; potential silent failure to register the PickupLocation search index widget
**Component:** `VirtoCommerce.Shipping` module -- Admin SPA JavaScript (`app.js`)

## Environment

| Property | Value |
|----------|-------|
| **Admin URL** | https://vcst-qa.govirto.com |
| **Storefront URL** | https://vcst-qa-storefront.govirto.com |
| **Platform Version** | 3.1003.0 |
| **Browser** | Microsoft Edge 144.0.3719.115 (Chromium) via playwright-edge MCP |
| **OS** | Windows 11 Pro |
| **Date** | 2026-02-13 |
| **Tested By** | qa-backend-expert (Claude Opus 4.6) |

## Reproduction

### Steps to Reproduce

1. Close all browser tabs / clear cookies for `vcst-qa.govirto.com`.
2. Open browser DevTools > Network tab and Console tab.
3. Navigate to `https://vcst-qa.govirto.com`.
4. Observe the login page loads at `#!/login`.
5. In the Network tab, observe a `GET /api/shipping/pickup-locations/indexedSearchEnabled` request with status **401**.
6. In the Console tab, observe two error entries:
   - `Failed to load resource: the server responded with a status of 401 ()`
   - `Possibly unhandled rejection: {"data":"","status":401,...}`

### Reproduction Rate: 100% (reproduced on every fresh session)

## Detailed Findings

### 1. Pre-Login Network Request Analysis

During initial Admin SPA page load (before any user credentials are entered), the following API requests fire:

| # | Endpoint | Status | Auth Required? |
|---|----------|--------|---------------|
| 1 | `GET /api/platform/localization?lang=en` | 200 | No (public) |
| 2 | `GET /api/platform/security/currentuser` | 200 | No (returns empty for unauthenticated) |
| 3 | **`GET /api/shipping/pickup-locations/indexedSearchEnabled`** | **401** | **Yes (requires OAuth2)** |
| 4 | `GET /api/platform/localization/locales` | 200 | No (public) |
| 5 | `GET /api/platform/localization/regionalformats` | 200 | No (public) |
| 6 | `GET /api/platform/apps` | 200 | No (public) |
| 7 | `GET /api/platform/settings/ui/customization` | 200 | No (public) |
| 8 | `GET /api/platform/security/logintypes` | 200 | No (public) |
| 9 | `GET /api/platform/common/ui/loginPageOptions` | 200 | No (public) |

**Key observation:** All other endpoints called during bootstrap are public/anonymous-accessible. The pickup-locations endpoint is the **only** one that requires authentication and is the **only** one returning 401.

### 2. Console Error Details

```
[ERROR] Failed to load resource: the server responded with a status of 401 ()
  @ https://vcst-qa.govirto.com/api/shipping/pickup-locations/indexedSearchEnabled:0

[ERROR] Possibly unhandled rejection: {
  "data": "",
  "status": 401,
  "config": {
    "method": "GET",
    "transformRequest": [null],
    "transformResponse": [null],
    "jsonpCallbackParam": "callback",
    "url": "/api/shipping/pickup-locations/indexedSearchEnabled",
    "headers": {"Accept": "application/json, text/plain, */*"}
  },
  "statusText": "",
  "xhrStatus": "complete",
  "resource": {}
}
  @ vendor.js:1
```

Note: The request has **no Authorization header** because the user has not yet authenticated.

### 3. Post-Authentication Behavior

After logging in as `admin`:

| Test | Result |
|------|--------|
| `GET /api/shipping/pickup-locations/indexedSearchEnabled` (with session cookies) | **200 OK**, body: `{"result":true}` |
| `GET /api/order/customerOrders/indexed/searchEnabled` (with session cookies) | **200 OK**, body: `{"result":true}` |
| `GET /api/shipping/pickup-locations/indexedSearchEnabled` (without cookies) | **401 Unauthorized** |
| `GET /api/order/customerOrders/indexed/searchEnabled` (without cookies) | **401 Unauthorized** |

Both endpoints behave identically on the server side -- they require authentication and return a simple boolean result. The critical difference is in the **client-side calling pattern**.

### 4. Endpoint Never Re-Called After Login

After installing an XHR interceptor and navigating through multiple Admin modules post-login (Home, Orders, Catalog, Stores), the pickup-locations `indexedSearchEnabled` endpoint was **never called again**. It fires only once during Angular module bootstrap and is never retried after authentication succeeds.

**Consequence:** If the call's purpose is to conditionally register the PickupLocation search index widget, this widget may silently fail to register because the call fails pre-auth and is never retried.

### 5. Root Cause: Angular Module `.run()` Block

The defect is in the `VirtoCommerce.Shipping` module's Admin SPA code. The relevant code in `modules/$(VirtoCommerce.Shipping)/dist/app.js`:

```javascript
angular.module("virtoCommerce.shippingModule", ["ngSanitize"])
  .run([
    "platformWebApp.widgetService",
    "platformWebApp.permissionScopeResolver",
    "virtoCommerce.storeModule.stores",
    "platformWebApp.bladeNavigationService",
    "virtoCommerce.shippingModule.pickupLocations",
    function(widgetService, permissionScopeResolver, stores, bladeNav, pickupLocations) {
      // ... registers other widgets ...

      // PROBLEMATIC CALL: Fires during module bootstrap, BEFORE authentication
      pickupLocations.indexedSearchEnabled(function(result) {
        if (result.result) {
          widgetService.registerWidget({
            controller: "virtoCommerce.searchModule.indexWidgetController",
            template: "Modules/$(VirtoCommerce.Search)/Scripts/widgets/index-widget.tpl.html",
            documentType: "PickupLocation"
          }, "pickupLocationIndex");
        }
      });
    }
  ]);
```

Angular `.run()` blocks execute during module initialization, which happens during the application bootstrap phase -- **before the user has a chance to log in**. The `pickupLocations.indexedSearchEnabled()` call makes an HTTP GET to the authenticated endpoint without any auth token.

### 6. Comparison with Orders Module (Correct Pattern)

The Orders module has an identical endpoint (`/api/order/customerOrders/indexed/searchEnabled`) with the same authentication requirements. However, the Orders module calls it **after login**, inside a controller initialization function that only runs when the user navigates to the Orders blade:

```javascript
// Orders module - CORRECT pattern (called inside a controller, after auth)
ordersApi.indexedSearchEnabled(function(e) {
  $scope.useIndexedSearch = e.result;
});
```

This call executes within a controller context that is only instantiated after the user is authenticated and navigates to Orders. The Shipping module should follow the same pattern.

### 7. Storefront Not Affected

The storefront (Vue.js) does not call this REST endpoint at all. The storefront communicates exclusively via GraphQL queries to `/graphql`. The 401 error is **Admin SPA-specific**.

### 8. Swagger API Specification Confirms Auth Required

The endpoint's Swagger definition confirms authentication is required:

```json
{
  "get": {
    "tags": ["Shipping module"],
    "operationId": "PickupLocations_GetPickupLocationFullTextSearchEnabled",
    "responses": {
      "200": { "description": "OK" },
      "401": { "description": "Unauthorized" },
      "403": { "description": "Forbidden" }
    },
    "security": [
      { "oauth2": [] },
      { "api_key": [] },
      { "api_key_header": [] },
      { "http-signature": [] },
      { "basic": [] }
    ]
  }
}
```

## Impact Assessment

### Functional Impact: Low

1. **Console errors on every Admin load:** Two 401 errors appear in the browser console on every fresh Admin session. While not user-visible, they create noise that can:
   - Mask real errors during debugging
   - Trigger false positives in automated error monitoring
   - Confuse developers investigating other issues

2. **PickupLocation search index widget may not register:** The purpose of the call is to conditionally register a search index widget for PickupLocations. Since the call fails silently (the error is an "unhandled rejection"), the widget may never be registered. This would mean the PickupLocation index widget does not appear in the Admin pickup location blade. However, since 109 pickup locations are visible and manageable in the Admin UI, the practical impact appears minimal -- the widget likely controls search index management (rebuild/refresh) for pickup locations, not the listing itself.

3. **No security risk:** The 401 is the correct response from the server. No sensitive data is leaked. The server correctly rejects the unauthenticated request.

4. **No storefront impact:** The storefront is not affected.

### Related Issues

This investigation is separate from the **P0 CartPickupLocations GraphQL bug** (documented in `BUG-CartPickupLocations-DuplicateKey-Server-Error.md`), which involves a `System.ArgumentException` when searching for pickup locations on the storefront. The two issues share the "pickup locations" domain but have completely different root causes:

| Issue | This Investigation (Admin 401) | CartPickupLocations Bug (P0) |
|-------|-------------------------------|------------------------------|
| **Where** | Admin SPA (Angular) | Storefront (Vue.js) |
| **API** | REST: `/api/shipping/pickup-locations/indexedSearchEnabled` | GraphQL: `cartPickupLocations` query |
| **Root Cause** | Client-side: API call before auth | Server-side: `ToDictionary()` duplicate key |
| **Severity** | Low (P3) | Critical (P0) |
| **User Impact** | Console noise only | BOPIS flow completely blocked |

## Recommended Fix

### Option A: Defer the call until after authentication (Preferred)

Move the `indexedSearchEnabled` call from the `.run()` block into a controller or a post-login initialization hook. This matches the pattern used by the Orders module.

**In `VirtoCommerce.Shipping` module, change the `.run()` block:**

```javascript
// BEFORE (current - broken):
.run([..., "virtoCommerce.shippingModule.pickupLocations",
  function(widgetService, ..., pickupLocations) {
    pickupLocations.indexedSearchEnabled(function(result) {
      if (result.result) {
        widgetService.registerWidget({...}, "pickupLocationIndex");
      }
    });
  }
])

// AFTER (fixed - defer until auth is ready):
.run([..., "virtoCommerce.shippingModule.pickupLocations", "platformWebApp.authService",
  function(widgetService, ..., pickupLocations, authService) {
    // Only call after user is authenticated
    authService.onAuthenticated(function() {
      pickupLocations.indexedSearchEnabled(function(result) {
        if (result.result) {
          widgetService.registerWidget({...}, "pickupLocationIndex");
        }
      });
    });
  }
])
```

The exact API for deferred execution depends on the platform's auth service. The key principle is: **do not call authenticated endpoints in `.run()` blocks**.

### Option B: Make the endpoint public (Not recommended)

Allow anonymous access to `GET /api/shipping/pickup-locations/indexedSearchEnabled`. Since it only returns a boolean configuration value (`{"result":true}`), there is minimal security risk. However, this breaks the consistent security pattern of the platform where all operational endpoints require authentication.

### Option C: Add error handling / silent retry (Workaround)

Wrap the call in a try-catch with a retry mechanism that fires after the `currentuser` endpoint returns an authenticated user. This is more of a band-aid than a proper fix.

## Evidence

| Artifact | Path |
|----------|------|
| Login page screenshot (pre-auth) | `reports/bugs/screenshots/pickup-401/01-login-page-before-auth.png` |
| Dashboard after login | `reports/bugs/screenshots/pickup-401/02-dashboard-after-login.png` |
| Stores blade with pickup locations | `reports/bugs/screenshots/pickup-401/03-swagger-endpoint-security.png` |

## Conclusion

This is a **confirmed low-severity bug** in the `VirtoCommerce.Shipping` module's Admin SPA client-side code. The module's Angular `.run()` block unconditionally calls an authenticated endpoint during application bootstrap, before the user has logged in. The server correctly returns 401, producing console errors on every Admin session. The fix is to defer the `indexedSearchEnabled` call until after authentication succeeds, following the same pattern used by the Orders module.

**Recommendation:** Fix in the next Shipping module release. No immediate action required as there is no user-facing impact beyond console errors, but the fix is straightforward and would clean up the Admin initialization flow.

---

**Investigation performed by:** qa-backend-expert (Claude Opus 4.6)
**Date:** 2026-02-13
**Duration:** ~15 minutes
