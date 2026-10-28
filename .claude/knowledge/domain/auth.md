---
domain_slug: auth
applicability: universal
rationale: |
  Storefront sign-in and account access, plus the Admin-SPA security surfaces that govern it:
  password sign-in, the OTP email sign-in (VCST-5748, VirtoCommerce.OTP), the multi-factor second
  step after a password (VCST-5904, VirtoCommerce.MFA — all five PRs MERGED 2026-10-26, module
  released 3.1000.1), PASSKEY sign-in and sign-in-methods management (VCST-6121,
  VirtoCommerce.Passkeys — NEW, deployed on vcptcore, its platform PR still OPEN), external identity
  providers, Punchout sign-in (alternative session method, boundary only — `.claude/knowledge/domain/punchout.md` owns it),
  account lockout, organization-scoped access refusal (fallback released VCST-6132, widened by the
  open customer#324), the sign-in audit log, password reset, sign-out, store-access rules (own store /
  trusted groups / per-store authentication schemes), the Admin-UI entry restriction and
  impersonation (Login on behalf). Auth is Domain 5 of the BL oracle (17 invariants,
  `bl:extract -- --domain auth`).
  Rev 3 (2026-10-28) adds the third stand (vcptcore), the passkey surface (previously excluded),
  the MFA outcome of two VCST-5904 test rounds, the merge state of every PR, the three-stand matrix
  (D14), and a coverage recount (suites 110/111/114/115 now exist). Rev 2 claims not re-walked are
  `UNVERIFIED · rev 2 only`.
