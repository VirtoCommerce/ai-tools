# BUG: [Push messages] Logout requests /firebase-messaging-sw.js and logs a 404 for users without notification permission — Low

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6398
**Tracker:** not filed (Low, local report only) · kb KB-EED5F6AC already records the 404

**Severity:** Low (P4) · **Type:** Console error / robustness · **Relationship:** found while testing VCST-6398 (regression suite 098 incidental); not introduced by it
**Env:** vcst, playwright-chrome 1920x1080, signed-in B2B user, FCM enabled, notification permission not granted, 2026-10-20 · **Build:** theme vc-frontend-next `3.1.0-pr-11-d67b-d67b0e0a`, @firebase/messaging 0.13.0

## Summary
On sign-out the browser fetches `GET {{FRONT_URL}}/firebase-messaging-sw.js` (header `Service-Worker: script`) → 404, and Chrome logs "A bad HTTP response code (404) was received when fetching the script". Sign-out completes; no visible effect. The theme's own worker `/fcm-service-worker-v1.12.js` is served (200).

## Steps to reproduce
Sign in (notification permission not granted), open any page, sign out; read the console and the HAR.

## Expected / Actual
No failed request on logout · one 404 + console error per logout (2/2; guest and signed-in page loads 0/5).

![After logout on the configurable PDP](../../screenshots/Logout-Firebase-Messaging-SW-404/02-config-pdp-after-logout.png)

## Root Cause Analysis
- `client-app/modules/push-messages/composables/useWebPushNotifications/useWebPushNotificationsModule.ts`: L68 hooks `deleteFcmToken` on logout; L91–95 call `deleteToken(messaging)` without checking a token was obtained.
- With no stored registration (`getToken` failed `permission-blocked` at sign-in) the SDK registers its default `/firebase-messaging-sw.js`.
- Same code upstream; last change 2026-07-01 (#2345).
- Package: `reports/tickets/Sprint26-21/VCST-6398/evidence-BUG_098_001/`; HAR `results/VCST-6398/har/BUG_098_001-pdp-logout.har`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend-next (same code upstream)
- **repoKind:** frontend · **Ownership hint:** platform
- **RCA anchor:** `useWebPushNotificationsModule.ts:91` `deleteToken(messaging)`
- **Routing confidence:** HIGH — guard on an obtained token, or pass the theme's own SW registration to the SDK
