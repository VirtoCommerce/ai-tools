# Suite 012 Re-Run — Root Cause Investigation

**Date:** 2026-04-27 · **Run ID:** REG-2026-04-27-1653-rerun-012
**Browser:** playwright-edge · **Build:** vc-theme-b2b-vue 2.48.0-pr-2269-cd06-cd06f094
**Investigator:** orchestrator (direct browser session, not delegated)

## TL;DR

The original Suite 012 run's "Suite blocked by `anonymousUsersAllowed=false`" verdict was **wrong**. The store config permits anonymous users. The actual blocker observed by the previous Edge MCP sub-agent was a **stale-localStorage-state issue** in the test runner profile — leftover `auth` and `user-id` keys from prior authenticated test runs caused the vc-frontend client-side router to redirect `/cart` → `/sign-in`. With localStorage cleared, guest cart access works exactly as the JIRA story expects.

## Reproduction

### Step 1 — Reproduce the redirect (with stale state)

Navigated to `https://vcst-qa-storefront.govirto.com/cart` in the existing Edge MCP context.

**Observed:**
- URL ended at `https://vcst-qa-storefront.govirto.com/sign-in?returnUrl=/cart` (client-side route push — page title transitioned "QA & Cart" → "QA & Sign in")
- `localStorage` had **15 keys**, including:
  - `auth = {"expires_at":null,"token_type":"Bearer","access_token":null,"refresh_token":null}`
  - `user-id = f4d5fed1-018c-4b71-ad0c-782675fbfbd5` (a stale GUID from a prior authenticated session)
  - `vcst-password-expire-reminder-date` (set by post-login flow)
  - `local_ship_to_addresses_anonymous`, `viewInStockProducts`, `currency`, …
- Cookies: only Cloudflare/Google Analytics tracking (`ai_user`, `ai_session`, `_ga`, `_ga_S2KXT3KTJZ`). No platform auth cookies.
- Network sequence: 6 GraphQL POSTs to `/graphql` (all HTTP 200), GA `view_cart` event fired with product `Efes Pilsner Can 50 CL X 24`, then GA `begin_checkout`, then a final `page_view` for `/sign-in?returnUrl=/cart` — confirming the redirect was a **client-side Vue Router push**, not a server response.

### Step 2 — Clear state and verify guest access

```js
localStorage.clear();
sessionStorage.clear();
// also expired all non-HttpOnly cookies
```

Result: `localStorage.length === 0`, `sessionStorage.length === 0`, only GA cookies remained (`_ga`, `_ga_S2KXT3KTJZ`).

### Step 3 — Re-navigate to /cart as a true guest

**Observed:**
- URL stayed at `/cart` ✅
- Title: "QA & Cart" ✅
- Page rendered: "CART · Your cart is empty · CONTINUE SHOPPING · ADD WITH BULK ORDER" ✅
- Header showed "Sign in" / "Sign up now" links — confirming unauthenticated state ✅
- Screenshot: `screenshots/01-guest-cart-works.png`

After this navigation, the storefront repopulated `localStorage` with a **NEW anonymous** `user-id = 3502817c-fcae-4143-b736-2ddcb8d9e598` and the empty `auth` placeholder. This is the normal vc-frontend bootstrap state for an anonymous visitor — NOT a leftover.

### Step 4 — Verify guest can browse PDP

Navigated to `/search?q=efes` → 1 product result (`Efes Pilsner Can 50 CL X 24`). Then `/product/77b02359-4b65-4f81-a618-7f95285bfff1`.

- Page loaded for guest ✅
- Title: "QA & Efes Pilsner Can 50 CL X 24" ✅
- Quantity input present, **`disabled: false`**, `value: 0` ✅ — directly contradicting the prior sub-agent's claim "increaseBtnDisabled=true"
- Screenshot: `screenshots/02-guest-pdp-qty-enabled.png`

## Root cause

**`vc-frontend` client-side route guard interprets the leftover-auth-state pattern as "expired session needs re-auth".**

