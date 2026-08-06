# [vc-shell] Session-expiry notification is buried under HTML parse-error toasts on a concurrent burst — MEDIUM

**Tracker:** VCST-5688 (related to VCST-5598)
**Env:** vcmp-dev Vendor Portal @ `@vc-shell/framework` 2.4.0, build-id `64804` (deployed 2026-08-04 10:25 UTC)

## Summary

When a session dies and several concurrent API calls land on the login page, the interceptor correctly latches and fires exactly one sign-out and one session-expiry notification — VCST-5598's AC2 passes. But it then returns the HTML response to *each* caller instead of short-circuiting them, so every other in-flight request tries to `JSON.parse` an HTML body and raises its own error toast. The one message that tells the user what happened is stacked behind four meaningless parse errors.

## Steps to reproduce

1. Sign in to the Vendor Portal (`/apps/vendor-portal/`) and open the dashboard, which issues a real 6-call widget burst (`seller/products`, `orders`, `quote`, `seller/offers`, `rating`, `reviews`).
2. Make those `/api/` calls resolve as the login page — a 302 to an HTML document, so the interceptor sees `ok:true, redirected:true, content-type:text/html`.
3. Watch the notification stack.

## Expected vs Actual

**Expected:** the user sees the session-expiry message. Requests aborted by an expiry are not surfaced as individual parse failures.

**Actual:** 5 toasts at peak — 1 session-expiry + 4 × `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. The expiry toast is visible ~2.6 s and is not the most prominent message.

Reproduced 6× with identical results.

![Session-expiry toast behind four parse errors](../../tickets/Sprint26-15/VCST-5412/screenshots/VCST-5598-AC2-one-toast-visible.png)

## Root cause

`framework/core/interceptors/index.ts` — once `setSessionExpired()` has latched, the wrapper still returns the login-page `Response` to every caller. The latch prevents duplicate *sign-outs* but does nothing about the responses themselves, so each caller's own `.json()` fails independently.

## Suggested fix

Short-circuit the remaining in-flight `/api/` responses once the expiry latch is engaged — reject them with a recognisable "session expired" error the callers can swallow, or return a synthetic empty result — rather than handing each caller an HTML body it will try to parse. Suppressing duplicate parse-error notifications while the latch is engaged would also close it.

## Method note

The login-page response was **fault-injected**: this platform cannot produce the 302→HTML trigger naturally (see VCST-5598 — a dead session answers 403, and auth is carried by an HttpOnly cookie). Only the server's reply was synthesized; the interceptor, latch, sign-out, routing and notification stack are the genuine deployed code, and the burst is the dashboard's own real concurrent widget load.

## Notes

vc-shell / Vendor Portal is a **separate product** from the storefront — storefront `BL-*` / `BL-UI-*` invariants and regression suites do not apply. Oracle here is the ticket ACs plus WCAG 2.1/2.2 A/AA.
