# Phase 5 — Live Environment Verification

**Run ID:** TLC-2026-05-14-1400
**Date:** 2026-05-14 07:20 – 07:31 UTC
**Browser:** playwright-firefox (locale en-US, 1920x1080 + 375x812 mobile)
**Build:** `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280) — footer-confirmed on every page
**Operator account used:** `acme_store_maintainer_1@acme.com` (François O'Brien-Müller) — ACME Store maintainer, role grants `platform:security:loginOnBehalf`
**Target accounts used:** ACME Employee 1/2/3/4/5 (same org), `acme_store_employee_8@acme.com` (Invited status), nested attempt → `user-acme-store-employee-5`

---

## Verification Results

| Case | URL | Check | Result | Evidence | Notes |
|---|---|---|---|---|---|
| **IMP-046** | /company/members → impersonate → revert; probe GraphQL /graphql with old token | AC#6: previous impersonation token returns HTTP 401 after revert | **BROKEN — P0 SECURITY** | `imp-046-operator-token.txt`, `imp-046-probe-200-pre-revert.txt`, `imp-046-probe-200-POST-revert-BROKEN.txt`, `imp-046-after-revert-operator-restored.png` | Probe endpoint used: `POST /graphql { me { id } }`. Pre-revert: 200 + `me.id=user-acme-store-employee-3`. POST-revert (same token): **200 again** (expected 401). Token's natural exp is ~30 min away; remains usable. Operator session WAS restored locally, but server-side token NOT revoked. **PROPOSED-BL-AUTH-012 is currently FALSE on vcst-qa.** |
| **IMP-042** | / (header during impersonation), 1920px | "Revert back to own account" item visible in header dropdown | **CHANGED** | `imp-042-header-dropdown-back-to-operator.png` | Actual label is **"Back to {operatorFullName}"** (e.g., `"Back to François O'Brien-Müller"`) — NOT `"Revert back to own account"`. Selector: `button:has-text("Back to ")` inside header `<DIV class="absolute right-0 top-full z-10 ...">` popover. Test case assertion text must be updated. |
| **IMP-043** | / at 375px viewport during impersonation | Mobile menu contains revert action | **VERIFIED + selector found** | `imp-043-mobile-menu-back-to-operator.png` | Mobile hamburger has `aria-label="Main menu"`. Revert button has stable test ID: **`data-testid="mobile-back-to-operator-button"`** with same dynamic label `"Back to François O'Brien-Müller"`. Touch target verified visually (≥44px). |
| **IMP-039** | /company/members | "Login on behalf" item in actions dropdown for member with security account + operator has CanImpersonate | **VERIFIED** | `imp-039-dropdown-login-on-behalf.png` | Dropdown order: Edit role, Block user, Delete, **Login on behalf**. Exact label = `"Login on behalf"` (lowercase b). Selector: `tr:has-text("...") button:has-text("Login on behalf")`. All 15 active-account rows show this menu item under the maintainer. |
| **IMP-040** | /company/members → Invite sent row (`acme_store_employee_8@acme.com`, status=Invited) | "Login on behalf" hidden when target has no security account | **CHANGED / AMBIGUOUS** | `imp-040-invited-member-shows-action.png` | The Invited member row DOES show "Login on behalf" in the dropdown. Either: (a) Invited users already have a stub security account (gate condition 2 is about something else), or (b) gate condition not enforced. Need a contact-only member with truly no security account to disambiguate — none observed in this org. Recommend: re-precondition the test to require seeding a contact without `securityAccount`. |
| **IMP-041** | /company/members confirmation modal Cancel | Cancel dismisses modal, no nav, no `/connect/token` POST | **VERIFIED** | `imp-041-after-cancel.png`, network trace `phase-5-net-trace.txt` | Modal closed; URL stayed `/company/members`; **zero** network requests matching `/connect/token` or `/impersonate` after Cancel. Operator session preserved. |
| **AUTH-028** | /company/members modal | Title "Login on behalf", body verbatim, Continue + Cancel buttons | **CHANGED** | `auth-028-confirmation-modal.png` | Modal heading: `"Login on behalf"` (h2). Body text matches AC verbatim: `"You are logging in on behalf of acme_store_employee_1@acme.com. The session will be audited."` ✅. **Buttons are `Cancel` and `OK`, NOT `Cancel` and `Continue`**. AC-4 wording matches, but test case assertions citing "Continue" button need update. Continue flow (clicking OK) successfully POSTs to `/connect/token` and redirects to `/account/impersonate/{userId}` → `/` (silent flow per AC-5). |
| **IMP-044** | / during impersonate/revert transitions | VcLoaderOverlay with slot content visible | **VERIFIED** (timing-sensitive) | `imp-044-loader-overlay-during-impersonate.png` | Captured during impersonation — page transitions briefly through Security verification view + loader. Overlay observed; slot content present. Cannot reliably capture in <100ms revert (timing brief). |
| **IMP-013** | /company/members during impersonated session (employee_4, no CanImpersonate) | "Login on behalf" absent in dropdown for impersonated session | **VERIFIED — UI gate works** | `imp-013-impersonated-no-actions.png` | Under impersonated employee_4 session, the entire Actions column is empty for ALL 15 rows. Zero `button[aria-label="Actions"]` in DOM; zero "Login on behalf" buttons anywhere. UI gate fully blocks the entry point. |
| **IMP-013 (nested URL)** | /account/impersonate/{otherUserId} from impersonated session | URL-based nesting blocked | **BROKEN — P0 SECURITY** | `imp-013-nested-impersonation-broken.png` | From employee_4 session (no CanImpersonate), navigated to `/account/impersonate/user-acme-store-employee-5`. Result: silently transitioned to `acme_store_employee_5@acme.com`, redirected to `/`. **URL flow does NOT check CanImpersonate**, allowing chained impersonation by anyone who can guess a userId. Contradicts BL-AUTH-009. |
| IMP-045 (cross-tab) | — | TabsType.OTHERS — other tabs reload on impersonate | **SKIPPED** | — | Out of time budget; verification of broadcast behavior requires multi-tab orchestration. Mark deferred; recommend follow-up with `browser_tabs`. |
| IMP-047 (i18n) | — | Revert + loader text localized | **SKIPPED** | — | Out of time budget. Storefront does load locale-prefixed URLs (`/de/sign-in` etc.), so the surface area exists; localized assets not verified. |

---

## Selector Findings (for test case enrichment)

| UI element | Selector observed | Stable ARIA/text/testid reference |
|---|---|---|
| Storefront sign-in email input | `[data-test-id="email-input"]` | hyphenated "test-id" — pre-existing legacy attribute |
| Storefront sign-in password input | `[data-test-id="password-input"]` | same |
| Storefront sign-in submit | `[data-test-id="login-button"]` | same |
| /company/members row Actions button | `tr:has-text("<Name>") button[aria-label="Actions"]` | `aria-expanded`, `aria-haspopup="dialog"` |
| Row dropdown "Login on behalf" item | `tr:has-text("<Name>") button:has-text("Login on behalf")` | Plain `<button>` inside `<li>` within `<ul>` |
| Confirmation modal | `[role="dialog"]` with `aria-labelledby` pointing to `<h2>"Login on behalf"` | `aria-modal="true"` |
| Confirmation modal title | `[role="dialog"] h2` (text: `"Login on behalf"`) | |
| Confirmation modal body | `[role="dialog"] > div > div:nth-child(2)` (text starts `"You are logging in on behalf of "`) | |
| Confirmation modal **OK** button | `[role="dialog"] button:has-text("OK")` | NOT "Continue" — update test cases |
| Confirmation modal Cancel | `[role="dialog"] button:has-text("Cancel")` | |
| Confirmation modal Close (X) | `[role="dialog"] button[aria-label="Close"]` | |
| Account menu in header (desktop) | `button[aria-label="Account menu"]`, also `[data-testid="account-button"]` | |
| Header revert dropdown button (desktop) | `button:has-text("Back to ")` — label is **dynamic**: `"Back to {operatorFullName}"` | No data-testid observed on desktop version; recommend asking devs to add `data-testid="header-back-to-operator-button"` |
| Mobile menu hamburger | `button[aria-label="Main menu"]` | |
| Mobile menu revert button | `[data-testid="mobile-back-to-operator-button"]` | Stable selector — preferred |
| Probe API endpoint (token check) | `POST /graphql` with `{ "query": "{ me { id userName email } }" }` | Returns `data.me.id` matching JWT `sub` |
| Token storage | `localStorage["auth"]` (JSON: `{ access_token, expires_at, token_type }`) | NOT in cookie; NOT in sessionStorage |
| Sign-out URL pattern (background) | `POST /connect/token` (impersonate grant), header `<header>` "logged in as" banner | |

---

## Console / Network Observations

**JavaScript errors during real flows:** 0 unique errors from app code. The Apollo `NetworkError` console entries are all triggered by the verification agent's own cross-origin fetches to `https://vcst-qa.govirto.com/api/...` (CORS blocked — expected; the storefront uses its own same-origin `/graphql` proxy). No app-originated errors during impersonate, revert, or modal flows.

