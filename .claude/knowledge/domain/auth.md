---
domain_slug: auth
applicability: universal
rationale: |
  Storefront sign-in and account access, plus the Admin-SPA security surfaces that govern it:
  password sign-in, the OTP email sign-in (VCST-5748, deployed pre-merge on vcptcore_qa1), external
  identity providers, account lockout, organization-scoped access refusal, the sign-in audit log,
  password reset, sign-out, store-access rules (own store / trusted groups), and impersonation
  (Login on behalf). Built because VCST-5748 needed it and none existed — auth is Domain 5 of the BL
  oracle (17 invariants) but had no persistent surface map.
generated: 2026-09-29
rev: 1
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/Password reset/admin-password-reset.md
  - reports/ba/Organization roles/ (cited only at the auth/org-access boundary, BL-AUTH-012/013/015/016)
  - reports/tickets/Sprint26-18/VCST-5898/summary.json (sign-in audit log ticket, tested 2026-09-17 pre-merge)
  - .claude/knowledge/oracles/business-logic.md Domain 5 (BL-AUTH-001..017)
  - live enumeration on vcptcore_qa1 (storefront, Admin SPA, REST/token endpoint), 2026-09-29
  - VirtoCommerce.OTP 3.1000.0-pr-1-3e73 (vc-module-otp#1), vc-platform#3114 (3.1074.0-pr-3114-5829), vc-frontend#2477 (2.59.0-pr-2477-6dac)
  - .claude/knowledge/domain/release-ledger.md (ledger_through 3.1054.0)
  - config/test-suites.json + regression/suites/Frontend/auth/** + regression/suites/Backend/platform/101-platform-sign-in-log.csv
  - VirtoOZ StorefrontUserGuide + PlatformUserGuide, queried 2026-09-29
excludes: >
  Full SSO round-trip against a real Google/Entra ID/Virto IdP (no IdP credentials on the stand);
  the Admin "Active Sessions" feature beyond locating it (§3 D3); load/perf of the sign-in log's
  buffered writer; organization membership-status mechanics beyond the auth/org-access boundary
  (owned by the b2b domain map); password-complexity policy and account registration.
---

# Auth (storefront sign-in & account access) — domain map

> Refresh with `/qa-domain-map auth`. This file answers **what the feature is and where its
> surfaces are**. It does not carry behavioural rules — those are `BL-AUTH-*` in
> `oracles/business-logic.md` — and it never grounds an assertion as `{DOC}`.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and not to be treated as true.

## §1 — Purpose and value chain

**Purpose: a visitor establishes an authenticated session by one of several methods, the platform
resolves which organization (if any) that session acts within, and every subsequent request carries
that identity + org context until the session is explicitly ended or expires. CONFIRMED** —
reconstructed from source + live; neither user guide states it as one sentence.

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | Visitor picks a sign-in method | Storefront `/sign-in`: OTP-email (the DEFAULT view when store setting `OtpSignIn.Enabled` is true), password (one click behind "Sign in with a password instead"), or an external IdP button (Google, Microsoft Entra ID). Admin `/#!/login`: password + Entra ID / Google / Virto — no OTP. **CONFIRMED live, both surfaces.** |
| 2 | Method-specific challenge | Password: `POST /connect/token grant_type=password`. OTP: `POST /api/otp/request {email, storeId}` (schedules `OtpSignInEmailNotification`) then `POST /connect/token grant_type=otp_email {email, code, storeId}`. **CONFIRMED live** at the back-office origin; from the storefront origin `/api/otp/request` is refused by the ingress unless a route is configured (§3 D5). |
| 3 | Token issuance + org resolution | Active organization resolved by BL-AUTH-015's 5-step chain over *accessible* orgs. **CONFIRMED at source** (BL-AUTH-015). |
| 4 | Session persisted, surfaces unlocked | Tokens in storage; account menu, orders, company navigation, checkout reachable. Admin and storefront sessions are separate. **CONFIRMED live.** |
| 5 | Access can be refused mid-chain | Global lockout (`ApplicationUser.LockoutEnd`, one counter shared by the password and OTP grants — the OTP module calls `AccessFailedAsync` on a wrong code) vs org-scoped refusal (BL-AUTH-012/013/015/016). OTP responses carry `lockoutSecondsRemaining`; its populated value is **UNVERIFIED** (G1). |
| 6 | Operator acts as another user | Login on behalf from Company → Members (storefront) or the Admin user blade, gated by `CanImpersonate`. **CONFIRMED at doc + source** (BL-AUTH-008..011). |
| 7 | Session ends | Storefront popup-only sign-out (BL-AUTH-007). Lockout expiry and org unlock are the two un-refuse paths. **CONFIRMED at source.** |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| Anonymous storefront visitor | Browse, choose a sign-in method, register, request a password reset or an OTP code | `CONFIRMED` live |
| Registered Customer (single-org) | Sign in by any enabled method to its own store or a store whose `trustedGroups` include it | `CONFIRMED` at source (OTP: `OtpService.CanSignInToStoreAsync`; password: xAPI `ContactSignInValidator`) |
| Registered Customer (multi-org) | Same, plus the org switcher over *accessible* orgs (BL-AUTH-016) | `CONFIRMED` at source |
| Company member with `Login on behalf` | Impersonate a same-org colleague who has a security account | `CONFIRMED` at doc |
| Support/Admin operator with `CanImpersonate` | Impersonate any user from Contacts or Security → User information | `CONFIRMED` at doc + source |
| Platform Administrator / non-Contact account | Password grant on the storefront is refused (`user_cannot_login_in_store`, kb KB-7A4C260E); the **OTP** store rule exempts administrators and non-Contact members (`CanSignInToStoreAsync` returns true) — whether a storefront session then works is **UNVERIFIED** (G9) | mixed |
| External-IdP-linked account | Google / Entra ID buttons on both surfaces; round-trip not exercised | `UNVERIFIED` (excluded) |

## §2 — Surface inventory

### Storefront

- **Entry points**: `/sign-in`, `/forgot-password`, `/sign-up`; the header "Sign in" link. No `/sign-out` route (BL-AUTH-007).
- **Homepage login section** (`login-form-section.vue`): a CMS block that renders the same sign-in form (OTP-aware since vc-frontend#2477). B2B-store's homepage on vcptcore_qa1 carries no such block, so it was not observable — **UNVERIFIED live, CONFIRMED at source**.
- **`/sign-in` OTP view (default when enabled)**: "We'll email you a code. No password needed.", Email, **Continue**, "Sign in with a password instead", then the IdP row. Verify step: "Check your email" header, masked email, 6-cell code input (auto-submits on the 6th digit), **Sign in**, **Resend code**, **Use a different email**. Terminal steps `locked` (countdown) and `generic` ("We couldn't sign you in"). **CONFIRMED live** (request view) / at source (verify + terminal steps).
- **`/sign-in` password view**: Email, Password, Remember me, "Forgot your password?", Sign in, Sign up, "Sign in with a one-time code instead" (only when OTP is enabled), IdP row. **CONFIRMED live.** Remember me is vestigial per kb KB-9D80EE6B (vcst_qa) — `UNVERIFIED` here.
- **`/forgot-password`**: single Email field, deliberately identical message for a nonexistent account. **CONFIRMED live.**
- **What is NOT here**: no attempts-remaining counter on the password form; no store indicator on the sign-in form (store access is resolved server-side).

### Admin SPA (back office)

- **`/#!/login`**: Login, Password, Remember me, Forgot your password, Log in; IdPs Entra ID, Google, Virto. **CONFIRMED live.**
- **Security module**: Users, Roles, OAuth applications, **Sign-in log**. **CONFIRMED live.**
- **Sign-in log** (VCST-5898): period picker, attempts chart, tiles (Sign-ins, Failed attempts, Users signed in, On behalf), top IPs / accounts / failure reasons, by-store, and a records grid (Date, User, Outcome + reason, **Type**, IP). `Type` carries **`OTP`** alongside Password / Impersonation / ImpersonationRevert / Logout. **CONFIRMED live.**
- **Store settings**: `OtpSignIn.Enabled` lives in the store's Settings, group **OTP Sign-In → General** (setting descriptor `GroupName = "OTP Sign-In|General"`, dev manual steps). **CONFIRMED at source + REST**; the blade itself not click-walked (G3).
- **Notifications**: `OtpSignInEmailNotification` (subject "Your sign-in code", body carries the 6-digit code), editable per store; sent messages visible in the notification journal. **CONFIRMED live.**
- **What is NOT here**: no Active Sessions tab in Security (§3 D3); per-user unlock control not located (G8).

### API / contract layer

- `POST /connect/token grant_type=password` — `storeId` required (kb KB-7A4C260E); lockout per BL-AUTH-003.
- `POST /api/otp/request {storeId, email}` — anonymous; returns `{outcome, maskedEmail}`. Outcomes `CodeSent / StoreNotFound / OtpDisabled / UserNotFound / DuplicateEmail / LockoutDisabled / StoreAccessDenied`; the four identity-revealing ones are masked as `CodeSent` only when `PasswordLogin:DetailedErrors` is false. **CONFIRMED live** (vcptcore_qa1 runs DetailedErrors = true, so `UserNotFound` is returned as-is).
- `POST /connect/token grant_type=otp_email {storeId, email, code}` — error codes `missing_parameter`, `store_not_found`, `otp_disabled`, `user_not_found`*, `lockout_disabled`*, `account_locked`*, `user_cannot_login_in_store`, `invalid_code` (* only when DetailedErrors). **CONFIRMED live** for missing_parameter, user_not_found, invalid_code, and a 200 token.
- `GET /api/stores/{id}` — `trustedGroups` (B2B-store ↔ New-super on vcptcore_qa1). **CONFIRMED populated**; cross-store behaviour UNVERIFIED (G6).
- **What is NOT here**: no GraphQL sign-in mutation (kb KB-0407F36E); no OTP code-length / expiry / resend-cooldown setting — all owned by ASP.NET Identity's Email token provider.

## §3 — Where the layers disagree

| # | Disagreement | Verdict |
|---|---|---|
| D1 | StorefrontUserGuide "Sign In" describes email + password only; the live default view is OTP-first with password one click behind, plus two IdP buttons | `CONFIRMED` — docs trail the build; not a defect |
| D2 | Admin sign-in offers three IdPs (Entra ID, Google, Virto); storefront offers two | `CONFIRMED` live |
| D3 | PlatformUserGuide "Manage Active Sessions" says Security can monitor/terminate sessions; this build's Security menu has no such tab | `CONFIRMED` absent at that location; elsewhere UNVERIFIED (G4) |
| D4 | OTP grant responses carry `lockoutSecondsRemaining`; BL-AUTH-003 names no such field for the password grant | `CONFIRMED` shape difference only |
| D5 | vc-frontend calls `/api/otp/request` relative to the storefront origin (its dev proxy forwards all of `/api`), but a Virto Cloud storefront ingress forwards only the paths listed in the env's `infra/environments.yml` `routes` — on vcptcore_qa1 `/api/otp` is not listed, so the edge answers **405** | `CONFIRMED` live 2026-09-29 (VCST-5748 run) |

## §4 — Coverage shape

Basis: `config/test-suites.json`, read directly 2026-09-29.

| Suite | Name | Feature-relevant | File |
|---|---|---|---|
| 031 | Auth Login & Register | 37/37 | `regression/suites/Frontend/auth/031-auth-login-register.csv` |
| 032 | Auth Session & RBAC | 20/20 | `regression/suites/Frontend/auth/032-auth-session-rbac.csv` |
| 033 | Auth Company & Account Menu | 15/15 | `regression/suites/Frontend/auth/033-auth-company-account-menu.csv` |
| 082 | Auth Impersonation / Login on Behalf | 48/48 | `regression/suites/Frontend/auth/082-auth-impersonation.csv` |
| 101 | Platform — Sign-in Log | 46/46 | `regression/suites/Backend/platform/101-platform-sign-in-log.csv` |
| 044 | Security Tests | partial of 39 | `regression/suites/Frontend/cross-cutting/044-security-tests.csv` |
| 042 | Smoke Tests | partial of 34 (tagged `auth`) | `regression/suites/Frontend/smoke/042-smoke-tests.csv` |
| 078 | Backend Smoke — Platform, API & GraphQL | partial of 27 (tagged `auth`) | `regression/suites/Backend/smoke/078-backend-smoke-tests.csv` |

**Zero coverage — a hole, not a deliberate exclusion:** the manifest holds no `otp` suite, case or tag (2026-09-29). The feature is ahead of the release ledger.

**Cross-corpus dependency:** `[PRE:SIGNIN_AS]` (`.claude/knowledge/execution/test-execution-preflight.md` §SIGNIN_AS) fills a password on `/sign-in`; with `OtpSignIn.Enabled` true the default view has no password field, so every suite using it depends on this domain's toggle.

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | Populated `lockoutSecondsRemaining` behaviour on the OTP grant | OPEN — needs a disposable account locked on purpose |
| G2 | Whether the non-locked password grant distinguishes `UserNotFound` from a wrong password on the wire | OPEN |
| G3 | Click-walk of the store Settings → OTP Sign-In → General blade | OPEN |
| G4 | Whether "Manage Active Sessions" exists elsewhere in the build | OPEN |
| G5 | Full SSO round-trip against a real IdP | OPEN — no IdP credentials |
| G6 | Trusted-group cross-store sign-in (B2B-store ↔ New-super) | OPEN — a New-super contact exists on vcptcore_qa1 |
| G7 | OTP happy path end-to-end in the storefront UI | OPEN — API path CONFIRMED; UI blocked by D5 |
| G8 | Per-user lockout/unlock control in Security → Users | OPEN |
| G9 | Administrator / non-Contact OTP sign-in on the storefront — exempted by the OTP store rule, refused by the password path | OPEN |

## §6 — Prior-art verdicts

| Claim | Verdict |
|---|---|
| `reports/ba/Password reset/admin-password-reset.md` — identical message for a nonexistent account, one-time link, rate-limited repeats, journal fallback | `CONFIRMED` still current; storefront `/forgot-password` follows the same design |
| `reports/tickets/Sprint26-18/VCST-5898/summary.json` — sign-in log, tested pre-merge | Merged and live; "Total sign-ins has no success rate" re-confirmed; other four gaps UNVERIFIED |
| `reports/ba/Organization roles/*` | Boundary only (BL-AUTH-012/013/015/016); nothing re-derived or contradicted |

## §7 — Amendments

(none — rev 1, first build)