The combination that triggers the redirect:
1. `localStorage.auth` exists as an object with `access_token: null`
2. `localStorage.user-id` exists with a GUID from a previously authenticated user
3. Some Vue Router `beforeEach` / route-meta `requiresAuth` check on cart-related routes fires `router.push('/sign-in?returnUrl=...')`

When localStorage is fully cleared, the SPA bootstraps a fresh anonymous user-id via `xCart.createGuestCart` (or similar) and the route guard does NOT redirect. The store `Stores.AllowAnonymousUsers=true` setting is honored correctly.

This is a **test infrastructure problem, NOT a product bug** — the store's anonymous shopping config works as intended for real first-time guest visitors.

## Why the previous run misclassified this

1. Edge MCP profile carried over `localStorage` from prior agent runs in the same regression session. Suite 077 (run before 012 on the firefox slot, but Edge had been used before for other work) likely left an authenticated session footprint.
2. The Edge profile's `auth` object was reset to all-nulls by some sign-out/cleanup attempt without clearing the matching `user-id` — leaving the malformed state that triggers the route guard.
3. The sub-agent observed the redirect, queried the store config setting name from memory ("anonymousUsersAllowed"), and reported that as the cause **without verifying** against the actual API.

## Verified facts (admin-API-confirmed)

- `Stores.AllowAnonymousUsers = true`
- `XOrder.CreateAnonymousOrderEnabled = true`
- `XPurchase.IsSelectedForCheckout = true`
- `storeState = Open`
- Direct `curl GET /cart` (no cookies) returns HTTP 200
- Browser navigation to `/cart` with cleared storage stays on `/cart` and renders empty-cart UI
- Browser navigation to PDP with cleared storage loads product detail with enabled quantity input

## Recommendations

### For the test runner / regression infrastructure
1. **Test-runner-agent SHOULD clear localStorage + sessionStorage at suite start** when the suite expects a guest/unauthenticated context. Add to `.claude/agents/qa/test-runner-agent.md` template: a pre-flow step that asserts `localStorage.length === 0 && sessionStorage.length === 0` for guest-scope suites.
2. **Suite 012 CSV preconditions SHOULD include a "clear browser storage" precondition tag** (e.g., `[PRE:CLEAR_STORAGE]`) that the runner honors before any guest case.
3. The Edge MCP profile path (configured in `config/mcp-playwright-edge.config.json`) should rotate per-suite OR the suite should explicitly clear it.

### For the Suite 012 re-run
The suite is **NOT blocked by store config**. Schedule a proper re-run with the storage-clear precondition added. Cases CHK-014, CHK-015, CHK-017, CHK-019, CHK-020, CHK-029 should execute successfully. CHK-016 and CHK-021 remain N/A per their own preconditions. CHK-018 still has the `/checkout/review`-removal MAN-006 quirk per the lifecycle report.

### For the vc-frontend product team (advisory, P3/Low)
Consider hardening the route guard against the `{user-id present, auth.access_token null}` corrupt-state pattern. Options:
- Treat `access_token: null` as fully unauthenticated (clear the matching `user-id`) instead of redirecting to /sign-in
- Or, on detection, clear both keys before deciding whether to redirect

This isn't a bug per se — corrupt localStorage isn't a real user flow — but it makes test infrastructure brittle.

## Files

- `reports/regression/REG-2026-04-27-1653/rerun-012/investigation.md` (this document)
- `reports/regression/REG-2026-04-27-1653/rerun-012/screenshots/01-guest-cart-works.png`
- `reports/regression/REG-2026-04-27-1653/rerun-012/screenshots/02-guest-pdp-qty-enabled.png`

## Verdict

**Suite 012 re-run blocker: identified.** The original blocker is a **test-runner stale-state bug**, not a store-config or product issue. The QA store correctly allows anonymous users. Suite 012 needs a fresh execution with storage-clear preconditions enforced — which is **outside** the scope of validating PR #2269. PR #2269 sidebar regression verdict (APPROVED) is unaffected.
