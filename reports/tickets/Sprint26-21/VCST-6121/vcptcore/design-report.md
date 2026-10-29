# VCST-6121 passkey sign-in - visual lane (4v) - design report

Env vcptcore - lane playwright-edge (Edge, real clicks/keys, WebAuthn virtual authenticator CDP-only) - 2026-10-28
Build: theme 2.61.0-pr-2601-8058-80583415 - Platform/classic admin 3.1091.0-pr-3144 - Admin Shell Build 3.1091.0-pr-3144-e637 - Passkeys 3.1000.0-pr-1-a25f
qa-design skill: loaded. Precedence BL-UI invariant > design spec > UX heuristic. Files nothing. Accounts left at 0 passkeys with a password (PK_LOCKOUT, PK_BO_MANAGER, PK_BO_MANAGER_2; no re-seed needed). Admin Shell language reset to English.

## Verdict per axis x target

| Target | BL-UI-* layout | a11y (WCAG 2.2 AA, BL-A11Y) | design-system | vs. DESIGN |
|---|---|---|---|---|
| Storefront /sign-in (1920 / 768 / 375 / 320) | PASS (no h-scroll, buttons 240x44 / 206x44, same size as Google) | FAIL non-blocking: A1 contrast 2.11:1 stand primary, passkey button itself PASS (focus ring 2px #1b789b, 3 Tab from Sign in) | PARTIAL | KNOWN_DIVERGENCE + advisory (D1-D3) |
| Storefront /account/security: empty, 1 / 2 / 3 keys, rename dialog, delete dialog (1920 / 768 / 375 / 320) | PASS (no overflow at 320, BL-UI-002 spacing 0 off-grid of 231 elements, targets 38x38, row-height drift 1 px) | FAIL non-blocking: A2 duplicate names, A3 focus lost, A4 widget title not a heading | PARTIAL | KNOWN_DIVERGENCE + advisory (D4-D6) |
| Admin Shell login (1920 / 375) | PASS (375: no h-scroll; Forgot 122x18 and Help 27x18 pass 2.5.8 spacing exception) | FAIL non-blocking: B1 focus ring ~1.3:1, B2 contrast 4.06:1, B3 tab order | PARTIAL | KNOWN_DIVERGENCE (passkey first = matches idea) |
| Admin Shell Profile > Sign-in methods (1920 / 768 / 375, RTL ar) | PASS (blade mirrors correctly in RTL; 768/375 single-column, no overflow) | PASS for the passkey rows (names "Rename: <key>", disabled delete has name + reason, axe clean on the blade); WARN B4 focus drops to blade after rename | PARTIAL | KNOWN_DIVERGENCE (no admin view of another user's keys, no settings blade) |
| AngularJS /#!/login (1920) | PASS | FAIL non-blocking: C1 | n/a (classic skin) | SKIPPED (see below) |
| AngularJS Sign-in methods widget/blade (1920) | PASS (long name truncates with ellipsis) | FAIL non-blocking: C2 focus + label | n/a | SKIPPED |

Not measured: BL-UI-001 CLS and BL-UI-003 hover/state shift (no observer installed; gaps, not passes). Storefront gated presets Coffee/Red: the stand serves a custom "B2B-store" preset only, so a11y holds for that preset. AngularJS at 768/375 and Admin Shell axe at 768 not run (not in the brief's matrix). Screen-reader output, WCAG 2.4.11/2.5.7/3.2.6/3.3.7/3.3.8 are manual-only: not concluded.

## invariant_failures (may block): none
No BL-UI-001..006 failure confirmed. A11y findings below are on a functional ticket, so by visual-axis.md 3 they go to `a11y_findings[]` (standalone, real severity, never blocking).

## a11y findings (non-blocking, file standalone if the user says so)

| # | Sev | Invariant / WCAG | Where | Measured |
|---|---|---|---|---|
| B1 | High | BL-A11Y-001 / 2.4.7, 1.4.11 | Admin Shell login: "Sign in with a passkey" and "Continue with Google" | focus = no outline, 4px box-shadow amber at 15% over #12161c (about 1.3:1); border unchanged. Other controls use a 2px #ffb224 outline. Evidence `screenshots/vis-bo-login-passkey-focus-1920.png` |
| C2 | High | BL-A11Y-001 + 002 / 2.4.7, 1.3.1, 1.4.11 | AngularJS Sign-in methods blade, icon links Add / Edit / Delete | focused Edit link: outline none, box-shadow none; icon #43b0e6 on white = 2.45:1; rename input `#signInKeyName` has no label (axe `label`); names come from `title` only and repeat per key. Evidence `screenshots/vis-ng-blade-edit-focus-1920.png` |
| A1 | High | BL-A11Y-003 / 1.4.3 | Storefront: Sign in, Sign up, Add passkey (stand primary #f99e24 vs white) | 2.11:1 on 16 px text. Stand-theme value, pre-existing, not passkey-specific; passkey buttons themselves are PASS |
| A2 | Medium | BL-A11Y-002 / 2.4.6, 4.1.2 | Storefront Security rows | icon buttons named just "Edit" / "Delete" for every key (3 keys = 3 identical names). Admin Shell does it right ("Rename: Unnamed key") |
| A3 | Medium | BL-A11Y-001 / 2.4.3 | Storefront Security | after Add passkey and after Delete OK, document.activeElement = BODY (focus lost). Rename/Delete dialogs themselves are good: focus enters, Cancel is the first focus in Delete, Escape closes and returns focus to the trigger |
| A4 | Low | BL-A11Y-004 / 1.3.1, 4.1.2 | Storefront Security | the "Passkeys" section title is a div, not a heading; the vc-widget body carries `aria-labelledby` on a role-less div (axe incomplete aria-prohibited-attr). UI-kit widget, pre-existing |
| B2 | Medium | BL-A11Y-003 / 1.4.3, 2.5.8 | Admin Shell login | "or", footer text, Help link, select placeholder 4.06:1 (#6f7886 / #12161c); showcase dots 6x6 (axe target-size) |
| B3 | Medium | BL-A11Y-001 / 2.4.3 | Admin Shell login | Tab order: passkey, Google, email, password, Sign in, then Forgot password (visually above the password field) |
| B4 | Low | BL-A11Y-001 / 2.4.3 | Admin Shell blade | after inline rename Enter, focus drops to the blade root (next Tab = Maximize); after delete it returns to the blade container |
| C1 | Medium | BL-A11Y-002 + 003 / 4.1.2, 1.4.3 | AngularJS login and shell chrome (pre-existing) | password toggle has no name; "Forgot your password?" 2.44:1; maximize/close buttons unnamed (axe button-name x5); Passkey / Google are `<a href="#">`; the hover tooltip "User profile" covers the "Manage profile" item and intercepts the click; no focus ring on dropdown items |

## Advisory (never blocking)

- D1 KNOWN_DIVERGENCE: storefront sign-in puts passkey as a secondary outline button next to Google, below "Or"; the idea shows passkey first with the subtitle "Face ID, fingerprint or screen lock" and "Email me a one-time code instead".
- D2: at 375 the Google / Passkey buttons are 206 wide, centred, while Sign in / Sign up fill the row (148 each); the idea stacks full-width.
- D3 KNOWN_DIVERGENCE: no create-passkey prompt (FE-CreatePrompt).
- D4 KNOWN_DIVERGENCE: no "N of 10" counter, no email-on-add/remove notice, no RP-ID / max-keys store settings, no admin view of another user's keys.
- D5: the idea shows device-derived names, "Synced passkey / Hardware key", "Last used" and a "Used for this sign-in" badge; the build shows "Unnamed key - Device only - Created ..." only.
- D6 UX: a long name is cut with an ellipsis, 13 characters at 375 and 89 px at 320 (no wrap, no tooltip observed); Admin Shell wraps it fully in its delete dialog. Storefront delete dialog says "OK" and does not name the key; classic says "Yes / No" without the name.
- D7 UX: the error toast "This device already has a passkey for your account." stayed over the header for 60 s+ and covers the account menu until closed.
- D8 UX: Admin Shell disabled password-delete is explained only by a title tooltip (not visible on touch). Cross-surface: AngularJS lists Google, Passkeys, Password and shows "Google - No keys" and an enabled password delete; Admin Shell lists Password, Google ("No linked account"), Passkeys.
- D9 RTL (Admin Shell, ar): layout mirrors correctly; the toolbar labels "Change password" and "Refresh" stay English and a ghost widget labelled "Icon" sits beside Sign-in methods.
- D10 out of scope, observed: after adding a passkey, changing the profile language in Admin Shell showed a raw EF Core message in a toast ("409 ... expected to affect 1 row(s), but actually affected 0 row(s)"); retrying worked. For triage, not filed.
- D11: Edge shows its own password-reveal icon beside the custom eye on Admin Shell login (Edge-only, Low).

## vs. DESIGN
SKIPPED for the extractor: `design:extract` over the 7 `.dc.html` files = 0 expectations, 1 unresolved, exit 2 (the canvas declares no tokens, geometry, icon map or stroke ladder to diff). The canvas is ideas, VCDZ-907 still In Progress. D1-D6 are manual comparisons, advisory only, never a PASS and never a FAIL. icon parity / non-text contrast of icons: only measured on AngularJS (C2).
