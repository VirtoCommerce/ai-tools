# Independent judge — VCST-6597 (MFA policy per store)

Judge: a separate session that did not run the test. Every finding was re-derived from fresh disposable fixtures, the PR source and the live stand, never from the run's summaries.
Stand: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481) · AdminShell 3.1093.0 (vc-shell @0c25dd4eb) · theme vc-frontend#2622 @caac275 (still the PR head) · 2026-11-04 19:41–20:07Z.
Data: creator `scripts/seed-data/auth/mfa-fixtures.mjs`, runs `jdg2ivkch`, phase 2, `jdgx1a`, `jdgbo1`, `jdggl1` and `jdgsf1`. Every one was torn down with zero residue (read back by GET), and every mode was reset to Off first.
Operator-approved shared windows: **global MFA on** 19:58:21.1–19:58:27.4Z (6 s), restored to false and read back. **B2B-store StoreMode** Disabled → CustomerChoice 19:59:20Z → AdminManaged 20:03:03Z → Enabled 20:03:54Z → Disabled 20:06:48Z, then a second window CustomerChoice 20:13:35Z → Disabled 20:18:26Z. Each read back; the final state is global false and B2B-store Disabled. Run `jdgsf2` was also torn down with zero residue.
Screenshots: `judge/` (5 PNGs).

## Verdict

**The run's PASS WITH NOTES holds.** All 7 linked tickets were reproduced or had their fix verified live, and the judge refutes none of them. Every bug the run reported reproduces live, except C-33 and MFA-070, which reproduce through the API (they have no UI surface). Nothing rises to P0/P1. Three corrections to the run's record are listed at the end; the main one is that VCST-6686 reproduces fully, sign-in included.

## Linked tickets (7 of 7 decided)

