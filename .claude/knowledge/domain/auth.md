---
domain_slug: auth
applicability: universal
rationale: |
  Storefront sign-in and account access, plus the Admin-SPA security surfaces that govern it:
  password sign-in, the OTP email sign-in (VCST-5748, released as VirtoCommerce.OTP 3.1000.0), the
  multi-factor second step after a password (VCST-5904, VirtoCommerce.MFA — DEPLOYED BUT SWITCHED OFF
  on vcst, absent on vcptcore_qa1), external identity providers, Punchout sign-in (an alternative
  session-establishing method, vcptcore_qa1 only), account lockout, organization-scoped access refusal
  (fallback now released, VCST-6132), the sign-in audit log, password reset, sign-out, store-access
  rules (own store / trusted groups), the Admin-UI entry restriction and impersonation (Login on
  behalf). Auth is Domain 5 of the BL oracle (17 invariants, `bl:extract -- --domain auth`).
  Rev 2 adds the MFA surface, the second stand (vcst), the Admin per-user session/lock surface that
  rev 1 wrongly reported absent, and corrects four rev 1 claims (see "Changed since rev 1").
generated: 2026-10-21
rev: 2
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/vcst-5748-otp-sign-in-guide.md (87 lines), reports/ba/vcst-6132-otp-organization-fallback-developer-guide.md (81) — verdicts in §6
  - reports/ba/test-models/VCST-5748-2026-09-29.md (197), reports/ba/test-models/VCST-6132-2026-10-20.md (235) — read; their {HYPOTHESIS} rows re-checked, not trusted
  - reports/tickets/Sprint26-21/VCST-6132/summary.json + testing-checklist.md (29 rows, FULL, PASS WITH NOTES)
  - reports/knowledge/BL-AUDIT-2026-10-20.md (BL-AUTH-012/013/016 synced to VCST-6132; "MFA: not observable until VCST-5904")
  - reports/ba/Organization roles/ (boundary only, BL-AUTH-012/013/015/016)
  - ABSENT from the working tree and git history (rev 1 cited them; cannot be re-read): reports/ba/Password reset/admin-password-reset.md, reports/tickets/Sprint26-18/VCST-5898/summary.json
  - .claude/knowledge/oracles/bl/auth.yaml BL-AUTH-001..017 (orientation only); .claude/knowledge/domain/release-ledger.md (ledger generated 2026-10-20 — predates MFA/OTP#2/passkeys; carries no MFA row)
  - live enumeration, both stands, 2026-10-21, `playwright-edge` + REST: vcst = platform 3.1088.0-pr-3133-23a5-vcst-5904, VirtoCommerce.MFA 3.1000.0-pr-1-41b3, VirtoCommerce.OTP 3.1001.0-pr-3-d978, Customer 3.1030.0, Xapi 3.1027.0, Store 3.1010.0, theme 2.61.0-pr-2570-5cc5-5cc519ff; vcptcore_qa1 = platform 3.1087.0-pr-3134-a3d2, OTP 3.1000.0, Customer 3.1030.0-pr-321-c54f, Punchout 3.1000.0-pr-2-05b5, Store 3.1010.0, no MFA module
  - source via gh CLI (GitHub MCP down): vc-module-mfa#1, vc-platform#3133, vc-module-otp#2 / #3, vc-module-store#189, vc-frontend#2570 (head 5cc519ff = deployed theme), vc-module-customer#321 (merged 2026-10-21, released as 3.1030.0), vc-platform#3144 / #3121; vc-frontend main router
  - .claude/knowledge/api/graphql-schema.md (introspected 2026-10-15, vcst) — no sign-in/MFA field exists in it; `store.settings.modules` and `authenticationTypes` re-queried live this pass
  - config/test-suites.json + regression/suites/** (csv-parse of every suite CSV, 2026-10-21)
  - VirtoOZ PlatformUserGuide, StorefrontUserGuide, PlatformDeveloperGuide, StorefrontDeveloperGuide, FrontendSourceCode, B2BExperts — all queried 2026-10-21
  - kb: KB-06FE6C8D KB-08CC76A3 KB-3CBA0D5F KB-9AF5645D KB-ED213173 KB-0080ED6D KB-4E1FD1E8 KB-83483C4E KB-0407F36E KB-7A4C260E KB-33B89BDD KB-6D7B2ED7 KB-903E980C KB-9D80EE6B KB-EF3CB7FB KB-262ADDFB KB-8646A9CB KB-F39ECA1A
excludes: >
  (carried, re-justified) Full SSO round-trip against a real Google/Entra ID/Virto IdP — still no IdP
  credentials on either stand. (carried, narrowed) The Admin per-user session list is now located and
  walked; TERMINATING a session is excluded because it is a mutation. (carried) Load/perf of the
  sign-in log's buffered writer. (carried) Organization membership-status mechanics beyond the
  auth/org-access boundary — owned by the b2b map (`b2b-organizations.md`, domain_slug `b2b`).
  (carried) Password-complexity policy and account registration (the email-verification setting is
  noted as a variant, G17). NEW: the MFA happy path with a real code, MFA enforcement and its limits —
  needs flipping `MultiFactorAuthentication.Enabled` / `StoreMode` on a shared stand, and the MFA
  code is PR-stage (vc-module-mfa#1 unmerged); a later pass once merged. NEW: Punchout cXML/ERP side
  and the Punchout mapping admin (suites 107/108 own them; only "Punchout is a sign-in method" is in
  scope here, §1 link 1). NEW: UCP/OAuth for agents (owned by `ucp.md`; boundary only).
  NEW: passkeys / sign-in-methods management (vc-platform#3144, VCST-6121 — open PR, not deployed) and
  the private `urn:vc:cookie-bridge` grant of vc-module-ai (existence only, §2 API).
---

# Auth (storefront sign-in & account access) — domain map

> Refresh with `/qa-domain-map auth`. This file answers **what the feature is and where its
> surfaces are**. It does not carry behavioural rules — those are `BL-AUTH-*` in
> `.claude/knowledge/oracles/bl/auth.yaml` — and it never grounds an assertion as `{DOC}`.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and not to be treated as true. A claim carried from rev 1 and not
re-walked is written `UNVERIFIED · rev 1 only` — rev 1 saw it, this pass did not.

**Mid-change callout (2026-10-21).** The MFA feature is spread over five OPEN PRs that are all
DEPLOYED on vcst: vc-platform#3133 (generic two-factor extension points), vc-module-mfa#1, vc-module-otp#3
(OTP opts out of the second factor), vc-frontend#2570 (code step on `/sign-in`). vc-module-otp#2
(OTP row inside the store "Authentication" blade, needs vc-module-store#189) is open and NOT deployed
on either stand. Passkeys (vc-platform#3144) open, not deployed. **Re-read §1 link 2, §2 and D6–D8 after
these merge or revert.** vc-module-customer#321 (VCST-6132) is no longer mid-change: merged and
released as Customer 3.1030.0 (2026-10-21), which vcst runs.

## Changed since rev 1

| Rev 1 claim | Now | Why |
|---|---|---|
| §2: "no Active Sessions tab in Security (D3)"; G4 "does it exist elsewhere?" | **DRIFT — rev 1 wrong.** The user blade (Security → Users → user, also Contacts → Accounts) has an **Active sessions** widget and a per-user **Lock account** toolbar button. D3 and G4 and G8 re-stated | walked on vcptcore_qa1, §2 Admin; PlatformUserGuide "Manage Contacts" describes the widget |
| D4: "OTP responses carry `lockoutSecondsRemaining`; BL-AUTH-003 names no such field for the password grant" | **DRIFT.** The field is part of the shared token-error envelope: a plain password `login_failed` carries `userId` and `lockoutSecondsRemaining` (null) on both stands, and a temporarily locked password grant carries it null (KB-262ADDFB). The populated value is still never observed | REST on both stands |
| D2: "Admin sign-in offers three IdPs (Entra ID, Google, Virto); storefront two" | **Narrowed.** Three on vcptcore_qa1 only; vcst Admin offers **two** (Microsoft Entra ID, "Google sign-in"). Storefront shows two on both | UI on both stands |
| D5: ingress answers 405 on `/api/otp/request` | **CLOSED for `/api/otp`** (200 on both storefront origins). **The same gap now exists for `/api/mfa/resend`** (405 on the vcst storefront origin) — new D8 | anonymous POSTs, both storefront hosts |
| G3 store Settings → OTP Sign-In click-walk | **CLOSED** (one control, "Enable OTP sign-in") | click-walked on qa1 |
| G6 trusted-group sign-in | **CLOSED for the password grant** (200 / `user_cannot_login_in_store`) | REST, qa1 |
| G7 OTP happy path in UI, "blocked by D5" | **CLOSED** — D5 no longer blocks; UI path run by suite 104 + VCST-6132 checklist rows 1–6; not re-driven by this pass | see G7 |
| G8 per-user lock control | **CLOSED** — "Lock account" in the user toolbar (the unlock label when locked is UNVERIFIED) | walked on qa1 |
| §1 link 6: gated by `CanImpersonate` | **DRIFT (name).** The permission id is `platform:security:loginOnBehalf`; `CanImpersonate` is not a permission | `GET /api/platform/security/permissions` |
| §4: suite 044 "partial of 39" | **DRIFT.** 044 has **34** cases (manifest + parse) | recounted |
| §4: OTP suites "Draft until a run promotes them" | **DRIFT.** 104 = 23 Automated + 7 Draft, 105 = 10 Automated + 11 Draft (51 cases, 33 promoted) | recounted |
| §6: two prior-art sources cited | **ABSENT** from tree and git history; their verdicts cannot be re-checked | `ls` / `git log` |
| header: OTP "deployed pre-merge" on qa1 | OTP is released (`3.1000.0`; vc-module-otp#1 merged 2026-10-02 per `gh`) | module list |
| NEW: stand set | rev 1 saw only vcptcore_qa1; vcst is now a second stand with a different module set (MFA present, Punchout absent) | see D14 |

## §1 — Purpose and value chain

**Purpose: a visitor establishes an authenticated session by one of several methods, the platform
resolves which organization (if any) that session acts within, and every later request carries that
identity and org context until the session ends or is refused. — reconstructed from source + live;
`UNDECLARED` in both user guides. `CONFIRMED` as a reconstruction (first written statement; cite
against it, do not treat it as authority).**
Where I looked: PlatformUserGuide, StorefrontUserGuide, PlatformDeveloperGuide, StorefrontDeveloperGuide,
FrontendSourceCode, B2BExperts (2026-10-21). The only purpose sentence found is for the Admin **Security**
module, not for sign-in: "The **Security** module provides various options to manage security and authentication for your online store or website." (https://docs.virtocommerce.org/platform/user-guide/security/overview). The storefront sign-in pages say *how*
("Enter you email and password", https://docs.virtocommerce.org/storefront/user-guide/registration_and_signing_in/sign-in), never *why*. B2BExperts returned only general B2B-portal articles — nothing on sign-in.

| # | Link, in the customer's words | Mechanism | Verdict |
|---|---|---|---|
| 1 | I pick a way to sign in | Storefront `/sign-in`: **OTP email form is the default view** when store setting `OtpSignIn.Enabled` is true (B2B-store on **both** stands), password one click behind "Sign in with a password instead", external IdP buttons from xAPI `authenticationTypes` minus Password. Punchout: a start link `/punchout/<token>` (qa1 only, §2). Admin `#!/login`: password + IdPs, no OTP | `CONFIRMED` live (both stands; Punchout `UNVERIFIED` live this pass — kb KB-CA2AE929) |
| 2 | The platform challenges me | Password: `POST /connect/token grant_type=password`. OTP: `POST /api/otp/request` → `grant_type=otp_email`. **MFA (VCST-5904): after a correct password the grant answers `400 two_factor_required` with `twoFactorToken`, `provider`, `providers`; the code is exchanged at `grant_type=mfa` (`POST /api/mfa/resend` re-sends); tokens issued that way carry claim `amr=mfa`; the Backoffice does the same through `POST /api/mfa/signin/send` + `/signin/verify`.** Required when `MultiFactorAuthentication.Enabled` (global) or the store's `StoreMode` says so; OTP and external sign-in opt out | password/OTP `CONFIRMED` live; MFA grant/endpoints `CONFIRMED` live for existence + error shape (bogus token), the real challenge `UNVERIFIED` (global setting is OFF on vcst, no mutation allowed — G10) |
| 3 | I get a token and land in an organization | Org resolution BL-AUTH-015 over *accessible* orgs; the fallback to another accessible org now applies to **every credential sign-in** — password, `otp_email`, `mfa` (Customer 3.1030.0 release note: "Fall back to an accessible organization on OTP and MFA sign-in (#321)"); `refresh_token` and impersonation get none | `CONFIRMED` live for password/OTP (VCST-6132 checklist, qa1); the `mfa` leg `CONFIRMED` at source only |
| 4 | My session is stored and surfaces unlock | Storefront keeps tokens client-side and calls `me`; the account menu shows user, org radio list, sign-out; Admin keeps a cookie session. The Admin lists a user's sessions (IP address, User agent) per user | `CONFIRMED` live (storefront on vcst, Admin on qa1) |
| 5 | Access can be refused | (a) global: `LockoutEnd`, one failed-attempt counter shared by password and OTP; five failures → temporary lockout code `user_is_temporary_locked_out` (KB-8646A9CB, KB-262ADDFB); (b) MFA's own wrong-code limit (`MaxCodeAttempts` 3, `code_attempts_exceeded`) — source only; (c) org-scoped refusal (BL-AUTH-012/013/015/016); (d) store rule `user_cannot_login_in_store` (checked before the password, KB-7A4C260E); (e) Admin UI entry denied to a signed-in account with no permission (route `#!/contact-admin`) | (a)(c)(d)(e) `CONFIRMED`; (b) `UNVERIFIED` |
| 6 | An operator acts as another user | Storefront Company → Members, or the Admin user blade "Login on behalf" (which opens the storefront at `/account/impersonate/<id>`, KB-EF3CB7FB), gated by permission `platform:security:loginOnBehalf`; grant `impersonate` | permission id `CONFIRMED`; flow `UNVERIFIED · rev 1 only` (+ KB-4E1FD1E8: no target guard) |
| 7 | The session ends — or the refusal is lifted | Sign-out via the account-menu popup only (no `/sign-out` route, BL-AUTH-007; lands on `/sign-in?returnUrl=<page>`); Admin user menu → Sign out; Admin "Terminate all" per user; lockout expiry; admin unlock; org unlock; MFA two-factor token expires (10 min) and a right code clears the wrong-code count | sign-out `CONFIRMED` live (both surfaces); the rest `UNVERIFIED` (terminate/unlock need a mutation — G16) |

**Reverse edges.** Lockout → expiry/unlock (`UNVERIFIED` live, needs a locked disposable account); session
→ terminate (`UNVERIFIED`, G16); MFA two-factor token → single redemption + expiry (source only, G10);
org fallback → restore next sign-in (VCST-6132 row 22, `CONFIRMED` by that run). **No reversal exists for a
consumed OTP code**: it replays (KB-06FE6C8D, `CONFIRMED` rev 1 on qa1; MFA PR adds a used-code store for
its own codes only).

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| Anonymous visitor | Browse, sign in by any enabled method, request a password reset, request an OTP code (`/api/otp/request`, anonymous), hit `/blocked` | `CONFIRMED` live |
| B2C customer, no org | Same, then no org label, no Organizations list, **no Corporate sidebar group** (observed on a personal account on vcst); token has no `organization_id` / `permission` claims | `CONFIRMED` live |
| Multi-org B2B buyer | Header "Org / user", Organizations radio list in the account popup, Corporate group (Company info / members / Sales reps) | `CONFIRMED` live (vcst) |
| Manager (account type) | Admin SPA user with permissions; 13 on qa1 | `CONFIRMED` (data count) |
| Customer account with zero permissions | Cannot enter the Admin SPA: lands on `#!/contact-admin` "Access denied" | `CONFIRMED` live (qa1) |
| Platform administrator (`admin`) | Admin SPA; on qa1 `lockoutEnabled=false` so it never locks there, and the OTP/MFA flows refuse accounts without lockout (`lockout_disabled`); on vcst it IS lockable and was locked twice in 25 minutes today | `CONFIRMED` live (see D-note under §5 G12) |
| Operator with `platform:security:loginOnBehalf` | Login on behalf | `UNVERIFIED · rev 1 only` |
| Account with unconfirmed email | qa1: 36 Customer + 9 Manager + 1 Administrator accounts have `emailConfirmed=false`; the MFA email provider needs a confirmed email (`mfa_provider_not_available`) — source | count `CONFIRMED` qa1; consequence `UNVERIFIED` |
| vc-shell / API apps | Password grant with no store; must handle `two_factor_required` once MFA is global (PR note) | `UNVERIFIED` |
| Punchout buyer | A mapped contact signed in from an ERP start link; sign-in log Type `punchout` | `CONFIRMED` in the log (qa1, 17 rows); journey `UNVERIFIED` |
| External-IdP-linked account | Google / Entra ID | `UNVERIFIED` (excluded) |

**Variants that change sign-in behaviour without changing code** (all `CONFIRMED` unless stated):
`OtpSignIn.Enabled` per store — B2B-store true on both stands, every other store false/unset (vcst has 7
stores, qa1 2); `MultiFactorAuthentication.Enabled` (vcst false, default false) and per-store
`StoreMode` (default "Use global setting", null on all 7 vcst stores); `trustedGroups` — qa1
B2B-store↔New-super, vcst B2B-store→Electronics but **TestStore→B2B-store one-way**;
`Stores.EmailVerificationRequired` — vcst B2B-store false, qa1 B2B-store true (`UNVERIFIED` effect, G17);
`PasswordLogin:DetailedErrors` — evidently on for both stands (the OTP request names unknown users, D11);
store authentication types (Password/Google/Entra on vcst, + Virto on qa1); module set (D14).

## §2 — Surface inventory

### Storefront

- **Routes** (source: vc-frontend `main` router; live status per route): `/sign-in` · `/sign-up` · `/forgot-password` · `/blocked` · `/account/change-password` — `CONFIRMED` live. `/reset-password` · `/set-password` · `/confirm-invitation` · `/account/confirmemail` · `/account/impersonate/:userId` · `/oauth/authorize` · `/auth/callback` · `/successful-registration` · `/403` — `UNVERIFIED` live (source only). `/punchout/<token>` — `UNVERIFIED` live (kb KB-CA2AE929, qa1). No `/sign-out` or `/logout` (BL-AUTH-007).
- **`/sign-in`, default view when OTP is on** (identical on both stands): "We'll email you a code. No password needed.", Email, **Continue**, "Sign in with a password instead", then "Or" and the IdP buttons. `CONFIRMED` live. Verify step, locked and generic steps `UNVERIFIED · rev 1 only` (+ KB-08CC76A3).
- **`/sign-in`, password view**: Email, Password (show/hide), Remember me, "Forgot your password?", **Sign in**, Sign up, "Sign in with a one-time code instead". `CONFIRMED` live. The IdP buttons follow the xAPI `authenticationTypes` order and drop `virto`: vcst "Entra ID, Google" (xAPI `Password, AzureAD, GoogleSSO`), qa1 "Google, Entra ID" (xAPI `Password, GoogleSSO, AzureAD, virto`). `CONFIRMED` live.
- **MFA code step** (vc-frontend#2570, theme head `5cc519ff` = the deployed footer "Ver. 2.61.0-pr-2570-5cc5-5cc519ff"): `SignInForm` swaps to `MfaVerifyForm` after `two_factor_required`; heading changes, the OTP link is hidden during it, "Resend code" counts down `resendSecondsRemaining`, errors another code cannot fix return to the password form; the impersonation dialog asks for the code the same way. `CONFIRMED` at source; **`UNVERIFIED` live** (MFA off; never rendered by this pass) — G10.
- **`/forgot-password`**: heading "reset your password", one Email field, **Submit**; a nonexistent address gets "We sent you a reset password link to your inbox" — the same as a real one. `CONFIRMED` live (vcst).
- **`/blocked`**: "Your account is blocked" + "contact the site administrator" link to `/contacts`. `CONFIRMED` live.
- **Account area** (signed in, vcst): sidebar group **User** = Profile, (Addresses, personal account only), Change password, Saved credit cards; group **Corporate** (B2B only) = Company info, Company members, Sales reps. Header account button → popup with the user, an icon-only sign-out button, and for multi-org buyers an **Organizations** radio list. Profile has no security settings: no MFA, no session list, no sign-in history. `CONFIRMED` live.
- **Homepage login section** (`login-form-section.vue`): not observed on either stand. `UNVERIFIED` (G19).
- **What is NOT manageable from the storefront**: turning OTP/MFA on or off; the user's own sessions; unlocking an account; sign-in methods; the MFA requirement is not even *readable* — see API.

### Admin SPA (back office)

- **`#!/login`** (both stands): Login, Password, Remember me, "Forgot your password?" (link `#!/forgotpassword`), Log in; IdPs — qa1: Microsoft Entra ID, Google, Virto; vcst: Microsoft Entra ID, "Google sign-in". `CONFIRMED` live. User menu: Manage profile, Change password, Sign out. `CONFIRMED` live (qa1).
- **Entry restriction**: a Customer account with zero permissions signing in lands on `#!/contact-admin` — card "Access denied", "You don't have access to this resource. Please contact your administrator", button "Login with other credentials". `CONFIRMED` live (qa1). Whether `PlatformUI.Access` is configured is `UNVERIFIED` (G15).
- **Security menu** (qa1): Users (167), Roles, OAuth applications, **Sign-in log**. vcst: Sign-in log `CONFIRMED`; the rest not enumerated (`UNVERIFIED`).
- **User information blade** (qa1): toolbar Save · Reset · **Change password** · **Lock account** · **Login on behalf**; fields Is administrator, Login, Email + Verified (Resend link), Status, Account type, Locked state, Last login date, Container (store); widgets Show contact, Roles, Changes, API key, **Active sessions**, **Sign-in log**. **Active sessions** blade: columns IP address, User agent; toolbar Refresh, **Terminate all**. `CONFIRMED` live. The Sign-in log widget's contents and the unlock label are `UNVERIFIED`.
- **Sign-in log**: tiles Sign-ins, Failed attempts, Users signed in, On behalf; lists Top IPs / Top accounts by failed attempts / Failure reasons / Sign-ins by store; records grid Date, User, Outcome (+ reason), Type, IP address; filters Last (30 min … All time, Custom), Outcome, Type, Store, IP address. `CONFIRMED` live, both stands. **vcst adds** Outcome "Awaiting second factor" and shows MFA rows (D6).
- **Settings**: Platform → **Security** (qa1: Account statuses, Account types, Cron for the tokens prune job, Default account status / type / external account status, Prune expired tokens, Black / White list, Return module version) and Platform → **Sign In Log** (cleanup cron…); **vcst adds "Multi-factor authentication"** (toggle, off) to Platform → Security. `CONFIRMED` live.
- **Store**: Settings widget → **OTP Sign-In → General → "Enable OTP sign-in"** (toggle) `CONFIRMED` click-walked (qa1); Settings widget → **Store → Security → "Multi-factor authentication"** (dropdown, "Use global setting") `CONFIRMED` (vcst); **Authentication** widget → "Store authentication types": Password, Google, Microsoft Entra ID, Virto, all active, **no OTP row** `CONFIRMED` (qa1; vcst widget not opened — `UNVERIFIED`); "Linked stores" field under Links; toolbar "Invite customers"; Notification / Notification log widgets `UNVERIFIED` this pass.
- **Notifications**: `OtpSignInEmailNotification` `UNVERIFIED · rev 1 only`; `MfaSignInEmailNotification` (per PR; an inactive one makes sign-in answer `mfa_provider_not_available`) `UNVERIFIED`.
- **Not manageable from the Admin**: customer-scoped sign-in history or sessions *by the customer*; MFA enrolment per user (the module is policy-based — there is no per-user enrolment screen, source); org membership lock/status (b2b map); IdP client secrets (appsettings); passkeys (not shipped).

### API / contract layer

- **Grant types** (anonymous `GET /.well-known/openid-configuration`): vcst — `password, refresh_token, client_credentials, authorization_code, impersonate, external_sign_in, mfa, otp_email`; qa1 — `password, refresh_token, client_credentials, authorization_code, impersonate, external_sign_in, otp_email, punchout, urn:vc:cookie-bridge`. Endpoints `/connect/authorize`, `/connect/token`, `/connect/logout`, `/connect/userinfo`, `/.well-known/jwks`; scopes `openid offline_access`; PKCE `plain, S256`. `CONFIRMED` live. (`urn:vc:cookie-bridge` belongs to the private vc-module-ai — existence only.)
- `POST /connect/token grant_type=password` — `storeId` required for store-bound customers; admin needs none (KB-83483C4E). A failure for a nonexistent user is `400 invalid_grant / login_failed` with `userId` and `lockoutSecondsRemaining` null and `count` 3 (**not** a failure counter — KB-0407F36E disputed). `CONFIRMED` live, both stands. Store rule: contact of a *trusted* store → 200; foreign-store and no-store accounts → `user_cannot_login_in_store` (qa1). `CONFIRMED`.
- `POST /api/otp/request {storeId,email}` — `200 {succeeded, error:{code,description}, maskedEmail, lockoutSecondsRemaining}`: unknown email → `user_not_found` **with the masked form of the input address**; store with OTP off → `otp_disabled`; nonexistent store → `store_not_found`. Reachable through **both storefront origins** (200). `CONFIRMED` live.
- `POST /connect/token grant_type=otp_email` — as rev 1 (`missing_parameter`, `invalid_code`, `user_cannot_login_in_store`, …). `UNVERIFIED · rev 1 only`.
- **MFA** (vcst only): `POST /connect/token grant_type=mfa` with a bogus token → `400 invalid_grant / invalid_two_factor_token`; `POST /api/mfa/resend` and `POST /api/mfa/signin/send` (anonymous) → `200` with `succeeded:false, error.code=invalid_two_factor_token`. On qa1: `unsupported_grant_type` / `404`. `CONFIRMED` live. **Through the vcst *storefront* origin: `/connect/token` mfa grant answers JSON, `/api/mfa/resend` answers an nginx `405`** (D8).
- **Settings**: `GET /api/platform/settings/MultiFactorAuthentication.Enabled` → group `Platform|Security`, Boolean, false; `MultiFactorAuthentication.StoreMode` → group `Store|Security`, default "Use global setting"; `OtpSignIn.Enabled` → module `VirtoCommerce.OTP`, group `OTP Sign-In|General`, **public**. `CONFIRMED` live. xAPI `store(storeId).settings.modules` exposes `OtpSignIn.Enabled` anonymously and **no** MFA setting, and `authenticationTypes` never lists OTP. `CONFIRMED` live.
- **Sign-in log**: `POST /api/platform/security/sign-in-log/search` (+ `/stats`). Record fields: createdDate, userName, userId, succeeded, failureReason, **signInType**, **provider**, operatorUserId/Name, ipAddress, host, userAgent, clientId, **sessionId**, storeId/Name, memberId, organizationId/Name. signInType seen: Password, OTP, Impersonation, ImpersonationRevert, Logout (both); MFA (vcst); `punchout` lower-case (qa1). `CONFIRMED` live.
- **Permissions** (`GET /api/platform/security/permissions`, 363 on qa1): `platform:security:loginOnBehalf`, `…:sign_in_log:read`, `…:generateToken`, `…:verifyToken`, `…:revokeToken`, `…:oauth_applications:*`, `…:verifyEmail`, `…:confirmEmail`. `CONFIRMED` live.
- **What is NOT here**: no GraphQL sign-in or MFA mutation (xAPI schema 2026-10-15 + KB-0407F36E); no OTP code-length / expiry / resend setting (Identity's Email provider owns them; MFA adds `TwoFactorTokenLifetime`, `CodeResendInterval`, `MaxCodeAttempts`, `UsedCodeLifetime`, `DisableEnforcement` in appsettings, source only); no public way to know a store requires MFA.

## §3 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | The guides trail the build. StorefrontUserGuide "Sign In": "Enter you email and password" and "Click **Log in**." (https://docs.virtocommerce.org/storefront/user-guide/registration_and_signing_in/sign-in) — live default view is the OTP form, password is one link behind, the submit button reads "Sign in", and the IdP row is part of the page. Same for the developer guides: "There are two primary methods for obtaining these tokens in Virto Commerce Frontend:" password and SSO (https://docs.virtocommerce.org/storefront/developer-guide/authentication/authentication-types); no guide mentions OTP, the code step, or MFA. The "Log in" vs "Sign in" difference is a UI-string paraphrase (not a defect); the missing OTP/MFA description is the finding | `CONFIRMED` — docs trail the build; expected |
| D2 | IdP lists differ by surface and by stand. qa1: Admin 3 (Entra ID, Google, Virto), store blade 4 toggles (Password + those 3), xAPI `[Password, GoogleSSO, AzureAD, virto]`, storefront 2 buttons (no Virto). vcst: Admin 2 ("Google sign-in" label), xAPI `[Password, AzureAD, GoogleSSO]`, storefront 2 buttons. The label for the same IdP differs per stand ("Google" vs "Google sign-in") | `CONFIRMED` live |
| D3 | **Rev 1 wrong.** PlatformUserGuide: "The Security module allows you to monitor and terminate active sessions of users." (https://docs.virtocommerce.org/platform/user-guide/security/active-sessions) and, in Manage Contacts, the Accounts table row "Active sessions … Manage the account's sessions: View active sessions. Terminate a single session. Terminate all sessions." (https://docs.virtocommerce.org/platform/user-guide/contacts/managing-contacts). The build has exactly that: a per-user **Active sessions** widget under Security → Users → user (blade lists IP address and User agent; toolbar Refresh, Terminate all). There is no entry for it in the Security menu itself, and the guides never said there was one. "Terminate a single session" is `UNVERIFIED` (the blade I saw offers Refresh and Terminate all) | `CONFIRMED` — guides and build agree; rev 1 looked in the wrong place |
| D4 | **Rev 1 wrong.** `lockoutSecondsRemaining` is on every token error body (password `login_failed` and `user_is_temporary_locked_out`, OTP, MFA) — null on the password grant even while the account is locked (KB-262ADDFB), so a client cannot read a countdown from it there. Its populated form on the OTP/MFA grants is still unobserved | `CONFIRMED` shape; value `UNVERIFIED` (G1) |
| D5 | vc-frontend calls platform paths **relative to the storefront origin**; a Virto Cloud ingress forwards only listed routes. rev 1: `/api/otp` → 405 on qa1. **Now `/api/otp/request` → 200 on both storefront origins** | `CLOSED for /api/otp`; recurs as D8 |
| D6 | **Sign-in log vocabularies disagree** (vcst, MFA installed): the Type filter offers All, Password, External provider, On behalf, On behalf revert, Sign out, **"Sign-in code"**; choosing "Sign-in code" lists rows whose Type column reads **MFA**; **there is no OTP option** although OTP rows exist (Type OTP in grid and API); "Impersonation" displays as "On behalf" in the filter and as "Impersonation" in the API; the Punchout module logs lower-case `punchout`. The MFA PR's own test step 7 says "The type filter of the log list has MFA" — it does not, by that name | `CONFIRMED` live (vcst grid + filter; qa1 API) |
| D7 | PlatformUserGuide "Enable Authentication Types": "Enable/ disable one or all available authentication types." (https://docs.virtocommerce.org/platform/user-guide/azure-ad/enabling-authentication-types). Build: the Authentication blade holds Password and the IdPs only. **OTP is switched elsewhere** (Settings → OTP Sign-In → General) and MFA elsewhere again (Platform → Security; Store → Security). A reader switching "all available types" off in the blade still has OTP on. vc-module-otp#2 / vc-module-store#189 would put OTP into the blade — **mid-change, open, not deployed** | `CONFIRMED` live (qa1 blade + vcst settings) |
| D8 | **Storefront origin vs platform for MFA**: vcst storefront host `POST /api/mfa/resend` → nginx **405** while `POST /connect/token grant_type=mfa` and `/api/otp/request` on the same host reach the platform. vc-frontend#2570 `useMfaSignIn` calls the relative path `/api/mfa/resend` (the deployed head sha equals the footer). The password step itself is unaffected, so "Resend code" is the broken link once MFA is enabled — **suspected defect**, same class as rev 1's D5; not driven through the UI because MFA is off | `CONFIRMED` for the 405; consequence `UNVERIFIED` (G13) |
| D9 | **StorefrontUserGuide contradicts itself in one paragraph** (https://docs.virtocommerce.org/storefront/user-guide/account/company-members): "Every company you belong to is listed, with your current one marked:" … "Only companies you currently have access to appear here." The build (VCST-6132 run on qa1, 3x N1): a locked organization stays listed, **disabled with a padlock**; Invited / Rejected / Deleted are not listed. Both sentences are partly true | `DRIFT` — doc; live by prior run, **not re-observed this pass** (needs locking an org) |
| D10 | PlatformDeveloperGuide "Restrict Admin UI Access": "A denied account is redirected to the **Contact admin for support** screen on sign in." (https://docs.virtocommerce.org/platform/developer-guide/Fundamentals/Security/authorization/restrict-admin-ui-access). Live: route `#!/contact-admin`, card titled "Access denied" with "Login with other credentials". The default rule ("any signed-in account that holds at least one permission can enter the admin UI") matches the zero-permission Customer being denied. The screen title is `{OBSERVED}` text, not a doc contract | `CONFIRMED` (title differs; behaviour agrees) |
| D11 | **Account existence is disclosed on one surface and hidden on two** (both stands): `POST /api/otp/request` for an unknown address → `user_not_found` + the masked *input* address; the password grant → collapsed `login_failed`; storefront `/forgot-password` → the same "We sent you a reset password link" message. The Sign-in log keeps the true cause (`UserNotFound`) while the wire says `login_failed`. Config-dependent: with `PasswordLogin:DetailedErrors` off the OTP form does not disclose (KB-9AF5645D) | `CONFIRMED` live (config on for both stands) |
| D12 | **Two guides disagree on the account types**: PlatformUserGuide Manage Contacts, "Account type … Administrator, Customer" (https://docs.virtocommerce.org/platform/user-guide/contacts/managing-contacts) vs Platform Settings "Account types … Administrator, Customer, Manager" (https://docs.virtocommerce.org/platform/user-guide/platform-settings). Live: `AccountTypes` allowed values `[Manager, Customer, Administrator]`, and one qa1 account has type `SiteAdministrator`, which is in neither list; another is type `Customer` with `isAdministrator` true | `CONFIRMED` live (the setting and the data); which guide is "right" is the platform's `AccountTypes` list |
| D13 | StorefrontUserGuide: "Check **Remember me** to save your credentials." (…/sign-in). kb KB-9D80EE6B (vcst_qa, earlier) records Remember me as vestigial | `UNVERIFIED` this pass (kb only) |
| D14 | **The two stands are different products**: MFA module only on vcst; Punchout, the `punchout` and `urn:vc:cookie-bridge` grants only on qa1; OTP `3.1001.0-pr-3` (vcst) vs `3.1000.0` (qa1); Customer `3.1030.0` release (vcst) vs `3.1030.0-pr-321` (qa1); Admin IdP set (D2). A case written against one stand silently skips or fails on the other | `CONFIRMED` live (module lists + discovery documents) |
| D15 | The release ledger lists a Sign-in log page (`…/security/sign-in-log`, Platform 3.1071.0); VirtoOZ returned no such page for "Sign-in log" (it returned Login on Behalf and Notification Log). Either the page is not indexed or it does not exist | `UNVERIFIED` — index gap vs missing page undecided |

## §4 — Coverage shape

Basis: `config/test-suites.json` `testCount` equals the csv-parse row count for every suite below
(2026-10-21; `Automation_Status` column). "BL-AUTH rows" = rows whose `Business_Rule` cites BL-AUTH-*.
Corpus: 160 suites, 5,421 parsed rows; **312 rows in 37 suites cite BL-AUTH**.

| Suite | Name | Cases | BL-AUTH rows | Status mix |
|---|---|---|---|---|
| 031 | Auth Login & Register | **37** | 37 | Automated 20 · Manual 11 · Draft 6 |
| 032 | Auth Session & RBAC | **20** | 20 | Automated 5 · Semi 5 · Reviewed 2 · Manual 3 · Draft 5 |
| 033 | Auth Company & Account Menu | **15** | 7 | Automated 8 · Manual 6 · Draft 1 |
| 082 | Auth Impersonation / Login on Behalf | **48** | 44 | Automated 30 · Reviewed 7 · Draft 6 · Manual 5 |
| 101 | Platform — Sign-in Log | **46** | 5 | **Draft 43** · Manual 3 |
| 104 | Auth OTP Sign-In (storefront) | **30** | 17 | Automated 23 · Draft 7 |
| 105 | OTP Sign-In API | **21** | 14 | Automated 10 · Draft 11 |
| 044 | Security Tests | **34** (rev 1: "39" — DRIFT) | 5 | Draft 10 · blank 24 |
| 042 | Smoke | 34 | 7 | Automated 26 · Manual 5 · Reviewed 3 |
| 078 | Backend Smoke | 27 | 7 | Automated 26 · Draft 1 |
| 049 | Platform API | 52 | 13 | Automated 40 · Draft 12 |
| 050d | GraphQL xProfile | 60 | 18 | Automated 25 · Draft 33 · synced 2 |
| 102 | UCP Agentic Commerce (oauth part) | 42 | 6 | Automated 34 · Draft 8 |
| 107 | Punchout — storefront session | **8** | 2 | **Draft 8** |
| 108 | Punchout — cXML, token exchange, Admin mapping | **25** | 3 | **Draft 25** |

**The `auth` selection** = 031, 032, 033, 082, 101, 104, 105 → **217 cases, 79 Draft (36%), 144 BL-AUTH rows**.

**Suites the group/tag MISSES but that carry the feature**: 027 Customer Orgs & Invites (19 of 71 BL-AUTH), 011b B2B Company E2E (14/30), 017b (14/37), 006 B2B Organization (13/71), 020 Platform Users Roles & Settings (8/66 — also the **only** suite naming `/forgot-password`, 4 rows, split storefront/admin not read), 008 B2B Members (6/40, the only suite that names "Sign in with a password instead"), 085 Task Management (6/26), 044 (5/34, tagged `auth-security`, not in `auth`). 107/108 are in their own `punchout` group and are excluded from `frontend` / `backend` by design (deliberate). Suite 058 holds the **only two cases that mention two-factor**: NOTIF-016 ("Two-factor authentication email") and NOTIF-031 (SMS), both blank `Automation_Status`, both written against "a two-factor enabled account … configured in this environment" — no fixture, and the MFA module sends email only (SMS has no counterpart) — see routing.

**Zero / near-zero**:
- **MFA: zero suites, zero fixtures, zero cases written against VirtoCommerce.MFA — HOLE.** The only text is NOTIF-016/031 above. Not deliberate: the module is PR-stage, but it is deployed on vcst and enforcement is one setting away.
- Admin UI entry restriction (`PlatformUI.Access`, `#!/contact-admin`): 0 rows — **hole**.
- Storefront `/reset-password`, `/set-password`, `resetPasswordByToken`: 0 rows; `/forgot-password`: 4 rows in one suite — **hole** (regex basis).
- Sign-in log Outcome "Awaiting second factor": 1 row mentions `RequiresTwoFactor` (049); suite 101 predates the MFA types — **hole** on the new vocabulary, and 43/46 of 101 are Draft.
- Full SSO round-trip: 1 row (031) — **deliberate** (no IdP credentials, excluded).
- `oauth/authorize`: 0 rows here — **deliberate** here, owned by the ucp map (suite 102 uses the password-grant recipe).
- Terminate-session (Active sessions): regex finds "terminate (all|session)" in 3 rows of 2 suites (006, 050d) — none in an auth suite; the user-blade widget has no case — **hole**.

**Over-covered relative to risk**: impersonation 48 cases (44 BL-AUTH) and OTP 51 cases (31 BL-AUTH) against 0 for MFA — the factor that can lock every Admin and storefront password sign-in out — and ~4 for the password-reset round trip.

**Selection-group / executability problems**:
- `[PRE:SIGNIN_AS]` (`test-execution-preflight.md` §SIGNIN_AS): 75 suite files use it, 1,947 case rows mention it (the preflight doc still says "~1,572"). Its steps are "fill email, fill password, click submit, wait for redirect". **Axis 1 (OTP, rev 1):** with `OtpSignIn.Enabled` true on B2B-store on BOTH stands the default view has no password field; only suite 008 literally names the "Sign in with a password instead" link. **Axis 2 (new): MFA.** With MFA required for the store the redirect never happens after the password — the code step appears and the code must be read from a mailbox or the notification journal — so every SIGNIN_AS case would be `BLOCKED:PRECONDITION_UNMET:SIGNIN_FAILED`. Today MFA is off on both stands, so this is a latent dependency, not a current failure. Also: 179 rows in 31 suites carry `grant_type=password`, 86 of them naming `ADMIN_EMAIL` on the same line; with the **global** MFA switch on, a store-less admin password grant gets `two_factor_required` (PR README).
- `requiresModules`: suites 104/105 require `["otp"]` (a short token); 102, 107, 108 use ids (`VirtoCommerce.UCP`, `VirtoCommerce.Punchout`). `MODULES_ENABLED` is matched by exact string (`ci/lib/suite-manifest.ts`) and `docs/onboarding.md` documents short names — so one convention or the other skips the wrong suites. `UNVERIFIED` which is "right".
- `envRiskGate`: 104, 105, 101, 107, 108 gated `staging`; 031/032/033/082/042/044 carry none (default = production) although 031 has 5 lockout rows and 082 impersonation — `UNVERIFIED` whether those rows use disposable accounts.
- 33 of 51 OTP cases were promoted; 18 Draft have never run. Punchout: 33 cases, all Draft, never run; the module is absent on vcst.

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | A **populated** `lockoutSecondsRemaining` (OTP/MFA grants) | **OPEN** — needs a disposable account locked on purpose; the password grant's value is null even when locked (D4) |
| G2 | Does the password grant distinguish a wrong password for an EXISTING user from `login_failed`? | **OPEN, narrowed** — nonexistent user → `login_failed` (observed, D11); the existing-user case needs a disposable account (a wrong password counts toward lockout) |
| G3 | Click-walk of Store Settings → OTP Sign-In → General | **CLOSED** — one control "Enable OTP sign-in", qa1 2026-10-21 |
| G4 | Whether "Manage Active Sessions" exists elsewhere | **CLOSED** — it is a widget on the user blade (D3); "Terminate a single session" and the effect of Terminate all are open (G16) |
| G5 | Full SSO round-trip against a real IdP | **OPEN** — no IdP credentials on either stand |
| G6 | Trusted-group cross-store sign-in | **CLOSED for the password grant** (200 for a contact of the trusted store; `user_cannot_login_in_store` for foreign / no-store accounts). The OTP-grant and UI halves are suite 105's |
| G7 | OTP happy path in the storefront UI | **CLOSED** — D5 no longer blocks it; suite 104 (23 Automated) and the VCST-6132 checklist (rows 1–6 PASS, 2026-10-19/20) drive it; not re-driven by this pass |
| G8 | Per-user lock/unlock control | **CLOSED** — "Lock account" in the user toolbar; the unlock control's label is open (needs a locked account) |
| G9 | Administrator / non-Contact OTP sign-in on the storefront (OTP store rule exempts them; password path refuses them) | **OPEN** — needs an admin account with lockout enabled on a store with OTP on; qa1 `admin` has `lockoutEnabled=false` (which makes OTP refuse it) |
| G10 | **MFA end-to-end**: the `two_factor_required` body, `mfa` grant success + `amr=mfa`, Backoffice code screen, storefront `MfaVerifyForm`, resend countdown, wrong-code limit, used-code refusal, `mfa_provider_not_available` | **OPEN** — needs `MultiFactorAuthentication.Enabled` or a store's `StoreMode` flipped (settings mutation) on vcst, a mailbox / notification-journal read for the code, and a disposable confirmed-email, lockout-enabled account. Note: the vcst sign-in log shows another session ran MFA between 14:07 and 14:16Z today (TestStore, QA-STORE, B2B-store) — the setting may be toggled by someone else; read it before assuming |
| G11 | OTP opts out of the second factor (otp#3): an MFA-required user still signs in by code alone | **OPEN** — needs G10's mutation + an OTP-eligible user |
| G12 | Which existing accounts MFA would block (needs confirmed email + lockout enabled) | **OPEN** — qa1 counted (36 Customer + 9 Manager + 1 Administrator unconfirmed; `admin` has no lockout); **vcst not counted** — the Admin locked out again before the read (it was locked twice within 25 min today; the vcst sign-in log shows 576 failed `admin` attempts in 24 h, `LockedOut` 251, from at least three IPs) |
| G13 | `/api/mfa/resend` through the storefront UI (D8) and the infra routes that decide it | **OPEN** — needs G10; the environment's ingress routes file is not in this repo |
| G14 | vcst Admin: the store Authentication blade and the Notification widget (is there an MFA template, an OTP template per store?) | **OPEN** — not walked (Admin locked out); one click each next pass |
| G15 | `PlatformUI.Access` configuration (`AllowedAccountTypes`, `DeniedPermissions`) | **OPEN** — only the default (zero permissions → denied) observed; needs an appsettings change or a Manager account built for it |
| G16 | Reverse edge: Terminate all / terminate single session revoke tokens at once (`EnablePersistentStorageTokenValidation`) | **OPEN** — needs a session terminated (mutation) |
| G17 | `Stores.EmailVerificationRequired` differs (vcst B2B-store false, qa1 true): what an unconfirmed account sees on sign-in under each (BL-AUTH-002 is SUSPECT) | **OPEN** — needs a sign-in as an unconfirmed account (36 exist on qa1) |
| G18 | Punchout as a sign-in method end-to-end (start link redeem once, session end, sign-in log row) | **OPEN** — suites 107/108 are 33 Draft cases never run; module absent on vcst |
| G19 | Homepage login section (`login-form-section.vue`) | **OPEN** — not rendered on either stand's homepage as seen; needs a theme/CMS block that carries it |

## §6 — Prior-art verdicts

| Claim | Verdict |
|---|---|
| `vcst-5748-otp-sign-in-guide.md` — prerequisite "Without [the route] the *Continue* button fails (HTTP 405)" | **DRIFT (resolved)** — both storefront origins route `/api/otp/request` (200) today; the same class of gap now exists for `/api/mfa/resend` (D8) |
| same guide — error codes `store_not_found`, `otp_disabled`, `user_cannot_login_in_store`; with DetailedErrors `user_not_found` | `CONFIRMED` for `otp_disabled`, `store_not_found`, `user_not_found` (anonymous requests, both stands) |
| same guide — "Sign-ins by code appear in Security → Sign-in log with the type *OTP*" | `CONFIRMED` in the grid and API; **DRIFT** in the filter (no OTP option, D6) |
| same guide — turn-on path "Stores → store → Settings widget → OTP Sign-In → General" | `CONFIRMED` click-walked on qa1 |
| same guide — "After 5 failed attempts (codes or passwords) the account is temporarily locked" | `CONFIRMED` for passwords (KB-8646A9CB, KB-262ADDFB); for codes `UNVERIFIED` here |
| `vcst-6132-…developer-guide.md` — fallback table; "Not covered: MFA sign-in (VCST-5904)" | `CONFIRMED` by the prior run; **the fix is released** (Customer 3.1030.0); MFA is now deployed on vcst and #321's own note says the fallback covers MFA — live `UNVERIFIED` (G10) |
| `VCST-6132-2026-10-20.md` — D5 CLOSED, 4 org error codes without locale keys, `{HYPOTHESIS}` rows | D5 `CONFIRMED` closed; hypotheses stay with their `3x` amendments; none re-observed here |
| `VCST-5748-2026-09-29.md` — OTP chain L1–L8 | `CONFIRMED` still the chain; MFA adds a second challenge on the *password* leg only (§1 link 2) |
| `BL-AUDIT-2026-10-20.md` — "MFA: not observable until VCST-5904" | **DRIFT** — partly observable now (module deployed, enforcement off); and its "PR #321 still open (not merged)" note is stale: merged 2026-10-21 07:07Z, released 07:11Z |
| rev 1's `admin-password-reset.md` and `VCST-5898/summary.json` verdicts | `UNVERIFIED` — both files are absent; the storefront reset behaviour was re-observed independently (D11) |
| `reports/ba/Organization roles/*` | boundary only; nothing contradicted |
| release ledger: Sign-in log (3.1071.0), Restriction of admin sign-in (3.1054.0) | `CONFIRMED` present (log walked; default rule observed, D10). Admin session hardening (3.1042.0) and Session invalidation on password change (3.1027.0): `UNVERIFIED` (need mutations). **The ledger has no MFA / OTP / passkey row** — stale for this domain by design (generated 2026-10-20) |

**Resolved from the prior art's open-question lists**: 5748 model "D5 ingress route" → closed; rev 1 G3/G4/G6/G7/G8 (above). **Still open from them**: which organization the fallback picks (VCST-6352), organization columns in the sign-in log (VCST-6438), `invalid_code` replay (KB-06FE6C8D).

## §7 — Amendments

(none between rev 1 and rev 2)
