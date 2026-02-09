# BUG: FCM ServiceWorker Registration Fails with 404 - Version Mismatch (v1.5 vs v1.6)

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-SW-404-001 |
| **Date Reported** | 2026-02-09 |
| **Reported By** | qa-frontend-expert |
| **Environment** | QA Storefront |
| **Storefront URL** | https://vcst-qa-storefront.govirto.com |
| **Storefront Version** | v2.41.0-alpha.2219 (footer: Ver. 2.41.0-pr-2173-7738-7738784d) |
| **Store** | B2B-store |
| **Browser** | Google Chrome (Chromium 144, via Playwright MCP) |
| **OS** | Windows |
| **Repository** | https://github.com/VirtoCommerce/vc-frontend |

---

## Summary

The Firebase Cloud Messaging (FCM) ServiceWorker registration fails on every page load for authenticated users because the JavaScript bundle references a non-existent file `/fcm-service-worker-v1.5.js` (returns 404), while the server has the updated file at `/fcm-service-worker-v1.6.js` (returns 200). This is a **version mismatch** in the source code: the service worker file was renamed from v1.5 to v1.6 but the corresponding constant in `constants/index.ts` was not updated.

---

## Severity Assessment

| Aspect | Rating | Justification |
|--------|--------|---------------|
| **Severity** | **Medium (P3)** | Push notifications are completely non-functional, but the storefront operates normally otherwise. No crash, no data loss, no checkout impact. |
| **Priority** | **Medium** | Should be fixed before next release. Simple one-line fix. |
| **User Impact** | Low | Users do not receive browser push notifications. Most B2B users may not have enabled push notifications. The error is invisible to users (console only). |
| **Developer Impact** | Medium | Generates 2 console errors on every page load for every authenticated user. Pollutes error monitoring/logging. Masks real errors. |

---

## Root Cause

**Version mismatch between the service worker file and the registration constant.**

The service worker file was updated and renamed:
- **Old file (deleted):** `client-app/public/fcm-service-worker-v1.5.js`
- **New file (deployed):** `client-app/public/fcm-service-worker-v1.6.js`

But the constant that references it was **NOT updated**:
- **File:** `client-app/modules/push-messages/constants/index.ts`
- **Line:** `export const SERVICE_WORKER_PATH = "/fcm-service-worker-v1.5.js";`
- **Should be:** `export const SERVICE_WORKER_PATH = "/fcm-service-worker-v1.6.js";`

The service worker file itself contains a comment warning about exactly this scenario:
```javascript
// NOTE: When updating the service worker, make sure to update the version
// in the service worker module constants "client-app/modules/push-messages/constants/index.ts"
```

---

## Preconditions

- User must be **signed in** (authenticated) to the storefront
- The push notifications module only initializes for authenticated users
- Browser must support ServiceWorker API (all modern browsers do)

---

## Steps to Reproduce

| Step | Action | Expected Result | Actual Result | Status |
|------|--------|-----------------|---------------|--------|
| 1 | Open browser DevTools Console tab | Console is empty/ready | As expected | PASS |
| 2 | Navigate to `https://vcst-qa-storefront.govirto.com` | Homepage loads | Homepage loads correctly | PASS |
| 3 | Sign in with valid credentials | User is authenticated, homepage reloads | As expected | PASS |
| 4 | Check browser console for errors | No errors | **Two errors appear** (see below) | **FAIL** |
| 5 | Navigate to any other page (e.g., catalog, account/dashboard) | No console errors | Same failed resource error appears | **FAIL** |
| 6 | Navigate to `https://vcst-qa-storefront.govirto.com/fcm-service-worker-v1.5.js` directly | JavaScript file content | **nginx 404 Not Found** page | **FAIL** |
| 7 | Navigate to `https://vcst-qa-storefront.govirto.com/fcm-service-worker-v1.6.js` directly | JavaScript file content | **Valid JS file** (5,898 bytes, Firebase v12.8.0) | PASS |

---

## Console Error Messages

### Error 1 (Primary)
```
Failed to register a ServiceWorker for scope ('https://vcst-qa-storefront.govirto.com/firebase-cloud-messaging-push-scope') with script ('https://vcst-qa-storefront.govirto.com/fcm-service-worker-v1.5.js'): A bad HTTP response code (404) was received when fetching the script.
```

### Error 2 (Resource)
```
A bad HTTP response code (404) was received when fetching the script.
```

