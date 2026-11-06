# Design / a11y / UX report — VCST-6597 MFA widgets (Step 4v)
**Date:** 2026-11-04 · **Lane:** playwright-chrome · **Theme:** storefront 2.62.0-pr-2622-caac-caac275a, active preset only (red/white) · **Executor:** vc-test:ui-ux-expert (qa-design skill loaded)
**Surfaces:** `/account/security` user widget, `/company/info` company widget, shared sign-in code form, Backoffice user Mode blade. Viewports 1280 and 390.
**Data:** creator runId `v6597` (customer-confirmed, org-mfa-maintainer + its org-mfa-member). Mode reset to Off, teardown: zero residue (14 ids read back).
**Store window (W3):** B2B-store StoreMode Disabled -> CustomerChoice 2026-11-04T14:28:53Z, restored Disabled 14:39:49Z, read back `Disabled` (and again 14:45:28Z). Global setting untouched.

## Axis verdicts
| Axis | Verdict | Basis |
|---|---|---|
| vs. DESIGN | **SKIPPED** — no Claude Design / prototype link on the ticket (attachments 4-7 are dev reference shots, not a spec). Never a pass | brief |
| BL-UI-004 overflow | PASS | 390: scrollWidth = clientWidth = 375; 1280: 1265 = 1265; cards equal width |
| BL-UI-006 touch targets (390) | PASS | all >= 24 px, no pair < 8 px apart. Resend and Cancel are exactly 24 px high (AAA 44 not met, advisory) |
| BL-UI-001/002/003/005 | **NOT RUN** (no CLS observer, spacing or rect-shift snippet run); visual review of 1280/390/de/fr shows no overlap or clipping |
| BL-A11Y-001 keyboard/focus | **FAIL candidate** F1 (rest passes: tab order, focus into code field, focus ring) |
| BL-A11Y-002 naming | PASS | textbox "Code" has its label, hint via aria-describedby, buttons named, `autocomplete=one-time-code`, `inputmode=numeric` |
| BL-A11Y-003 contrast (Coffee/active preset) | PASS (measured) | see table; disabled countdown not measured (F6) |
| BL-A11Y-004 status/role | **FAIL candidate** F2, WARN F3 | wrong-code alert is correct; success/cancel/initial-send are silent |
| axe-core | **INCONCLUSIVE** | loading axe from cdnjs was denied by the auto-mode classifier and there is no local copy; an absent measurement, not a clean one |
| Locale spot-check (de, fr, ja) | storefront widget PASS; Backoffice blade WARN (F7); email FAIL candidate (F5) | |
| Not covered | 200% zoom, 320 px reflow, Red/dark presets, screen-reader output, 2.4.11/2.5.7/3.3.7/3.3.8 | manual or not run |