| Ticket | Judge result | Live evidence |
|---|---|---|
| VCST-6694 (Medium): Admin Shell sign-in mails an unrequested code and logs the 2FA ticket | **REPRODUCED** 1/1, clean control | Edge, fresh context. Manager (mfa:manage, **user mode Off**) whose own store is Enabled: `security/login` 200, the dashboard opens, then `POST /connect/token` **400** `two_factor_required`. The console error from `use-user fetchToken` carries the 497-char `twoFactorToken`. One "Your sign-in code" row at 19:46:24.9Z. Control (own store Disabled): token 200, no error, no row. Source: `useUser/index.ts` `signIn()` → `fetchToken(password)`, and `logger.error(…, errorBody)` |
| VCST-6687 (Low): `updateMfaUserMode` not refused under an org requirement | **REPRODUCED** | Org Required, member Enabled: `canChangeUserMode` true. `updateMfaUserMode(false)` with a code → `succeeded`, stored **Off**. The next grant still answers `two_factor_required` |
| VCST-6688 (Low): `requestMfaChangeCode` mails a Required user | **REPRODUCED** | Request `succeeded`, journal +1. `updateMfaUserMode` → `mfa_locked_by_administrator`, mode stays Required |
| VCST-6686 (Medium): an org-role buyer is a "Backoffice account" on a Disabled store | **REPRODUCED, both halves** (contradicts the run's "undecided") | Status API: `isDisabledModeSkipped` false → **true** after adding "Organization employee" to `user.Roles`. Global-on window, own Disabled store: role-less customer → tokens, no code; the same customer with the role → **`two_factor_required`** (KB-AE7EF8A7) |
| VCST-6495 (High, On hold; this PR covers it) | **FIX VERIFIED** | Customer of an Enabled store: no storeId, B2B-store (Disabled) and an unknown store each → `two_factor_required` + 1 email |
| VCST-6530 (Medium, On hold; this PR covers it) | **FIX VERIFIED** | Global-on window, Disabled run store: Manager bound to it → `two_factor_required`; store-less Manager naming it → `two_factor_required`; customer holding a permission role → `two_factor_required`. Control: the store's role-less own customer → tokens, no code |
| VCST-6528 (Medium, relates) | **REPRODUCED** | 66-char Manager name, `POST /api/platform/security/login` → **500** "String or binary data would be truncated in table … column …". Pre-existing platform bug, not MFA |

## Checklist rows and drafts

| Row | Judge result | Live evidence |
|---|---|---|
| C-1 journey (CustomerChoice) | **PASS confirmed** | Turn on by keyboard → code step → the journal code auto-submits → "On", toast "Two-factor authentication is on.". The next password sign-in shows "Enter the sign-in code" |
| C-3 / C-8 | **PASS confirmed** | The maintainer's Company › Info → Turn on → code (Resend disabled, "Resend code in 30 s") → "On / Required for all company members…". The org mode is stored as Enabled. Member: the password sign-in shows "Enter the sign-in code". Account › Security: "Your company requires it…" + "Your company turned it on for all its members, so you can't change it here.", no switch. Company › Info shows **no** company widget |
| C-11 UI half | **PASS confirmed** | Turn on → Cancel → Turn on again within 30 s: 1 email in the journal (20:16:25Z), the countdown continues ("Resend code in 12 s"), and the page only says "enter the code we sent". It never claims a new code was sent |
| C-15 (impersonation UI) | **PASS confirmed** | The operator's Company › Members → target → Actions → Login on behalf → OK. The header shows the target. Account › Security: "Off" + "You can't change it while you act on behalf of the customer.", no Turn on |
| C-19 org half (AngularJS organization blade) | **PASS confirmed** | Contacts → org ⋮ → Manage → widget "Multi-factor authentication" → Mode Required → "Preview of the selected mode. Save to apply it." Stored mode still Off; Save → GET Required |
| C-33 locales | **PASS confirmed** | Storefront `/de`, `/fr`, `/ja` /account/security: the widget is fully translated (e.g. "Zwei-Faktor-Authentifizierung", "Authentification à deux facteurs", "2 段階認証"), no raw keys, no English. Backoffice localization API: 66/66 `mfa.*` keys in each locale. Only the five `mfa.store-modes.*` labels stay English; they mirror the raw StoreMode values, as the run's triage F7 said, and are not a defect |
| C-5 (AdminManaged) | **PASS confirmed** | Account › Security: "Off / Signing in needs only your password." + "The store administrator manages…", no switch |
| C-32 (store Enabled) | **PASS confirmed** | "On / The store requires it: we send a code to a•••r@… every time you sign in.", no switch |
| C-19 (AngularJS mode blade) | **PASS confirmed** | Select Required → "Preview of the selected mode. Save to apply it."; stored mode still Enabled. Save → PUT 200 → GET Required |
| C-20 (`mfa:read` only) | **PASS confirmed** | Admin Shell: the Mode select is locked, with no Save on the mode page. REST: GET 200, **PUT 403**. `mfa:manage`: GET 200 |
| C-23 (Admin Shell Save) | **PASS confirmed** | `mfa:manage`: Mode → Enabled → Save → PUT 200 → GET Enabled |
| #26 global-on half (BL-AUTH-025) | **PASS** (the run left it uncovered) | Global on, Manager whose own store is Disabled: Backoffice `security/login` → `succeeded:false, requiresTwoFactor:true`. A Disabled own store does not relax the Backoffice sign-in |
| C-34 (Medium, a11y) | **REPRODUCED live** | Chrome, keyboard only. Turn on → focus moves into the code field. The step's `alert` and polite regions are empty, and the "we sent a code" text is neither live nor `aria-describedby` (F2). **Cancel** → focus on `<body>`, and the next Tab lands on the footer "Orders". **Correct code** → focus on `<body>` (F1, 2/2) |
| C-13 (Low) | **REPRODUCED live** | Unconfirmed customer: Turn on is disabled + "Confirm your email…". After the admin sets Enabled: "On / You turned it on: we send a code to  every time…" (empty address), Turn off enabled. Clicking it → "We can't send a sign-in code to this account…". API: the grant → `mfa_provider_not_available`, 0 emails |
| C-14 / F-1 (Medium) | **REPRODUCED** (API) | Maintainer `updateMfaOrganizationMode(true)` → `succeeded`, `errorCode` null, no warning field. Unconfirmed member → `mfa_provider_not_available`, 0 emails. The admin PUT path behaves the same. Still a PO decision (README L29) |
| C-33 (Low) | **REPRODUCED** (API) | The change-code row and the sign-in row are identical: "Your sign-in code … If you did not try to sign in…" |
| X-2 (Low) | **REPRODUCED live, both halves** | (a) AngularJS blade after an admin-set Enabled: "Turned on in the storefront…" and status "The user turned it on.". (b) AdminManaged company widget: "Not required: each member decides for themselves." directly above "The store administrator manages…" |
| MFA-070 (Low) | **REPRODUCED** (API) | Unknown user and org ids are stored and read back. A deleted user's mode stays Required |
| X-5 (Low) | **REPRODUCED live**, out of scope | Admin Shell, `mfa:read`: Tab lands on the locked "Mode" combobox (`tabindex 0`, no `aria-disabled`, inside the disabled wrapper). This is a pre-existing vc-shell `SelectTrigger.vue` defect |
| X-6 (Low) | **REPRODUCED live**, scope note | The AngularJS Mode select is exposed as "Select box". Every other select on the same user blade is also "Select box": a platform-wide ui-select pattern |
| C-27 (dismissed by design) | **Dismissal UPHELD** | After Required: refresh 200, the old token still serves, the next password grant asks (README L117) |
| C-6, C-7 (dismissed as known) | **UPHELD** | They are VCST-6688 / VCST-6687 |

## Corrections to the run's record

1. **VCST-6686 reproduces, sign-in included.** `summary.json` and C-18 say "not decided: fixture gap". Adding the org role to `user.Roles` (one PUT) is enough, and MFA-035's BLOCKED status can be lifted the same way.
2. **Severity drift.** Checklist C-13 says "FAIL Medium" and C-33 says "FAIL Medium (candidate)", while the drafts, the triage and the Jira comment say **Low**. Align the checklist.
3. **VCST-6694 needs no Required user mode.** It reproduces with mode Off; the own store being Enabled is the only trigger. C-30's wording narrows it more than needed.

## Process notes

- **X-4 bites the tooling, measured live.** While B2B-store was Enabled (20:03:54–20:06:48Z), the seed scripts' admin password grant answered `two_factor_required` 3/3, and each attempt mailed the admin a code. The restore went through a Backoffice cookie login, which follows only the global setting. Any operator window that sets the admin's own store to Enabled needs a pre-minted admin token or this cookie fallback.
- **The run's kb evidence came from one session (7f21950d).** The judge confirmed KB-2DF21203, KB-724EABC7, KB-66BB028C, KB-76F9AECF, KB-64C80F20, KB-8E161EEC and KB-DE731068, and captured KB-AE7EF8A7 (VCST-6686).
- **A stand-wide settings write in the run's C-34 log.** The log records a `POST /api/platform/settings` attempt ("did NOT take"). Keep store-mode windows to the store PUT.

## Coverage

Every linked ticket and every checklist row named in this review was re-checked by the judge: live, or through the API for the rows with no UI surface (C-14, C-33 email, MFA-070). No row rests on the run's evidence alone.
