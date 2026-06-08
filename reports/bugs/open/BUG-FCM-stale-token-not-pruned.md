# BUG: Push-messages never prunes FCM tokens rejected with UNREGISTERED (404) — dead tokens retried forever

## Status: READY_TO_SUBMIT — filed as [VCST-5210](https://virtocommerce.atlassian.net/browse/VCST-5210)

**Env:** vcst-qa @ Platform 3.103x (backend) · module `vc-module-push-messages` (`dev`), FirebaseAdmin 3.4.0
**Severity:** Low (Minor) · **Type:** Defect — missing error handling / resource hygiene

## Summary
When a push send to FCM returns a per-token failure (HTTP 404 / `MessagingErrorCode.Unregistered` = the device registration token is no longer valid), the module only logs the error and never deletes the stale token. The token stays in storage and is re-queried and re-sent on every subsequent push, producing repeated 404s from `fcm.googleapis.com` indefinitely. No user-facing failure (valid recipients still receive their push), but it generates ongoing dependency-error noise and unbounded dead-token accumulation.

## How it was found
Surfaced by `/qa-monitoring backend` (run MONITOR-2026-06-08-0947): App Insights `vcst-qa` dependencies probe showed `HTTP fcm.googleapis.com 404` ×5 in a 1-second burst (5 distinct operations → 5 distinct recipient tokens), each a real ~90–600 ms round-trip. No correlated server-side exception was logged — consistent with the catch-and-log-only handling below.

## Steps to reproduce
1. Register an FCM token for a user, then invalidate it (uninstall the PWA / let the token expire / rotate) so FCM will answer `UNREGISTERED`.
2. Trigger a push message to that user (recipient-changed event → send job).
3. Observe a `POST https://fcm.googleapis.com/v1/projects/<project>/messages:send` → HTTP 404 in App Insights `dependencies` (telemetry-confirmed in vcst-qa).
4. Trigger any further push to the same user.

**Expected:** After a token is rejected with `UNREGISTERED`/404, the module removes that token (the existing `DeleteFcmToken` path), so it is not retried.
**Actual:** The token is left in storage; every future send re-queries and re-sends to it → the same 404 recurs on each send.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront | N/A | not a storefront-render issue |
| 2. Admin SPA | N/A | not admin-visible |
| 3. GraphQL xAPI | N/A | send is a server-side background flow, not an xAPI resolver |
| 4. Backend module | **FAIL** | `FcmPushMessageRecipientChangedEventHandler` swallows the failed-token response without pruning |

**Owning layer:** Layer 4 — backend module (`vc-module-push-messages`).

## Root Cause Analysis
`src/VirtoCommerce.PushMessages.Data/Handlers/FcmPushMessageRecipientChangedEventHandler.cs` — `SendFirebaseMessage(MulticastMessage)`:

```csharp
var batchResponse = await FirebaseMessaging.DefaultInstance.SendEachForMulticastAsync(firebaseMessage);
if (batchResponse.FailureCount == 0) return;
foreach (var response in batchResponse.Responses.Where(x => !x.IsSuccess))
{
    _logger.LogError("FCM Send failed: {Exception}", response.Exception);   // logs only
}
```

- The failed `SendResponse.Exception` (a `FirebaseMessagingException` carrying `MessagingErrorCode.Unregistered` / `InvalidArgument`) is **never inspected** and the offending token is **never deleted**.
- A delete path exists (`IFcmTokenService.Delete` via the `DeleteFcmTokenCommand` GraphQL command) but is only reachable on explicit client request — it is not wired into the send-failure path.
- The send loop re-queries tokens from storage for each recipient batch, so a dead token is re-attempted on every push (`searchResult.Results.Select(x => x.Token)`).
- Because failures are caught and logged (not re-thrown), nothing reaches the exceptions table — explaining the telemetry signature being a dependency 404 with no paired exception.

**Suggested fix (small, localized):** inspect `response.Exception.MessagingErrorCode` for `Unregistered`/`InvalidArgument` (i.e. `SenderId`-independent terminal token errors) and call the existing token-delete service for that token before continuing. Do not delete on transient errors (`Unavailable`, `Internal`, quota).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — Backend module
- **Suggested repo:** VirtoCommerce/vc-module-push-messages
- **repoKind:** module
- **Component / module:** Push Messages — `FcmPushMessageRecipientChangedEventHandler.SendFirebaseMessage`
- **RCA anchor:** `src/VirtoCommerce.PushMessages.Data/Handlers/FcmPushMessageRecipientChangedEventHandler.cs` → `SendFirebaseMessage` (FirebaseAdmin 3.4.0 `SendEachForMulticastAsync`); token delete in `FcmTokenService` / `DeleteFcmTokenCommandHandler`
- **Routing confidence:** HIGH

## Related
- VCST-4605 — different FCM defect (storefront service-worker registration 404; Done). Same subsystem, unrelated root cause/layer.
