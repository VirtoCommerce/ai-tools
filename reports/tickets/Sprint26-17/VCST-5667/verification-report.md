# VCST-5667 — Fix Verification

**Ticket:** VCST-5667 · Bug · Medium · `[vc-shell] Password fields outside the login page have no autocomplete tokens`
**Fix task:** VM-1748 (Done) · **Fix:** vc-shell PR [#296](https://github.com/VirtoCommerce/vc-shell/pull/296) (`229f46832`), merged 2026-08-13
**Verdict: VERIFIED WITH NOTES** — 2026-08-25

## Env

**`@vc-shell/framework`** / Marketplace Vendor Portal (separate product — not the storefront, not the Platform Admin
SPA). Affected 2.4.0, fixed **2.5.0**. Verified against `main @ 324cd9b09` (= v2.5.0) and live on the **deployed**
`vcmp-dev.govirto.com/apps/vendor-portal/` (bundle build id `22260`, framework 2.5.0 confirmed independently).

## Summary

All password fields outside the login page now carry correct `autocomplete` tokens, on the native `<input>` and not
stranded on the `.vc-input` wrapper — confirmed on **all five surfaces** of the deployed artifact, including the
authenticated one the fix author could not reach. Two of the three ACs are met. The third — the password-manager
*behaviour* AC — **could not be exercised** in this toolkit and is reported unverified, not passed.

## RED → GREEN (unit)

Scope: `shell/auth` + `shell/components/change-password`, run from `framework/` (the CI cwd).

| Phase | Source | Result |
|---|---|---|
| **GREEN** | `main @ 324cd9b09` | **83 passed (83)** across 10 files, 3 consecutive runs |
| **RED** | the four `.vue` files reverted to the parent of `229f46832`; the four `.test.ts` files PR #296 added left unchanged | **4 failed / 79 passed (83)** |

One failure per affected file, each reading `expected [ undefined, undefined, undefined ] to deeply equal
[ 'current-password', … ]` — matching the author's own description ("`undefined` in place of every token").
Evidence: `evidence/green-fixed.txt`, `evidence/red-prefix.txt`.

## Completeness — re-run independently, not taken on trust

The author's claim was that `grep -rl 'type="password"' framework --include='*.vue'` returns exactly 5 files and all
5 now carry tokens. Re-run against current `origin/main`: **confirmed**, same 5 files, per-file `autocomplete` counts
matching their table exactly (3 / 3 / 2 / 3, plus 2 in `Login.vue` from PR #280). No password field anywhere in
`framework/` is untokenized.

**The author caught a file the ticket missed.** The ticket's list came from a grep of `framework/shell/auth/` and so
omitted `framework/shell/components/change-password/change-password.vue` — the user-menu form, which is *the path
users actually take* (the auth-page version only serves a forced change at sign-in). Three more untagged password
fields. Without that catch the ticket would have shipped half-fixed.

**Token values, not just presence** — a wrong token is worse than a missing one. All **11 fields** correctly paired:
`current` → `current-password`; every new/confirm field → `new-password`; Invite's prefilled email → `username`.

## Live verification — the deployed artifact

Every value below was read with `getAttribute('autocomplete')` on the **native `<input>`** *and* separately on the
`closest('.vc-input')` wrapper — the exact discrimination the stubbed page tests cannot make.

**Check 1 — authenticated user-menu Change password: PASS.** Reached by real interaction (login → user menu →
Change password). It renders as a **popup** (`.vc-popup`), not a blade.

| type | name | on native `<input>` | wrapper `.vc-input` |
|---|---|---|---|
| password | `current` | `current-password` | `null` |
| password | `new_pass` | `new-password` | `null` |
| password | `confirm_pass` | `new-password` | `null` |

Stranding scan `.vc-input[autocomplete]`: **0**. Broader scan for `[autocomplete]` on any non-field element: **0**.
All three fields sit inside a real `<form>` — the precondition for password-manager recognition.
No password change was submitted: `Update` stayed disabled and the popup was exited via **Cancel**, with the
post-cancel state re-read (0 password fields, 0 forms).

**Check 2 — the three auth pages + login, on the deployed build: PASS.** 10 fields across
`#/changepassword`, `#/resetpassword`, `#/invite` and `#/login`; every token on the native `<input>`, every wrapper
`null`, stranding scan **0 on each of the four pages**. ResetPassword and Invite render **disabled** fields with the
invalid test tokens (matching the author's local observation) — disabled state does not affect where the attribute
lands.

**Independent bundle corroboration.** A `curl` of the live `vc-shell-framework22260.js` found
`autocomplete:"current-password"` ×2, `"new-password"` ×6, `"username"` ×2, alongside the version constant `2.5.0`.
(The one `autocomplete:"off"` is the framework-wide default for generic inputs, unrelated.) The counts being 2/6
rather than 3/8 implies the auth ChangePassword page and the user-menu popup compile to a **shared component**; the
per-surface live DOM read is authoritative either way and confirmed all five surfaces individually.

Screenshots (all verified on disk): `screenshots/check1-authenticated-change-password-blade.png`,
`check2-auth-changepassword.png`, `check2-auth-resetpassword.png`, `check2-auth-invite.png`,
`check3-newpassword-field-focused.png`.

## Acceptance criteria

| AC | Verdict | Basis |
|---|---|---|
| Every password field on the three pages carries the correct token | **PASS** | 11 fields at source + all 5 surfaces live on the deployed artifact, wrapper-stranding ruled out (0 everywhere) |
| A password manager offers to generate/save a new password, and does not prefill the new-password field with the current one | **NOT VERIFIED** | See Note 1 — mechanism confirmed, browser behaviour unexercisable here |
| Unit or story coverage mirroring the `vc-input` test from PR #280 (attribute lands on the `<input>`, not the wrapper) | **PASS — by composition** | See Note 2 |

## Notes

**1. The password-manager AC could not be exercised — reported unverified, not passed.** What *is* confirmed: the
`new-password` token is on the native `<input>` on every new-password field, inside a `<form>`, on a secure context,
in the deployed artifact. What is not: Chromium/Edge renders the "Suggest strong password" affordance as **browser
chrome outside the page**, so it appears in neither an accessibility snapshot nor a page screenshot. And the Playwright
MCP context is `isolated: true` — an ephemeral profile with no saved credentials — so with nothing saved there is no
autofill to trigger and **the negative half of the AC ("does not prefill the current password into the new-password
field") cannot be falsified**. A reading of `value.length === 0` after focusing the field is a vacuous pass, not
evidence, and is not being counted as one. Closing this properly needs a persistent browser profile with a saved
vcmp-dev credential, driven by hand.

**2. AC3 is satisfied by composition, and that is the right design.** The four page tests stub `VcInput` as a bare
`<input data-stub="VcInput" />`, where attributes fall through automatically — so those tests pass whether the token
is correctly prop-bound *or* stranded on the wrapper `div` that `inheritAttrs: false` would send it to. Taken alone
they pin token **values and order**, not delivery. But the mechanism is guarded one level down, on the **real**
component: `vc-input.test.ts:121-128` — *"sets autocomplete on the native input, not on the root wrapper"* — mounts
the unstubbed `VcInput` and asserts both halves, including that `.vc-input` does **not** carry the attribute. Test the
mechanism once where it lives, the values at each call site: AC3's intent is met. The live DOM read across all five
surfaces confirms it empirically as well.

## Incidental findings — nothing filed

1. **Both login inputs carry `name="Field"`** (a duplicate, meaningless `name`), as does the nav search box.
   Pre-existing, unrelated to this fix, and `autocomplete` is the authoritative signal for password managers so the
   AC is unaffected — but a distinct `name` would be strictly better.
2. **The browser lane is not exclusively ours.** The console buffer on the authenticated session held entries
   timestamped ~1 h before the run, referencing authenticated screens the agent never visited. The first sign-in also
   failed with `Authentication error: The session has expired…` and cleared the password field; a reload + retry
   authenticated fine — consistent with stale cookies from that earlier session. Worth knowing before trusting a
   console-derived finding on this lane.
3. Pre-existing environment 500s, unrelated and with no password/autocomplete involvement:
   `/api/vcmp/security/seller/users/search`, `/api/vcmp/seller/offers`, `/api/vcmp/message/unreadcount`,
   `/api/vcmp/conversation/search`; repeating `401` on `/pushNotificationHub/negotiate`; 404s on catalog images and
   `logo.svg`.

## Tooling note

`hooks/enforce-real-user.mjs` blocked the first **read-only** `browser_evaluate`, so every DOM read went through the
documented `/* @allow-eval: <reason> */` opt-in. That opt-in is scoped to "UI-FIX / DEBUG DOM experiment, NOT for
test runs", so leaning on it for routine read-only measurement is a stretch. The hook's allowlist already permits
`getBoundingClientRect` / `getComputedStyle`; adding read-only attribute reads (e.g. `getAttribute('autocomplete')`)
would make this class of verification first-class instead. Same shape as the previously-noted `page.route`
fault-injection gap.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the 123 regression
suites cover the storefront only — none cover vc-shell or the Vendor Portal. Substituted: the framework's own vitest
suites, live DOM attribute measurement on the deployed artifact, and a bundle-level marker check.

**Data changes: none.** No password submitted, no entity created or modified; the Change-password popup was cancelled
and its closed state re-read.
