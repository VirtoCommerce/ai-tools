# BUG: Storefront Security page — keyboard focus drops to the page body after adding a passkey and after deleting one

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6121

**Severity:** Medium (accessibility — BL-A11Y-001, WCAG 2.2 AA 2.4.3 Focus Order) · **Priority:** Medium
**Tracker:** [VCST-6600](https://virtocommerce.atlassian.net/browse/VCST-6600) · **Relates to:** VCST-6121 (does not fail the story)

## Env
- **Stand:** `vcptcore` — `{FRONT_URL}/account/security`, store `{{STORE_ID}}` (B2B-store); Edge (playwright-edge) 1920×1080 + WebAuthn virtual authenticator (CTAP2, internal, resident key, UV)
- **Versions (package = deployed, `vc-deploy-dev@vcptcore-qa` `theme/artifact.json`):** **Theme `2.61.0-pr-2601-8058-80583415`** (owning repo) · Platform `3.1091.0-pr-3144-e637` · VirtoCommerce.Passkeys `3.1000.0-pr-1-a25f` · XFrontend `3.1008.0-alpha.64-vcst-6121-passkeys` · ProfileExperienceApiModule `3.1022.0-pr-150-afd6` · Store `3.1012.0-pr-190-ded5` · Customer `3.1032.0-pr-324-b30b`
- **Repro rate:** 4/4 (deterministic) — design lane 4v, a mouse-driven Add, and this package's keyboard Add and keyboard Delete → OK
- **HAR:** none for this run — the edge lane writes its HAR only when its context closes and the context stayed open; `network/requests.txt` carries the requests (all 2xx)
- **Trace / App Insights:** N/A — client-side focus management, no server layer (root-cause §2)
- **Evidence package:** `reports/tickets/Sprint26-21/VCST-6121/vcptcore/evidence-20261028T1620Z-security-focus-lost/` (`<pkg>` below)

## Summary
On `/account/security`, focus lands on `document.body` after **Add passkey** finishes and again after **Delete → OK**.
**After the add** the next Tab still reaches the new row (Chromium keeps its sequential-navigation start point), so a
keyboard user recovers, but a screen-reader user hears nothing after Enter. **After the delete** the keyboard position is
lost: the next Tab goes to the footer's first link, past the whole Passkeys widget. Why: the button is put into
`loading` (which renders it `disabled`) during the ceremony and nothing re-focuses it afterwards. The Delete dialog
closes only after the row holding its trigger has been removed, so Headless UI has no opener to return focus to.

## Steps to reproduce
1. Re-arm the account: `TEST_ENV=vcptcore npm run seed:passkey -- --only PK_LOCKOUT` (no passkeys). Account `@td(PK_LOCKOUT)` — B2B buyer on `{{STORE_ID}}`.
2. Edge, WebAuthn virtual authenticator. `{FRONT_URL}/sign-in` → email + password → `/account/security` ("You have no passkeys yet.").
3. Click the "Passkeys" widget title text, press **Tab** → focus on **Add passkey**.
4. Press **Enter** → row "Unnamed key · Device only" renders. `document.activeElement` = **BODY**, no outline.
5. Press **Tab** → **Edit** of the new row (recoverable; nothing was announced since Enter).
6. **Tab** → **Delete**, **Enter** → "Delete key" dialog opens with focus on **Cancel** (correct). **Tab** → **OK**, **Enter**.
7. The dialog closes, list shows "You have no passkeys yet." `document.activeElement` = **BODY**, no dialog open.
8. Press **Tab** → `link "Orders"` in the **footer** "Account Details".

## Actual
- After Add: `activeElement BODY, isBody true, outline none` — `<pkg>/network/01-activeElement-after-add.json`; DOM: only the root `[active]`, key row present — `<pkg>/screenshots/dom-after-add-passkey.txt`
- After Delete → OK: `activeElement BODY, isBody true, dialogOpen false` — `<pkg>/network/02-activeElement-after-delete-ok.json`; next Tab → footer `link "Orders"`
- Screenshot (no focus ring anywhere after OK): `../screenshots/Storefront-Security-Focus-Lost-After-Passkey-Add-Delete/01-FAIL-no-focus-after-delete-ok.png`; dialog opens correctly on Cancel: `02-context-delete-dialog-focus-on-cancel.png`
- Every request 2xx (`<pkg>/network/requests.txt`); console 0 errors / 0 warnings (`<pkg>/console/console.txt`)

## Expected
- Focus order stays logical (BL-A11Y-001; WCAG 2.4.3): after **Add passkey**, focus stays on (or returns to) **Add passkey**, or moves to the new key row.
- After **Delete → OK**, the trigger row no longer exists, so focus goes to a logical successor (**Add passkey**, or the widget / empty-state text), never to BODY.
- The page's own Rename flow already returns focus to its trigger (`button "Edit" [active]` after Save).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `<pkg>/network/01-…`, `02-activeElement-…json`; `<pkg>/screenshots/01-FAIL-…png`, `dom-after-*.txt`; `<pkg>/console/console.txt` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | `network/requests.txt` (createPasskey / deleteSignInKey succeed) |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — storefront (Vue page `security.vue`)

## Root Cause Analysis
- Claims → evidence: `<pkg>/root-cause.md` §3 (rows 1–6), source `<pkg>/source/findings.md` S1–S3 (vc-frontend @ `80583415`)
- **Add:** `client-app/pages/account/security.vue` 15–23 — `VcButton :loading="toValue(extensionProps.creating)"`; `vc-button.vue` 8 `:disabled="!enabled"`, 151 `enabled = !props.disabled && !props.loading` → the focused button becomes disabled; `createKey` (111–114) = `await contribution.createKey?.(); await refetch();` with no focus restore.
- **Delete:** `security.vue` 149–163 — `onConfirm` runs `await deleteKey(...); closeDeleteModal();`; the row with the trigger is unmounted first; `vc-modal.vue` 3–17 (Headless UI `Dialog`) restores focus to that opener → BODY.
- Ruled out (`<pkg>/root-cause.md` §5): by-design (BL-A11Y-001 + the page's own Rename pattern); env data drift (re-armed account, expected rows); timing (read after the UI settled, 4/4); harness artefact (delete flow uses no WebAuthn and fails the same way); version skew (source read at the deployed commit).
- **Confidence:** HIGH.

## Regression
N/A — new page (vc-frontend PR #2601, merged to `dev` 2026-10-28). Not in stable bundles v15 (theme 2.51.1) / v16 (2.59.0): `client-app/pages/account/security.vue` does not exist at either tag.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend — account Security page (`client-app/pages/account/security.vue`)
- **RCA anchor:** `client-app/pages/account/security.vue:111-114` (`createKey`: after `refetch()` focus "Add passkey" via a template ref, or the new row) and `:149-163` (`openDeleteModal` `onConfirm`: after `closeDeleteModal()` focus "Add passkey" or the widget / empty state with `tabindex="-1"` on `nextTick`); vitest cases asserting `document.activeElement`. Not `vc-button.vue` — disabling while loading is shared ui-kit behaviour; the page owns where focus goes next.
- **Routing confidence:** HIGH
