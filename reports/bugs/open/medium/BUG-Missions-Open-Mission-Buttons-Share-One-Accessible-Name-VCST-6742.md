# Every mission card's "Open mission" button has the same accessible name — Medium

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-06-1424-W7C
**Tracker:** [VCST-6742](https://virtocommerce.atlassian.net/browse/VCST-6742) — Medium, labels vc-fix + qa-autofix, Need hotfixes set (v16)
**Case:** MSNF-046 (suite 083c) · Stable 16 W7 (VCST-6411 / VCST-6042)

**Env:** vcptcore_regression, store B2B-store · Platform 3.1076.8 · theme 2.59.0 (live footer) · VirtoCommerce.Loyalty 3.1009.0 · Chrome 1920x1080 · repro deterministic (the label is a constant in the source). No server-side part: every `/graphql` call returns 200, no `errors[]`; App Insights is not configured for this env (console log in the package instead).

## Summary
On `/account/missions`, each mission card ends with an icon-only arrow button. All 12 buttons on the page have the same accessible name, "Open mission" (in French, "Ouvrir la mission"). The mission name exists only in the sibling `h3`. A screen-reader user tabbing through the grid, or listing its buttons, hears "Open mission" twelve times and cannot tell which mission a button opens (WCAG 2.4.6, 4.1.2).

## Steps to reproduce
1. Chrome 1920x1080, store B2B-store. Sign in as a loyalty member (`@td(LOY_PERSONAL_NOORG.email)`).
2. Open `{{FRONT_URL}}/account/missions` and wait for the card grid (12 cards on page 1).
3. Read the accessibility tree of the grid.

## Actual
- 12 of 12 arrow buttons are `button "Open mission"`: one distinct name (`missions-grid-a11y-snapshot.yml`).
- ![grid](../../screenshots/Missions-Open-Mission-Buttons-Share-One-Accessible-Name/MSNF-046-grid-identical-open-mission.png)

## Expected
- Each button's accessible name identifies its mission, e.g. "Open mission AGENT-TEST-…-DUE-31". BL-A11Y-002 requires every control to expose a contextual name, not a generic label. `coupon-card.vue` in the same theme already does this. Docs (vc-docs `storefront/user-guide/docs/account/missions.md`) ask for no generic label.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | package `screenshots/MSNF-046-grid-identical-open-mission.png`, `missions-grid-a11y-snapshot.yml`, `console/missions-session-console.log` |
| 2. Backend Admin | N/A — not probed by the investigation | |
| 3. GraphQL xAPI | N/A — not probed by the investigation | |
| 4. Platform REST API | N/A — not probed by the investigation | |

**Owning layer:** Layer 1, storefront.

## Root Cause Analysis
`client-app/modules/loyalty/components/mission-card.vue` (2.59.0, L42–53) binds `:aria-label="$t('pages.account.missions.card.open_mission')"` with no mission parameter (package `source/mission-card.vue@2.59.0-L42-53.txt`). The file is unchanged on `dev` (2026-11-09), and no open vc-frontend PR covers it. Alternatives ruled out: by design (no doc asks for it) and data drift (the label is a constant). Full analysis: package `root-cause.md`.

Package: `reports/regression/REG-2026-11-06-1424-W7C/evidence/MSNF-046-047/` (owner machine).

## Regression
Pre-existing, not a regression of Stable 16. The missions UI first ships in bundle v16 (theme 2.59.0). Bundle v15 (theme 2.51.1) has no missions UI.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend loyalty missions, `mission-card.vue`
- **RCA anchor:** `client-app/modules/loyalty/components/mission-card.vue:50` — `:aria-label="$t('pages.account.missions.card.open_mission')"`
- **Routing confidence:** HIGH. Fix: put the mission name in the label (i18n key with a `{name}` parameter), or use `aria-labelledby` pointing at the card's `h3`.