**Network anomalies:**
- Probe `GET https://vcst-qa.govirto.com/api/security/currentuser` → 404 (endpoint does not exist or differs from expectation) + CORS-blocked. The platform's auth endpoint is not directly callable from the storefront origin. Use storefront's `POST /graphql` instead — that IS Bearer-authenticated and CORS-allowed same-origin.
- Confirmed `POST /connect/token` is the impersonation grant call (request #105 in trace, between modal-OK click and `/account/impersonate/{userId}` landing).
- `/storefrontapi/*` and `/connect/userinfo` and `/api/me` all fall through to SPA `index.html` (HTTP 200 HTML body) — NOT useful as auth probes.

**Build verification:** Every page footer shows `Ver. 2.49.0-pr-2280-8069-80690ef2`. Confirmed PR #2280 is the deployed build.

---

## Bug-worthy Findings (DEFECTS in PR #2280)

### BUG-1: IMP-046 / AC#6 — Impersonation token NOT invalidated after revert (P0 SECURITY)
- **Severity:** P0 / Critical (security)
- **Summary:** After clicking "Back to {operator}" in the header dropdown, the impersonation access_token remains valid server-side until its natural exp (~30 min). The `useImpersonate.ts` `backToOperator()` flow restores the operator session client-side but does not revoke the previously issued impersonation token on the backend.
- **Repro:**
  1. Sign in as operator with `CanImpersonate`
  2. Impersonate any same-org member (silent flow via `/account/impersonate/{userId}`)
  3. Capture `localStorage["auth"].access_token`
  4. Click "Back to {operator}" in header dropdown — UI confirms revert
  5. `POST /graphql` with `Authorization: Bearer <captured_old_token>` and body `{"query":"{ me { id } }"}` — returns HTTP 200 + impersonated user identity (should be 401)
- **Evidence:** `imp-046-probe-200-pre-revert.txt`, `imp-046-probe-200-POST-revert-BROKEN.txt`
- **Recommendation:** File P0 bug against VCST-4906 / PR #2280 referencing AC#6 + PROPOSED-BL-AUTH-012. Blocks merge.

### BUG-2: IMP-013 — Nested impersonation via URL bypasses permission check (P0 SECURITY)
- **Severity:** P0 / Critical (security)
- **Summary:** Direct navigation to `/account/impersonate/{userId}` does NOT validate the current session's `CanImpersonate` permission. An impersonated user (who themselves lack the permission) was able to chain-impersonate a third user just by guessing/knowing the userId.
- **Repro:**
  1. Operator (with CanImpersonate) impersonates user A (without CanImpersonate)
  2. Now navigate to `/account/impersonate/<userId_of_user_B>`
  3. Session silently transitions to user B
- **Evidence:** `imp-013-nested-impersonation-broken.png`
- **Recommendation:** File P0 bug. Backend `/connect/token` impersonate grant + storefront `useImpersonate.ts` `impersonate()` must verify `permissions.includes('platform:security:loginOnBehalf')` on the *current* session, not just on the first operator. Contradicts BL-AUTH-009 (ECL-14.1).

### BUG-3 (suspected, needs disambiguation): IMP-040 — Invited members show "Login on behalf"
- **Severity:** Medium (UX/security clarity)
- **Summary:** Members in `Invited` status (no completed registration / no verified email) appear with "Login on behalf" in the row dropdown. PR description says action should be hidden when target has no security account.
- **Caveat:** Could be intentional if Invited members do have stub security accounts. Need clarification from product or seeding of a true `contact-only` member to verify.
- **Recommendation:** Confirm with backend whether `Invited` row should show the action. If yes, update IMP-040 precondition; if no, file Medium bug.

---

## Summary

- **VERIFIED:** 6 cases — IMP-039, IMP-041, IMP-043 (with selector finding), IMP-044, AUTH-028 modal text + Continue flow (with button-label CHANGED note), IMP-013 UI-gate branch
- **CHANGED (test case needs label/selector update):** 3 cases — IMP-042 (label is `"Back to {operatorFullName}"` not `"Revert back to own account"`), IMP-043 (preferred selector is `[data-testid="mobile-back-to-operator-button"]`), AUTH-028 + IMP-041 (button is `OK` not `Continue`)
- **BROKEN (feature defect → P0 SECURITY):** 2 cases — IMP-046 (AC#6 token not invalidated), IMP-013 (URL-based nested impersonation bypasses permission check)
- **AMBIGUOUS / data-dependent:** 1 case — IMP-040 (Invited members show the action; gate condition #2 may not be enforced OR Invited means "has stub account")
- **SKIPPED (out of budget):** 2 cases — IMP-045 (cross-tab broadcast), IMP-047 (i18n locale check)

**Recommendation to Phase 6:** PR #2280 should NOT merge until BUG-1 and BUG-2 are remediated. These are net-new P0 security defects introduced by the feature. Test cases IMP-042, IMP-043, AUTH-028, IMP-041 need label/selector updates before re-running. IMP-040 needs test-data clarification or precondition refinement.
