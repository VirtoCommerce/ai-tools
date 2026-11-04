# BUG: Storefront Security page — every passkey's buttons are named only "Edit" and "Delete", so screen-reader users cannot tell the keys apart

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6121
**Severity:** Medium (accessibility — BL-A11Y-002; WCAG 2.2 2.4.6, 4.1.2) · **Tracker:** [VCST-6599](https://virtocommerce.atlassian.net/browse/VCST-6599) (labels `found-by-agent`, `found-in-testing`, `vc-fix`, `qa-autofix`) · **Relates:** VCST-6121 (does not fail the story), VCST-6595 (same class on the classic admin blade, other repo)

## Env
- **Stand:** `vcptcore` — storefront `{FRONT_URL}/account/security` → **Passkeys**; Edge 1920×1080 with WebAuthn virtual authenticators
- **Versions (package `BUILD_VERSIONS`, matched against `vc-deploy-dev@vcptcore-qa` 2026-10-28):** Theme `2.61.0-pr-2601-8058-80583415` (owning repo) · Platform `3.1091.0-pr-3144-e637` · VirtoCommerce.Passkeys `3.1000.0-pr-1-a25f` · XFrontend `3.1008.0-alpha.64-vcst-6121-passkeys` · ProfileExperienceApiModule `3.1022.0-pr-150-afd6` · Store `3.1012.0-pr-190-ded5` · Customer `3.1032.0-pr-324-b30b`
- **Repro rate:** 3/3 — deterministic (1, 2, 3 keys; before and after a rename)
- **Not in package, by env:** no trace id (storefront-only rendering defect); no HAR for this run (the edge lane writes its HAR only when the context closes) — `network/requests.txt` carries the requests (all 200)

## Summary
On `/account/security` every passkey row's icon buttons are announced as just "Edit" and "Delete", so with two or more keys an assistive-technology user cannot tell which key each button renames or deletes. Why: `security.vue` gives both `VcButton`s the generic `common.buttons.edit` / `common.buttons.delete` string as `aria-label` instead of a label that includes the key's name.

## Steps to reproduce
1. `TEST_ENV=vcptcore npm run seed:passkey -- --only PK_LOCKOUT` (no passkeys). Account `@td(PK_LOCKOUT)` — B2B buyer on `{{STORE_ID}}`.
2. Edge (playwright-edge), virtual authenticator A (CTAP2, internal, resident key, UV). `{FRONT_URL}/sign-in` → email + password → `/account/security` → **Add passkey** → row 1 "Unnamed key · Device only".
3. Replace the authenticator with a second one (B) → **Add passkey** → row 2 "Unnamed key · Device only".
4. Read the accessibility tree of the "Passkeys" region: row 1 `button "Edit"`, `button "Delete"`; row 2 `button "Edit"`, `button "Delete"`.
5. Row 2 **Edit** → "Rename key" → Name "AGENT-TEST work laptop" → **Save**.
6. Read the tree again: still `button "Edit"` / `button "Delete"` on both rows.
7. Side signal: row 2's button resolves only as `getByRole('button', { name: 'Edit' }).nth(1)`.

## Actual
- Four buttons, two names: `Edit`, `Delete`, `Edit`, `Delete` — identical per row, unchanged after the rename.
- The distinct key names ("Unnamed key", "AGENT-TEST work laptop") sit next to the buttons in the same tree, but no button name contains them.
- 0 console errors; every request 200.

![Two passkey rows with identical Edit/Delete icon buttons](../screenshots/Security-Page-Passkey-Buttons-Not-Named-Per-Key/01-FAIL-two-keys-identical-button-names.png)

## Expected
- Each row's buttons carry a contextual accessible name naming the key, e.g. "Rename AGENT-TEST work laptop" / "Delete AGENT-TEST work laptop" (BL-A11Y-002: distinct from a generic element-type label; WCAG 4.1.2, 2.4.6).
- Two keys sharing the "Unnamed key" fallback still get distinct names (e.g. add the created date the row shows).
- Product reference: the Admin Shell passkey blade already names its buttons per key ("Rename: Unnamed key").

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `<package>/screenshots/01-FAIL-two-keys-identical-button-names.png`, `dom-passkey-list-2-keys.txt`, `dom-passkey-list-2-keys-renamed.txt`, `console/console.txt` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — storefront (Vue page template; the key data reaches the page, only the button labelling ignores it).

## Root Cause Analysis
`<package>` = `reports/tickets/Sprint26-21/VCST-6121/vcptcore/evidence-20261028T1616Z-security-key-buttons-names/`
- `root-cause.md` §3 claims 1–4, §4, §5; `source/findings.md` S1–S2.
- S1 vc-frontend @ `80583415` `client-app/pages/account/security.vue` L36 renders the key name; L44–52 Edit `:aria-label="$t('common.buttons.edit')"`; L54–62 Delete `:aria-label="$t('common.buttons.delete')"`.
- S2 `client-app/ui-kit/components/molecules/button/vc-button.vue` L10 `:aria-label="ariaLabel || title"` — the page string becomes the accessible name as given.
- Ruled out (§5): by-design / config-gated (hard-coded label, BL-A11Y-002), env data drift (renamed key — unchanged), flaky (static, 3/3), version skew (source read at the deployed commit).

## Regression
N/A — new page (vc-frontend PR #2601). Not in stable bundles v15 (vc-frontend `2.51.1`) or v16 (`2.59.0`): neither tag has `client-app/pages/account/security.vue` ⇒ Need hotfixes not set.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend account Security page (`/account/security`, Passkeys list)
- **RCA anchor:** `client-app/pages/account/security.vue:44-62` — `:aria-label="$t('common.buttons.edit')"` / `$t('common.buttons.delete')`; fix: key-aware i18n labels (e.g. `pages.account.security.rename_key_aria` / `delete_key_aria` with `{ name: key.name || $t("pages.account.security.unnamed_key") }`, plus a disambiguator for duplicate fallback names) + a vitest asserting distinct names for two keys
- **Routing confidence:** HIGH (package §7 — DOM-vs-data proven + the template line)
