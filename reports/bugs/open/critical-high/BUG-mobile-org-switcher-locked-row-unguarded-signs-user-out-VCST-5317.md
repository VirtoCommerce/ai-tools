# BUG — Organization switcher in the mobile: a blocked organization lacks the icon indicating an inactive state

## Status: CONFIRMED

**Severity:** Critical · **Priority:** High · **Found:** 2026-09-09 · **Ticket:** VCST-5317 (in-scope)
**Env:** vcst-qa — `FRONT_URL=https://vcst-qa-storefront.govirto.com`, `BACK_URL=https://vcst-qa.govirto.com`
**Found by:** `/qa-test VCST-5317` Step 3x discovery lane (Round 2), reproduced twice.

## Summary

PR #2469 adds the locked-organization treatment (disabled row, padlock, tooltip, click guard) to the **desktop** org switcher only. The **mobile** switcher is a different component and was not changed, so on a phone a locked organization renders as an ordinary, full-contrast, tappable row. Tapping it fires an organization switch that the server correctly refuses — and the storefront then signs the user out entirely, including out of the organization they were legitimately working in. No message is shown.

## Steps to reproduce

1. Ensure a multi-org buyer has one **locked** membership and one active one (fixture: `MULTI_ORG_TF_BR_ALT`; TechFlow locked, BuildRight active — `npm run seed:membership-lock -- --lane frontend --state V2`).
2. Sign in to the storefront as that user at a **375 × 812** viewport.
3. Open the hamburger menu → **Corporate** → **My organizations**.
4. Observe the locked organization's row.
5. Tap it.

**Actual:** the locked row is **enabled, full-contrast, with no padlock and no lock indicator**, and is tappable. Tapping POSTs `/connect/token` with `organization_id=<locked org id>`; the server returns `400`. The app performs a hard redirect to `/sign-in?returnUrl=/account/dashboard` — the user is signed out of the whole storefront. No error message is rendered.

**Expected:** the locked row is presented the same way it is on desktop — non-selectable, visually flagged, with the reason available — and activating it does not switch, does not sign the user out, and leaves the active organization unchanged.

## Desktop control — same account, same lock state, same minute

| | Desktop 1920 (`top-header-organizations.vue`, patched by #2469) | Mobile 375 (`multi-organisation-menu.vue`, untouched) |
|---|---|---|
| Locked row | `option … [disabled]`, greyed, padlock rendered | `radio …` enabled, full-contrast, **no padlock** |
| Tappable | no | **yes** |
| Result of activating | no-op, active org unchanged | `/connect/token` → `400` → **full sign-out** |

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `R2-M1-02-mobile-375-V2-locked-row-not-flagged.png`, `R2-M1-03-mobile-375-after-tap-signed-out.png`; HAR `test-results/chrome/har/session.har` |
| 2. Backend Admin | N/A | not an admin-visible surface |
| 3. GraphQL xAPI | **PASS** | `me.contact.organizations` returns the locked org correctly flagged `isLockedForCurrentUser: true` — the data the client needs is present and correct |
| 4. Platform REST API | **PASS** | `POST /connect/token` returns `400`, `error: invalid_grant`, **exactly one** `errors[]` entry, `code: user_is_locked_in_organization`, description *"Your access to organization '96f109a7…' has been blocked. Please contact your organization administrator."* — exactly per `BL-AUTH-013` |

**Owning layer:** Layer 1 — Storefront Frontend. The server is correct on every axis; the client discards a well-formed, user-ready refusal.

## Root cause analysis

`client-app/shared/layout/components/header/_internal/mobile-menu/menus/multi-organisation-menu.vue` is absent from PR #2469's changed files while reading the same `organizationFields` fragment that now carries `isLockedForCurrentUser`. Two distinct defects in that one component:

1. **No lock affordance and no guard (lines 25–36, 66–76).** The row is rendered by a plain `v-for` `VcRadioButton` with `:value="item.id"` and `@change="selectOrganization"` — no `:disabled`, no lock icon, no `title`. `selectOrganization()`'s only guard is `if (!contactOrganizationId.value) return;`, then it calls `trySwitch()` unconditionally. The desktop component has all four (`:disabled="item.isLockedForCurrentUser"`, the `lock-closed` `#append` icon, the tooltip `title`, and an early `return` when the target is locked).
2. **The component's own error path is unreachable.** It already renders a `switchError` `VcAlert` (lines 3–12) and reverts the selection on `!succeeded` (lines 73–75). Neither fires, because the session teardown happens before either can render. So even the designed failure handling is dead on this path — fixing only the guard would leave that latent.

Note for the fix: the desktop guard looks the target up in `organizations.value` while rendering from `displayedOrganizations`. Mobile renders from `organizationsWithoutCurrent`, so the guard should read `item.isLockedForCurrentUser` on the row itself rather than repeating the desktop lookup.

## Module versions

Platform `3.1064.0` · `ProfileExperienceApiModule 3.1018.0-pr-145-4fe6` · `Customer 3.1024.0-pr-316-1ac3` · storefront `Ver. 2.58.0-pr-2469-83d6-83d6e5d5`. Deployed = declared (authenticated `/api/platform/modules`). Both PRs **OPEN / unmerged**, PR-deployed to vcst-qa only — so this is catchable before merge.

## Impact

A multi-organization buyer on a phone loses their entire session by tapping a control that gives no indication it is unavailable. They are ejected from the organization they *can* use, not merely refused the one they cannot. **Mitigating:** the cart is server-side and survives — re-authenticating restores it at the same subtotal, so the loss is the session and the user's place, not the basket.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** mobile org switcher — `multi-organisation-menu.vue`
- **RCA anchor:** `client-app/shared/layout/components/header/_internal/mobile-menu/menus/multi-organisation-menu.vue:25-36` (render, no `:disabled`/icon/title) and `:66-76` (`selectOrganization`, no lock guard; `switchError`/revert unreachable)
- **Routing confidence:** HIGH
- **Branch note:** PR **#2469** (`feat/VCST-5317`) is already open for this ticket and is the PR that added the desktop treatment. The mobile guard most likely belongs on that branch rather than a new one — a routing call for the operator at `/qa-fix` time.

## Evidence

- `reports/tickets/Sprint26-18/VCST-5317/screenshots/R2-M1-01-viewport-check.png` — the 375×812 viewport, verified from the PNG header
- `reports/tickets/Sprint26-18/VCST-5317/screenshots/R2-M1-02-mobile-375-V2-locked-row-not-flagged.png`
- `reports/tickets/Sprint26-18/VCST-5317/screenshots/R2-M1-03-mobile-375-after-tap-signed-out.png`
- `reports/tickets/Sprint26-18/VCST-5317/screenshots/R2-M4-01-desktop-V2-locked-row-disabled-padlock.png` — the desktop control
- Session report: `reports/exploratory/SBTM-VCST-5317-R2-2026-09-09.md` §M1
- Regression carrier authored by the same run: `B2C-ORG-066` (Critical, `Draft` — asserts the correct expectation, so it fails until this is fixed)

## Not claimed

- Whether the same gap affects other mobile-only surfaces was **not** swept — only the org switcher was examined.
- The `375px unreachable` note in the earlier design report is **lane-specific to Chrome DevTools MCP**; `playwright-chrome` reaches 375 px. This report's measurements are all at a genuine 375 × 812.