## Findings (candidates, none filed)
| # | Sev | Rule | Finding | Evidence |
|---|---|---|---|---|
| F1 | Medium | BL-A11Y-001 · WCAG 2.4.3 | After a correct code (Turn on) and after Cancel, the code step unmounts and `document.activeElement` is `BODY`. Focus is not returned to the Turn on/off button; a keyboard user restarts from the top of the page. Same on Cancel. Resend does it right (focus back in the code field) | `4v-kb-success-on-1280.png` (state), activeElement read |
| F2 | Medium | BL-A11Y-004 · WCAG 4.1.3 | The outcome is not announced. The live region (`aria-live=polite`, 1x1 sr-only) and the `role=alert` slot live inside the code step, so they are removed with it; after success `main` holds no live region and "On / You turned it on" appears silently. Initial send ("we sent a code to a•••d") is also not announced; the hint the field is described by does not say where the code went. Needs SR confirmation | live-region reads, `4v-kb-success-on-1280.png` |
| F3 | Low | WCAG 4.1.3 | "New code sent." is the same string each time in one persistent polite node; a second Resend rewrites identical text, which many SRs do not re-announce. Cleared after a wrong code. Manual SR check | live-region reads |
| F4 | Medium | UX H5/H9 (error prevention, recovery); {OBSERVED}, not checked against VirtoOZ/kb | Wrong codes in the change-code step feed the platform lockout. Four wrong codes (000000, 111111, 222222 x2) locked the signed-in customer until 14:51:18Z (+15 min); the next navigation sent them to `/blocked` "Your account is blocked ... contact the site administrator", signed out. Nothing warned about remaining attempts; the first three errors read the same ("That code didn't work."), the fourth became "Your account has been temporarily locked". Entering the 6th digit submits at once (no Confirm press), so one mistyped digit costs an attempt. After unlock, Turn off showed "Too many incorrect codes ... sign in again" (ja) instead of the code step, i.e. a second counter. The "blocked/contact admin" page for a 15 min lock is also heavy. Functional lane: attempt-limit case worth adding | `4v-fr-code-step-lockout.png`, `4v-ja-turnoff-too-many-codes.png` (the /blocked shot was overwritten by a re-capture; reproducible) |
| F5 | Medium | C-33 / AC-20 (UX H2 match with real world) | The change-code email reads as a sign-in code and nothing else. Subject "Your sign-in code"; body "Your sign-in code is <code>. It expires shortly ... If you did not try to sign in, change your password." Same text for Turn on, Turn off and the company switch. Nothing says what the code authorises. Not localized either: sent while the storefront was on /de, body English (journal 14:35:51Z) | notification journal rows, `4v-de-code-step-wrong-code.png` |
| F6 | Low | WCAG 1.4.3 (exempt) / 1.3.1 | The "Resend code in N s" countdown is the only place the wait is shown and is drawn in the pale disabled style, visibly lighter than the enabled "Resend code" (5.17:1). Exempt as an inactive control but the information is hard to read; value not measured. Also `generic "Two-factor authentication"` is an aria-label on a role-less container (name likely ignored; axe would need to confirm) | `4v-kb-turnon-send-step-1280.png` |
| F7 | Low | C-33 (i18n) | Backoffice `mfa.store-modes.*` (Use global setting / Enabled / Disabled / Admin managed / Customer choice) equals English in all 12 non-English locales; they render in the Mode blade "Store setting" column. `status.backoffice` and `short-name` "MFA" are also identical (probably intended). Method: `/api/platform/localization?lang=` diff of the 78 MFA keys, 0 missing keys anywhere, so no raw keys. The blade was not switched to de/fr/ja in the UI, to avoid changing the shared admin profile: UI half NOT MEASURED | scratch diff (not committed) |
| F8 | Low | UX H4 consistency / visual | Backoffice says "Enabled" (tile, Mode), storefront says "On" for the same state. The Effective status table header row is about 60 px tall with its labels at the top (extra blank band) | `4v-bo-en-mode-blade.png` |
| F9 | Info | out of scope | de and fr storefront header: "Ship to" label collides with the "Call us" block at 1280 px (pre-existing, not MFA) | `4v-de-security-on.png`, `4v-fr-code-step-lockout.png` |

Already found by the functional lane, seen again: "You turned it on" copy for an Enabled mode set by an admin (the text is the user's own action); no re-report.

## Measured (computed style, active preset)
| Element | Ratio | Needs | Result |
|---|---|---|---|
| Heading, status text, labels | 19.8 | 4.5 / 3 | PASS |
| Turn on / Add passkey (white on 229,33,33) | 4.59 | 4.5 | PASS (thin) |
| Off badge 12 px bold / On badge | 13.88 / 9.21 | 4.5 | PASS, state also stated in text |
| Hint 14 px / explainer 16 px | 4.74 / 7.81 | 4.5 | PASS |
| Error text (128,15,15 on 250,214,214) / red cell border | 7.85 / 6+ | 4.5 / 3 | PASS; icon + text, not colour alone |
| Code cell border (115) / active cell ring (29,78,216) | 4.74 / 6.70 | 3 | PASS |
| Focus outline on buttons, 2 px (59,130,246) | 3.68 | 3 | PASS |
| Turn off outline button text / border | 7.56 / 4.83 | 4.5 / 3 | PASS |
| "New code sent." green (49,97,68) | 7.18 | 4.5 | PASS |
Keyboard walk (1280, real keys): h1 -> Tab -> Add passkey -> Tab -> Turn on (focus ring) -> Enter opens step, focus in the code field -> six digits fill the cells and auto-submit -> wrong: red cells, `role=alert` "That code didn't work.", `aria-invalid=true`, describedby error + hint, cells cleared, focus kept -> Resend (Tab, Enter) returns focus to the field -> correct code -> On (focus lost, F1). Escape does not close the step (inline form, informational).

## Company widget (/company/info, maintainer)
Same component and tokens: Off badge and Turn on contrast as above, code field `mfa-organization-code` with label "Code", hint, polite region and `role=alert`, no horizontal overflow. Cancelled before submit (organization left Off).

## Evidence (reports/tickets/Sprint26-22/VCST-6597/vcst/screenshots/)
`4v-security-off-1280`, `4v-kb-turnon-send-step-1280`, `4v-kb-wrong-code-error-1280`, `4v-kb-code-typed-1280`, `4v-kb-success-on-1280`, `4v-390-turnoff-code-step`, `4v-390-wrong-code-error`, `4v-de-security-on`, `4v-de-code-step-wrong-code`, `4v-fr-code-step-lockout`, `4v-ja-security-on`, `4v-ja-turnoff-too-many-codes`, `4v-signin-code-step`, `4v-company-info-widget-off-1280`, `4v-company-info-code-step-1280`, `4v-bo-en-mode-blade` (all .png).
