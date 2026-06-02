# BUG_032_051 — "Remember Me" checkbox on /sign-in is a no-op

**Status:** REJECTED — KNOWN GAP (not a bug)
**Severity:** n/a
**Priority:** n/a
**Reclassified:** 2026-04-21 by product owner — "Remember Me" functionality is not implemented. The checkbox is vestigial UI; there is no backend contract for session-lifetime gating. Track as a feature request if persistent-vs-session storage is desired. Test cases AUTH-050 and AUTH-051 should be revised or retired.
**Action for test suite 032:** mark AUTH-050/AUTH-051 as `N/A — feature not implemented` (not BLOCKED, not FAIL). Remove from default run until the feature ships.
**Domain:** Authentication > Session > Persistence
**Found In Run:** REG-2026-04-20-1000 (AUTH-051, suite 032-auth-session-rbac)
**Investigation:** 2026-04-21 09:06–09:08 UTC (Edge / playwright-edge)
**Linked Tests:** AUTH-050, AUTH-051
**Business Rule:** BL-AUTH-003 — N/A (rule premise incorrect — no Remember-Me gate exists in current product)
**Verdict:** **CONFIRMED behavior (checkbox has no effect)** but reclassified from BUG → KNOWN GAP because the feature is not implemented.

---

## Summary

The "Remember Me" checkbox on `/sign-in` does not influence session persistence. A fresh A/B capture with the same user on the same build shows:

- Identical `POST /connect/token` request body in both modes — no `rememberMe`/`persist` form field; `scope=offline_access` is sent unconditionally.
- Identical response: `access_token` of 1477 chars (30-minute TTL), `refresh_token` of 3282 chars (OpenIddict JWE `RSA-OAEP + A256CBC-HS512 / typ=oi_reft+jwt`) issued in both passes.
- Identical storage: the auth bundle is written to `localStorage['auth']` in **both** passes. `sessionStorage` is empty in both. No auth cookies.
- Same refresh-token key (`kid=D588DABE64A6FCCE070860E222359675C0C53481`) → backend is not differentiating token lifetime per mode.

Consequence: even with the checkbox UNCHECKED the session persists across browser restart (the refresh token is long-lived in `localStorage`), violating the user's expectation expressed via the UI control. This is a UX-trust bug and arguably a privacy/security bug on shared devices.

## Environment

| Field | Value |
|---|---|
| Storefront | https://vcst-qa-storefront.govirto.com (B2B-store) |
| Storefront version | 2.47.0-alpha.2306 |
| Browser | Microsoft Edge (Edg/147.0.0.0) via playwright-edge, isolated context |
| Test user | `qa-agent-slot1@virtocommerce.com` |

## Steps to Reproduce

1. Open a fresh browser context. Clear storage. Navigate to `/sign-in`.
2. **Pass A — Remember Me ON:**
   - Fill email + password, check **Remember Me**, click **Sign In**.
   - Capture `POST /connect/token` request body + response; dump `localStorage`/`sessionStorage`/cookies; decode `access_token` and `refresh_token` (header) JWT claims.
3. Sign out and clear all storage.
4. **Pass B — Remember Me OFF:**
   - Re-navigate to `/sign-in`. Ensure the checkbox is unchecked. Log in with the same credentials.
   - Capture the identical set of artefacts.
5. Diff A vs B.

## Expected vs Actual

| Artefact | Expected — OFF | Expected — ON | Actual — OFF | Actual — ON |
|---|---|---|---|---|
| `POST /connect/token` body | `scope` absent or `scope=` (short-lived), or explicit `rememberMe=false` flag | `scope=offline_access` | `grant_type=password&scope=offline_access&storeId=B2B-store&username=...&password=...` | **identical** |
| Refresh token | Not issued (or short-lived cookie) | Issued, long-lived | Issued (length **3282**, JWE) | Issued (length **3282**, JWE) — **identical** |
| Storage location of `auth` | `sessionStorage` (session-only) | `localStorage` | `localStorage` | `localStorage` — **identical** |
| Access-token TTL | Short (e.g. ≤ browser session) | 30 min rolling | 30 min (iat→exp = 1800 s) | 30 min — **identical** |
| Auth cookies | Session cookie with no expiry | Persistent cookie | **None** | **None** — identical |
| Persistence across browser close | Session dies | Session restored | Session survives (token in localStorage) | Session survives — **identical** |