generated: 2026-10-28
rev: 3
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/Auth/vcst-5748-otp-sign-in-guide.md (87 lines), reports/ba/Auth/vcst-6132-otp-organization-fallback-developer-guide.md (81) — MOVED here from reports/ba/ since rev 2; verdicts in §6
  - reports/ba/test-models/VCST-5748-2026-09-29.md (197), reports/ba/test-models/VCST-6132-2026-10-20.md (235)
  - reports/tickets/Sprint26-21/VCST-6132/summary.json + testing-checklist.md; reports/knowledge/BL-AUDIT-2026-10-20.md (46); reports/ba/Organization roles/ (boundary only)
  - NEW prior art, MFA — reports/tickets/Sprint26-21/VCST-5904/vcst/ (test-model.md 160, test-strategy.md 94, testing-checklist.md 117, verdict.md 60 BLOCKED, triage-report.md 43, visual-notes.md 36, exploratory/SBTM-VCST-5904-2026-10-22.md 58, bugs/critical-high/BUG-MFA-Wrong-Code-Limiter-Per-Instance-VCST-6506.md 51, bugs/medium/BUG-OTP-Code-Boxes-Border-Contrast-Below-3to1-VCST-6504.md 57) and reports/tickets/Sprint26-21/VCST-5904/vcst-2026-10-23/ (summary.json 173 PASS_WITH_NOTES, test-model.md 190, testing-checklist.md 52, design-report.md 72) + reports/exploratory/SBTM-VCST-5904-2026-10-23.md (54) — read; their findings are hypotheses here, re-observed only where §2/§3 say CONFIRMED
  - NEW prior art, PASSKEYS (run IN PROGRESS by another session at write time) — reports/tickets/Sprint26-21/VCST-6121/vcptcore/ (summary.json 251, test-model.md 259, testing-checklist.md 85 — written offline, Result cells empty, exploratory/SBTM-VCST-6121-2026-10-28.md 76, knowledge/api/graphql-schema.md 731 = vcptcore introspection 2026-10-28, READ in place of the shared 2026-10-15 snapshot for this stand)
  - .claude/knowledge/oracles/bl/auth.yaml BL-AUTH-001..017 (orientation only); .claude/knowledge/domain/release-ledger.md (generated 2026-10-20 — still carries NO MFA / OTP / passkey row, so release_delta for this domain is empty by staleness, not by absence of releases)
  - live enumeration, vcptcore ONLY, 2026-10-28 13:55–14:02Z: anonymous REST + xAPI, `playwright-firefox` (storefront /sign-in, /account/security, Admin login pages), and ONE platform-administrator password grant (read-only REST afterwards). vcptcore build = platform 3.1091.0-pr-3144-e637 · theme 2.61.0-pr-2601-8058-80583415 · MFA 3.1000.1 · OTP 3.1001.0 · Passkeys 3.1000.0-pr-1-a25f · Customer 3.1032.0-pr-324-b30b · Store 3.1012.0-pr-190-ded5 · ProfileExperienceApi 3.1022.0-pr-150-afd6 · XFrontend 3.1008.0-alpha.64-vcst-6121-passkeys · Xapi 3.1027.0 · AzureAD 3.1003.0 · GoogleSSO 3.1003.0 · OpenIdConnect 3.1001.0 · AdminShell 3.1002.0-pr-4-1dd1 · UCP 3.1010.0 · no Punchout module (93 modules). Preflight 2026-10-28 13:51Z READY with 1 WARN `breaking:vc-module-customer`. vcst and vcptcore_qa1 were NOT browsed (rev 2 / prior-art values only)
  - source via gh CLI: vc-module-mfa#1, vc-platform#3133, vc-frontend#2570, vc-module-otp#3 (all MERGED 2026-10-26); vc-frontend#2601 (MERGED 2026-10-28 08:29Z); OPEN: vc-platform#3144, vc-module-passkeys#1, vc-module-customer#324 (diff read: `IsOrganizationFallbackAllowed`), vc-module-store#190, vc-module-x-frontend#13, vc-module-admin-shell#4, vc-module-otp#2, vc-module-store#189
  - config/test-suites.json (170 suites; working copy has uncommitted entries 114/115) + regression/suites/** — csv-parse of all 170 CSVs, 5,713 rows, 2026-10-28
  - VirtoOZ PlatformUserGuide, StorefrontUserGuide, PlatformDeveloperGuide, StorefrontDeveloperGuide, FrontendSourceCode, B2BExperts — all queried 2026-10-28
  - kb: KB-C196A782 KB-3BF84A5E KB-7EFFA0AD KB-1609EA54 KB-F57D86E8 KB-CD356AF4 KB-4E12E506 KB-2338B876 KB-12E99BF8 KB-CA0059B2 KB-5874C9A4 KB-D42D6CAA KB-4E40858D KB-5B5D8A99 KB-69C4BE5F KB-06FE6C8D KB-3CBA0D5F KB-0080ED6D KB-ED213173 (opened this pass); carried from rev 2: KB-06FE6C8D KB-08CC76A3 KB-9AF5645D KB-262ADDFB KB-8646A9CB KB-7A4C260E KB-83483C4E KB-0407F36E KB-EF3CB7FB KB-4E1FD1E8 KB-9D80EE6B. Captured this pass: KB-6F34216D (source), KB-416B0E02, KB-84366C59
excludes: >
  (carried, re-justified) Full SSO round-trip against a real Google / Entra ID / Virto IdP — still no IdP
  credentials on any stand. (carried, narrowed) TERMINATING a session — a mutation; the REST endpoint for a
  single session now exists in swagger (D3). (carried) Load/perf of the sign-in log's buffered writer.
  (carried) Organization membership-status mechanics beyond the auth/org-access boundary — owned by the
  b2b map (`.claude/knowledge/domain/b2b-organizations.md`). (carried) Password-complexity policy and registration (variant G17).
  (carried) Punchout cXML/ERP side and the Punchout mapping admin — owned by `.claude/knowledge/domain/punchout.md` and suites
  107/108/109/113; only "Punchout is a sign-in method" is in scope (§1 link 1) and the module is absent
  on vcptcore. (carried) UCP/OAuth for agents — owned by `.claude/knowledge/domain/ucp.md`; boundary only. (carried) the private
  `urn:vc:cookie-bridge` grant of vc-module-ai — existence only (it is in the vcptcore discovery document).
  NEW and RE-JUSTIFIED: MFA enforcement and the MFA happy path are NOT re-driven here — two VCST-5904
  rounds on vcst already did, and re-driving needs a shared-setting write (global switch / StoreMode);
  this map records their outcome as prior art. NEW: REGISTERING / renaming / deleting a passkey and the
  WebAuthn ceremony — a mutation and needs a Chromium virtual authenticator (VCST-6121 owns it, run in
  progress); this map enumerates the surfaces, the real-user flow is `UNVERIFIED` here. Passkeys are NO
  LONGER excluded as a surface (rev 2 excluded them as "not deployed"); what stays out is the ceremony and
  any write.
---

# Auth (storefront sign-in & account access) — domain map

> Refresh with `/qa-domain-map auth`. This file answers **what the feature is and where its
> surfaces are**. It does not carry behavioural rules — those are `BL-AUTH-*` in
> `.claude/knowledge/oracles/bl/auth.yaml` — and it never grounds an assertion as `{DOC}`.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and not to be treated as true. A claim carried from an earlier rev and
not re-walked is `UNVERIFIED · rev 2 only` (or `rev 1 only`); a claim whose only witness is another
run's report is `UNVERIFIED · <run>` — the run saw it, this pass did not.

**Mid-change callout (2026-10-28).** MFA is no longer mid-change: vc-module-mfa#1, vc-platform#3133,
vc-module-otp#3 and vc-frontend#2570 all MERGED 2026-10-26 and the module is released (3.1000.1).
**Passkeys ARE mid-change**: vc-frontend#2601 MERGED 2026-10-28 08:29Z (the storefront half is in
`dev`), but the platform half (vc-platform#3144 sign-in methods + `ISignInMethodService`,
vc-module-passkeys#1, vc-module-store#190, vc-module-x-frontend#13, vc-module-admin-shell#4) is OPEN and
DEPLOYED on vcptcore as PR builds, and vc-module-customer#324 (OPEN, deployed) changes organization
resolution for EVERY credential grant (the preflight's `breaking:vc-module-customer` WARN names an older release, Customer 3.1021.0 (2026-09), not #324 — #324's own break is unflagged because it is unreleased). vc-module-otp#2 / vc-module-store#189
(OTP as a store authentication type) remain OPEN and are NOT deployed. **Re-read §1 links 3 and 8–9, §2,
D7 and D17–D21 when #3144 / #324 merge, change or revert.** The VCST-6121 run (another session, same stand,
same hours) flips shared store settings and holds the storefront and back-office Chromium lanes: every
setting value below is point-in-time, written with its UTC time.

## Changed since rev 2

| Rev 2 claim | Now | Why |
|---|---|---|
| Header / callout: "MFA spread over five OPEN PRs"; "MFA code is PR-stage (vc-module-mfa#1 unmerged)" | **DRIFT.** All MERGED 2026-10-26; module `VirtoCommerce.MFA 3.1000.1` (release) on vcptcore. vcst ran PR builds `3.1000.0-pr-1-*` at the time of the 5904 rounds | `gh pr view`; modules list |
| frontmatter / §4: MFA "zero suites, zero fixtures, zero cases — HOLE" | **CLOSED.** Suites **110** (MFA API + Backoffice, 32 cases) and **111** (storefront, 13) exist (commit 3f54bf98); 110 has a fixtures creator. 45 cases: 35 Automated, 10 Draft | csv-parse; manifest |
| G10 MFA end-to-end "OPEN" | **CLOSED by prior art** (not re-driven): VCST-5904 round 2 (vcst, 2026-10-23) PASS WITH NOTES — password→code step→`amr=mfa`, Backoffice `#!/sign-in-code`, requirement matrix, resend, wrong-code cap; open product findings in D22–D23 | `reports/tickets/Sprint26-21/VCST-5904/vcst-2026-10-23/summary.json` + checklist C1–C3 |
| G11 "OTP opts out of the second factor" OPEN | **CLOSED by prior art, as a recorded door**: `otp_email` alone issues tokens on an MFA-required store (5904 C-34) | `reports/tickets/Sprint26-21/VCST-5904/vcst/verdict.md` "Doors recorded" |
| G13 / D8 "`/api/mfa/resend` 405 on the storefront origin — suspected defect" | **DRIFT.** Not recurring on vcptcore (anonymous POST → 200 `invalid_two_factor_token`, both hosts); on vcst the same call was routed by 2026-10-23 (KB-12E99BF8 contested; its 2026-10-23 note: UI "Resend code" → 200). The ingress route differs per stand | anonymous POST 2026-10-28; KB |
| D6 "filter offers 'Sign-in code'" | **DRIFT on later builds**: on platform 3.1090 the Type filter reads "Multi-factor authentication" and has no "Sign-in code" (KB-D42D6CAA, contested note). vcptcore UI filter not seen this pass (no Admin UI session) — see G21 | KB-D42D6CAA |
| D7 "OTP is switched elsewhere than the Authentication blade" | **NARROWED.** PASSKEY is now a store authentication scheme (`GET /api/store-authentication-schemes/{storeId}` lists Passkey; docs: "By default, all registered authentication types are enabled"); OTP still is NOT in the schemes (B2B-store: Password, GoogleSSO, Passkey), because vc-module-otp#2 / store#189 are still OPEN | REST, vcptcore |
| §1 link 3: "refresh_token and impersonation get none" fallback | **DRIFT at source (customer#324, OPEN, deployed)**: fallback is allowed for every request EXCEPT a `refresh_token` carrying `organization_id`; impersonate, passkey, external now fall back too; the org claim is rewritten on fallback; a rejected request logs reason `NotAllowed`; the lockout check moved out of the customer module into the platform base handler (#3144). Live for impersonate `UNVERIFIED` (G25) | gh diff; KB-6F34216D |
| §2: Admin `#!/login` offers password + IdPs; "no OTP"; no passkey | **DRIFT.** Both back-office UIs offer a passkey entry: AngularJS `#!/login` "Passkey" link, **Admin Shell** `/apps/admin-shell/#/login` "Sign in with a passkey" first. (The VCST-6121 model's 1r note "Admin Shell has no passkey button" was itself wrong — its 3x amendment corrects it) | live firefox, anonymous |
| §2: Security menu / user blade | **NEW surfaces (UNVERIFIED live, source/swagger only)**: user blade and Admin Shell **Sign-in methods** blade (own keys), `GET /api/platform/security/sign-in-methods`, `currentuser/sign-in-methods/{name}/keys/{id}` PUT/DELETE, store schemes GET/PUT, `/connect/session`, `…/users/{userId}/sessions/{id}` DELETE | swagger.json, vcptcore |
| §2: grant types | vcptcore = `password, refresh_token, client_credentials, authorization_code, impersonate, external_sign_in, mfa, otp_email, passkey, urn:vc:cookie-bridge`; **no `punchout`** (module absent) | discovery document |
| D14 "two stands" | **THREE stands**; the matrix is rewritten | see D14 |
| §4: 160 suites / 5,421 rows / 312 BL-AUTH rows in 37 suites | **170 suites / 5,713 rows / 342 BL-AUTH rows in 45 suites** (basis: csv-parse of every CSV, 2026-10-28; includes untracked 114/115). New: 110, 111, 112 (sales rep, not auth), 113 (Punchout OrderRequest), 114, 115 | recount |
| §4 "Terminate-session: no case in an auth suite" | **Partial.** The regex now finds a terminate/sessions mention in 032 (an auth suite) as well as 101, 006, 050d (4 suites, 7 rows); none drives the user-blade widget | recount |
| Rev 2's prior-art paths for the two OTP guides (then directly under reports/ba/) | **MOVED** to `reports/ba/Auth/` (untracked in the working tree) | `ls` |
| §1 link 7 / G16 "terminate a single session needs a mutation, endpoint unknown" | **Endpoint now known** — swagger lists `DELETE /api/platform/security/users/{userId}/sessions/{id}` and `…/sessions`; effect still `UNVERIFIED` | swagger |
| NEW — OTP default | **OTP is OFF on every vcptcore store**: `OtpSignIn.Enabled` is null on all 12 stores and xAPI answers false for B2B-store and Clothing (13:56Z). On vcst and vcptcore_qa1 B2B-store had it true — so the OTP default view of `/sign-in` (rev 2 §2) does NOT exist on vcptcore | REST + xAPI |

**Folded from "Changed since rev 1" (condensed, still true):** the Admin per-user Active sessions widget and
Lock account button exist (rev 1 was wrong); `lockoutSecondsRemaining` is on every token-error envelope
(null on the password grant even while locked); the impersonation permission id is
`platform:security:loginOnBehalf`; suite 044 has 34 cases; the OTP suites are partly promoted.

## §1 — Purpose and value chain

**Purpose: a visitor establishes an authenticated session by one of several methods, the platform
resolves which organization (if any) that session acts within, and every later request carries that
identity and org context until the session ends or is refused. — reconstructed from source + live;
`UNDECLARED` in every published guide. `CONFIRMED` as a reconstruction (first written statement; cite
against it, do not treat it as authority).**
Where I looked (2026-10-28): PlatformUserGuide, StorefrontUserGuide, PlatformDeveloperGuide,
StorefrontDeveloperGuide, FrontendSourceCode, B2BExperts. The only purpose sentence found is for the Admin
**Security** module, not sign-in: "The **Security** module provides various options to manage security and
authentication for your online store or website." (https://docs.virtocommerce.org/platform/user-guide/security/overview;
rev 2 quote, re-confirmed by the overview's current feature list, which names users, roles, API keys, login on behalf and
active sessions and **does not name sign-in methods, the sign-in log, MFA, OTP or passkeys**). The storefront pages say *how* ("Enter you email and
password", https://docs.virtocommerce.org/storefront/user-guide/registration_and_signing_in/sign-in), never *why*. B2BExperts returned
only checkout / marketplace articles. **No guide has any page for MFA, OTP sign-in or passkeys** (queries "passkey", "multi-factor
authentication", "one-time password OTP", "sign-in methods" returned none) — D16.

| # | Link, in the customer's words | Mechanism | Verdict |
|---|---|---|---|
| 1 | I pick a way to sign in | Storefront `/sign-in`: store-gated methods from xAPI `store.settings.authenticationTypes` (vcptcore B2B-store `[Password, GoogleSSO, Passkey]`, Clothing `[GoogleSSO, Passkey, Password]`); the **OTP email form is the default view only when store setting `OtpSignIn.Enabled` is true (not on vcptcore today)**; password form otherwise; IdP and Passkey buttons under "Or". Passkey also fires silently on page load/field focus (conditional mediation, D21). Back office: AngularJS `#!/login` (password, Google, Passkey) and Admin Shell `#/login` (passkey first, Google, password). Punchout: `/punchout/<token>` (module absent on vcptcore) | storefront + both back-office logins `CONFIRMED` live (vcptcore, anonymous); OTP default view `UNVERIFIED` here (no OTP-on store); Punchout `UNVERIFIED · rev 2 only` |
| 2 | The platform challenges me | Password: `POST /connect/token grant_type=password`. OTP: `POST /api/otp/request` → `grant_type=otp_email`. **MFA: after a correct password the grant answers `400 two_factor_required` + `twoFactorToken`; code at `grant_type=mfa` (fields `two_factor_token`, `code` — KB-1609EA54); `POST /api/mfa/resend`; token carries `amr=mfa`; Backoffice via `/api/mfa/signin/send|verify` and `#!/sign-in-code`.** Required by global `MultiFactorAuthentication.Enabled` or the named store's `StoreMode`; OTP and external opt out. **Passkey: `passkeyRequestOptions` (anonymous, usernameless, `allowCredentials: []`, user verification required, 300 s timeout, `rpId` = the request host) → `navigator.credentials.get` → storefront `POST /connect/token grant_type=passkey credential storeId`; back office `POST /api/platform/security/sign-in` (cookie)**; the passkey grant handler never asks for a second factor (source: `IsTwoFactorRequiredAsync` returns false, "as SignInManager.PasskeySignInAsync does") | password/OTP `CONFIRMED` (rev 2); MFA grant/endpoints and passkey grant/options `CONFIRMED` live for existence + error shape (vcptcore, anonymous); real MFA challenge `UNVERIFIED` here, `CONFIRMED` by the 5904 rounds (vcst); passkey success `UNVERIFIED` here (ceremony, G20), observed by the 6121 run |
| 3 | I get a token and land in an organization | Org resolution BL-AUTH-015 over *accessible* orgs. **After customer#324 (source, OPEN, deployed): every grant falls back to an accessible organization except a `refresh_token` that carries `organization_id`; the claim is rewritten on fallback; a refused request logs `NotAllowed`.** Rev 2's "mfa `CONFIRMED` at source" is carried (5904 checklist C-16/17 covered the mfa leg by REST on vcst) | source `CONFIRMED` (gh diff); mfa leg `CONFIRMED` by prior art (vcst); passkey leg observed by the 6121 run (SBTM: locked last-used org → lands in the usable org); impersonate leg `UNVERIFIED` live (G25) |
| 4 | My session is stored and surfaces unlock | Storefront keeps tokens client-side and calls `me`; account menu has user, org radio list, sign-out; Admin keeps a cookie session (the passkey door creates one). Admin lists a user's sessions (IP address, User agent) | `UNVERIFIED · rev 2 only` (no signed-in session this pass) |
| 5 | Access can be refused | (a) global `LockoutEnd` — one failed-attempt counter shared by password, OTP and MFA codes; five failures → `user_is_temporary_locked_out` (KB-8646A9CB, KB-262ADDFB); **the lockout check now lives in the platform base grant handler (#3144), so passkey is refused when locked (6121 observed) — but a passkey SUCCESS does not reset the counter (D20)**; (b) MFA wrong-code cap `MaxCodeAttempts` 3 is held per platform instance (VCST-6506, D23) and the log reasons `CodeAttemptsExceeded`, `InvalidTwoFactorToken`, `ProviderNotAvailable`, `LockoutDisabled` exist (KB-D42D6CAA); (c) org-scoped refusal (BL-AUTH-012/013/015/016); (d) store rule `user_cannot_login_in_store` — **checked AFTER the MFA challenge**, so a store-refused customer is challenged and emailed first (D22); passkey grant refuses a foreign store structurally; (e) Admin UI entry denied to an account with no permission (`#!/contact-admin`); (f) a Customer-type account at the back-office cookie door (passkey) | (c)(e) `UNVERIFIED · rev 2 only`; (a) shape `CONFIRMED` (rev 2) + 6121 run; (b)(d) `CONFIRMED` by the 5904 rounds, not re-driven; (f) by the 6121 run |
| 6 | An operator acts as another user | Storefront Company → Members, or Admin user blade "Login on behalf" (opens storefront `/account/impersonate/<id>`, KB-EF3CB7FB), permission `platform:security:loginOnBehalf`; grant `impersonate`; **the storefront re-prompts the operator for credentials ("Confirm your identity to continue", a code step when MFA applies — 5904 Q1 open)**; impersonated sessions are refused by key-management writes (source: `PasskeyService.CreateAsync`; xAPI `changePassword` NOT refused — 6121 N4) | permission id `CONFIRMED` (live: in the 354-permission list); flow `UNVERIFIED · rev 2 only`; the doc now exists (D20b) |
| 7 | The session ends — or the refusal is lifted | Sign-out via the account-menu popup only (no `/sign-out`, BL-AUTH-007); Admin Sign out; **Admin "Terminate all" and (REST) a single-session DELETE**; lockout expiry; admin unlock; org unlock; MFA two-factor token expiry 10 min and code lifetime ~9 min (KB-F57D86E8) | `UNVERIFIED · rev 2 only` (terminate effect, G16); REST endpoints `CONFIRMED` present (swagger) |
| 8 | **I manage how I can sign in** (NEW) | Storefront `/account/security` (anonymous → `/sign-in?returnUrl=/account/security`); xAPI `signInMethods` (Unauthorized when anonymous), `passkeyCreationOptions`, `createPasskey`, `renameSignInKey`, `deleteSignInKey`; back office: user/Admin Shell **Sign-in methods** blade over REST `currentuser/sign-in-methods` (a Customer token gets 403 on the REST route, xAPI serves it — KB-4E40858D). Rules seen by the 6121 run, not here: last key refused (`last_sign_in_key`), duplicate authenticator refused client-side, no key-count cap, password deletable | route redirect `CONFIRMED` live; xAPI Unauthorized `CONFIRMED` live; the rest `UNVERIFIED · VCST-6121 run` |
| 9 | **Taking a key away takes access away** (NEW) | REST DELETE of a key → `TryTerminateUserSessions`: other tokens/refresh die, the calling cookie session stays (KB-4E12E506; source in #3144 `SecurityController`); **xAPI `deleteSignInKey` does not terminate sessions** (6121 N/S23); store-scheme off → the Passkey button disappears on a fresh load but the grant does not re-check the scheme (6121 N3); no admin revoke of ANOTHER user's key (VCST-6522, ABSENT IN PRODUCT) | `CONFIRMED` source (REST); xAPI/store-gate `UNVERIFIED · VCST-6121 run` |

**Reverse edges.** Lockout → expiry/unlock (`UNVERIFIED`); session → terminate (REST single/all endpoints present, effect `UNVERIFIED`, G16);
MFA two-factor token → single redemption + expiry (`CONFIRMED` by 5904: replay → `invalid_two_factor_token`; but a store-rule refusal after
a right code burns the ticket, KB-3BF84A5E; per-ticket retention is mixed per KB-7EFFA0AD); org fallback → restore next sign-in (6132 row 22);
key delete → sessions end (REST yes, xAPI **no** — D19). **Sessions minted before the MFA requirement is switched on survive it** (5904 C-38,
recorded door). **No reversal exists for a consumed OTP code** (replays — KB-06FE6C8D, KNOWN DEFECT VCST-6490). **No way for an administrator to
revoke another user's passkey** (VCST-6522). **No way to switch Passkey off per store at the TOKEN endpoint** (D18, 6121).

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| Anonymous visitor | Browse, sign in by any enabled method, request a password reset, request an OTP code (`/api/otp/request`, anonymous), call `passkeyRequestOptions` anonymously (200, a fresh challenge), hit `/blocked` | `CONFIRMED` live (vcptcore) |
| B2C customer, no org | Same, then no org label, no Organizations list, no Corporate group; token has no `organization_id` / `permission` claims; first render of `/account/security` after a passkey sign-in shows a transient ApolloError and a blank page until reload (6121 N7) | `UNVERIFIED · rev 2 only` + 6121 run |
| Multi-org B2B buyer | Header "Org / user", Organizations radio list, Corporate group; lands in the usable org after a fallback | `UNVERIFIED · rev 2 only` |
| Manager (account type) | Admin SPA user with permissions; can use REST `currentuser/sign-in-methods` (a Customer cannot, KB-4E40858D) | `UNVERIFIED · 6121 run` |
| Customer account with zero permissions | Cannot enter the Admin SPA: `#!/contact-admin` "Access denied" | `UNVERIFIED · rev 2 only` |
| Platform administrator (`admin`) | Admin SPA; password grant on vcptcore answered a token with NO MFA challenge (global MFA off, 13:56Z); has Google SSO and Passkey rows in its own `currentuser/sign-in-methods`, with one passkey key already registered (created 2026-10-28 11:27Z, authenticator name "Apple Passwords" — read, not touched). Lock behaviour on vcptcore `UNVERIFIED`: the sign-in log shows 152 failed `admin` attempts in its window | `CONFIRMED` live (grant + method list) |
| Operator with `platform:security:loginOnBehalf` | Login on behalf | permission `CONFIRMED`; flow `UNVERIFIED · rev 2 only` |
| Account with unconfirmed email | MFA email provider needs a confirmed email (`mfa_provider_not_available`, `ProviderNotAvailable` log reason — KB-D42D6CAA) | consequence `CONFIRMED` by 5904 (log reason); counts `UNVERIFIED · rev 2 only` (qa1) |
| **Passkey-only account** (NEW) | Reachable though out of scope in VCST-6121: the password can be deleted from both back-office UIs and xAPI | `UNVERIFIED · VCST-6121 run` (S7) |
| vc-shell / API apps | Password grant with no store; must handle `two_factor_required` once global MFA is on; **the Admin Shell has no MFA code step — follow-up VCST-6533** | `UNVERIFIED` (G27) |
| Punchout buyer | Mapped contact from an ERP start link; sign-in log Type `punchout` | `UNVERIFIED · rev 2 only`; absent on vcptcore |
| External-IdP-linked account | Google (and Entra / Virto where configured); the external sign-in service passes `bypassTwoFactor: true` (source, 5904 triage) | `UNVERIFIED` (excluded); source note carried |

**Variants that change sign-in behaviour without changing code** (point-in-time, vcptcore 13:56Z unless stated):
`OtpSignIn.Enabled` per store — null on all 12 stores (OFF); `MultiFactorAuthentication.Enabled` null (default false) and per-store
`StoreMode` null on all 12 (⇒ "Use global setting"); per-store authentication schemes — B2B-store saved (Password, GoogleSSO,
Passkey; the Passkey row was persisted 2026-10-28 13:12Z by another session), Clothing / Electronics / B2B-loyalty unsaved
defaults (all active, id null); `trustedGroups` — B2B-loyalty→[B2B-store], Clothing→[Electronics, B2B-store],
Electronics→[Clothing, B2B-store], B2B-store→[]; `Stores.EmailVerificationEnabled` B2B-store true / `…Required` false;
global `Passkey:Enabled` is an appsettings value (default true, source) — no runtime switch (6121: no passkey / WebAuthn / FIDO
setting among 381 platform settings); the Passkeys module registers no platform setting and no permission (KB-2338B876; `Passkeys.StorefrontPlugin.Enabled`
→ "not registered" live); `PasswordLogin:DetailedErrors` (D11); store authentication types; module set (D14). The other eight stores include
disposable / odd ones (`AGENT-TEST-*`, `TEST-DEL-STORE-*`, `123` in state RestrictedAccess).

## §2 — Surface inventory

### Storefront

- **Routes**: `/sign-in` (live, vcptcore) · `/account/security` (live: anonymous redirect only) · `/sign-up` · `/forgot-password` · `/blocked` · `/account/change-password` — rev 2 `CONFIRMED` on other stands, `UNVERIFIED` here. Source-only: `/reset-password`, `/set-password`, `/confirm-invitation`, `/account/confirmemail`, `/account/impersonate/:userId`, `/oauth/authorize`, `/auth/callback`, `/successful-registration`, `/403`. `/punchout/<token>` absent (no module). No `/sign-out` or `/logout` (BL-AUTH-007, rev 2).
- **`/sign-in` on vcptcore B2B-store (OTP off)**, page title "QA-audit-test | B2B-store | Sign in", environment indicator "QA-audit-test": heading "Sign in"; Email*, Password* (show/hide), Remember me, "Forgot your password?", **Sign in**, Sign up; then "Or" with **"Sign in with Google"** and **"Sign in with Passkey"**. No OTP link, no Entra button. Footer "Ver. 2.61.0-pr-2601-8058-80583415". Console on a firefox load: 0 errors, 3 warnings (GA cookie expiry ×2, an unused preload). No `/connect/token` request fired on load in firefox (no resident credential). `CONFIRMED` live.
- **`/sign-in` OTP default view (when OTP is on)** and **MFA code step**: rev 2 text carried; the MFA step was observed on vcst by the 5904 rounds (KB-5874C9A4: heading "Enter the sign-in code", masked email, 30 s Resend countdown, auto-submit at 6 digits, "That code didn't work." ×3, 4th submit → back to the password form "Too many incorrect codes", Resend → "New code sent." + new email). `UNVERIFIED` here (MFA off; OTP off).
- **`/account/security`** (vc-frontend#2601, merged): anonymous → `/sign-in?returnUrl=/account/security`, and after sign-in returns there (the second half by the 6121 checklist, `UNVERIFIED` here). Signed-in content (Sign-in methods section: Add passkey, per-key name/created/state, rename, delete; impersonated session shows the heading only — N6) `UNVERIFIED · VCST-6121 run`. Rev 2: the account sidebar had Profile / Addresses / Change password / Saved credit cards and "no security settings" — **DRIFT by #2601** for any store with a method that supports keys; suite 033 AUTH-030/032/033 are contradicted by it (6121 SBTM).
- **`/forgot-password`, `/blocked`, Account area, Homepage login section**: `UNVERIFIED · rev 2 only` (not rendered this pass).
- **What is NOT manageable from the storefront**: turning OTP / MFA / Passkey on or off (store setting / scheme); another user's keys; unlocking an account; the MFA requirement is not readable (xAPI exposes neither `MultiFactorAuthentication.*`; it exposes `OtpSignIn.Enabled` only — `CONFIRMED` live: B2B-store module settings list `OtpSignIn.Enabled` false).

### Admin SPA (back office) — two UIs

- **AngularJS `#!/login`** (vcptcore, anonymous, `CONFIRMED`): heading "Sign in to Virto Commerce Manager"; Login*, Password*, Remember me, "Forgot your password?" (`#!/forgotpassword`), **Log in** (disabled until both fields are filled), "or", links **Google** and **Passkey**. No Entra, no Virto. 1 console error on first load (not read this pass; the 6121 summary names an anonymous 401 on `api/platform/settings/VirtoCommerce.Platform.UI.WidgetColorMarkers`).
- **Admin Shell `/apps/admin-shell/#/login`** (`CONFIRMED`): "Welcome back" / "Sign in to Virto Commerce to continue"; buttons "Sign in with a passkey", "Continue with Google"; "or"; Email or username, Password, show-password, **Sign in**, "Forgot password?" (`#/forgot-password`); a marketing aside; footer "Help" link. **No Remember me.** 0 console errors.
- **Entry restriction, Security menu, User information blade** (toolbar Save · Reset · Change password · Lock account · Login on behalf; widgets incl. Active sessions and Sign-in log), **Sign-in log**, **Settings (Platform → Security, Platform → Sign In Log)**, **Store (Settings widget, Authentication widget, Linked stores, Notification widgets)**: rev 2 `CONFIRMED` on other stands, **`UNVERIFIED` on vcptcore (no Admin UI session — the lane's stored secret belongs to another stand, so no browser sign-in was attempted; G21)**. New by source/prior art: user-blade and Admin Shell **Sign-in methods** blade (`PasskeyAngularJS` widget, `host.extend("Passkey")` in the Admin Shell, vc-module-admin-shell#4 OPEN); AngularJS delete of the last key stays enabled and answers "400: Bad request" while the Admin Shell disables it (KB-5B5D8A99); icon-only links in the AngularJS blade have no accessible name (6121 #9) — all `UNVERIFIED · VCST-6121 run`.
- **Settings read via REST** (`GET /api/platform/settings/<name>`, admin token, 13:56Z): `MultiFactorAuthentication.Enabled` — module VirtoCommerce.MFA, group `Platform|Security`, Boolean, value null, default false; `MultiFactorAuthentication.StoreMode` — group `Store|Security`, allowed `["Use global setting","Enabled","Disabled"]`, null on all 12 stores; `OtpSignIn.Enabled` — module VirtoCommerce.OTP, group `OTP Sign-In|General`, **public**, null on all 12 stores. `CONFIRMED`.
- **Not manageable from the Admin**: customer-scoped sign-in history or sessions *by the customer*; MFA enrolment per user (module is policy-based, source); **an administrator revoking / managing ANOTHER user's passkey (VCST-6522, ABSENT IN PRODUCT)**; org membership lock/status (b2b map); IdP client secrets (appsettings); the global `Passkey:Enabled` switch (appsettings + restart).

### API / contract layer

- **Grant types** (anonymous `GET /.well-known/openid-configuration`, vcptcore): `password, refresh_token, client_credentials, authorization_code, impersonate, external_sign_in, mfa, otp_email, passkey, urn:vc:cookie-bridge`; endpoints authorization / token / end-session / userinfo (+ jwks); scopes `openid offline_access`; PKCE `plain, S256`. No `punchout`. `CONFIRMED` live.
- `POST /connect/token grant_type=password` — nonexistent user → `400 invalid_grant / login_failed` ("Login attempt failed. Please check your credentials."), `userId` null, `lockoutSecondsRemaining` null (anonymous, vcptcore, nonexistent address — no account touched). `CONFIRMED`.
- `POST /connect/token grant_type=otp_email` for a store with OTP off → `otp_disabled` ("OTP sign-in is disabled for this store."); `POST /api/otp/request {storeId:B2B-store,email}` → 200 `{succeeded:false,error:{code:otp_disabled},maskedEmail:<masked input>}` — the masked form of the typed address is returned even when the store has OTP off. Reachable through the storefront origin. `CONFIRMED` live (vcptcore).
- **MFA**: `grant_type=mfa` bogus token → `400 invalid_grant / invalid_two_factor_token`; `POST /api/mfa/resend` and `/api/mfa/signin/send` → 200 `{succeeded:false,error.code:invalid_two_factor_token}`; **both back-office and storefront hosts route them** (vcptcore). `CONFIRMED` live. The real challenge/exchange: `UNVERIFIED` here (KB-7EFFA0AD, KB-3BF84A5E, KB-1609EA54, KB-F57D86E8 from the 5904 rounds on vcst).
- **Passkey** (`CONFIRMED` live unless noted): `POST /connect/token grant_type=passkey` with no credential → `400 invalid_request / missing_parameters` ("Missing required parameters: credential.") on **both** hosts; `POST /api/platform/security/sign-in {}` (cookie door) → back-office host `400 unsupported_grant_type`, **storefront host nginx `405`** (KB-416B0E02); `POST /api/passkeys/creation-options` and `GET currentuser/sign-in-methods` → 401 anonymous. xAPI (schema introspection 2026-10-28, the vcptcore copy in the 6121 run folder, read in place of the shared 2026-10-15 snapshot): queries `signInMethods()`, `passkeyCreationOptions()`, `passkeyRequestOptions()`; mutations `createPasskey`, `renameSignInKey`, `deleteSignInKey` (+ `changePassword`). `Query.passkeyRequestOptions` anonymous → a JSON string `{challenge, timeout:300000, rpId:<storefront host>, allowCredentials:[], userVerification:"required", hints:[]}`; `signInMethods` anonymous → `Unauthorized`. REST via swagger: `POST /api/passkeys/request-options`, `POST /api/passkeys/creation-options`, `POST /api/passkeys`, `GET /api/platform/security/sign-in-methods`, `GET /api/platform/security/currentuser/sign-in-methods`, `PUT|DELETE …/currentuser/sign-in-methods/{name}/keys/{id}`, `GET|PUT /api/store-authentication-schemes/{storeId}`.
- **Authentication schemes** (REST, admin token): global `GET /api/platform/security/sign-in-methods` → GoogleSSO (kind External, priority 2), Passkey (priority 0; `canCreateKey` true, `canRenameKey` true, `canDeleteKey` true), Password (priority 0; `canDeleteKey` true). AzureAD 3.1003.0 and OpenIdConnect 3.1001.0 are installed but contribute NO method here (not enabled / configured — reason `UNVERIFIED`). `GET /api/store-authentication-schemes/{id}`: B2B-store → Password, GoogleSSO, Passkey (saved, ids present); Clothing / Electronics / B2B-loyalty → GoogleSSO, Passkey, Password, all `isActive` true, id null (not persisted). xAPI `settings.authenticationTypes` mirrors them (KB-2338B876, confirmed). `CONFIRMED`.
- **Sign-in log** (admin token, 13:57Z): `POST /api/platform/security/sign-in-log/search` (3,496 rows) and `/stats` (fields: recordingEnabled, totalCount, failedCount, distinctUserCount, impersonationCount, previous*, timeline, topFailedIpAddresses, topFailedUserNames, failureReasonBreakdown, signInsByOrganization, signInsByStore). `signInType` values present: Password, **Passkey** (33 ok, 74 failed), **MFA (2 failed only)**, External, Impersonation, ImpersonationRevert, Logout — **no OTP row exists on this stand**. `failureReason` values: InvalidPassword, InvalidPasskey, LockedOut, NotAllowed, UserNotFound, Forbidden, MissingParameter, InvalidTwoFactorToken, Unknown. A passkey success row carries host, storeId, memberId, `provider` null, `sessionId` null (KB-84366C59). `CONFIRMED` live.
- **Other endpoints present (swagger, existence only)**: `/connect/session` (GET, POST — purpose `UNVERIFIED`, G26), `/api/platform/security/users/{userId}/sessions/search`, `…/sessions/{id}` DELETE, `…/sessions` DELETE, `/api/platform/security/users/{id}/lock|unlock|locked`, `/api/customer/organization-memberships/{id}/lock|unlock`, `/api/stores/{storeId}/accounts/{id}/loginonbehalf`, `/externalsignin/*`, `/api/mfa/*`, `/api/otp/request`. The Swagger document itself is served anonymously (`/docs/PlatformUI/swagger.json` → 200; platform-wide, recorded by the 5904 probe).
- **Permissions** (`GET /api/platform/security/permissions`, 354 on vcptcore): `platform:security:loginOnBehalf`, `…:sign_in_log:read`, `…:generateToken`, `…:verifyToken`, `…:revokeToken`, `…:verifyEmail`, `…:confirmEmail`, `…:oauth_applications:create|read|update|delete`. **No MFA, OTP, passkey or sign-in-methods permission exists** (the passkey module registers none; any authenticated user manages own keys). `CONFIRMED`.
- **What is NOT here**: no GraphQL MFA or OTP mutation; no OTP code-length / expiry / resend setting; MFA appsettings `TwoFactorTokenLifetime`, `CodeResendInterval`, `MaxCodeAttempts`, `UsedCodeLifetime`, `DisableEnforcement` (source, not readable at runtime); no public way to know a store requires MFA; no runtime switch for the global passkey flag.

## §3 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | The guides trail the build. StorefrontUserGuide "Sign In": "Enter you email and password" and "Click **Log in**." (https://docs.virtocommerce.org/storefront/user-guide/registration_and_signing_in/sign-in) — live vcptcore sign-in shows a **Sign in** button, an "Or" row with Google and **Passkey** buttons; on OTP-on stores the default view is the code form. StorefrontDeveloperGuide: "There are two primary methods for obtaining these tokens in Virto Commerce Frontend:" password and SSO (https://docs.virtocommerce.org/storefront/developer-guide/authentication/authentication-types). "Log in" vs "Sign in" is a UI-string paraphrase (not a defect); the missing OTP / MFA / passkey description is the finding (D16) | `CONFIRMED` — docs trail the build; expected |
| D2 | IdP / method lists differ by surface and by stand. **vcptcore**: Admin AngularJS login Google + Passkey; Admin Shell Google + passkey; storefront Google + Passkey; xAPI `[Password, GoogleSSO, Passkey]` (B2B-store) / `[GoogleSSO, Passkey, Password]` (stores with no saved schemes — Passkey sorts before Password there, KB-2338B876); global REST list GoogleSSO, Passkey, Password; AzureAD installed but contributes none. qa1 (rev 2): Admin 3 IdPs, xAPI `[Password, GoogleSSO, AzureAD, virto]`. vcst (rev 2): Admin 2, xAPI `[Password, AzureAD, GoogleSSO]`. The label for one IdP differs per stand ("Google" vs "Google sign-in") and button order follows each surface's own rule | `CONFIRMED` live (vcptcore); other stands `UNVERIFIED · rev 2 only` |
| D3 | PlatformUserGuide: "The Security module allows you to monitor and terminate active sessions of users." (https://docs.virtocommerce.org/platform/user-guide/security/active-sessions) and the Accounts-table row "Active sessions … Terminate a single session. Terminate all sessions." (https://docs.virtocommerce.org/platform/user-guide/contacts/managing-contacts). Swagger now shows both endpoints (`DELETE …/sessions/{id}`, `DELETE …/sessions`); the user-blade widget offered Refresh and Terminate all (rev 2). Whether the UI offers a per-row terminate `UNVERIFIED` | `CONFIRMED` guides and API agree; UI half `UNVERIFIED` |
| D4 | `lockoutSecondsRemaining` is on every token error body incl. the mfa and passkey grants (null on all vcptcore bodies seen); null on the password grant even while locked (rev 2, KB-262ADDFB). A populated value is still unobserved | shape `CONFIRMED` live; value `UNVERIFIED` (G1) |
| D5 | Relative platform paths vs the storefront ingress: rev 1 `/api/otp` 405, rev 2 `/api/mfa/resend` 405 on vcst. **vcptcore routes both** (200) **but answers an nginx 405 for `POST /api/platform/security/sign-in`** — by design (the cookie door is the back office's), so not a defect unless a storefront flow calls it. The route set is per-stand ingress configuration | `CLOSED` for `/api/otp` and `/api/mfa` on vcptcore; the 405 is `CONFIRMED`, classification `UNVERIFIED` |
| D6 | **Sign-in log vocabularies disagree.** vcst/MFA era (rev 2): Type filter had "Sign-in code" listing rows whose column reads MFA, no OTP option. Later build (3.1090, KB-D42D6CAA contested): filter reads "Multi-factor authentication"; no OTP option still reported. API `signInType`: vcptcore Password / Passkey / MFA / External / Impersonation / ImpersonationRevert / Logout (no OTP, no `punchout`); "Impersonation" displays "On behalf" in the filter; Punchout logs lower-case `punchout`. **Whether the UI filter offers Passkey is unknown** (the 6121 charter lists it as open) | API vocabulary `CONFIRMED` live (vcptcore); filter labels `UNVERIFIED` here (G21) |
| D7 | PlatformUserGuide "Enable Authentication Types": "Enable/ disable one or all available authentication types." (https://docs.virtocommerce.org/platform/user-guide/azure-ad/enabling-authentication-types) and the developer guides: "By default, all registered authentication types are enabled." (https://docs.virtocommerce.org/storefront/developer-guide/authentication/adding-sso-provider). **Passkey now follows that model exactly** (default active, unsaved until the first save, listed by `store-authentication-schemes`). **OTP and MFA still do not**: OTP is `Settings → OTP Sign-In → General`, MFA is `Platform → Security` / `Store → Security`; OTP in the blade waits on vc-module-otp#2 / store#189 (OPEN, not deployed) | `CONFIRMED` live (REST) — passkey agrees, OTP/MFA diverge |
| D8 | (rev 2) MFA resend 405 on the vcst storefront origin | `DRIFT` — see D5; not recurring on vcptcore, routed on vcst by 2026-10-23 per kb |
| D9 | StorefrontUserGuide contradicts itself on the companies list (https://docs.virtocommerce.org/storefront/user-guide/account/company-members): "Every company you belong to is listed, with your current one marked:" … "Only companies you currently have access to appear here." Build (VCST-6132, qa1): a locked org stays listed, disabled with a padlock | `DRIFT` — doc; `UNVERIFIED · rev 2 only` |
| D10 | PlatformDeveloperGuide "Restrict Admin UI Access": "A denied account is redirected to the **Contact admin for support** screen on sign in." (https://docs.virtocommerce.org/platform/developer-guide/Fundamentals/Security/authorization/restrict-admin-ui-access). Live (rev 2): route `#!/contact-admin`, card "Access denied" | `UNVERIFIED · rev 2 only` |
| D11 | Account existence disclosure. vcptcore: password grant for a nonexistent user → collapsed `login_failed` `CONFIRMED`; `/api/otp/request` on an OTP-off store answers `otp_disabled` + the masked **input** address and does not distinguish users `CONFIRMED`. The OTP-on disclosure (`user_not_found` + masked input, 5904 EXP-1 Medium, triaged KNOWN_ISSUE, config-gated by `PasswordLogin:DetailedErrors`, KB-9AF5645D) cannot be re-observed on vcptcore (no OTP-on store). Sign-in log keeps the true cause (`UserNotFound`, 15 rows) | partly `CONFIRMED`; OTP-on half `UNVERIFIED · 5904 run` |
| D12 | Two guides disagree on account types ("Administrator, Customer" in Manage Contacts vs "Administrator, Customer, Manager" in Platform Settings — https://docs.virtocommerce.org/platform/user-guide/contacts/managing-contacts, …/platform-settings); live `AccountTypes` has Manager, Customer, Administrator and data with `SiteAdministrator` | `UNVERIFIED · rev 2 only` |
| D13 | StorefrontUserGuide: "Check **Remember me** to save your credentials." — the vcptcore storefront and AngularJS back-office logins show Remember me; the Admin Shell login has none. KB-9D80EE6B records it as vestigial on the storefront | presence `CONFIRMED` live; effect `UNVERIFIED` |
| D14 | **THREE stands are three products** — matrix below | `CONFIRMED` (vcptcore live; others rev 2 / prior art) |
| D15 | Release ledger lists a Sign-in log page (Platform 3.1071.0); VirtoOZ has no such page, and the Security overview's feature list omits it | `UNVERIFIED` — index gap vs missing page |
| D16 | **No guide documents MFA, OTP sign-in, passkeys, sign-in methods, the sign-in log or the per-store authentication scheme for them.** Queried PlatformUserGuide, PlatformDeveloperGuide, StorefrontUserGuide, StorefrontDeveloperGuide, FrontendSourceCode, B2BExperts for each term. Expected lag (VirtoOZ trails the build, its release corpus stops ~3.917), recorded as a finding because MFA is RELEASED: a released behaviour with no page is a documentation gap, not "no requirement". FrontendSourceCode's `sign_in_form.errors` locale snapshot (branch `master`) lists `login_failed, email_verification_is_required, user_is_temporary_locked_out, user_is_locked_out, user_is_locked_in_organization, user_cannot_login_in_store, password_expired, user_not_found` and no MFA / passkey code — index lags `dev` | `CONFIRMED` — gap |
| D17 | **A new method appears on every store the moment the module installs.** `Passkey` is `isActive` true with id null on Clothing, Electronics and B2B-loyalty (not persisted); B2B-store's row was persisted by an admin save at 13:12Z. Docs agree ("By default, all registered authentication types are enabled."). Consequence for tests: a store's Passkey state is read from `GET /api/store-authentication-schemes/{id}`, never assumed; an admin save writes ALL rows, so a test that saves schemes changes the persisted shape | `CONFIRMED` live; consequence is a reading of it |
| D18 | **The per-store Passkey switch gates the UI, not the token endpoint.** 6121 (N3/S15): a page loaded before the scheme was switched off still obtains a passkey token; the grant does not re-check the scheme (source: grant handler checks lockout, store rule and account type only). Rev 2's doc statement says a disabled type is disabled | `UNVERIFIED · VCST-6121 run` — **suspected product defect** (no ticket yet), needs a scheme flip (G22) |
| D19 | **Two delete doors, two session effects.** REST `DELETE …/currentuser/sign-in-methods/Passkey/keys/{id}` → 204 and terminates the user's other sessions and refresh tokens, keeps the caller's cookie (source `TryTerminateUserSessions`; KB-4E12E506, seen twice on both admin UIs). xAPI `deleteSignInKey` (storefront) leaves other access and refresh tokens valid (6121 S23, observed) | REST half `CONFIRMED` source + prior-art live; xAPI half `UNVERIFIED · VCST-6121 run` — **suspected product defect** (VC-AUTH-004 class: rule enforced on one surface only) |
| D20 | **A passkey success does not reset the failed-attempt counter** (6121 N2: 4 wrong passwords → passkey OK → count still 4 → one more wrong → locked). BL-AUTH-003 says a successful login resets it. The lockout check itself IS enforced for passkey (6121 S19a/b) | `UNVERIFIED · VCST-6121 run` — **candidate contradiction of BL-AUTH-003**, route: bug + `/qa-review-oracles bl` |
| D20b | The docs now describe impersonation: "The **Login on behalf** feature lets you sign in as another user and act on their behalf without ever seeing or entering their password." and "The Frontend application will open in a new window and prompt you to re-enter your credentials for security purposes." (https://docs.virtocommerce.org/platform/user-guide/security/login-on-behalf). FrontendSourceCode agrees: `impersonate_form.subtitle` "Confirm your identity to continue". Whether the operator must supply the MFA code at that prompt is 5904's open question Q1 (C24) | guides and source `CONFIRMED` agree; MFA × impersonation `UNVERIFIED` (open by decision) |
| D21 | **`/sign-in` runs a passkey conditional-mediation get on page load** (KB-CD356AF4, seen by the 6121 session in Chromium: valid resident credential → silent sign-in; stale credential → `POST /connect/token` 400 `login_failed` + a console error on the public page). Firefox here (no resident credential): no token request fired. Per the 6121 notes it also leaves phantom Passkey rows in the sign-in log. The ticket text says "autofill" | `UNVERIFIED` here for Chromium — **suspected product defect** (no ticket yet) |
| D22 | **MFA challenge precedes the store rule**: with global MFA on, a customer with no/unknown `storeId` gets `two_factor_required` and an email before `user_cannot_login_in_store`; a right code is redeemed then refused by the store rule (ticket spent, log reason `Unknown`, store = the account's own store) — KB-7EFFA0AD (2 confirmations), KB-3BF84A5E. PlatformDeveloperGuide: "Without it, the grant fails with `400 invalid_grant`." (https://docs.virtocommerce.org/platform/developer-guide/Fundamentals/Security/authentication/issuing-and-using-access-token) — still `400 invalid_grant` but a different code, and VCST-6353 says responses stay the same | `UNVERIFIED` here (global MFA off) — **suspected product defect / open PO question** (5904 §Bugs) |
| D23 | **The MFA wrong-code cap is per platform instance** (default 3, in-memory; the module's README says so): the 5th wrong code hit the shared Identity lockout (900 s) instead (VCST-6506, High, accepted). Also `Customer`-type account with a back-office role and a 65-char username → HTTP 500 on the MFA path (VCST-6528, 5904 C17) | `UNVERIFIED · 5904 run`; tracker ids as recorded by that run |
| D24 | **The two back-office logins differ** (live, anonymous): AngularJS has Remember me and "Forgot your password?" at `#!/forgotpassword`; Admin Shell has no Remember me, puts "Sign in with a passkey" and "Continue with Google" ABOVE the password form (AngularJS: below it, after "or", as links), and its link reads "Forgot password?" at `#/forgot-password`. The 6121 test model's 1r note ("Admin Shell has NO passkey button") was wrong | `CONFIRMED` live |
| D25 | **Org fallback rule moved under a deployed OPEN PR.** Rev 2 / KB-3CBA0D5F baseline: only password/OTP/mfa fall back, refresh and impersonate do not. customer#324: all grants fall back except refresh with `organization_id`; a refused request logs `NotAllowed`. (The preflight's `breaking:vc-module-customer` WARN is Customer 3.1021.0, a different release — no gate flags #324) | source `CONFIRMED`; live impersonate `UNVERIFIED` (G25) |

**D14 — stand matrix** (vcptcore live 2026-10-28; vcst / vcptcore_qa1 = rev 2 or the named run, NOT re-checked):

| | vcst (rev 2 / 5904 rounds) | vcptcore_qa1 (rev 2) | **vcptcore (live)** |
|---|---|---|---|
| MFA module | `3.1000.0-pr-1-*` (PR builds) | absent | **3.1000.1 (release)** |
| OTP module / B2B-store `OtpSignIn.Enabled` | `3.1001.0-pr-3-d978` / true | `3.1000.0` / true | **3.1001.0 / null → OFF** (all 12 stores) |
| Passkeys module / platform sign-in methods | absent / 3.1090 (#3133) | absent | **`3.1000.0-pr-1-a25f` / 3.1091.0-pr-3144-e637** |
| Punchout module, `punchout` grant | absent | present | **absent** |
| Grants in discovery | + `mfa`, `otp_email` | + `otp_email`, `punchout`, `urn:vc:cookie-bridge` | **+ `mfa`, `otp_email`, `passkey`, `urn:vc:cookie-bridge`** |
| Admin IdPs (AngularJS login) | Entra, "Google sign-in" | Entra, Google, Virto | **Google, Passkey** |
| Storefront IdP / method buttons | Entra, Google | Google, Entra | **Google, Passkey** |
| xAPI `authenticationTypes` B2B-store | Password, AzureAD, GoogleSSO | Password, GoogleSSO, AzureAD, virto | **Password, GoogleSSO, Passkey** |
| Customer module | `3.1030.0` | `3.1030.0-pr-321` | **`3.1032.0-pr-324-b30b`** |
| Sign-in log Types in API | Password, OTP, MFA, Impersonation(Revert), Logout | + `punchout` | **Password, Passkey, MFA(fail only), External, Impersonation(Revert), Logout** |
| MFA global setting | false (windows opened by test rounds) | n/a | **null/false, StoreMode null on 12 stores** |
| `/api/mfa/resend` on the storefront host | 405 → routed by 2026-10-23 (kb) | n/a | **routed (200)** |
| Email delivery | SendGrid "Maximum credits exceeded": codes read from the notification journal (5904) | `UNVERIFIED` | `UNVERIFIED` |
| Six role accounts fail sign-in (USER2, ORG_USER, MULTI_ORG_USER, EUR_USER, SALES_REP, SALES_REP_NOCUSTOMERS) | n/a | n/a | **per the 6121 summary** (not re-tried here) |

A case written against one stand silently skips, passes or fails on another: every case names its stand's module/setting state and reads it first.

## §4 — Coverage shape

Basis: csv-parse of every `regression/suites/**/*.csv` (170 files, 5,713 rows, 2026-10-28; working copy: 114/115 untracked and
`config/test-suites.json` modified); `testCount` in the manifest equals the parsed row count for every suite below. "BL-AUTH rows" =
rows whose `Business_Rule` column cites BL-AUTH-*. **342 rows in 45 suites cite BL-AUTH.** Keyword counts are regex hits over every cell (a
mention is not coverage).

| Suite | Name | Cases | BL-AUTH rows | Status mix |
|---|---|---|---|---|
| 031 | Auth Login & Register | 37 | 37 | Automated 20 · Manual 11 · Draft 6 |
| 032 | Auth Session & RBAC | 20 | 20 | Automated 4 · Semi 5 · Reviewed 2 · Manual 3 · Draft 6 |
| 033 | Auth Company & Account Menu | 15 | 7 | Automated 8 · Manual 6 · Draft 1 |
| 082 | Auth Impersonation / Login on Behalf | 48 | 44 | Automated 30 · Reviewed 7 · Draft 6 · Manual 5 |
| 101 | Platform — Sign-in Log | 46 | 4 | **Draft 43** · Manual 3 |
| 104 | Auth OTP Sign-In (storefront) | 30 | 17 | Automated 23 · Draft 7 |
| 105 | OTP Sign-In API | 21 | 14 | Automated 10 · Draft 11 |
| **110** | **MFA Sign-In API and Backoffice** | **32** | 8 | Automated 23 · Draft 9 |
| **111** | **Auth MFA Sign-In (storefront)** | **13** | 4 | Automated 12 · Draft 1 |
| **114** | **Auth Passkey Sign-In (storefront)** — untracked, VCST-6121 in progress | **19** | 9 | **Draft 19** |
| **115** | **Passkey Sign-In API and Backoffice** — untracked | **14** | 5 | **Draft 14** |
| 044 | Security Tests | 34 | 5 | Draft 10 · blank 24 |
| 042 / 078 | Smoke / Backend Smoke | 34 / 27 | 7 / 7 | Automated 26 / 26 |
| 049 / 050d | Platform API / GraphQL xProfile | 52 / 60 | 13 / 18 | Automated 40 / 25 · Draft 12 / 33 |
| 102 | UCP Agentic Commerce (oauth part) | 42 | 6 | Automated 34 · Draft 8 |
| 107 / 108 / 109 / 113 | Punchout — session / cXML+token+mapping / requisition / OrderRequest (owner `.claude/knowledge/domain/punchout.md`) | 8 / 25 / 35 / 46 | 2 / 3 / — / 0 | 107, 108: all Draft; 113: Automated 25 · Draft 21 |

**Moving while written (14:10Z):** the VCST-6121 session has since staged 114, 115 and two more passkey CSVs, `114a-auth-passkey-mfa.csv` and `114b-auth-passkey-otp.csv`, and modified 033. 114a/114b are NOT in the counts above — recount after that run lands.

**Selections.** `auth` = 031, 032, 033, 082, 101, 104, 105 → **217 cases, 79 Draft (36%)** — unchanged; it does **not** contain 110, 111, 114, 115.
110/111 are excluded by design from `full`, `backend`/`frontend`, `sprint`, `domain:auth-security`: Draft windows and shared-setting flips, "name them and run ALONE" (manifest notes) — **deliberate, but it means `auth` and `domain:auth-security` run no MFA case**.
**114/115 are in NO selection**, yet `domain:auth-security` (a `where` rule) would pick them up: they carry `exclusiveGroup store-setting:Passkey`, `envRiskGate staging`, `preferredBrowser playwright-chrome`, `clickDriven`, all 33 Draft. Whether the runner serialises `exclusiveGroup` and whether 114/115 are meant to run unattended is `UNVERIFIED` — see Step-5 routing.

**Suites the group/tag still MISSES but that carry the feature**: 027 Customer Orgs & Invites (19 of 71 BL-AUTH), 011b (14/30), 017b (14/37), 006 B2B Organization (13/71), 020 Platform Users Roles & Settings (8/66 — also the only suite naming `/forgot-password`, 2 rows), 008 B2B Members (6/40), 085 Task Management (6/26), 044 (5/34, tagged `auth-security`, not in `auth`). Suite 058 still holds the only two "two-factor" cases (NOTIF-016 email, NOTIF-031 SMS), both blank `Automation_Status`, written against "a two-factor enabled account"; the MFA module sends email only (no SMS counterpart) — and 110 now covers the MFA email path.

**Zero / near-zero**:
- ~~MFA: zero suites~~ — **CLOSED** (110 + 111 = 45 cases, 35 Automated). Remaining MFA holes: Backoffice code-screen UI cases ran only partly (5904 round 1 C-5/C-6 BLOCKED, round 2 C2 PASS); VC-Shell code step MISSING (VCST-6533); `lockout_disabled` is not testable (lockoutEnabled=false is not settable, KB-87EC0A28) — **deliberate** fixture gap.
- Passkeys: **33 cases, all Draft, never run** (114/115) — the VCST-6121 run is writing them now; `/account/security` has no case elsewhere. Suites 031 AUTH-025/026 and 033 AUTH-030/032/033 are contradicted by the new surface (6121 SBTM) — **stale rows**, not holes.
- Admin UI entry restriction (`PlatformUI.Access`, `#!/contact-admin`): 0 rows (regex `contact-admin|PlatformUI.Access` — no hit) — **hole**.
- Storefront `/reset-password`, `/set-password`, `resetPasswordByToken`, `requestPasswordReset`: 0 rows in any suite; `/forgot-password`: 2 rows, both in suite 020 (rev 2 counted 4 under a looser pattern — basis changed) — **hole**.
- Sign-in log: suite 101 predates MFA and passkey types (no passkey/MFA keyword in it; 43 of 46 Draft) — **hole** on the new vocabulary.
- Terminate-session: 7 rows in 4 suites (032, 101, 006, 050d), none drives the user-blade widget or the REST DELETE — **hole**.
- Full SSO round-trip: 1 row (031) — **deliberate** (no IdP credentials).

