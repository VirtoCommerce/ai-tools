# VCST-5904 — Step 4v visual + accessibility report (MFA code step)

Build: theme 2.61.0-pr-2570-2fc9 (head eecfe333 locale + impersonation fixes NOT deployed), MFA 3.1000.0-pr-1-cf83. Env vcst, Coffee preset only (Red not run). Browser: Chrome DevTools MCP.
Surfaces: Storefront `/sign-in` code step (MfaVerifyForm + sign-in-code-input) at 375 / 768 / 1920 (W2); Backoffice `#!/login` -> `#!/sign-in-code`, desktop 1920 (W1).
Evidence: `screenshots/vis-*.png` (22 files). Fresh accounts per error capture, all torn down (`teardown` zero residue). Admin token: only the `.admin-refresh-visual` chain.

## Verdicts

| Target | BL-UI | A11y (WCAG 2.2 AA) | vs. DESIGN |
|---|---|---|---|
| 1 Storefront code step | **FAIL** (BL-UI-003, Medium); WARN BL-UI-006 (Low) | **PASS WITH NOTES** (no new FAIL; known VCST-6504) | SKIPPED |
| 2 Backoffice sign-in-code | **FAIL** (BL-UI-003 shift, Low) | **FAIL** (F1, F2 High) | SKIPPED |

vs. DESIGN: SKIPPED — the ticket carries no Prototype link, so there is no named design source (never a PASS).

## Findings (new)

| # | Sev | Surface | Finding | Rule | Evidence |
|---|---|---|---|---|---|
| F1 | High | Backoffice | Focus is NOT moved to the code input when the step opens (`activeElement` = BODY, textbox not `focused` in the a11y tree) and is lost to BODY again after every wrong code. A keyboard/AT user must re-find the field after each attempt. Storefront does both correctly. | WCAG 2.4.3, 3.3.1; BL-UI-007 | vis-bo-code-resting, vis-bo-code-error |
| F2 | High | Backoffice | Wrong-code message ("That code didn't work. Check it and try again.") is a plain `div.vc-alert--error`: no `role=alert`/`aria-live`, and the input carries no `aria-invalid` and no `aria-describedby`. The error is visual only; combined with F1 a screen-reader user gets no signal. Storefront has `role=alert` container + `aria-invalid=true` + `aria-describedby="mfa-code-error mfa-hint"`. Same for the final "Too many incorrect codes" message. | WCAG 4.1.3, 3.3.1, 4.1.2; BL-A11Y-004 | vis-bo-code-error, vis-bo-final-error-3rd |
| F3 | Medium | Storefront (all viewports) | Inserting the error alert ABOVE the code field pushes the whole form down 46 px (input y 355 -> 401 at 1920; 252 -> 298 at 375/768; Sign in, Resend, Back all move). Typing the 6th digit auto-submits, so the field jumps under the user's focus. Reserve the slot or render the message below the field. | BL-UI-003 | vis-sf-1920-resting-true vs vis-sf-1920-error-true; vis-sf-375-resting vs -error |
| F4 | Low | Backoffice | Error insertion re-centres the card: the input moves up 29 px (y 502 -> 473). | BL-UI-003 | vis-bo-code-resting vs vis-bo-code-error |
| F5 | Low | Storefront | "Resend code" / "Back to sign in" are 18 px tall (121x18, 89x18). WCAG 2.5.8 holds via the spacing exception (no neighbour within 24 px circle), but BL-UI-006's literal 24x24 is not met at <=768 (375: 262,456 / 24,456). WARN, not an AA failure. Disabled Resend is exempt. | BL-UI-006 / 2.5.8 | vis-sf-375-resting |
| F6 | Low | Storefront | "New code sent." is a visually hidden (1x1) polite live region. Sighted users get no confirmation other than the countdown restarting (input is also cleared). Announced for AT = OK. | Nielsen 1 (status) | vis-sf-1920-new-code-sent |
| F7 | Low | Storefront | Hint "Enter or paste the code. On mobile, tap it above your keyboard." is shown on desktop and at 1920 where "tap above keyboard" has no meaning. | Nielsen 2 (copy) | vis-sf-1920-resting |
| F8 | Low | Backoffice | First cold load of `#!/login` rendered raw i18n keys (`platform.blades.login.labels.*`, broken logo image); a reload rendered correctly. Seen once; related to the already-known raw-key behaviour on `#!/sign-in-code`. Not reproduced on the code step in this run. | i18n | (probe shot not kept) |
| F9 | Info | Backoffice | Code input border `rgb(211,218,233)` on white is ~1.4:1 (1.4.11). It is the platform's standard input style, so a platform-level finding to record once (BL-UI-007 scope note), not a module defect. | 1.4.11 | vis-bo-code-focused |

