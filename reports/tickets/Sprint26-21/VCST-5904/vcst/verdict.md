# VCST-5904 — BLOCKED
Significant bugs: 1 in scope, 0 outside — the code challenge holds at API level on vcst (MFA 3.1000.0-pr-1-cf83, Platform 3.1090.0-pr-3133, OTP 3.1001.0-pr-3-d978, theme 2.61.0-pr-2570; deployment UNKNOWN in the bundle, MFA/OTP/platform LIVE and theme PINNED per deploy:pr --verify), but the Backoffice code screen and the storefront code step never ran, so R6 (High) has no result and the ticket cannot be signed off.

| AC | Result | Evidence |
|---|---|---|
| AC-1 setting to enable MFA | PASS | C-1, C-2 (global + per-store settings, allowed values) |
| AC-2 code sent after login | PASS | C-1, C-3 (challenge 400 `two_factor_required`, one journal row to the employee) |
| AC-3 sent as email notification | PASS | C-3 (`MfaSignInEmailNotification`, active) |
| AC-4 employee receives the code | UNVERIFIED | C-3: every MFA/OTP notification on vcst ends Error (SendGrid credits); delivery never seen |
| AC-5 employee can enter the code | API PASS · UI BLOCKED | C-4 `mfa` grant; C-5 not run (global-on is the ac-checks window only) |
| AC-6 right code signs in to admin UI | API PASS · UI BLOCKED | C-4 (`amr=mfa`, current-user 200); C-5 not run |
| AC-7 wrong code: error, not signed in | API PASS · UI BLOCKED | C-7, C-8, C-9; C-6 and C-17 not run |
| AC-8 new code on demand | API PASS · UI BLOCKED | C-12, C-13 (resend, old code refused, `resend_too_soon`); C-15 not run |
| AC-9 ready for SMS / Authenticator | PASS (shape only) | C-53 `providers[]` array; no second provider exists to observe |
| AC-10 per Platform and per Store | REST PASS on stand-in stores · storefront UI BLOCKED | C-22…C-26, C-28, C-29, C-35 on AGENT-TEST-MFA5904, not B2B-store; C-16…C-20 not run |

