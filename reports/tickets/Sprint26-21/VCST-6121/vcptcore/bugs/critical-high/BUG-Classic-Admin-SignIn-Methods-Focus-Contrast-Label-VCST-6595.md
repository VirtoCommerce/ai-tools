# BUG: Classic admin Sign-in methods blade — Add/Edit/Delete icon links have no focus indicator and 2.44:1 contrast; passkey rename input has no label

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6121
**Severity:** High (accessibility — BL-A11Y-001 / BL-A11Y-002; WCAG 2.2 2.4.7, 1.3.1 / 4.1.2, 1.4.11) · **Tracker:** [VCST-6595](https://virtocommerce.atlassian.net/browse/VCST-6595) (labels `found-by-agent`, `found-in-testing`; auto-fix labels withheld — two repos) · **Relates:** VCST-6121 (does not fail the story)

## Env
- **Stand:** `vcptcore` — classic admin `{BACK_URL}#!/workspace/userProfile` → **Sign-in methods** blade; Edge 1920×1080, virtual authenticator
- **Versions (package `BUILD_VERSIONS`, matched against `vc-deploy-dev@vcptcore-qa` 2026-10-28):** Platform `3.1091.0-pr-3144-e637` · VirtoCommerce.Passkeys `3.1000.0-pr-1-a25f` · AdminShell `3.1002.0-pr-4-1dd1` (not involved) · Theme `2.61.0-pr-2601-8058-80583415` (not involved)
- **Repro rate:** 2/2 — deterministic markup/CSS
- **Not in package, by env:** no trace id (client-side defect, no server request); no HAR for this run (edge lane writes its HAR only when the context closes) — `network/requests.json` carries the requests

## Summary
A keyboard user on the Sign-in methods blade cannot see which icon (Add / Edit / Delete) has focus: all three are `:focus-visible` with `outline: none` and `box-shadow: none`. The icons are #43b0e6 on white = **2.44:1** (< 3:1). The rename field opened by Edit (`#signInKeyName`) has **no accessible name**. Why: the classic admin resets `outline` to 0 for every element and the new icon-only links add no focus style; the passkey key template renders the `<input>` with no label.

## Steps to reproduce
1. `TEST_ENV=vcptcore npm run seed:passkey -- --only PK_BO_MANAGER_2` (`@td(PK_BO_MANAGER_2)`, back-office Manager).
2. Edge 1920×1080 with a virtual authenticator → `{BACK_URL}#!/login` → sign in → user menu → **Manage profile** → **Sign-in methods** widget → blade.
3. In **Passkeys** click **+** → one key "Unnamed key · Device only".
4. Click the "Passkeys" label, then **Tab** → Add, **Tab** → Edit, **Tab** → Delete.
5. **Shift+Tab** to Edit, **Enter** → `#signInKeyName` gets focus; **Escape** closes it.

## Actual
- Step 4: no visible change on any focused icon — focused Edit and focused Delete captures are pixel-identical (`01` = `02`, same MD5).
- Icon colour `rgb(67,176,230)` #43b0e6 on #fff = 2.44:1.
- Step 5: accessibility tree shows `textbox [active]` with **no name**; axe `label` on `#signInKeyName` (4v design run).
- Icon links carry a `title`-only name (Add/Edit/Delete/Save/Cancel), identical for every key — no key name.

![Edit icon focused — no indicator](../screenshots/Classic-Admin-SignIn-Methods-Focus-Contrast-Label/01-FAIL-edit-icon-keyboard-focus.png)
![Rename input — no label](../screenshots/Classic-Admin-SignIn-Methods-Focus-Contrast-Label/03-FAIL-rename-input-no-label.png)

## Expected
- Every focusable control shows a visible focus indicator (BL-A11Y-001, WCAG 2.4.7).
- Icon controls meet ≥ 3:1 non-text contrast (WCAG 1.4.11).
- The rename input has a programmatic label (BL-A11Y-002, WCAG 1.3.1 / 4.1.2); icon links name the key they act on.
- Product's own reference: the Admin Shell version of the same blade names its controls ("Rename: <key>") and passes axe.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A — not probed by the investigation | — |
| 2. Backend Admin (classic AngularJS) | **FAIL** | `<package>/screenshots/01–03`, `dom-rename-open.txt`, `source/findings.md` §Measured |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 2 — classic admin UI (client-side markup/CSS; no request involved).

## Root Cause Analysis
`<package>` = `reports/tickets/Sprint26-21/VCST-6121/vcptcore/evidence-20261028T1510Z-ng-signin-methods-focus-label/`
- `root-cause.md` §3 claims 1–6, §4, §5; source table `source/findings.md` S1–S5.
- S1 `vc-platform` `wwwroot/css/platform.css` — `*{margin:0;outline:0;padding:0}`; nothing restores focus for these links (pre-existing, platform-wide).
- S2 `vc-platform` `wwwroot/js/app/userProfile/blades/sign-in-methods-list.html` L9, L13 — Add/Delete icon-only, `title` only.
- S3–S5 `vc-module-passkeys` `Scripts/templates/passkey-sign-in-key.html` L6 (Edit), **L10 `#signInKeyName` no label**, L12–13 (Save/Cancel).
- Ruled out (§5): by-design/config-gated, env data drift, flaky. Pre-existing reset is acknowledged; the controls are new in this ticket's PRs (vc-platform #3144, vc-module-passkeys #1), so the failure on this blade is in scope.

## Regression
N/A — new blade/template. Not in stable bundles v15 (Platform 3.1039.15) or v16 (3.1076.9): `userProfile/blades/` there holds no `sign-in-methods-list.*`, and neither bundle ships VirtoCommerce.Passkeys.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin (classic AngularJS admin)
- **Suggested repo:** TWO, as the package states — `VirtoCommerce/vc-platform` (scoped `:focus-visible` style for the blade's icon links + icon colour ≥ 3:1 + key-specific `aria-label` on Add/Delete) and `VirtoCommerce/vc-module-passkeys` (Edit/Save/Cancel names with the key name + label / `aria-label` on `#signInKeyName`)
- **repoKind:** platform (primary) + module
- **Ownership hint:** platform
- **Component / module:** vc-platform userProfile Sign-in methods blade; vc-module-passkeys key template
- **RCA anchor:** `src/VirtoCommerce.Platform.Web/wwwroot/js/app/userProfile/blades/sign-in-methods-list.html:9,13` + `wwwroot/css/platform.css` `*{outline:0}`; `src/VirtoCommerce.Passkeys.Web/Scripts/templates/passkey-sign-in-key.html:6,10,12-13`
- **Routing confidence:** HIGH on the root cause (package §7); spans two repos — the `/qa-fix` single-repo rule ⇒ two fixes (or one ticket, two PRs)
