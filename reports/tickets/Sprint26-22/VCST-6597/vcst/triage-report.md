# Triage — VCST-6597 checklist (ticket mode)

Source: `testing-checklist.md` (C-1..C-34, X-1..X-6) · vcst, Platform 3.1094.0, VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481), theme 2.62.0-pr-2622-caac (vc-frontend#2622 @caac275), AdminShell 3.1093.0 · 2026-11-04
Mode: `--verify`. Every REAL_BUG candidate was reproduced with `vc-fix:qa-investigate`; packages are under `investigations/<row>/`. Ticket mode writes no CSV and no bug draft (those are 5-file's).
Rows triaged: 12 FAIL rows; advisory: 3 (C-24, C-28, X-4) · real bugs: 8 confirmed + 2 side findings · dismissed: 4 (KNOWN_ISSUE 3, test-tool artifact 1)
The regression run's own triage: `reports/regression/REG-2026-11-04-1531/triage-report.md` (MFA-070 confirmed, MFA-027 fixed, 2 fixture defects, 2 ENV).

## 1. Confirmed real bugs

| Row | Sev | Repo | Root cause | Package |
|---|---|---|---|---|
| X-1 | P2 Medium | vc-shell (`useUser/index.ts` L236-241, L130-131) as shipped in AdminShell 3.1093.0; secondary vc-module-mfa | The Admin Shell sign-in sends an extra password grant after the cookie login. The own-store rule (BL-AUTH-020) challenges it, so every sign-in of a Backoffice user whose own store requires MFA mails an unrequested code. `fetchToken` logs the live twoFactorToken to the console. This contradicts BL-AUTH-025 and README L20. Reproduced 2/2; controls clean | investigations/X-1 · KB-724EABC7 |
| C-34 | P2 Medium (BL-A11Y) | vc-frontend (`mfa-settings-widget.vue` L3, L136-138, L180-193; `sign-in-code-form.vue` L3-4, L19, L92) | After Cancel or a correct code, focus drops to the body (BL-A11Y-001). The initial "code sent" is not announced (BL-A11Y-004). Not reproduced: an unannounced outcome (the toast region is live) and the 4-wrong-codes lockout (per-instance limiter) | investigations/C-34 · KB-1CCD2E8C |
| C-14 | P2 Medium (oracle: PO) | vc-module-mfa (`MfaSelfService.cs` L155-178, `MfaModesController.cs` L68-81, `MfaChangeResponse.cs`) | When a maintainer, or the admin, turns an organization on, nothing checks that members can receive a code, and the response has no field to warn. A member with an unconfirmed email is then locked out (400 `mfa_provider_not_available`, 0 emails). The lockout itself is documented (README L29/L144); a refusal or warning is not. Reproduced 3/3 | investigations/C-14 · KB-2DF21203, KB-C91A3971 |
| C-13 | P3 Low | vc-frontend (`mfa-settings-widget.vue` L9, L27-35, L152-157) | For an unconfirmed email with an admin-set Enabled, Turn off stays enabled and dead-ends, and the destination is empty. Any admin-set Enabled reads "You turned it on", also for confirmed customers; the API has no "set by" field. All three reproduced | investigations/C-13 · KB-39374F04 |
| C-33 | P3 Low (oracle: PO) | vc-module-mfa (`MfaService.cs` L62, L253, L320-329; `IMfaProvider.SendCodeAsync`; `EmailMfaProvider.cs` L47-67) | A change code is sent with the sign-in template ("Your sign-in code… If you did not try to sign in"). The purpose stops at the ticket. Reproduced 1/1, deterministic | investigations/C-33 · KB-76F9AECF |
| X-2 | P3 Low | (a) vc-module-mfa Localizations, AngularJS `mfa-mode.js` L72-74 + Admin Shell `mode.vue` L143-145; (b) vc-frontend `mfa-settings-widget.vue` L143-146, L160-163 | (a) Both admins tell the admin that "The user turned it on" / "Turned on in the storefront" for a mode the admin set. (b) In AdminManaged, the company widget says "each member decides" above "the store administrator manages". Both reproduced | investigations/X-2 · KB-2EEF45B7, KB-407E93C0 |
| X-5 | P3 Low (BL-A11Y) | vc-shell `SelectTrigger.vue` @v2.7.0 L45-53 | A disabled VcSelect stays a Tab stop and has no `aria-disabled`; affects every disabled VcSelect in the framework | investigations/X-3 · KB-1AD3367C |
| X-6 | P3 Low (BL-A11Y) | vc-module-mfa `Scripts/blades/mfa-mode.tpl.html` L6-13 | AngularJS Mode select is named "Select box"; its visible label is not linked | investigations/X-3 |

## 2. Dismissed

| Row | Class | Reason |
|---|---|---|
| C-6 | KNOWN_ISSUE | VCST-6688 (`requestMfaChangeCode` mails a code to a Required user). Re-observed; BL-AUTH-023 itself holds |
| C-7 | KNOWN_ISSUE | VCST-6687 (`updateMfaUserMode` accepted under an organization requirement). Re-observed; BL-AUTH-021 holds at sign-in |
| C-27 | KNOWN_ISSUE (by design) | README L117: refresh tokens are not affected; AC-3 promises the next sign-in only. Kept as a PO/security risk note (30-day refresh; Terminate all is the only cut-off) |
| X-3 | test-tool artifact | The nameless option comes from the `@playwright/mcp` 0.0.83 AI-mode snapshot (`removeRedundantNames`); getByRole, the DOM and CDP all name it. Row set to PASS; real side findings are X-5 and X-6 |

## 3. Advisory (author/PO questions, not triaged)

C-24: a change through a foreign CustomerChoice store is accepted (KB-D5A600E6). C-28: no audit trail for mode changes (KB-C2DB3C56). X-4: the admin's own REST password grant is challenged while its own store is Enabled (KB-64C80F20).

Note: three investigators asked the orchestrator to write `source/findings.md`, which subagents may not write. It was not written; their source findings are in each `root-cause.md`.

No tracker ticket filed, no fix triggered — human decides.


## 4. Verdict re-check against the story text (5-report ratification)

The release-gate verifier read AC-5/BL-AUTH-021 and BL-AUTH-025 more broadly than their text. Re-checked against the story, its comments and the BL wording, the verdict **PASS WITH NOTES** stands:
- **C-7 / VCST-6687:** AC-5 says "a member can't turn it off with their own switch". BL-AUTH-021 says the member needs the code "whatever the user's own mode is", and its violation signal is a member signing in without it. Live, the member has no switch and the sign-in still asks, so both hold. The API accepting the member's own Off is a missing guard (Low).
- **X-1 / VCST-6694:** BL-AUTH-025 governs whether the Backoffice sign-in *asks* for the code, and it does not. Comment 112608 makes a /connect/token password sign-in require the code when the own store requires it, so the module behaves to spec. The defect is vc-shell sending that extra request and logging the token (Medium, VCST-6694).
- **C-6, C-13, C-14:** a README mismatch (Low), widget copy after an admin-set Enabled (Low), and a PO question (Medium, To-fix F-1). None is an unmet AC.
- **Open reading for the PO:** if AC-5 means the server must refuse the member's own change, VCST-6687 turns this into FAIL.
- **Severity of the Low rows:** C-13 and C-33 are Low and C-14 is Medium because C-13 needs a deliberate admin action on one account and C-33 is wording with a PO-owned oracle, while C-14 silently locks out every unconfirmed member of a company through one maintainer click.
- **Design-report F7** (Backoffice store-mode labels in English) is not a defect: they mirror the raw StoreMode setting tokens.
- **The 4 conditions without evidence:** gap-AC-4, 22, 24 and 25, all waived in 3-exec.