---

## Guest vs Authenticated User Comparison

| User State | Console Errors | SW Registration Attempted | Push Notifications |
|------------|---------------|---------------------------|-------------------|
| **Guest (not signed in)** | 0 errors | No | N/A |
| **Authenticated user** | 2 errors on every page load | Yes (fails with 404) | Broken |

---

## File Availability on Server

| File Path | HTTP Status | Content-Type | Size |
|-----------|-------------|--------------|------|
| `/fcm-service-worker-v1.5.js` | **404 Not Found** | text/html (nginx error page) | N/A |
| `/fcm-service-worker-v1.6.js` | **200 OK** | application/javascript | 5,898 bytes |
| `/sw.js` | 404 | text/html | N/A |
| `/service-worker.js` | 404 | text/html | N/A |
| `/firebase-messaging-sw.js` | 404 | text/html | N/A |

---

## Source Code Analysis

### 1. Constants File (contains the bug)

**File:** [`client-app/modules/push-messages/constants/index.ts`](https://github.com/VirtoCommerce/vc-frontend/blob/dev/client-app/modules/push-messages/constants/index.ts)

```typescript
export const PUSH_MESSAGES_MODULE_ENABLED_KEY = "PushMessages.Enable";
export const PUSH_MESSAGES_MODULE_FCM_ENABLED_KEY = "PushMessages.FCM.Enable";

export const REGISTRATION_SCOPE = "/firebase-cloud-messaging-push-scope";
export const SERVICE_WORKER_PATH = "/fcm-service-worker-v1.5.js";  // <-- BUG: should be v1.6
// NOTE: When updating the service worker, make sure to update the file name
// and this constant accordingly - example: fcm-service-worker-v2.js
```

### 2. Registration Code (uses the constant)

**File:** [`client-app/modules/push-messages/composables/useWebPushNotifications/useWebPushNotificationsModule.ts`](https://github.com/VirtoCommerce/vc-frontend/blob/dev/client-app/modules/push-messages/composables/useWebPushNotifications/useWebPushNotificationsModule.ts)

```typescript
import { REGISTRATION_SCOPE, SERVICE_WORKER_PATH, ... } from "../../constants";

async function initModule() {
    if (!(await isSupported())) {    // <-- Firebase isSupported() check
      return;
    }

    // ... Firebase initialization ...

    await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {  // <-- FAILS HERE (404)
      scope: REGISTRATION_SCOPE,
    });

    // ... rest of initialization never executes ...
}
```

### 3. Service Worker File (correctly deployed as v1.6)

**File:** [`client-app/public/fcm-service-worker-v1.6.js`](https://github.com/VirtoCommerce/vc-frontend/blob/dev/client-app/public/fcm-service-worker-v1.6.js)

```javascript
/* eslint-disable no-console */
/* eslint-disable no-undef */

// NOTE: When updating the service worker, make sure to update the version
// in the service worker module constants "client-app/modules/push-messages/constants/index.ts"

const VERSION = "12.8.0";
importScripts(
  `//www.gstatic.com/firebasejs/${VERSION}/firebase-app-compat.js`,
  `//www.gstatic.com/firebasejs/${VERSION}/firebase-messaging-compat.js`,
);

const DEFAULT_RETURN_URL = "/account/notifications";
const DB_NAME = "fcm-auxilia...
// ... (5,898 bytes total)
```

### 4. Minified Bundle Mapping

The constants are compiled into the main JavaScript bundle `index-t8b4qgtw.js`:

```javascript
// In the minified bundle:
tb="PushMessages.Enable"
lb="PushMessages.FCM.Enable"
AY="/firebase-cloud-messaging-push-scope"     // REGISTRATION_SCOPE
MY="/fcm-service-worker-v1.5.js"              // SERVICE_WORKER_PATH (stale reference)
```

---

## Impact Assessment

### What Is Broken
1. **Push Notifications:** Firebase Cloud Messaging (FCM) service worker cannot register, so browser push notifications do not work at all.
2. **Console Pollution:** 2 error messages on every authenticated page load, polluting error logs and monitoring dashboards.
3. **FCM Token Management:** Since the SW never registers, no FCM token is generated, and the `AddFcmToken` GraphQL mutation never executes.

### What Is NOT Broken
1. **Storefront Functionality:** All core features (catalog, cart, checkout, search, account) work normally.
2. **In-App Notifications:** The notifications page (`/account/notifications`) still shows server-side push messages via WebSocket. Only browser-level push notifications (when tab is closed/background) are broken.
3. **Order Processing:** No impact on orders, payments, or checkout flow.
4. **Performance:** The failed registration is a single request and does not cause performance degradation.

### User-Facing Impact
- Users who have previously granted notification permission will not receive browser push notifications.
- Users who have NOT enabled notifications will see no difference.
- No visible error messages are shown to users -- the error is only in the browser console.

---

## Pages Affected

| Page | Error on Full Load | Notes |
|------|--------------------|-------|
| Homepage (`/`) | Yes (when authenticated) | SW registration attempted during app init |
| Catalog (`/catalog`) | Yes (SPA-nav shows resource error) | Same failed resource |
| Account Dashboard (`/account/dashboard`) | Yes | SW registration attempted |
| Cart (`/cart`) | No (sometimes) | Timing-dependent; may not appear if module init hasn't completed |
| Any page (guest) | No | Push module only initializes for authenticated users |

The error occurs on **every full page load** (hard refresh or direct URL navigation) for authenticated users. SPA navigations within the app do not re-trigger registration but the original failed resource error persists in the console.

---

## Evidence

### Screenshots

| # | Filename | Description |
|---|----------|-------------|
| 1 | `test-results/chrome/sw-investigation-01-fcm-script-404.png` | Direct navigation to `/fcm-service-worker-v1.5.js` shows nginx 404 Not Found |
| 2 | `test-results/chrome/sw-investigation-02-homepage-with-errors.png` | Homepage loaded as authenticated user (errors in console, page visually normal) |

### Console Log Files

| File | Description |
|------|-------------|
| `test-results/chrome/sw-investigation-console-errors.txt` | Captured console errors from authenticated page load |
| `test-results/chrome/sw-investigation-network-requests.txt` | Full network request log from page load (139 requests) |

### Web Manifest

The PWA manifest at `/assets/manifest-DZwuqUo8.webmanifest` is a basic PWA configuration and does NOT reference a service worker. The SW registration is done programmatically via JavaScript:

```json
{
  "name": "Store",
  "short_name": "Store",
  "description": "Store description",
  "lang": "en-US",
  "display": "standalone",
  "orientation": "any",
  "start_url": "/",
  "background_color": "#fff",
  "theme_color": "#fff",
  "icons": [
    {
      "src": "/static/icons/favicon-pwa-v1.svg",
      "sizes": "512x512",
      "type": "image/svg+xml"
    }
  ]
}
```

---

## Fix

### Required Change (one line)

**File:** `client-app/modules/push-messages/constants/index.ts`

```diff
- export const SERVICE_WORKER_PATH = "/fcm-service-worker-v1.5.js";
+ export const SERVICE_WORKER_PATH = "/fcm-service-worker-v1.6.js";
```

### Verification Steps After Fix

1. Deploy the updated bundle to QA
2. Open browser DevTools console
3. Sign in as any user
4. Verify: No ServiceWorker 404 errors in console
5. Verify: `navigator.serviceWorker.getRegistrations()` returns a registration with scope `/firebase-cloud-messaging-push-scope`
6. Verify: FCM token is stored in localStorage (`saved-fcm-token`)
7. Test: Send a push notification from Admin and verify it arrives in the browser

### Prevention Recommendation

To prevent this version mismatch from recurring:
1. Add a CI/build check that validates the `SERVICE_WORKER_PATH` constant matches an actual file in `client-app/public/`
2. Consider making the service worker filename dynamic (not version-hardcoded) or using a hash-based approach
3. The existing comment in the SW file is insufficient -- automated validation is needed

---

## Related Information

| Item | Reference |
|------|-----------|
| Storefront Repository | https://github.com/VirtoCommerce/vc-frontend |
| Constants File | `client-app/modules/push-messages/constants/index.ts` |
| Registration Module | `client-app/modules/push-messages/composables/useWebPushNotifications/useWebPushNotificationsModule.ts` |
| Service Worker File (v1.6) | `client-app/public/fcm-service-worker-v1.6.js` |
| Component | Push Messages Module / Firebase Cloud Messaging |
| Feature | Web Push Notifications |
| Labels | frontend, push-notifications, firebase, service-worker, deployment, configuration |

---

*Report generated: 2026-02-09 | Investigation performed using Playwright MCP (Chrome), Chrome DevTools MCP, and GitHub MCP*
