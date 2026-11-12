# Sprint 26-22 · WX Exclusive window — sign-in settings — report

**Owner:** Elena Kutasina · **Sub-task:** VCST-6803 · **Env:** vcst · **Lane:** playwright-edge, slot 3
**Runs:** REG-2026-11-12-1014-WXpre — 114 passkey cases that change no setting, run while W5 was active · REG-2026-11-12-1133-WX — the exclusive window, 111 MFASF-015…022 + 110 MFA-004/005/027
**Build:** Platform 3.1097.0 · theme 2.62.0-alpha.2647 · VirtoCommerce.Customer 3.1033.0 · VirtoCommerce.Passkeys 3.1000.0
**Scope (owner decision):** only this sprint's sign-in changes — VCST-6597 (MFA policy per store/organization/customer), VCST-6495 (tokens without the code), VCST-6630 (expired password). The rest of WX is deferred to a later exclusive window.

## Verdict

**Sprint scope verified: 35 cases — 32 PASS · 1 FAIL · 2 observed (no verdict) · 0 BLOCKED. No new product defect.**

| Suite | Pass | Fail | No verdict | Covers |
|-------|------|------|------------|--------|
| 111 MFA storefront (MFASF-015…022) | 8 | 0 | 0 | VCST-6597: self-service on/off, admin-managed, customer Required, company policy, unconfirmed email, Enabled store, impersonation, unreachable code |
| 110 MFA API (MFA-004/005/027) — outside WX, same setting | 3 | 0 | 0 | VCST-6495 (no token without the code, with or without storeId), VCST-6597 settings |
| 114 Passkey (20 of 22; not PKS-009/016) | 16 | 1 | 3 | VCST-6630 (PKS-022 PASS), VCST-6599/6600 |

- **PKS-011 FAIL** — deleting a passkey on the storefront does not end the buyer's other sessions: DUPLICATE **VCST-6594**.
- **No verdict:** PKS-005 (blank name cannot be submitted, case premise unreachable), PKS-017 (impersonated changePassword answers PasswordMismatch — PO decision, KB-B93A97C4), PKS-024 (failed-delete arm needs a `.spec`).

## Settings

Taken 11:32:38Z and restored, re-read after the window: B2B-store `OtpSignIn.Enabled = true`, `MultiFactorAuthentication.StoreMode = CustomerChoice`; platform `MultiFactorAuthentication.Enabled = false`. Per-user and per-organization policies reset to Off. Store-setting writes through `/api/platform/settings/v2/tenant/Store/…` were not picked up by `GET /api/stores` and the storefront for over 10 minutes (KB-5B1912FA), so the window used the Admin UI store settings blade; no full `PUT /api/stores`.

## Not covered in this release

- Not run, deferred to a later exclusive window: 104 OTP (30), the rest of 111 (14), 114a, 114b, PKS-009/016, and the cases other waves deferred to WX (W1, W3, W4, W6 MSNF-004/005).
- No case exists, none written by owner decision: VCST-6630 for OTP sign-in (GAP-03), VCST-6530, VCST-6504.

## Other observations

- The "This device already has a passkey" toast stays until closed and covers the account button.
- With `StoreMode=Enabled` on B2B-store the admin password grant itself answers `two_factor_required`; mint the admin token before such a window.
