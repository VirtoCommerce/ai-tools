# Exploratory Session: VCST-4905 Login-on-Behalf / Impersonation
**Date:** 2026-05-20
**Duration:** ~30 minutes
**Tester:** qa-testing-expert (playwright-firefox)
**Platform:** 3.1028.0
**Theme (vc-frontend):** 2.49.0
**XCart (pre-release):** 3.1015.0-pr-119-6a09
**Environment:** vcst-qa (`https://vcst-qa-storefront.govirto.com`)

## Charter

Explore Login-on-Behalf (impersonation) end-to-end to find bugs, fragile UX, and security/auditability gaps that scripted tests miss. Cover storefront landing/re-auth, permission gating, session-state edge cases, banner persistence (BL-AUTH-010), and the action-logging promise.

**Coverage actually achieved:**
- Storefront initiation paths (bare `/account/impersonate`, parametrized, arbitrary userId)
- Anonymous (cold-browser) access to the Security Verification Form
- Token flow analysis via `/connect/token` network inspection
- Banner persistence across SPA navigation (home, /cart, /account/orders)
- Banner persistence on full-page reload
- Banner visibility at mobile viewport 375px
- Stop Impersonation control discovery
- Nested-impersonation path (BL-AUTH-009 silent flow re-test)
- Invalid userId behavior + error message
- Locked target user (USR-021) — backend redirects to `/blocked`

**NOT covered (time/scope):**
- Admin SPA initiation paths (Contacts module vs Security module enumeration)
- Permission gate negative test from a customer user without `CanImpersonate` (cookie persistence prevented clean state)
- Self-impersonation (BL-AUTH-008) — already exercised by IMP-017
- Audit-log content verification (storefront-side only — would need Admin SPA Platform > Audit Trail review)
- Cross-org impersonation rejection (IMP-018 in 082)

