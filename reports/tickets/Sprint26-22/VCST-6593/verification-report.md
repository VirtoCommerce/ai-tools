# VCST-6593 — verification report (vcst, 2026-11-05)

**Verdict: VERIFIED WITH NOTES** · STR 3/3 · checklist 9 PASS / 0 FAIL / 1 noted (out of scope)
Step 5 run inline — dispatched agents have no built-in browser.

**Build:** Platform 3.1094.0 · VirtoCommerce.AdminShell 3.1094.0-pr-8-3275 (vc-module-admin-shell#8 @ 32752f89) via vc-deploy-dev#7037 (merged; vcst-qa "Cloud platform deployment" success 11:33 UTC).
Live module version not read from /api/platform/modules (built-in browser signed out of the admin; no sign-in from automation). Corroborated: served stylesheet `/apps/admin-shell/assets/index83735.css` contains the PR rule `.as-auth__provider:focus-visible { outline: 2px solid var(--color-primary-500); outline-offset: 2px }`.

**Surface:** https://vcst-qa.govirto.com/apps/admin-shell/#/login — click "Welcome back", then Tab.

## Before → after
| Control | Before (RED, AdminShell 3.1093.0, dark) | After (GREEN, dark, 3/3) | After (light) |
|---|---|---|---|
| Sign in with a passkey | outline none, 15 % halo, ≈ 1.33:1 | 2px solid #FFB224, offset 2px, 10.06:1 | 2px solid #319ED4, 3.01:1 |
| Continue with Microsoft | same as above | same, 10.06:1 | 3.01:1 |
| Continue with Google | same as above | same, 10.06:1 | 3.01:1 |

## Checklist
1. PASS — original bug reproduced first (baseline/ RED-01, RED-02).
2. PASS — focus ring visible on all three provider buttons, run 1/2/3 identical (dark).
3. PASS — root cause addressed: the `:focus-visible` rule itself now draws an outline (not a per-button patch); covers every `.as-auth__provider`.
4. PASS — light theme: 3.01:1, meets 3:1 (exactly at threshold, same `primary-500` token as the other rings on the page).
5. PASS — tab order unchanged: passkey → Microsoft → Google → email → password → Sign in → Forgot password? → Show password.
6. PASS — email/password inputs still show their focus state (border); Forgot password? link (auto outline, 15.64:1); Show password (2px solid, 10.06:1).
7. PASS — theme switch and language picker unaffected; theme restored to dark after the check.
8. PASS — no new console errors on the admin-shell page (only pre-existing 401s from the classic admin `/#!/login` settings call, visited earlier for the modules check).
9. PASS — BL-A11Y-001 (visible focus indicator) for the provider buttons.
10. NOTE (out of scope) — **Sign in** (`.as-auth__submit`) still uses the 25 % halo only (outline none), ≈ 1.7:1 on dark. Named as out of scope in the fix comment 112707; needs its own ticket.

## Evidence
baseline/RED-01-passkey-focus-vcst-dark.jpg, baseline/RED-02-google-focus-zoom.png, screenshots/GREEN-01-passkey-focus-dark.jpg, GREEN-02-google-focus-dark-zoom.png, GREEN-03-google-focus-light.jpg. Network: all admin-shell assets 200.
