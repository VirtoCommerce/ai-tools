# VCST-5688 — Fix Verification

**Ticket:** VCST-5688 · Bug · Medium · `[vc-shell] Session-expiry notification is buried under HTML parse-error toasts on a concurrent burst`
**Fix:** vc-shell PR [#291](https://github.com/VirtoCommerce/vc-shell/pull/291) (`9795955d2`), merged 2026-08-13
**Verdict: VERIFIED WITH NOTES** — 2026-08-25

## Env

**`@vc-shell/framework`** / Marketplace Vendor Portal (separate product — not the storefront, not the Platform
Admin SPA). Filed against 2.4.0 (build-id `64804`); fixed in **2.5.0**. Verified against `main @ 324cd9b09`
and the deployed build **22260** (2026-08-24). No comments on the ticket, so the fix was located from `main`'s
history.

## Summary

The interceptor now **fails** an API request whose response is really the login page, instead of handing back
HTML that every caller then tried to `JSON.parse`. RED→GREEN is clean and the unit coverage is unusually
thorough (15 tests across both branches, including the burst case and the deliberately-unchanged 401 path).
The fix is correct, and so is its own recorded reasoning — my first pass claimed otherwise and that claim is
**retracted** (Note 1). The live axis is **blocked by tooling**, not merely skipped (Note 2); the naturally
reachable half of the STR has since been executed (see Step A).

## The change

```diff
- const sessionDied = response.status === 401 || (response.ok && looksLikeLoginPage(response));
+ const isLoginPageResponse = response.ok && looksLikeLoginPage(response);
+ const sessionDied = response.status === 401 || isLoginPageResponse;
  …
+ if (isLoginPageResponse && isSessionExpired()) {
+   throw new SessionExpiredError();
+ }
```

Two design decisions worth crediting: it is **gated on the expiry latch**, so a login page seen while nobody
is signed in stays an expected answer rather than a session death; and a **401 is deliberately returned
unchanged**, because its body is not a document so nothing tries to parse markup. Both are pinned by tests.

## RED → GREEN (unit)

Scope `core/interceptors` + `core/utilities/sessionExpiration` + `core/composables/useAsync`, from `framework/`:

| Phase | Source | Result |
|---|---|---|
| **GREEN** | `main @ 324cd9b09` | **31 passed (31)**, 3 consecutive runs |
| **RED** | `interceptors/index.ts` + `sessionExpiration.ts` @ parent of `9795955d2`; tests unchanged | **4 failed / 27 passed** |

RED failures:
- *treats an API call answered with an HTML login page as an expired session*
- ***fails the request instead of handing the login page's HTML to the caller*** ← the core fix
- *recognises the login page by its URL when the content type is absent*
- ***acts once for a burst of concurrent requests that all land on the login page*** ← the burst

**Scoping:** both source files revert together — the interceptor's `throw` needs the `SessionExpiredError`
class the same PR introduced, so reverting one alone would not compile. `useAsync/index.ts` was **not**
reverted: its notify guard is pre-existing (PR #291 touched only `useAsync.docs.md`).

**Coverage is genuinely complete** — 15 tests. Beyond the four above: `still returns a 401 response to the
caller`, `leaves an ordinary JSON response alone`, `does not sign out on a 403`, `leaves an HTML response
that was not redirected alone`, `does not act on a login page while nobody is signed in`, `does not fail the
sign-in request itself`, plus five 401-handling cases including `handles concurrent 401s from the same dead
session exactly once`. Every design decision and all five negative guards are pinned.

## Deploy gate

`9795955d2` is an ancestor of **v2.5.0**, not of v2.4.0. The deployed `vc-shell-vendors22260.js` carries
`SessionExpiredError` ×1 and the full message *"The session has expired, so this request was not completed"*
×1; the `-framework` facade chunk has 0 of both, as expected. `looksLikeLoginPage` / `markSessionExpired` are
absent because they are module-local names and get minified — the class name and message survive because both
are string literals.

**Independent live corroboration.** The **VCST-5667** verification run earlier the same day hit, on a first
sign-in attempt against vcmp-dev, the message *"Authentication error: The session has expired, so this request
was not completed."* — verbatim this fix's `SessionExpiredError` default, observed by a different agent
pursuing an unrelated ticket. So the class is deployed and does reach a user-visible surface.

## Notes

**1. RETRACTED — my original Note 1 was wrong. The fix's documentation is accurate.**

My first pass claimed the `notificationId` de-duplication cited in `useAsync.docs.md` "does not exist as
described", and that the collapse rested on the `!isSessionExpired()` suppression alone. **Both claims were
false.** The real chain:

1. `useAsync/index.ts:65` derives the id **from the error message** —
   `const notifId = \`async-error-${parsed.message.slice(0, 80)}\`;` — so N identical errors supply the **same**
   `notificationId`.
2. It passes that to `notification.error(msg, { notificationId: notifId, … })`.
3. `notification.ts` `showNotification` **preserves** a supplied id (it only generates one when absent — the
   branch I misread).
4. `useContainer` `actions.add()` **de-duplicates on it**:
   `const exists = containers.value.find((item) => item.notificationId === options.notificationId);`
   then `if (!exists) { … push … }`. No else branch — a same-id notification is dropped.

⇒ N identical-message errors produce exactly **one** toast. The interceptor's own comment — *"All of them fail
with the same error, so a consumer that does surface it shows one message, not one per request"* — is
**correct**, precisely because the id is message-derived and the container de-duplicates on it.

**How I got it wrong:** I traced `showNotification` → `appendInstance` in `useContainer`, saw `appendInstance`
only mounts the per-position container, and concluded from there. The de-duplication lives in `actions.add()`,
a sibling in the same file reached via the mounted container's handler
(`if (options.updateId) actions.update() else actions.add()`). I stopped one call short. This is the same shape
of error I made on VCST-5667 (concluding coverage was missing without checking the layer below) — worth
treating as a recurring failure mode rather than a one-off.

**Two further mechanisms I also missed, both real:**

- **The latch has four consumers, not two.** `interceptors/index.ts:166` sets it; `:194` is this fix;
  `useAsync/index.ts:64` suppresses the toast; and **`shell/components/error-interceptor/interceptor.ts:56`**
  suppresses the *blade error banner* (`if (isSessionExpired()) return;` before `setBladeError`). Expiry is
  respected on both the toast and the banner surface.
- **The toast is deferred and cancellable.** `useAsync` fires it via `setTimeout(0)` and registers it through
  `setPendingErrorNotification`, so `ErrorInterceptor` can `cancelPendingErrorNotification` when
  `onErrorCaptured` fires — *"Cancel any deferred useAsync toast — blade banner replaces it"*. A third
  de-duplication path, distinct from the other two.

Net: the fix's reasoning holds up better than my review of it did. Nothing else in the verdict changes.


**2. The live axis is BLOCKED BY TOOLING — no browser agent was dispatched, deliberately.** Three
independent reasons a live run cannot reach this branch:
- The ticket itself records that this platform **cannot produce the 302→HTML trigger naturally** (established
  during VCST-5598); the original repro was fault-injected.
- Playwright MCP exposes **no route-interception tool** — there is no `browser_route`. The only way to install
  a route handler is `browser_run_code_unsafe`, which `hooks/enforce-real-user.mjs` blocks, and the documented
  `/* @allow-eval */` opt-in is scoped to *"UI-FIX / DEBUG DOM experiment, NOT for test runs"*.
- The naturally reachable expiry (clearing the HttpOnly cookies) yields a **401** — a *different* branch,
  which this fix deliberately leaves unchanged. It can neither confirm nor refute the defect.

Dispatching an agent would have burned a session on a branch it structurally could not reach. Evidence relied
on instead: the unit RED→GREEN above including the burst case, the deployed-bundle markers, and the
independent live sighting of the message. **To close it properly**, `hooks/enforce-real-user.mjs` needs its
allowlist extended for `page.route` / `unrouteAll` fault injection — the clean fix the hook's own guidance
points at. This is the **third time in this session** that gap has bounded a verification.

**3. An observation to reconcile, not a defect call.** The unit suite pins *"does not fail the sign-in request
itself"*, yet the VCST-5667 run saw the `SessionExpiredError` message surface *during* sign-in, prefixed
`Authentication error:`. The likely explanation is a **stale latch** from a prior session — `isSessionExpired()`
still true, so a non-sign-in bootstrap call threw and the login form surfaced it. That path is outside
`useAsync`'s guard, which is consistent with Note 1. Worth a look, but I have one sighting and no repro, so I
am not calling it a defect.

## Coverage limits

The live burst behaviour (1 expiry toast, 0 parse errors, on the dashboard's real 6-call widget load) is
**unverified** — see Note 2. The 401 branch was likewise not exercised live, though it is unit-pinned. No
screen-reader or visual-ordering check of the toast stack was performed (the ticket's original complaint
included the expiry toast not being *topmost*, which the unit tests cannot speak to at all — see below).

**Worth flagging:** the ticket's Actual described two things — four extra parse-error toasts **and** the
expiry toast being "visible ~2.6 s and not the topmost/most prominent message". The fix addresses the first.
**Toast ordering/prominence is not addressed and is not testable at unit level.** If the expiry message being
topmost matters, that is a separate concern this fix does not close.

## Step A — the naturally-reachable half of the STR, executed

Step 2 of the STR (302→HTML injection) stays unreachable here (Note 2), but steps 1 and 3 need no injection
and had not been run post-fix.

**The burst is confirmed; the ticket's figure is refined, not contradicted.** The widget load fires **8**
`/api/` calls in **two waves**, and the concurrent wave is **exactly the six the ticket names** —
`seller/products/search`, `orders/search`, `quote/search`, `seller/offers/search`, `rating`,
`reviews/search`, all 200 `application/json`. The extra two are a later re-fetch of the Orders and Offers
widgets. The "6-call concurrent burst" severity rationale holds.

Concurrency was established without scripting, two independent ways: response `Date` headers place a 1146 ms
and a 648 ms request inside the same one-second window (1794 ms cannot complete sequentially there), and
requests 187–192 share a Cloudflare `cf-ray` tick prefix `a30b58c198` that the two later calls do not.
*Caveat:* that proves they were in flight together, not dispatched in the same tick — Playwright's log exposes
no per-request initiation timestamp.

**Healthy path clean:** zero toasts, the `role="status"` container present and empty, no `Unexpected token '<'`
anywhere, 0 console errors.

**Fixed code present, with its suppression half** — from fetching the served asset, no page evaluation.
`vc-shell-vendors22260.js` carries the class verbatim, with the module-level latch and its guard adjacent.

**The 401 branch is separately worded** — `Access Denied: Your session has expired or you do not have the
necessary permissions.`, in the *other* chunk. Useful for whoever verifies that path.

**No natural session death observed** — zero 401s across the session, so the 401 branch stays live-unverified
(unit-pinned only).

**Environment-noise calibration:** the 500s recorded on earlier runs today did **not** reproduce —
`/pushNotificationHub/negotiate` returned 200 and `seller/offers/search` returned 200 twice. Those earlier
failures look session-specific rather than stable characteristics of vcmp-dev, which is worth knowing before
passing "known noise" lists to future runs.

Screenshots: `screenshots/check1-2-dashboard-healthy-no-error-toasts.png`,
`screenshots/check4-orders-no-401-no-toasts.png`.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the 123
regression suites cover the storefront only — none cover vc-shell or the Vendor Portal. Substituted: the
framework's own vitest suites, source tracing of the collapse mechanism, and deployed-bundle marker checks.

**Data changes: none.** No live session was run for this ticket; the worktree was verified identical to
`origin/main` after the RED probe.