**Over-covered relative to risk**: impersonation 48 cases (44 BL-AUTH) and OTP 51 cases against MFA 45 and passkeys 33 (unrun) — OTP is OFF on vcptcore and was never used there (no OTP row in its log), so 104/105 can only run where an OTP-on store exists.

**Selection-group / executability problems**:
- `[PRE:SIGNIN_AS]` — 77 suite files, 1,990 rows mention it (rev 2: 75 / 1,947; the preflight doc still says "~1,572"). Its steps assume the password form is the first view. **Axis 1 (OTP-on stores)** unchanged. **Axis 2 (MFA)**: with MFA required for the store the redirect never happens after the password (code step, code from the notification journal). **Axis 3 (new): passkey** — the `/sign-in` page fires conditional mediation on load, so in Chromium with a resident credential a SIGNIN_AS run may be signed in (or fail with a console error) before the password is typed (D21). Today MFA is off and OTP is off on vcptcore: latent, not current. Also `grant_type=password` appears in 257 rows of 38 suites (rev 2: 179 / 31 under a narrower pattern — basis changed), 162 of them naming `ADMIN_EMAIL`; with the global MFA switch on, a store-less admin password grant gets `two_factor_required`.
- `requiresModules` is matched by exact string against `MODULES_ENABLED` (`ci/lib/suite-manifest.ts` lines 226–229): 104/105 use a short token (`otp`), 027 `customer`, 058 `notifications`, 017b `orders`, 085 `task-management`; 102, 107, 108, 109, 110, 111, 113, 114, 115 use module ids. **Convention still mixed** — `UNVERIFIED` which side `MODULES_ENABLED` is written in on each stand.
- `envRiskGate`: 101, 104, 105, 110, 111, 114, 115, 107, 108, 113 gated `staging`; 031/032/033/082/042/044 carry none — `UNVERIFIED` whether their lockout / impersonation rows use disposable accounts.
- OTP: 18 Draft OTP cases never ran. Punchout: 107/108 (33 cases) all Draft; the module is absent on vcptcore.

