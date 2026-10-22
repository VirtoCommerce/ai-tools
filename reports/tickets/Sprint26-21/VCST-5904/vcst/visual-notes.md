# Visual lane notes — VCST-5904 (env vcst, Chrome DevTools MCP, 2026-10-22)

qa-design skill: loaded. Scope: strategy row R12 (storefront code step, Backoffice code screen, sign-in log badge); tokens only.
Auth path used: none needed for public pages; one account minted through the UI (`/sign-up`, ledgered). No admin REST, no setting read or changed (the one REST read the lane tried first was declined by the user and never re-run).
Themes: the storefront renders the Red preset only (no preset switch outside Storybook); Coffee not auditable here. Dark scheme checked once (emulated).

## Findings
| ID | Sev | Finding | Rule | Evidence |
|---|---|---|---|---|
| VIS-1 | Medium | Code boxes' resting border is `#d4d4d4` = 1.48:1 on the page (light) and `#3f3f3f` = 1.9:1 on the box (dark). The boxes are the only visual cue where to type (the real input is transparent). The standard storefront input border is `#a3a3a3` (2.5:1), so the new form is lighter than its sibling | WCAG 1.4.11 (3:1); BL-UI consistency | screenshots/vis-otp-code-step-768.png, vis-otp-code-step-dark-768.png |
| VIS-2 | Low | "Resend code" and "Use a different email" are 79x18 and 129x18 px at 375/768. Passes WCAG 2.5.8 only through the spacing exception (no neighbour within 24 px); fails the BL-UI-006 24x24 rule as stated | BL-UI-006 / WCAG 2.5.8 | screenshots/vis-otp-code-step-375m.png (measured: belowAA true for both) |
| VIS-3 | Low | A wrong code inserts the error banner above the form and pushes the code boxes down 46 px (252 -> 298 at 375); the email-step error does the same (~46 px). Empty live region exists first, so it is announced, but the layout jumps | BL-UI-003 | screenshots/vis-otp-code-filled-375m.png, vis-otp-after-continue-1280.png |
| VIS-4 | Low | "Resend code": the (disabled, grey) Sign in button turns red and shows a spinner while the resend runs, and the focused first box loses its ring; no visible confirmation that a code was sent in the two captures taken during and right after (the sr-only status paragraph was empty when read later). Needs a manual look at timing | Nielsen 1 (system status) | screenshots/vis-otp-resend-768.png, vis-otp-resend-done-768.png |

## Checked, clean
- Sign-in OTP step, password mode, code step, error state: no horizontal overflow at 375/500/768/1280; text contrast all >= 4.5:1 (smallest: helper text 4.74:1, error text 7.85:1 on pink); disabled Sign in 6.2:1.
- Spacing in the code form on grid (margins 16/8/12/8/24/16 px); input 56 px tall, boxes 47.8x56.
- Keyboard: Tab from the code box lands on Resend code with a 2 px `rgb(59,130,246)` outline, visible; focus ring on the active box is a blue border + ring.
- Alert region is present empty before the error (`role=alert`-style live region), so WCAG 4.1.3 holds for the error.
- Code form is the OTP flavour (otp-email-verify-form) reached with the minted user; layout is identical at 768 (two-column with OR divider) and 375 (stacked).

## vs. DESIGN
SKIPPED — the ticket carries no design link (no Prototype link to resolve). Not a pass.

## Not measured
CLS on the step transitions; screen-reader output; WCAG 2.4.11 / 2.5.7 / 3.2.6 / 3.3.7 / 3.3.8 (axe does not cover them — 3.3.8 in particular: paste into the code boxes was not tried); Coffee preset.

## BLOCKED
1. Storefront MFA code step (mfa-verify-form) and its error/resend states — needs B2B-store `MultiFactorAuthentication.StoreMode=Enabled` (admin REST write; the REST access was declined and the lane has no admin path) or global on (guard rule 3: ac-checks window only). BLOCKED — not run.
2. Backoffice code screen — needs global MFA on (guard rule 3) and a Backoffice session; the lane's profile is signed out and holds no credential. BLOCKED — not run.
3. Sign-in log badge — needs a Backoffice admin session; same reason. BLOCKED — not run.
4. Storefront impersonation dialog (R10, impersonate-form.vue) — needs a signed-in operator/sales-rep role; no pre-signed profile. BLOCKED — not run.
5. Guard rule 1 re-read: no setting could be read from this lane. The OTP sign-in default screen is consistent with B2B-store OtpSignIn.Enabled=true but the setting itself was not re-read.

## Ledger
`.vc-fix/vc-test/VCST-5904/ledger.jsonl`: one line — storefront user AGENT-TEST-vis5904@example.com (personal account, email unconfirmed, platform id unknown). No setting changed. Entity left in place.