## Known / recorded, not re-reported

- **VCST-6504 (filed)**: storefront code-cell border `#d4d4d4` on white = 1.48:1 (resting, all viewports) and 1.88:1 on the grey page area. Reconfirmed at 1920/768/375 (`vis-sf-*-resting`). The active cell is blue (6.7:1) and the error cells red (`#bb1616`, >6:1) pass.
- Discovery items: "We sent a code" with no email sent and Admin `#!/sign-in-code` opened directly (raw key) were NOT exercised here.
- Discovery saw a generic "Something went wrong" on the 3rd wrong code; in this run (storefront account, Backoffice account) the 3rd wrong code showed **"Too many incorrect codes. Wait a few minutes and sign in again."** on both surfaces. The generic variant was not reproduced; it may depend on the path (e.g. a token/lockout state).

## Target 1 — Storefront state matrix (axes a + b)

| State | 375 | 768 | 1920 | Notes |
|---|---|---|---|---|
| Resting (heading "Enter the sign-in code", masked email `a•••4@example.com`) | PASS | PASS | PASS | no overflow (scrollW <= innerW), gaps 8 px, cells 48x56 / 57x56 / 75x56 |
| Focused | n/a (touch) | n/a | PASS | input focused automatically on step change; blue ring cell; Tab ring `#3b82f6` 1.6 px = 3.68:1 |
| Filled (5 digits) | PASS | PASS | PASS | `vis-sf-*-filled-partial` |
| Error, wrong code | FAIL F3 | FAIL F3 | FAIL F3 | a11y correct: `aria-invalid=true`, `role=alert`, focus stays in input; error text 7.9:1 |
| Resend countdown ("Resend code in N s", disabled) | PASS | PASS | PASS | disabled = exempt; no layout change on tick |
| "New code sent" | - | - | WARN F6 | visually hidden |
| Back to sign in | - | - | PASS | returns to password step, email + password kept, focus to Email, no stale error |
| Final error (3rd wrong code) | - | - | PASS | returns to password step with role=alert "Too many incorrect codes..." focus on Email (`vis-sf-1920-back-to-password-with-error`) |

Contrast (computed): paragraph 7.81, label 17.9, hint 4.74, Back/Resend link 5.17, disabled Sign in exempt. axe 4.10 (wcag2a/aa/21/22aa): **0 violations** on the error state at 768 and 1920; only `incomplete` color-contrast on the transparent `#mfa-code` input (design: cells paint the digits) and footer images. Name on input: "Code", `autocomplete=one-time-code`, `inputmode=numeric`. Keyboard (desktop only): Tab order input -> Back (disabled Sign in / Resend skipped), Shift+Tab returns to the input, no trap.
Caveat: the first 1920 shots (`vis-sf-1920-resting`, `-error-wrong-code` ...) were taken in a window capped at 1540 px; `vis-sf-1920-resting-true`, `-focused-input`, `-error-true` are at a true 1920.

## Target 2 — Backoffice state matrix (desktop)

| State | BL-UI | A11y |
|---|---|---|
| Login | PASS | PASS (labelled inputs, "Log in" disabled until filled) |
| Code step resting: title "Enter the sign-in code", masked `a•••1@example.com`, input `Code *` (`maxlength=6`, `one-time-code`, numeric), Sign in disabled, "Resend code in N s", Back link | PASS (no overflow) | **FAIL F1** (no focus move) |
| Focused (click) | PASS | PASS visible focus on click |
| Inline wrong-code error | WARN F4 | **FAIL F1, F2** |
| Resend countdown -> link | PASS | PASS (plain text, not live; acceptable) |
| Final error "Too many incorrect codes..." (stays on code step, only Back link) | PASS | **FAIL F2** (not announced) |

Not run on Backoffice: axe scan and keyboard Tab walk (10-minute W1 limit; only observable via the a11y tree and `activeElement`). Not run anywhere: Red preset, Backoffice at 375/768.

## summary.json.visual

```json
{"surface":"storefront+admin-spa","axes_run":["bl-ui","wcag-2.2-aa"],"axes_skipped":[{"axis":"design","reason":"no ticket Prototype link"}],
 "verdicts":{"storefront_code_step":{"bl_ui":"FAIL","a11y":"PASS_WITH_NOTES","design":"SKIPPED"},"admin_sign_in_code":{"bl_ui":"FAIL","a11y":"FAIL","design":"SKIPPED"}},
 "findings":["F1 High","F2 High","F3 Medium","F4 Low","F5 Low","F6 Low","F7 Low","F8 Low","F9 Info"],
 "known":["VCST-6504 reconfirmed"],"themes":["Coffee"],"viewports":{"storefront":[375,768,1920],"admin":[1920]}}
```