## §5 — Open gaps

| # | Gap | State / what it needs |
|---|---|---|
| G1 | A populated `lockoutSecondsRemaining` (OTP / MFA / passkey grants) | **OPEN** — needs a disposable account locked on purpose |
| G2 | Does the password grant distinguish a wrong password for an EXISTING user from `login_failed`? | **OPEN, narrowed** — nonexistent user observed (D11); existing user needs a disposable account (counts toward lockout) |
| G3 | Store Settings → OTP Sign-In → General click-walk | **CLOSED** (rev 2, one control "Enable OTP sign-in"; vcptcore stores have it off) |
| G4 | Whether "Manage Active Sessions" exists elsewhere | **CLOSED** (D3) |
| G5 | Full SSO round-trip against a real IdP | **OPEN** — no IdP credentials on any stand |
| G6 | Trusted-group cross-store sign-in | **CLOSED for the password grant** (rev 2); vcptcore has a different trust graph (variants); passkey grant refuses a foreign store structurally (6121, not re-driven) |
| G7 | OTP happy path in the storefront UI | **CLOSED** (rev 2) — not exercisable on vcptcore (OTP off) |
| G8 | Per-user lock/unlock control | **CLOSED** (rev 2) — unlock label still open |
| G9 | Administrator / non-Contact OTP sign-in on the storefront | **OPEN** — needs an OTP-on store and an admin with lockout enabled |
| G10 | MFA end-to-end | **CLOSED by prior art** (5904 round 2); **vcptcore itself UNVERIFIED** — needs global `MultiFactorAuthentication.Enabled` or a store's `StoreMode` flipped (shared-setting write) and a journal read for the code |
| G11 | OTP opts out of the second factor | **CLOSED by prior art** (recorded door, 5904 C-34) |
| G12 | Which accounts MFA would block (confirmed email + lockout enabled) | **OPEN** — vcst / vcptcore not counted; qa1 counted in rev 2 |
| G13 | `/api/mfa/resend` through the storefront UI | **CLOSED** — routed on vcptcore (anonymous) and on vcst by 2026-10-23 (kb); UI click on vcptcore needs G10 |
| G14 | vcst / vcptcore Admin: store Authentication blade and Notification widget (MFA / OTP templates) | **OPEN** — one click each; needs an Admin UI session on a Chromium lane (G21) |
| G15 | `PlatformUI.Access` configuration | **OPEN** — needs appsettings change or a built Manager account |
| G16 | Reverse edge: terminate all / single revoke tokens at once | **OPEN, narrowed** — REST endpoints exist (swagger); effect needs a session terminated (mutation) |
| G17 | `Stores.EmailVerificationRequired` differs per stand (vcst B2B-store false, qa1 true, **vcptcore false, Enabled true**) | **OPEN** — needs an unconfirmed account sign-in (BL-AUTH-002 is SUSPECT) |
| G18 | Punchout as a sign-in method end-to-end | **OPEN** — owner `.claude/knowledge/domain/punchout.md`; module absent on vcptcore |
| G19 | Homepage login section (`login-form-section.vue`) | **OPEN** — not looked at this pass |
| G20 | **Passkey ceremony end-to-end** (register, sign in, delete, autofill) | **OPEN** — a mutation; needs a Chromium lane with the WebAuthn virtual authenticator and a disposable account — the VCST-6121 run owns it (observed there; not re-driven) |
| G21 | **Admin UI on vcptcore**: Sign-in methods blade, store Authentication widget, user-blade Active sessions, Sign-in log Type filter (Passkey / MFA options), Security settings | **OPEN** — the firefox lane's stored admin secret does not belong to this stand, so no browser sign-in was attempted; needs a Chromium lane with the vcptcore secret |
| G22 | **Passkey scheme off — refused at the token endpoint?** (D18) | **OPEN** — needs a store scheme flip (PUT) and a fresh/cached-tab sequence |
| G23 | **MFA × passkey**: does a passkey satisfy MFA / set `amr`? (6121 Q4; the handler skips the second factor) | **OPEN** — needs an MFA-required store window + a passkey ceremony |
| G24 | An OTP-on store on vcptcore (D11 on-state, D7 OTP row, suites 104/105) | **OPEN** — OTP is off on all 12 stores; a setting write |
| G25 | customer#324 on the impersonate and external legs | **OPEN** — source only; needs a multi-org target with a locked last-used org |
| G26 | `/connect/session` (GET, POST) — purpose, auth, effect | **OPEN** — existence from swagger only; not read |
| G27 | Admin Shell when MFA is required (no code step, VCST-6533) and the VC-Shell sign-in with `two_factor_required` | **OPEN** — needs the global MFA window |
| G28 | Email delivery of MFA / OTP codes (SendGrid credits exhausted on vcst) | **OPEN** — environment; not observed on vcptcore |

