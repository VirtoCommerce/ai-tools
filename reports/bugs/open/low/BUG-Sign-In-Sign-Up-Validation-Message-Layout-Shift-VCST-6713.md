# [vc-frontend] Sign-in and sign-up forms jump as validation messages appear: VcInput error row reserves no space (+16px per message)

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-0023-W6R

**Severity:** Low (cosmetic UX; nothing lost, no a11y or functional impact) · **Type:** Layout / UX · **Tracker:** VCST-6713 (Relates VCST-6042, VCST-6467, VCST-170)
**Release:** Stable 16 regression (VCST-6042), wave W6, case `LAYOUT-COMP-VCINPUT-002`

## Env
- Stand `vcptcore_regression` — storefront `{FRONT_URL}` = vcptcore-regression-storefront, guest, store B2B-store, 1280x900
- Theme (vc-frontend) **2.59.0** — package `BUILD_VERSIONS`, re-confirmed at filing: live `/assets/index-Cg7OMg95.js` carries `2.59.0`; matches bundle v16's pin
- Platform / modules: not involved (no server call on the failing action)
- Browsers: Chromium (runner, 3/3) + Firefox (manual). Repro rate: deterministic
- Trace ID / App Insights: N/A — client-side validation only, no request is sent (package rows 5, 10)

## Summary
On `/sign-in`, each validation message inserts a new 16 px row under its field (`vc-input-details`: `mt-1` + `min-h-3`, hidden when empty), so everything below moves down: an empty submit shows two messages and moves **Sign in** by **+32 px**. `/sign-up` moves +16 px on an invalid email. The UI kit already offers the fix (`show-empty-details` reserves the row) and other kit consumers use it; these two forms do not.

**Honest grading:** no doc and no human-sourced rule requires reserved space — BL-UI-003 is `trust: INFERRED`; VirtoOZ (Storefront user/developer guides) is silent. The shift is user-initiated, so it is outside Core Web Vitals CLS. Filed as a Low UX defect; precedent: VCST-170 (same symptom on another form, fixed as a bug).

## Steps to reproduce
1. Guest, viewport 1280x900. Open `{FRONT_URL}/sign-in`. Note the **Sign in** button (top 513 px).
2. Click **Sign in** with Email and Password empty.
3. "This field is required" appears under both fields; **Sign in** moves to 545 px (+32); Remember me / Forgot password +32; "Sign in with Entra ID" +16.
4. Variant: reload, type `not-an-email` into Email — the email message appears while typing and moves the form +16.
5. `/sign-up`: type `not-an-email` into Email — Password, Confirm password, the tips box and **Sign up** move +16.

## Actual
- Sign in +32 px on an empty submit (runner `[SHIFT] topDelta=32`, 3/3); +16 px per message.
- Sign-up form +16 px on an invalid email.
- 0 console errors, 0 failed requests.

![before](../../screenshots/Sign-In-Sign-Up-Validation-Message-Layout-Shift/01-sign-in-before.png) → ![after](../../screenshots/Sign-In-Sign-Up-Validation-Message-Layout-Shift/02-sign-in-after-empty-submit.png)
Sign-up: `05-sign-up-before.png` → `06-sign-up-after-invalid-email.png` (same folder).

## Expected
The message appears without moving the controls below it: the row under each field is reserved, as the kit does where `show-empty-details` is set (quantity-control, add-to-cart, quantity-stepper, date-range-picker, …) and as VCST-170 fixed on the company form. Source: kit convention + VCST-170 precedent; BL-UI-003 (INFERRED, no human source).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | `<pkg>/screenshots/01→02, 05→06`, `runner-trace-recheck-{1,2,3}.json`, `har/firefox-sign-in-sign-up.har` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | no request on the action (`network/requests.txt`) |
| 4. Platform REST API | N/A — not probed by the investigation | no `/connect/token` sent |

**Owning layer:** Layer 1 — Storefront. `<pkg>` = `reports/regression/REG-2026-11-05-0023-W6R/evidence/LAYOUT-COMP-VCINPUT-002`.

## Root Cause Analysis
- `client-app/ui-kit/components/atoms/input-details/vc-input-details.vue` @2.59.0 :78 `flex mt-1 gap-2 min-h-3` (16 px) and :88-89 `--hide-empty { empty:hidden }`, applied when `!showEmpty`.
- `molecules/input/vc-input.vue` :91-101 forwards `showEmptyDetails` (:130, default false).
- `client-app/shared/account/components/sign-in-form.vue` :34-60 — both `VcInput` set `:message`/`:error`, not `show-empty-details`. `client-app/pages/sign-up.vue` — 6 `VcInput`, none with it.
- Detail: `<pkg>/root-cause.md` §3–§5. Not a regression (048b measured the push earlier; long-standing).
- Related: VCST-6467 — VcDatePicker/VcDateInput expose no `showEmptyDetails` at all (also mentions `/account/profile`); its fix does not touch sign-in/sign-up.

## Need hotfixes
Set: the anchor is present in both latest stable bundles — v16 vc-frontend 2.59.0, v15 2.51.1 (also 2.51.2 and `dev`): `sign-in-form.vue` without `show-empty-details`.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend sign-in form + sign-up page (UI-kit `VcInput` consumers)
- **RCA anchor:** `client-app/shared/account/components/sign-in-form.vue:34-60` (+ `client-app/pages/sign-up.vue`) — add `show-empty-details` to each `VcInput`
- **Routing confidence:** HIGH
- **Auto-fix labels withheld:** reserving the row adds 16 px of resting space under every field of released pages — a design call with no human-sourced requirement (the kit's default-off is deliberate), so a Gate-0 by-design bail; consistent with VCST-6467.