## Evidence

### Pass A — Remember Me CHECKED
- Screenshot: `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_032_051-passA-remember-me-ON-logged-in.png` — logged in as "Agent Chrome".
- `POST /connect/token` → **200**, request body:
  ```
  grant_type=password&scope=offline_access&storeId=B2B-store&username=qa-agent-slot1%40virtocommerce.com&password=TestAgent1%21
  ```
- localStorage keys include `auth` (length 4859). sessionStorage contains no `auth`.
- `access_token` JWT: `iat=1776762400 exp=1776764200 (Δ=1800s / 30 min), scope=offline_access, sub=c994fa34-...-547d, name=qa-agent-slot1@virtocommerce.com, role=__customer`.
- `refresh_token` JWE header: `alg=RSA-OAEP, enc=A256CBC-HS512, kid=D588DABE64A6FCCE070860E222359675C0C53481, typ=oi_reft+jwt`. Length **3282**.

### Pass B — Remember Me UNCHECKED
- Screenshot: `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_032_051-passB-remember-me-OFF-logged-in.png` — same "Agent Chrome" header state, same dashboard.
- `POST /connect/token` → **200**, request body:
  ```
  grant_type=password&scope=offline_access&storeId=B2B-store&username=qa-agent-slot1%40virtocommerce.com&password=TestAgent1%21
  ```
  **Byte-identical to Pass A** (no rememberMe/persist flag).
- localStorage keys include `auth` (length 4859). sessionStorage contains no `auth`.
- `access_token` JWT: `iat=1776762458 exp=1776764258 (Δ=1800s / 30 min), scope=offline_access` — same user, same claims, same 30-min TTL.
- `refresh_token` JWE header identical: `alg=RSA-OAEP, enc=A256CBC-HS512, kid=D588DABE64A6FCCE070860E222359675C0C53481, typ=oi_reft+jwt`. Length **3282**.

### DOM of the checkbox
```html
<input type="checkbox" />  <!-- no name, no id, no aria-label -->
<button>Remember me</button>
```
(Single `<input type=checkbox>` on the page; toggled via `setChecked(true|false)`; pre-login state was verified both times.)

## Root Cause Hypothesis

Two candidate causes (either or both could be at play):

1. **Frontend wiring gap.** The storefront's sign-in handler serializes the auth request without reading the checkbox state — `scope=offline_access` is hard-coded, so OpenIddict always issues a refresh token. The checkbox is cosmetic.
2. **Storage-strategy gap.** Even if a short-lived token had been requested, the frontend writes `auth` to `localStorage` unconditionally. A proper "Remember Me OFF" implementation would write to `sessionStorage` (or hold the access token in memory only) so that a browser restart drops the session.

A proper fix usually addresses both (send `rememberMe` to backend so it can decide on refresh-token issuance; and choose the storage bin on the frontend based on the same flag).

## Severity Justification (Medium)

- Not a data-leak or credential-exfiltration bug.
- **Violates user expectation** that unchecking "Remember Me" keeps them logged in only for the current session — real-world impact on shared/public machines.
- UI trust issue: the control advertises a capability the product doesn't provide. Breaks compliance narratives around user control of session persistence.
- Easy to triage: single A/B test shows byte-identical capture; low effort to diagnose, moderate effort to fix.

## Suggested Fix

1. When the checkbox is **unchecked**, send `offline_access=false` (or omit from `scope`) so OpenIddict does not issue a refresh token — or send an explicit `persist=false` flag and let the backend gate the refresh-token lifetime.
2. When unchecked, the frontend should store `auth` in `sessionStorage` (dies on tab/window close) or hold it in memory only; `localStorage` should be reserved for the checked state.
3. Add `data-test-id`, `aria-label` and a `name` attribute to the `<input type="checkbox">` so automation and assistive tech can reliably target it.
4. Add a visible hint under the checkbox clarifying the behavior (e.g. "Keep me signed in on this device").

## Artifacts (repo-root)

- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_032_051-passA-remember-me-ON-logged-in.png`
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_032_051-passB-remember-me-OFF-logged-in.png`