## §6 — Prior-art verdicts

| Claim | Verdict |
|---|---|
| `reports/ba/Auth/vcst-5748-otp-sign-in-guide.md` — prerequisite "Without [the route] the *Continue* button fails (HTTP 405)" | **DRIFT (resolved)** — `/api/otp/request` is routed on the vcptcore storefront host (200) |
| same — error codes `store_not_found`, `otp_disabled`, `user_cannot_login_in_store`, `user_not_found` | `otp_disabled` `CONFIRMED` live (vcptcore); `store_not_found` / `user_not_found` `UNVERIFIED` here (rev 2 CONFIRMED on vcst/qa1) |
| same — "Sign-ins by code appear in Security → Sign-in log with the type *OTP*" | **`UNVERIFIED` on vcptcore — no OTP row exists there** (the stand never used OTP) |
| same — turn-on path "Stores → store → Settings widget → OTP Sign-In → General" | `UNVERIFIED · rev 2 only` |
| `reports/ba/Auth/vcst-6132-otp-organization-fallback-developer-guide.md` — fallback table; "Not covered: MFA sign-in" | **superseded in part**: the fallback logic itself is rewritten by customer#324 (OPEN, deployed on vcptcore); the MFA leg is covered by 5904 on vcst |
| `reports/ba/test-models/VCST-6132-2026-10-20.md` — D5 closed, `{HYPOTHESIS}` rows | unchanged; its `allowFallback = SignInResult != null` rule is **REPLACED** (D25) |
| `reports/ba/test-models/VCST-5748-2026-09-29.md` — OTP chain L1–L8 | `CONFIRMED` still the chain on stands with OTP on; vcptcore has it off |
| `reports/knowledge/BL-AUDIT-2026-10-20.md` — "MFA: not observable until VCST-5904" | **DRIFT** (rev 2) → now observed by two rounds; "PR #321 still open" stale since 2026-10-21 |
| `reports/tickets/Sprint26-21/VCST-5904/vcst/verdict.md` (BLOCKED, 2026-10-22) | **SUPERSEDED** by `reports/tickets/Sprint26-21/VCST-5904/vcst-2026-10-23/summary.json` (PASS_WITH_NOTES, round 2): the Backoffice code screen C2 and the storefront code step C1 ran; its "Not tested" list is closed except external IdP, `lockout_disabled`, and impersonation (Q1) |
| `reports/tickets/Sprint26-21/VCST-5904/vcst/test-model.md` — "mind-map DRIFT: `auth.signin.mfa.store-mode` says a store relaxes the global setting only for its own customers" | **kept as a drift against the mind map**: the named store decides for every user (112278 / MfaRequirementService); `.claude/knowledge/domain/auth.mind-map.json` still lacks nodes for the Basic door, user flag, challenge-before-validators and **every passkey node** (6121 test model) — refresh with `/qa-test-mind-map` |
| `reports/tickets/Sprint26-21/VCST-6121/vcptcore/test-model.md` — "domain map lists passkeys as not deployed; every passkey surface MISSING from it" | **`CONFIRMED` for rev 2, now closed by this rev**; its 1r note (Admin Shell no passkey) **wrong** (D24); its Part 0 L1–L9 chain is carried as §1 links 1–9 |
| `reports/tickets/Sprint26-21/VCST-6121/vcptcore/exploratory/SBTM-VCST-6121-2026-10-28.md` — N1 conditional mediation, N2 counter not reset, N3 store-off token, N4 impersonated changePassword, N5 AngularJS last-key delete, N6 impersonated /account/security, N7 B2C first render | recorded as D21 / D20 / D18 / §1 link 6 / §2 / §2 / actors; all `UNVERIFIED · VCST-6121 run` — the run is in progress and its checklist Result cells were empty at write time |
| `VCST-5904/vcst/exploratory` EXP-1 (OTP enumeration, Medium) | triaged `KNOWN_ISSUE` (config-gated); carried in D11 |
| release ledger: Sign-in log (3.1071.0), Restriction of admin sign-in (3.1054.0) | log `CONFIRMED` present (vcptcore REST); entry restriction `UNVERIFIED · rev 2 only`. **The ledger has no MFA / OTP / passkey row** — stale for this domain (generated 2026-10-20) |

**Resolved from the prior art's open-question lists**: 5904 "Backoffice code screen never ran" → ran in round 2; 5748 D5 → closed; 6121 1r → corrected. **Still open from them**: which organization the fallback picks (VCST-6352), organization columns in the sign-in log (VCST-6438; the vcptcore passkey row shows `organizationId` null), `invalid_code` replay (VCST-6490), 6121 author questions Q1–Q5 (password deletion, store switch API-enforced, key delete ends sessions, "satisfies MFA", username-first), VCST-6522 (impersonating operator / admin revoke).

## §7 — Amendments

(none between rev 2 and rev 3)
