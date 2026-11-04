# BUG: Admin Shell login — keyboard focus on "Sign in with a passkey" / "Continue with Google" is not visible (1.34:1 halo, no outline)

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6121

**Severity:** High (accessibility — BL-A11Y-001, WCAG 2.2 AA 2.4.7 Focus Visible + 1.4.11 Non-text Contrast) · **Priority:** High
**Tracker:** [VCST-6593](https://virtocommerce.atlassian.net/browse/VCST-6593) · **Relates to:** VCST-6121 (does not fail the story)

## Env
- **Stand:** `vcptcore` — `{BACK_URL}apps/admin-shell/#/login`, anonymous, default dark theme; Edge 1920×1080
- **Versions (package = deployed, `vc-deploy-dev@vcptcore-qa` `backend/packages.json`):** Platform `3.1091.0-pr-3144-e637` · **VirtoCommerce.AdminShell `3.1002.0-pr-4-1dd1`** (owning module) · VirtoCommerce.Passkeys `3.1000.0-pr-1-a25f` · Theme `2.61.0-pr-2601-8058-80583415` (not involved)
- **Repro rate:** 2/2 — deterministic CSS
- **HAR:** none for this run — the edge lane flushes its HAR only when its context closes (package row 7); no server request is involved, network rows carry the requests
- **Trace / App Insights:** N/A — client-side styling defect, no server layer (root-cause §2)

## Summary
On the Admin Shell login page, tabbing onto **Sign in with a passkey** or **Continue with Google** changes nothing but a 4 px amber halo at 15 % alpha, which composites to ≈ rgb(54,45,29) on the rgb(18,22,28) page: **1.34:1** (needs ≥ 3:1). A keyboard user cannot see where focus is. Why: `.as-auth__provider:focus-visible` sets `outline: none` and replaces it with a 15 % `color-mix` shadow of `--color-primary-500`.

## Steps to reproduce
1. Edge 1920×1080, signed out. Open `{BACK_URL}apps/admin-shell/#/login` (default dark theme).
2. Click the "Welcome back" heading (sets the keyboard start point), press **Tab** → focus on **Sign in with a passkey** (`:focus-visible` true).
3. Observe: no outline; border unchanged; only `box-shadow: 0 0 0 4px` amber at 15 % alpha → composite ≈ rgb(54,45,29) on rgb(18,22,28) = **1.34:1**.
4. **Tab** → **Continue with Google**: identical styling (1.34:1).
5. **Tab** → email input: border turns rgb(239,168,38) = 8.9:1 — the page's own visible pattern. **Tab** ×2 → **Sign in** button: 25 % ring only (≈1.73:1, same mechanism).

## Actual
- Passkey button focused: outline `none`, border `1px rgb(42,49,60)` (unchanged from rest), shadow `0 0 0 4px rgb(255 178 36 / 0.15)` → **1.34:1** vs page, 1.03:1 vs border
- Google button focused: same → **1.34:1**
- Sign in button focused: 25 % ring only → ≈1.73:1 (same mechanism)
- Screenshots: `../screenshots/AdminShell-Login-Provider-Focus-Invisible/02-FAIL-passkey-focus-zoom.png`, `03-FAIL-google-focus-zoom.png`, viewport `01-FAIL-passkey-button-keyboard-focus.png`

## Expected
- Every interactive control shows a visible focus indicator with ≥ 3:1 contrast against adjacent colours (BL-A11Y-001; WCAG 2.2 2.4.7 + 1.4.11)
- The shell's own pattern: a 2 px solid `--color-primary-500` outline with offset (AuthShell.vue S3), or the solid primary border the email input gets (8.9:1) — reference `04-ref-email-field-focus.png`

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend (here: Admin Shell Vue app) | FAIL | `evidence-…-adminshell-login-focus/screenshots/02-…`, `03-…`; `source/findings.md` §Measured; `console/console.json` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | N/A — not probed by the investigation | `network/requests.json` (all 200, no failing request) |

**Owning layer:** Layer 1 — the Admin Shell login app's CSS (client-side; ships inside the module)

## Root Cause Analysis
- Claims → evidence: `evidence-20261028T1502Z-adminshell-login-focus/root-cause.md` §3 (rows 1–5)
- Rule: `src/VirtoCommerce.AdminShell.Web/App/src/pages/AuthShell.vue` 348–363 — `.as-auth__provider:focus-visible { box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary-500) 15%, transparent); outline: none; }` (`source/findings.md` S1); both buttons render with `class="as-auth__provider"` (`Login.vue` 16–60, S4)
- Ruled out (root-cause §5): by-design (the same file uses a visible 2 px outline elsewhere, S3); env drift (static CSS of the deployed bundle); timing (measured after Tab settled, twice). Light theme not measured — follow-up, not a rebuttal.
- Regression: N/A — new login screen (Admin Shell #1, VCST-6327; passkey button added in PR #4)

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Admin Shell frontend (Vue app inside the module)
- **Suggested repo:** VirtoCommerce/vc-module-admin-shell
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** VirtoCommerce.AdminShell — login page (`AuthShell.vue`)
- **RCA anchor:** `src/VirtoCommerce.AdminShell.Web/App/src/pages/AuthShell.vue:360-363` (`.as-auth__provider:focus-visible`); same change advisable on `.as-auth__submit:focus-visible` 523–526
- **Routing confidence:** HIGH — note: the Admin Shell app is not declared in `fix-repos.json` `moduleFrontendSubApps`, so `/qa-fix` needs the sub-app path declared or a manual route
