## Root-Cause Worksheet — BUG_098_001

### 1. Symptom
At storefront **Logout**, Chrome logs `A bad HTTP response code (404) was received when fetching the script.`. The failing script is `GET /firebase-messaging-sw.js` → 404. Sign-out completes normally.

### 2. Lowest failing layer
The frontend: theme JS plus the Firebase SDK, running in the browser. The storefront host answering 404 is correct, because the theme ships no file at that path.

### 3. Evidence → claim chain
- At sign-in the theme registers its own worker: `GET /fcm-service-worker-v1.12.js` → 200, `Service-Worker: script` (HAR, `network/failing-firebase-messaging-sw.json`). That is `SERVICE_WORKER_PATH` in `client-app/modules/push-messages/constants/index.ts`, and the file is `client-app/public/fcm-service-worker-v1.12.js`.
- At Logout the browser fetches `/firebase-messaging-sw.js`, which gets a 404 (HAR). This path occurs nowhere in vc-frontend-next. It is the Firebase SDK's own `DEFAULT_SW_PATH = '/firebase-messaging-sw.js'` (@firebase/messaging 0.13.0, `dist/esm/index.esm.js` l.23).
- The theme registers the logout handler in `client-app/modules/push-messages/composables/useWebPushNotifications/useWebPushNotificationsModule.ts`:
  - l.68 `broadcast.on(userBeforeUnauthorizeEvent, deleteFcmToken)`
  - l.91–95 `deleteFcmToken()` → `if (initialized && messaging) await deleteToken(messaging)`. It does not check whether a token or a worker registration was ever obtained.
- In the SDK, `deleteToken$1` runs `if (!messaging.swRegistration) await registerDefaultSw(messaging)`, and that registers `/firebase-messaging-sw.js` (l.917–920, l.1660). `messaging.swRegistration` is set only inside `getToken$1`, after the permission gate: `if (Notification.permission !== 'granted') throw permission-blocked` (l.1460) comes before `updateSwReg` (l.1464).
- So when notification permission is not granted, `getToken` throws at sign-in, and the theme catches it (l.86). The SDK never stores the theme's registration. At Logout, `deleteToken` falls back to the default worker path, gets a 404, and throws. The theme catches that too (l.99), but Chrome has already logged the fetch error. No `DeleteFcmToken` mutation follows, because `currentToken` is undefined (HAR shows none).

### 4. The "why" in one sentence
The theme's logout handler calls Firebase `deleteToken()` even when no FCM token was ever obtained, so the SDK tries to register its default `/firebase-messaging-sw.js` worker, which this theme does not ship.

### 5. Alternatives ruled out
- **Environment / missing file on the stand (ENV):** ruled out. The worker the theme asks for (`/fcm-service-worker-v1.12.js`) is served (200). `/firebase-messaging-sw.js` is not a store setting or CMS script. It is a path hard-coded in the SDK that the theme never meant to use. Serving that file would only hide the problem.
- **Page-specific (/compare, configurable PDP):** ruled out. Guest loads 0/3 and signed-in loads 0/2. The error fires only at Logout (2/2), on whichever page the user is on. Suite 098 signs in and signs out on those pages, which is why the run tied the error to them.
- **By design:** not documented. VirtoOZ (Storefront Developer Guide) has no page on the push worker. The theme's own `fix: firebase messaging warnings (#1775)` shows the team treats SDK console noise as a defect.
- **Regression from PR #11:** ruled out. PR #11 (`chore/merge-upstream-2.60.0`) changes no `push-messages` file. The composable is byte-identical on PR head, next `dev`, and upstream vc-frontend `dev`, and was last changed 2026-07-01 (#2345). kb KB-EED5F6AC saw the same 404 on 2026-10-09 and 2026-10-15 builds.

### 6. Regression archaeology
Not a regression of this build. The code was inherited from upstream vc-frontend. NEW_WITH_MERGE = **no**.

### 7. Confidence
**HIGH** for the mechanism: the URL comes from the HAR, and the SDK and theme lines were read at the deployed versions. One step is a source-derived prediction that was not verified live: with notification permission **granted**, the 404 should not occur. The automation browser had permission not granted, and granting it would need a non-UI call, which is blocked.

### 8. Fix Routing handoff
- Owning layer: storefront theme, push-messages module (frontend). `repoKind` = frontend.
- Repo: **VirtoCommerce/vc-frontend-next** (where this build ships it). The identical code is upstream in VirtoCommerce/vc-frontend, so a fix there flows down on the next upstream merge.
- Fix shape: in `deleteFcmToken`, call `deleteToken(messaging)` only when a token or worker registration was obtained. For example, guard on `currentToken`, or pass the theme's own registration so the SDK never falls back to its default worker.
- Severity: **P4 / Low**, console noise only. Sign-out works and no user-visible effect was seen. It needs `PushMessages.FCM.Enable` plus the theme's `push_messages_enabled` setting, and a user who has not granted notification permission, which is most users.
