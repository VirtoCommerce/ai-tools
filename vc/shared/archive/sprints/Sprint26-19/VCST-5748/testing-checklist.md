# VCST-5748 — Testing checklist (Artifact B) · round 2

**Ticket:** One-Time Password (OTP) Sign-In via Email · Story · FULL · `vcptcore_qa1` / B2B-store
**Build:** Platform 3.1075.0-pr-3114-8668 · VirtoCommerce.OTP 3.1000.0-pr-1-11d6 · theme 2.59.0-pr-2477-ff59 (vc-deploy-dev#6669)
**Env:** `OtpSignIn.Enabled = true` (revert at close-out) · DetailedErrors on · SMTP broken → code read from the notification journal
**Model:** `reports/ba/test-models/VCST-5748-2026-09-29.md` — `#N` = scenario row; conditions, oracles and data are there
**Precondition:** the storefront ingress does not route `/api/otp` (405). Items marked **[R]** are BLOCKED without it; an
INSTRUMENTED run (request forwarded by the harness) is recorded as supporting evidence only.

Status: PASS / FAIL / BLOCKED / NOT RUN + evidence. FE = qa-frontend-expert · BE = qa-backend-expert · UX = ui-ux-expert.

| # | Condition | Model | AC | Owner | Status | Evidence |
|---|---|---|---|---|---|---|
| 1 | [R] Journey: email → masked "Check your email" → code → signed in | #1 | dev 1 | FE | PASS | r2-fe-01-check-your-email.png, r2-fe-01-signed-in-home.png |
| 2 | Continue on the real storefront origin: request status + message shown | #1 | dev 1 | FE | PASS | 200 after vc-deploy-dev#6674 route; was 405 (r2-fe-02-continue-405.png) |
| 3 | Redirect after sign-in, with and without returnUrl | #1 | dev 1 | FE | PASS | no returnUrl → /; returnUrl=/account/orders honoured (r2-fe-03-otp-returnurl-orders.png) |
| 4 | [R] Wrong code: message(s) shown and code input state | #2 | dev 2 | FE | PASS | one alert "That code didn't work." (round 3, theme dcf7: the field is cleared and refocused; round 2 kept the digits) — r3-fe-04-wrong-code.png |
| 5 | [R] Unknown email shows the same screen as a known one | #3 | dev 3 | FE | FAIL | unknown email → "User not found" on the email step (r2-fe-05-unknown-email.png); DetailedErrors on |
| 6 | Empty / invalid email rejected without a request | #9 | dev 4 | FE | PASS | field validation, no request; no max length (255 reaches server) |
| 7 | [R] Pasted and malformed codes | #10 | — | FE | PASS | letters dropped, <6 blocked, spaced paste works |
| 8 | [R] Resend / Use a different email clear old errors | #11 | dev 5 | FE | PASS | new code, field + error cleared |
| 9 | Switch to password and back; state after reload | — | dev 8 | FE | PASS | choice resets to OTP on reload |
| 10 | [R] Buyer with an expired password after OTP sign-in | 3x N1 | — | FE | PASS (by design) | expired password → /change-password after sign-in, same as the password path (round 1, 3x) |
| 11 | Homepage login section | #18 | — | FE | BLOCKED | B2B-store homepage has no login section |
| 12 | Setting off → password form only (then back on) | #12 | dev 7 | FE+BE | PASS | password form only (r2-12-setting-off-password-only.png); request → otp_disabled |
| 13 | Outstanding code after the setting is switched off | #13 | CTX-2 | BE | PASS | pre-switch code → 400 otp_disabled |
| 14 | Trusted-store contact | #14 | CTX-5 | BE | PASS | token, me.storeId New-super |
| 15 | Foreign-store and no-store contacts | #15 | CTX-5 | BE | PASS | user_cannot_login_in_store, no email |
| 16 | Administrator and non-Contact accounts | #16 #17 | CTX-5 | BE | PASS + PO question | admin/manager get a token — same as the password path; should back-office accounts use OTP? |
| 17 | Lockout-disabled account | #17 | — | BE | PASS | lockout_disabled, no email |
| 18 | Code re-use after a successful sign-in | #4 | title | BE | FAIL | same code → 2nd token (round 2, 2026-10-01) |
| 19 | Lockout at the platform threshold (disposable account) | #5 | dev 6 | BE | PASS | locked at 5; 6th → user_is_temporary_locked_out 120 s; correct code refused |
| 20 | Shared counter with password attempts (disposable account) | #6 | CTX-3 | BE | PASS | shared counter: 2 password + 2 code + 1 password → locked |
| 22 | Resend: codes and their validity | #8 | — | BE | PASS (note) | resend 4 s later → identical code; UI says "New code sent" |
| 23 | Notification: subject, code, sender, language | #19 | — | BE | FAIL (Low) | OTP-only: from null (other store emails carry the store address); subject ends with a trailing newline (no other type does). Language: no localized templates for any type — env config, out of scope |
| 24 | Sign-in log entries (Type OTP, reason) | #20 | CTX-3 | BE | PASS | Type OTP rows, failure reason OtpDisabled; storeId = home store (platform-wide) |
| 25 | Request/grant validation (missing params, unknown store) | model API #12 | — | BE | PASS | 400 on missing fields / malformed JSON, store_not_found |
| 26 | Visual + a11y of the OTP steps (desktop + 390px) | 4v | — | UX | NOT RUN | visual lane not run; manual comparison with the prototype: caret missing, double focus ring, copy differs |

**Uncovered by this checklist:** DetailedErrors off (WAIVED in the model); "sign in unavailable" screen with no password auth
(needs a store without password sign-in); SSO round-trip.

**Removed from scope (operator, 2026-10-01):** item 21 "Request rate for one email" — not part of this story; the storefront
password-reset request behaves the same (no server-side throttle), so it is a platform-wide question, not a VCST-5748 defect.
