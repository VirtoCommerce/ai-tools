# BUG: Sign-in page shows "Login attempt failed" on load when the device holds a passkey whose key was deleted `[Medium]`

## Status: CLOSED
**Resolution:** not a bug — cancelled 2026-10-29. On a real device the page-load (conditional) request completes only after the user picks the passkey from the autofill list, so "Login attempt failed" for a stale key is correct feedback; the "user did nothing" premise came from the virtual authenticator answering on its own.
**Found by:** agent — testing VCST-6121
**Tracker:** [VCST-6631](https://virtocommerce.atlassian.net/browse/VCST-6631) · Relates VCST-6121, VCST-6598, VCST-6630
**Severity:** Medium (a visible false error on a public page for real users whose key was removed on another device; no data impact)

Env: vcst (vcst-qa-storefront / vcst-qa) @ Platform 3.1091.0-pr-3144-9e58 · VirtoCommerce.Passkeys 3.1000.0-pr-1-a25f (a25fea0) · XFrontend 3.1008.0-alpha.64-vcst-6121-passkeys · Theme 2.61.0 (matches `vc-deploy-dev@vcst-qa`). Edge (Playwright) + WebAuthn virtual authenticator.

## Summary
With a passkey still on the device but its key deleted on the server, opening `/sign-in` and doing nothing shows a red "Login attempt failed. Check your credentials" alert, a 5-second error toast and a console 400. The page-load autofill request (WebAuthn conditional mediation) is answered by the stale credential; the grant correctly refuses it, but the storefront passkey app reports that background failure as a user-initiated sign-in error.

## Steps to reproduce
1. Sign in as any buyer, open **Account → Security** (`/account/security`).
2. **Add passkey**, complete the browser prompt (Chromium; a virtual authenticator works).
3. **Delete** that passkey on the same page. The authenticator still holds the credential (`WebAuthn.getCredentials` = 1).
4. Sign out.
5. Open `/sign-in` and do nothing.

## Expected
- A failed autofill (`mediation: "conditional"`) request on page load is silent: no alert, no toast, no console error. Ideally the 400 is not surfaced at all.
- The `passkey` grant refusing a deleted key stays as is.
- Source: generic UX expectation (`PKS-015` (b), `{HYPOTHESIS}`). VirtoOZ has no passkey docs (new feature; queried StorefrontUserGuide 2026-10-29, sign-in pages only); VCST-6121 AC are silent. **Author question N1 is open** — so "not by design" rests on no doc, not on a doc that says otherwise.

## Actual
- `POST /connect/token` `grant_type=passkey` → **400** `{error: invalid_grant, code: login_failed, errors[0]: "Login attempt failed. Please check your credentials."}`
- Inline red alert: **Login attempt failed. Check your credentials**; a 5 s toast (from source — gone by capture time).
- Console: `Failed to load resource: the server responded with a status of 400 () /connect/token`.
- Form stays usable; password sign-in still works.

![Sign-in page on load](../screenshots/Passkey-Stale-Credential-Autofill-Error-On-Sign-In/BUG-passkey-stale-credential-sign-in-load.png)

**Reproduction:** reproduced twice on vcst in this session (triangulation 2026-10-29 ~18:2x, lane `playwright-edge`) — that run is Step 1's evidence; no re-run (it needs a full passkey ceremony on a Chromium lane).

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | FAIL | alert + toast + console 400 on an idle page load; screenshot above |
| 2. Admin | N/A | not admin-visible |
| 3. xAPI | N/A | sign-in goes through `/connect/token`, not GraphQL |
| 4. REST `/connect/token` | PASS | 400 `invalid_grant` for a deleted key is correct |

**Owning layer:** Layer 1 — the storefront passkey app shipped inside `vc-module-passkeys` (`StorefrontApp`).

## Root Cause Analysis
- `src/VirtoCommerce.Passkeys.Web/StorefrontApp/src/composables/usePasskeySignIn.ts:62-76` (at a25fea0; same on main): the `catch` returns silently only for `isPasskeyPromptCancelled(e)` or an aborted signal; anything else calls `Logger.error`, analytics and `notifications.error({ duration: 5000, single: true })`. No branch exempts `mediation === "conditional"`.
- `src/VirtoCommerce.Passkeys.Web/StorefrontApp/src/components/passkey-provider.vue:31` (`onMounted(startAutofillSignIn)`) and `:44` (the conditional call goes through the same `signIn`).
- Confirmed with `search_code` (`repo:VirtoCommerce/vc-module-passkeys isPasskeyPromptCancelled`, `startAutofillSignIn`).
- kb: KB-CD356AF4 (suspected defect, now reproduced on vcst_qa).

**Need hotfixes:** not set — VirtoCommerce.Passkeys is in neither stable bundle v15 nor v16 (new, unreleased).

**Regression case:** `PKS-015` assertion (b), `regression/suites/Frontend/auth/114-auth-passkey-sign-in.csv` (not edited).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront (the module's embedded `StorefrontApp`)
- **Suggested repo:** VirtoCommerce/vc-module-passkeys
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** VirtoCommerce.Passkeys — StorefrontApp `usePasskeySignIn`
- **RCA anchor:** `src/VirtoCommerce.Passkeys.Web/StorefrontApp/src/composables/usePasskeySignIn.ts:62-76` (`catch` without a `mediation === "conditional"` branch)
- **Routing confidence:** HIGH