## Bugs
- Medium OTP code boxes' resting border 1.48:1 light / 1.88:1 dark (WCAG 1.4.11, BL-A11Y-003), `sign-in-code-input.vue:148`, new in vc-frontend#2570 — `investigations/C-69/` (root-cause.md, evidence-index.md); no qa-bug report yet (not filed). BL-A11Y on a functional ticket: filed standalone, does not fail this verdict.
- Not a bug, dismissed KNOWN_ISSUE: Medium C-65 account enumeration on `/api/otp/request` / `otp_email` / OTP form (config-gated by DetailedErrors, on for vcst; KB-AF607E75, KB-33B89BDD, KB-9AF5645D) — PO list.
- Open PO question, not a defect: C-33 / C-66 — a store-refused customer gets `two_factor_required` and a code email before the store rule (#3133 documents challenge-before-validators). Row C-33 recorded FAIL Medium; triage says re-word to PASS (recorded).

## Noticed
- C-67 password step sends a new code email inside the 30 s interval (once seen, once not; per-instance limiter) — exploratory notes
- C-68 sign-in log: top-account click leaves a hidden userName filter — screenshots/exp-signin-log-awaiting.png
- C-70 Resend / Use a different email links 18 px tall (BL-UI-006) — vis-otp-code-step-375m.png · C-71 error banner shifts the code boxes 46 px (BL-UI-003) — vis-otp-code-filled-375m.png · C-72 Resend: no visible "code sent" in two stills, needs a timed look — vis-otp-resend-768.png
- Doors recorded, never FAIL: `otp_email` alone issues tokens (C-34); trusted-store request skips the code (C-32, VCST-6495); administrator naming a Disabled store gets tokens (C-27); a refresh token minted before global-on survives (C-38); Basic and Backoffice follow the global setting only (C-29, C-35)

## Not tested, and why
- C-5, C-6 Backoffice code screen — needs global-on in a browser; the plan allows it only in the ac-checks REST window (plan gap)
- C-15…C-20, C-54 storefront code step, impersonation — shared B2B-store StoreMode write refused; own stores have no storefront url (R6 High, R10)
- C-56 OTP-off screen — shared B2B-store OtpSignIn.Enabled write refused
- C-36 external sign-in — no external IdP account on vcst; source shows `bypassTwoFactor: true` at ExternalSignInService.cs:75 (not a result)
- C-49 `lockout_disabled` — `lockoutEnabled=false` is not settable through the API (KB-87EC0A28)
- Mind map — U43, read only in a run · Coverage triage + regression — U7, 363 cases at risk in 78 suites go to /qa-test-lifecycle · Verifier — run by /qa-test-strategy before approval
- vs. DESIGN — SKIPPED, no design link · Coffee preset not auditable · strategy out of scope: lockout race (111971), VCST-6495, VCST-6490, MFA × unconfirmed email (112285), `/connect/session`, tile options

## Suspicions
- confirmed: S-1 (C-34) · S-9 (C-27) · S-10 trusted-store half (C-32) · S-11 (C-8: after 5 wrong codes the right one is refused, 900 s) · S-14 (C-10, confounded by the superseded code) · S-17 (C-30) · S-19 (C-33, C-66)
- refuted: S-2 (C-43) · S-3 (C-42) · S-10 no-storeId half (C-31) · S-12 (C-14, a new email did go out; an earlier own-store probe saw none) · S-15 (C-11) · S-20 (C-52) · S-21 on HTTPS only (C-64) · S-22 (C-60) · S-23 (C-61)
- not decided: S-4 (C-18) · S-5 (C-20) · S-6 (C-15) · S-7 (C-54) · S-8 (C-19) · S-16 (C-5) · S-13 (C-49; C-50 reads default admin lockoutEnabled=true) · S-18 (C-36) · S-24 (C-58, failed resend not provoked)

## Data
Created 212 AGENT-TEST- entities (72 users, 54 contacts, 41 organizations, 42 memberships, 2 stores, 1 storefront user) · removed 0 (teardown waits for the human) · settings restored and re-read: MultiFactorAuthentication.Enabled false after one 51 s global-on window (13:44:20Z–13:45:11Z); own-store StoreMode/OtpSignIn back to Enabled/true; no shared B2B-store setting written (writes refused). Another tester ran this ticket on the same stand today; no row was BLOCKED for a changed setting.

## Context used
Strategy reports/tickets/Sprint26-21/VCST-5904/vcst/test-strategy.md · Round 1 (deep; Reconciliation table left empty in the file, filled here) · Model test-model.md · Checklist testing-checklist.md (C-1…C-72: 51 PASS, 9 FAIL, 12 BLOCKED) · Domain map PRESENT · Mind map read only (auth.signin.mfa.*) · Exploratory exploratory/SBTM-VCST-5904-2026-10-22.md · Visual visual-notes.md · Triage triage-report.md · PRs vc-module-mfa#1, vc-platform#3133, vc-module-otp#3, vc-frontend#2570, vc-module-customer#321, vc-frontend#2477

## Cost
| Step | Input-equivalent | Share | Output | Active min |
|---|---|---|---|---|
| ui-checks | 26.27M | 23.1% | 0.00M | 12.8 |
| visual | 20.47M | 18.0% | 0.00M | 7.4 |
| exploratory | 19.88M | 17.5% | 0.00M | 14.5 |
| ac-checks | 18.90M | 16.6% | 0.00M | 23.4 |
| orchestrator | 11.89M | 10.5% | 0.04M | 16.6 |
| test-model | 6.60M | 5.8% | 0.00M | 9.4 |
| investigate | 5.09M | 4.5% | 0.00M | 3.5 |
| triage | 3.12M | 2.7% | 0.00M | 4.1 |
| checklist | 1.56M | 1.4% | 0.00M | 4 |
| **total** | 113.77M | 100% | 0.05M | 95.7 (wall 167.1) |