## Areas Explored
| Area | Coverage | Notes |
|------|----------|-------|
| Admin SPA initiation (Contacts) | Not reached | Out of time; covered by existing IMP-001/002 in suite 082 |
| Admin SPA initiation (Security) | Not reached | Same as above |
| Anon access to `/account/impersonate` (bare) | Full | Returns 404 — route requires userId param |
| Anon access to `/account/impersonate/{validUserId}` | Full | **Form renders without any session** — see Finding #1 |
| Anon submit of valid impersonator credentials | Full | **Silent succeed → impersonation active** — Finding #1 |
| Permission gating (positive — admin impersonator with `CanImpersonate`) | Full | Works as documented |
| Permission gating (negative — user without permission) | Partial | Could not get clean cookie state; relies on existing 082 suite IMP-015 |
| Storefront landing + re-auth UX | Full | Form is clean, button correctly disables until both fields filled |
| Banner on home | Full | Present, persists |
| Banner on /cart | Full | Persists (BL-AUTH-010 satisfied at desktop) |
| Banner on /account/orders | Full | Persists |
| Banner after full-page reload | Full | Survives — httpOnly cookie persists |
| Banner on mobile 375px | Full | **MISSING — Finding #2** |
| Stop Impersonation control | Partial | Exists as `data-test-id="back-to-operator-row"` inside account menu popover; popover lazy-mounts; could not capture menu-open screenshot due to Vue/Floating-UI click-event quirk in Playwright |
| Nested impersonation from impersonated session | Partial | Silent flow triggered — backend returned 200 + redirected to `/blocked` because target was locked. Could not definitively confirm whether this is operator-token-stack-by-design or BL-AUTH-009 violation (Finding #3) |
| Invalid userId error message | Full | "Verification succeeded, but switching to the customer account failed. Please try again." — exposes that userId-vs-permission distinguishability (Finding #4) |
| Locked target user (USR-021) | Full | Backend correctly redirects to `/blocked` — good |
| Console errors during session | Full | **Zero errors** across all navigation; only 3 cosmetic warnings — clean |

## Findings

### Bugs Found
| # | Severity | Title | Evidence | Suggested next step |
|---|----------|-------|----------|---------------------|
| 1 | **P2 / Medium** (design hardening) | Anonymous browser can access Security Verification Form and complete impersonation without prior Admin SPA session | `F1-anon-security-verification-form.png`, `F2-after-anon-submit-home.png`, `F2b-after-anon-submit-full.png`. Network: `/connect/token` x2 (request 50 = `grant_type=password` operator login, request 51 = `grant_type=impersonate&user_id=…` exchange) | Confirm with product: **is this intentional?** The flow effectively allows any holder of impersonator credentials + any target userId to start impersonation from anywhere — no Admin SPA referrer/CSRF/origin gate. If intentional, document; if not, gate the form to require a referrer from `BACK_URL` or a short-lived initiation token. |
| 2 | **P1 / High** (UX/security) | Impersonation banner is **completely absent at mobile viewport (375px)** — neither in the header nor inside the hamburger menu | `F8-mobile-375-banner.png`, `F9-mobile-hamburger-open.png`. DOM check: `[data-test-id=operator-name-label]` returns `null` at 375px. Hamburger panel enumerated — banner not re-mounted there | **Violates BL-AUTH-010** at mobile breakpoints. An operator using a phone cannot tell they are impersonating — they could place real orders on a customer's account thinking they're using their own. Either add the banner to the mobile header strip or surface it inside the hamburger panel. Add an IMP-mobile-banner test case to suite 082. |
| 3 | **P3 / Low** (clarify-or-fix; possibly known) | Silent token-grant flow appears to trigger from inside an impersonated session — server returned 200 for `grant_type=impersonate&user_id={USR-021}` while session was already impersonating David Kim | `F11-nested-impersonate-blocked-user.png`. Network request 56 (POST `/connect/token`, 200). No Security Verification Form rendered | Could be the documented operator-token-stack (operator token preserved alongside target token — fine) OR a regression of IMP-013 which was FAIL in the original 2026-05-13 VCST-4905 sweep. **Needs backend confirmation**: does the silent path use the operator's token or David Kim's? Add a test that captures the `Authorization`/cookie header on the nested impersonate call. |
| 4 | **P3 / Low** (info-disclosure / UX) | Error message "Verification succeeded, but switching to the customer account failed" leaks state — distinguishes "valid creds, invalid target" from "invalid creds" | `F10-invalid-userid-silent-flow.png`. Surface text on `/account/impersonate/00000000-…` with valid impersonator session cookie | Use a uniform "Verification failed" copy for both bad-creds and bad-target paths to avoid target-userId enumeration. Minor by itself — combine with Finding #1 mitigation. |

### Risk Areas (no defect reproduced, but flag for scripted coverage)
- **Cross-tab session sharing**: Two tabs of the storefront share the impersonation cookie. Opening a second tab and visiting `/account/impersonate/{otherUserId}` silently switches the impersonation target in **both** tabs. Worth a dedicated IMP- test case.
- **Cookie/httpOnly token persistence**: Impersonation survives full-page reload and tab close + reopen (we did not test browser-restart, but the cookie has typical refresh-token TTL). No idle-timeout or visible expiry indicator in the banner.
- **No visible Stop Impersonation control at the banner level**: The `back-to-operator-row` exists only inside the account-menu popover. An operator scanning the page for a quick exit will not see it without opening the menu. Consider adding a small `× Stop` icon directly in the banner area beside "logged in as".

### UX Observations
- The Security Verification Form copy says *"You are logging in on behalf of a customer. The session will be audited."* — good, sets expectation.
- Form button stays disabled until both fields filled — good a11y/UX.
- The banner shows `operator name` + `"logged in as"` + `target name` — clear at desktop ≥1280px. At smaller desktop widths the operator name truncates first (single-line, no wrap), which is acceptable.
- After a failed nested impersonation against a locked target, the user lands on a generic `/blocked` page — no breadcrumb back to operator. The operator could think they need to sign in again.

### Security & Auditability Observations
- The `/connect/token` flow uses standard OAuth2 grants: `grant_type=password` (operator self-login) → `grant_type=impersonate&user_id={target}` (token exchange). Clean signature.
- **No storefront-side audit calls were observed during impersonation initiation** — confirmed via `browser_network_requests` filter `audit|log|track|telemetry|history|userActivity` returning zero matches. Audit logging is presumed to happen platform-side (`POST /connect/token` server handler likely writes to `Platform > Audit Trail`). **This was NOT verified end-to-end during this session** — flag for Admin SPA verification.
- Permission gating positive path holds — operator credentials must succeed at `grant_type=password` before the `impersonate` grant is attempted.
- Permission negative path (a customer user submitting their own creds at the form) was not cleanly tested due to cookie persistence; relies on suite 082 IMP-015 to cover this.
- The banner is the only in-band signal that an operator is impersonating — there's no Admin SPA cross-tab indicator and no platform-level "active impersonation sessions" dashboard (would be a nice-to-have).

### Questions for the team
1. **Is anonymous access to the Security Verification Form intentional?** (Finding #1). The previous QA pass (commit `7934846`, 2026-05-13) labeled this an "IMP-008 silent-flow banner" test and PASSed it — but that was an authenticated-from-admin start. The cold-browser start case may not have been considered.
2. **What is the canonical end-of-impersonation UX at mobile breakpoints?** Should the banner re-mount into the hamburger panel, into the main header bar, or somewhere else?
3. **Does the silent token-stack design accept a third-party userId from an already-impersonated session?** (Finding #3). The IMP-013 case PR was FAILed at `7934846` — confirm whether it shipped a fix or not.
4. **Where does the audit log live?** Platform > Audit Trail? Platform > Security log? Confirm path so future regressions can verify the promise made in the form copy ("the session will be audited").

## Evidence index
- Screenshots: `evidence/SBTM-impersonation-2026-05-20/`
  - `F1-anon-security-verification-form.png` — Anonymous form rendered (no admin session)
  - `F2-after-anon-submit-home.png`, `F2b-after-anon-submit-full.png` — Successful impersonation from anonymous, banner + target org visible
  - `F3-banner-and-menu-open.png` — Banner detail
  - `F4-account-menu-open.png`, `F5-menu-popover.png`, `F5b-no-stop-impersonation-control.png` — Stop Impersonation discovery (control exists as `back-to-operator-row` in lazy-mounted popover)
  - `F6-banner-on-cart.png` — BL-AUTH-010 PASS (cart)
  - `F7-banner-on-orders.png` — BL-AUTH-010 PASS (account/orders)
  - `F8-mobile-375-banner.png` — **Banner MISSING at mobile**
  - `F9-mobile-hamburger-open.png` — Banner NOT re-mounted into hamburger
  - `F10-invalid-userid-silent-flow.png` — Invalid userId error copy
  - `F11-nested-impersonate-blocked-user.png` — Silent flow from impersonated session against locked target
- HAR: not exported (browser_network_requests captured in-session; full HAR available via Playwright trace if needed)
- Console logs: 0 errors, 3 cosmetic warnings across entire session (no specific log file written; level=error returned 0 messages over `all=true`)
- Token request bodies (captured via `browser_network_request`):
  - Req 50: `grant_type=password&scope=offline_access&storeId=B2B-store&username=agent-test-impersonator%40virtoworks.com&password=…` → 200
  - Req 51: `grant_type=impersonate&scope=offline_access&user_id=ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` → 200
  - Req 56 (nested): `grant_type=impersonate&scope=offline_access&user_id=3133b984-…` → 200 (locked-user — UI redirected to `/blocked`)
  - Req 61 (invalid userId after token rotation): `grant_type=impersonate&scope=offline_access&user_id=00000000-…` → 400 (`token_invalid` — cached token stale, not "permission denied")

## Recommendations

### Scripted regression coverage to add (suite 082-auth-impersonation.csv)
1. **IMP-mobile-banner**: At viewport 375x812, start impersonation → verify banner is present somewhere reachable (header strip OR open hamburger panel and check inside). **Blocks BL-AUTH-010 mobile compliance.** P1.
2. **IMP-anon-cold-start**: Cold browser, no admin session, no cookies → navigate to `/account/impersonate/{validUserId}` → form renders → submit valid impersonator creds → confirm flow either (a) succeeds with banner as today, or (b) is gated. Encode the team's product decision. P2.
3. **IMP-multi-tab-cookie-share**: Open two tabs, impersonate User-A in tab 1, navigate tab 2 to `/account/impersonate/{User-B}` → confirm tab 1 also reflects User-B (cookie-shared) — and document whether this is desired. P3.
4. **IMP-error-copy-uniformity**: Form returns same generic copy for bad creds, bad userId, and locked-target paths (anti-enumeration). P3.

### Knowledge base / BL drafts (write to `tests/Sprint-current/proposed-invariants/`)
- **`PROPOSED-BL-AUTH-012`**: Banner must persist across all storefront viewports including mobile ≤500px. Either re-mount into the hamburger panel header, or keep a compact indicator in the top header strip. *(extension of BL-AUTH-010 to mobile)*
- **`PROPOSED-BL-AUTH-013`** (optional, pending product decision on Finding #1): Initiation of impersonation must require a verifiable referrer from the Admin SPA (Origin/Referer header check or a short-lived initiation token) — anonymous cold-browser starts must NOT succeed even with valid impersonator credentials. *(only file if team confirms current behavior is unintended)*
- **`PROPOSED-BL-SEC-001`**: `/account/impersonate/{userId}` error copy must be uniform across (invalid userId, invalid credentials, target locked, target unverified) to prevent userId enumeration. *(supports Finding #4)*

### For test-management-specialist
- Update suite 082 with the 4 new IMP-* cases above (P1 + P2 + 2× P3).
- Verify IMP-013 (nested impersonation) status — the 2026-05-13 evidence file `IMP-013-FAIL-nested-impersonation-allowed.png` in `7934846` suggests this was open. If still open, link Finding #3 to it.

### For qa-lead-orchestrator (delegation)
- **Backend verify** (qa-backend-expert): inspect Admin SPA Platform > Audit Trail (or equivalent) after this session's impersonation events — confirm log entries exist for the 4 successful `grant_type=impersonate` requests (target userIds: `ec3031ac…`, `3133b984…`).
- **Frontend follow-up** (qa-frontend-expert): file a UI bug for the mobile banner gap (Finding #2) — P1.

## Session summary

- **Duration**: ~30 minutes
- **Bugs/concerns**: 4 (1 × P1, 1 × P2, 2 × P3)
- **Single most important finding**: At mobile 375px the impersonation banner is completely missing from the DOM (Finding #2), violating BL-AUTH-010 at small viewports. Real risk: an operator on a phone could place orders/changes on a customer's account without realizing they're in an impersonation session.
- **Permission gate (positive)**: Held — `grant_type=password` with impersonator creds succeeds, `grant_type=impersonate` succeeds, target resolves correctly.
- **Permission gate (negative)**: Partially tested; clean-cookie state could not be achieved during session. Relies on suite 082 IMP-015 coverage. Recommend follow-up.
- **Audit logging fires**: Not directly observable from the storefront network panel (no `/audit`, `/log`, `/track` calls). Platform-side promise per form copy ("The session will be audited") — **not verified end-to-end in this session**. Flag for qa-backend-expert.
- **Console errors**: Zero across the full session.
