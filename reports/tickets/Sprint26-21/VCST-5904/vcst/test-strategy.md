# Test strategy — VCST-5904

## Round 1 of 3 — 2026-10-22

Status: APPROVED (Elena Mutykova, 2026-10-22) · Depth label: deep (computed)
Blocked: no
Build: vc-module-mfa#1 @ cf830c0 · vc-platform#3133 @ 8b4a2e4 · vc-module-otp#3 @ d9782ea · vc-frontend#2570 @ 2fc9261 · vc-module-customer#321 @ c54fcfe (released 3.1030.0) · vc-frontend#2477 @ cba9c74 · Stand: vcst · Deployed: UNKNOWN → unverified (bundle: MFA "token: 400", platform no live source; deploy:pr --verify 2026-10-22: MFA, OTP, platform LIVE, theme PINNED) · Previous: none
Change map: .vc-fix/vc-test/VCST-5904/change-map.json
Floors fired: F1 (priority High; High/Critical risks) · F2 (auth domain map §1 purpose UNDECLARED) · F3 (rendering files sign-in.vue, impersonate-form.vue, callback.vue) · F5 (363 cases_at_risk rows across 78 suites) · F10 (OrganizationId) · F11 (MultiFactorAuthentication.Enabled) · F12 (51 significant-zone hotspots, 50 sources) · not fired: F4 (no revenue flow named), F6 (no NOT DEPLOYED line), F7 (Story), F8 (fails closed — mfa#1 diff partly over-cap, no ui-kit path read), F9 (applied inside each floor)
Lanes sequenced: three browser lanes at most (firefox exploratory FIRST, then chrome ui-checks beside devtools visual); the `none` lane is browserless REST and holds no browser slot.

**Mission.** Find out, for the PO and the QA lead, whether an employee (AC field) and a store customer (description) who must enter the emailed code get in only with a correct code under every global × store setting the stand allows, and which other doors still let a password — or no password — through.

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst, ENV_RISK=test (writable) · MFA 3.1000.0-pr-1-cf83, Platform 3.1090.0-pr-3133-8b4a, OTP 3.1001.0-pr-3-d978, Customer 3.1030.0, theme 2.61.0-pr-2570-2fc9 · settings (admin REST, 2026-10-22): MultiFactorAuthentication.Enabled=false; B2B-store StoreMode="Use global setting", OtpSignIn.Enabled=true (global false), TrustedGroups=[Electronics] · appsettings not readable through any API: PasswordLogin:DetailedErrors, MultiFactorAuthentication:DisableEnforcement, MaxCodeAttempts, CodeResendInterval, TwoFactorTokenLifetime (code defaults false / 3 / 30 s / 10 min) · lanes: firefox, chrome, devtools + REST | P1, P2, P4, P5, P10 |
| Product elements | platform two-factor gate (token endpoint, Backoffice login, Basic, external sign-in, sign-in log) · MFA module (settings, requirement rule, mfa grant, /api/mfa/*, Backoffice code screen, email) · storefront code step, impersonation, shared OTP code form · OTP opt-out · Customer org fallback. Chain: setting → rule → challenge → email → code → tokens → organization → session | P3 |
| Quality criteria | AC-1…AC-10 · BL-AUTH-003, BL-AUTH-015, BL-AUTH-016 · comments 112278 (which setting applies), 112031 (org scenario), 111947 (sign-in log), 111971 (lockout race) · KB-C196A782, KB-12E99BF8, KB-06FE6C8D, KB-6D7B2ED7 · auth.md, auth.mind-map.json `auth.signin.mfa.*` · no design link · no VirtoOZ page (new feature) | P7 |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | An employee or customer signs in without a code where the global or store setting requires one — or an admin is waved through because the token request names a Disabled store | AC-1 · AC-10 · floor:F11 · src/VirtoCommerce.MFA.Data/Services/MfaRequirementService.cs:25 · src/VirtoCommerce.MFA.Data/Services/MfaTwoFactorPolicy.cs:26 · src/VirtoCommerce.MFA.Data/Services/MfaTwoFactorPolicy.cs:17 · src/VirtoCommerce.Platform.Security/TwoFactorSignInService.cs:34 | 4×5=20 | Critical |
| R2 | A user whose account needs the code gets in through another door — OTP code alone, an external provider, no storeId or a trusted store — and nobody decided that door is intended | floor:F2 · src/VirtoCommerce.Otp.Data/Services/OtpGrantTypeHandler.cs:59 · src/VirtoCommerce.Platform.Web/Security/ExternalSignInService.cs:75 · src/VirtoCommerce.Platform.Security/OpenIddict/GrantTypeHandlerBase.cs:74 · src/VirtoCommerce.Platform.Web/Security/Authentication/BasicAuthenticationHandler.cs:64 | 3×5=15 | High |
| R3 | An employee does not get the email, or enters the right code and is not taken into the admin UI (bounced to login, stuck on the code screen, or refused without a handler) | AC-2 · AC-3 · AC-4 · AC-5 · AC-6 · src/VirtoCommerce.Platform.Web/Controllers/Api/SecurityController.cs:221 · src/VirtoCommerce.Platform.Web/Controllers/Api/SecurityController.cs:1353 · src/VirtoCommerce.Platform.Web/wwwroot/js/app/security/security.js:61 · src/VirtoCommerce.MFA.Web/Scripts/sign-in/two-factor-sign-in.js:67 · src/VirtoCommerce.MFA.Web/Module.cs:45 · src/VirtoCommerce.Platform.Web/Startup.cs:604 · src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs:212 · src/VirtoCommerce.Platform.Security/TwoFactorSignInService.cs:80 | 3×5=15 | High |
| R4 | A wrong code signs someone in, or three wrong guesses by whoever has the password lock the real user out of their correct code; an accepted code works twice; another email-code flow breaks because the platform's Email token provider was replaced | AC-7 · BL-AUTH-003 · src/VirtoCommerce.MFA.Data/Services/MfaService.cs:118 · src/VirtoCommerce.MFA.Data/Services/MfaService.cs:235 · src/VirtoCommerce.MFA.Data/Services/MfaService.cs:107 · src/VirtoCommerce.MFA.Web/Module.cs:51 | 3×4=12 | High |
| R5 | "Resend code" does nothing, says a code was sent when none was, or the old code still works after a new one | AC-8 · KB-12E99BF8 · src/VirtoCommerce.MFA.Data/Services/MfaService.cs:66 · client-app/shared/sign-in/components/mfa-verify-form.vue:97 | 4×3=12 | High |
| R6 | A store customer who must enter the code sees "wrong password" instead of the code step, lands on the wrong screen after an error, or stays half signed in | AC-10 · client-app/shared/sign-in/composables/useMfaSignIn.ts:48 · client-app/core/composables/useAuth.ts:41 · client-app/shared/sign-in/composables/useCodeSignIn.ts:90 · client-app/shared/sign-in/components/mfa-verify-form.vue:59 · locales/en.json:533 · client-app/shared/account/composables/useSignMeIn.ts:82 · client-app/core/composables/useAuth.ts:217 · client-app/shared/sign-in/composables/useOtpSignInMode.ts:16 | 3×4=12 | High |
| R7 | A buyer in several organizations passes the code and is refused for a stale organization, or lands in a different organization than without one | floor:F10 · BL-AUTH-015 · BL-AUTH-016 · src/VirtoCommerce.CustomerModule.Data/OpenIddict/OrganizationIdRequestValidator.cs:61 · src/VirtoCommerce.CustomerModule.Data/OpenIddict/OrganizationIdRequestValidator.cs:42 · src/VirtoCommerce.CustomerModule.Data/OpenIddict/OrganizationIdRequestValidator.cs:67 · src/VirtoCommerce.CustomerModule.Data/OpenIddict/OrganizationIdRequestValidator.cs:24 · client-app/core/composables/useAuth.ts:184 · client-app/core/composables/useAuth.ts:119 | 3×4=12 | High |
| R8 | Turning MFA on locks out accounts that cannot complete the code step (lockout disabled, notification inactive) — the default admin included | src/VirtoCommerce.MFA.Data/Services/MfaService.cs:162 · src/VirtoCommerce.MFA.Data/Providers/EmailMfaProvider.cs:52 | 3×3=9 | Medium |
| R9 | The sign-in log counts an MFA sign-in twice or as a failure; the Failed list and the dashboard disagree | src/VirtoCommerce.Platform.Security/SignInLog/UserSignInLogSearchService.cs:322 · src/VirtoCommerce.Platform.Security/SignInLog/UserSignInLogSearchService.cs:82 | 3×3=9 | Medium |
| R10 | An operator impersonating from the storefront is left signed in as themselves after a failed impersonation, or Back closes the dialog | client-app/shared/account/composables/useImpersonate.ts:158 · client-app/shared/account/components/impersonate-form.vue:21 | 2×4=8 | Medium |
| R11 | OTP sign-in stops working or shows the wrong screen after the shared code form and the OTP opt-out | src/VirtoCommerce.Otp.Data/Services/OtpGrantTypeHandler.cs:25 · src/VirtoCommerce.Otp.Web/module.manifest:7 · client-app/shared/sign-in/composables/useOtpSignInMode.ts:7 · client-app/shared/sign-in/composables/useOtpSignIn.ts:54 · client-app/shared/sign-in/composables/useOtpSignIn.ts:51 · client-app/shared/sign-in/composables/useOtpSignIn.ts:76 · client-app/shared/sign-in/composables/useOtpSignIn.ts:105 · client-app/shared/sign-in/components/otp-email-verify-form.vue:169 · client-app/shared/sign-in/components/otp-email-verify-form.vue:200 · client-app/shared/sign-in/components/otp-email-sign-in-form.vue:237 · client-app/pages/sign-in.vue:31 · client-app/shared/account/composables/useSignMeIn.ts:89 · client-app/shared/layout/components/login-form-section/login-form-section.vue:17 | 3×3=9 | Medium |
| R12 | The code screens look broken or untranslated (storefront code step, Backoffice code screen, log badge) | floor-F3 rendering files | 2×2=4 | Low |

Project risks: P1 MFA is off on vcst; every check flips a setting on a shared stand, and global on challenges every password sign-in there → storefront checks use StoreMode=Enabled on B2B-store set and restored in the case; the global toggle runs in one short REST window, restored in Cleanup and logged in the ledger; never sign in as the default admin while global is on (R8). · P2 deployment unverified in the bundle → accepted; the verdict quotes the DEPLOYMENT UNKNOWN lines. · P3 the storefront origin may answer /api/mfa/resend with 405 (KB-12E99BF8) → R5 records it; triage separates ingress from product. · P4 codes are read from the notification journal (admin REST) → accepted. · P5 DetailedErrors value unknown → accepted; R4 records the observed lockout form. · P6 F5 regression is not run by vc-test (U7) and no staleness check ran → accepted; suites 101–105, 031–033, 082 go to /qa-test-lifecycle. · P7 AC numbering changed between context passes (7/8/10) → accepted; this round cites AC-1…AC-10 of the current bundle. · P8 the lockout-race finding stays off public GitHub and the kb → accepted. · P9 the wrong-code limit is in memory per instance → accepted; results recorded with the instance count unknown. · P10 the MultiFactorAuthentication appsettings on vcst are unknown, and DisableEnforcement=true would void R1/R3 silently → the first R1 case proves the challenge fires (400 two_factor_required) with global on before any other MFA case runs; R4/R5 record the observed limit, interval and lifetime instead of asserting the defaults.

### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Model-based ✔: R1, R2, R7 take MODEL (F11, F2, F10) · Reactive ✔: F1/F2 fired, R1/R2 oracles conflict ({HYPOTHESIS}) · Regression-averse ✔: F5 fired (run by /qa-test-lifecycle, not here) · Process-compliant —: no external standard in scope

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | MODEL, DT | comment 112278 {SPEC} vs en StoreMode description {HYPOTHESIS} | api · REST /connect/token | none · qa-backend-expert | high |
| R2 | MODEL, EXPLORE | description goal vs comment 112278's accepted bypass — two {SPEC} in conflict ⇒ {HYPOTHESIS} until the PO answers | api + storefront · REST, Playwright | firefox · qa-testing-expert | high |
| R3 | FLOW, ST | AC-2…AC-6 {SPEC} | admin-spa + api · Playwright, REST | firefox · qa-testing-expert | high |
| R4 | BVA, ST | AC-7 {SPEC} · BL-AUTH-003 {BL} | api · REST /connect/token, /api/mfa/signin/verify | none · qa-backend-expert | high |
| R5 | ST, BVA | AC-8 {SPEC} · KB-12E99BF8 {OBSERVED} | storefront + api · Playwright, REST | chrome · qa-frontend-expert | medium |
| R6 | FLOW, ST | AC-10 {SPEC} · comment 112278 {SPEC} | storefront · Playwright | chrome · qa-frontend-expert | medium |
| R7 | MODEL, DT | BL-AUTH-015, BL-AUTH-016 {BL} · comment 112031 {SPEC} | api · REST /connect/token | none · qa-backend-expert | medium |
| R8 | EP | AC-2 {SPEC}: the code reaches every employee who must enter one | api · REST | none · qa-backend-expert | medium |
| R9 | DT | comment 111947 {SPEC} | api + admin-spa · REST | none · qa-backend-expert | low |
| R10 | FLOW, EXPLORE | vc-frontend#2570 claims (impersonation code step) {HYPOTHESIS} — charter item, no pass/fail row | storefront · Playwright | firefox · qa-testing-expert | low |
| R11 | FLOW, EP | KB-6D7B2ED7, KB-08CC76A3 {OBSERVED} | storefront · Playwright | chrome · qa-frontend-expert | medium |
| R12 | VISUAL | design-system tokens {OBSERVED} | storefront + admin-spa · DevTools | devtools · ui-ux-expert | low |

### Artifacts
| Artifact | Decision |
|---|---|
| Test model | RUN (new) — expands R1, R2, R7 only |
| Mind map | RUN — read only: auth.mind-map.json `auth.signin.mfa.*`, `auth.org.resolve.*` (domain map PRESENT; vc-test U43) |
| Checklist | RUN (always) — every item names its R-n |
| Exploratory | RUN 60 min, FIRST — charter: R1, R2, R3, R4, R10 + the change map's 51 zoned hotspots + the anonymous access probe |
| Visual lane | RUN (F3) — storefront code step, Backoffice code screen, sign-in log badge; no design link ⇒ tokens only |
| Contract refresh | RUN — REST contract changes: token response (two_factor_required), /api/mfa/*, sign-in log criteria |
| Coverage triage + regression | RUN — F5: 363 cases_at_risk rows across 78 suites; staleness check not run; vc-test runs no regression (U7) ⇒ hand to /qa-test-lifecycle |
| Verifier | RUN (Critical R1) |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |

### Data
No MFA profile in auth.data-model.json ⇒ created in the case (FIFTH RULE: settings, codes and two-factor tokens are state the stand takes away), AGENT-TEST- prefix, ledger-logged: a test employee with confirmed email and lockout enabled; a B2B-store customer; a customer of a store trusted through TrustedGroups (Electronics); a multi-org customer per profile.auth.org-fallback / org-no-org-left / org-status-refusal; one user with lockout disabled (R8). Codes from the notification journal.
Must differ: the named store's StoreMode ≠ the user's own store's StoreMode, and global on ≠ off under "Use global setting" (R1) · last-used org ≠ an accessible org, with ≥2 accessible orgs (R7) · wrong ≠ accepted ≠ superseded code (R4, R5) · Before redeploy: none

### Out of scope
- AC-9 readiness for SMS / Authenticator — no second provider exists to observe — residual Low
- Parallel wrong-password / wrong-code race on lockout (comment 111971) — needs the QA lead's go before load on a shared stand; kept off the public kb — residual High
- The VCST-6495 bypass (no storeId, trusted store) — accepted for this story in comment 112278; R2 records it as observed, never as FAIL — residual High (tracked)
- OTP code reuse (VCST-6490) — known open bug, separate ticket — residual Medium
- MFA × store email confirmation (Stores.EmailVerificationEnabled / EmailVerificationRequired; B2B-store on vcst: true / false, admin REST 2026-10-22) — the requirement rule ignores the store's confirmation settings, while an unconfirmed address gets no code (src/VirtoCommerce.MFA.Data/Services/MfaService.cs:162 hotspot: Identity's Email provider offers codes only to a confirmed email → mfa_provider_not_available), so where confirmation is optional an unconfirmed customer cannot finish an MFA sign-in; the unconfirmed half of that hotspot is not tested here — separate story (to be filed) — residual Medium
- /connect/session token-to-cookie without a second factor — pre-existing path, not changed here — residual Medium
- Sign-in log dashboard tile options a–d (comment 111947) — PO decision pending — residual Low

### Criteria
Entry: PRs live per deploy:pr --verify (bundle UNKNOWN ⇒ "deployment unverified") · `npm run env:check` green · notification journal readable · MfaSignInEmailNotification active · Suspend (BLOCKED): MFA module not loaded, the notification cannot be activated, a changed setting cannot be restored, or the storefront ingress blocks /connect/token
Exit: every in-scope R1–R12 has a result or a named deviation · exploratory 60-min box spent · every setting and entity in the ledger restored or deleted

### Amendments

### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|

Candidate cases (→ /qa-test-lifecycle): none yet · Carried to Round 2 / escalation: none
