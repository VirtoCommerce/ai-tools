# VCST-6451 — Testing checklist (Artifact B, FAST)

**Ticket:** Sales Rep Hub: header icon linking to the hub Dashboard (Sales Rep role only) · Story · P2 (Medium) · parent VCST-5142
**Env:** vcptcore (vcptcore-qa) · Platform 3.1093.0 · `VirtoCommerce.SalesRep 3.1017.0-pr-31-efa5` (PR #31 artifact, deployed — preflight `expect` OK)
**Path:** feature-test · FAST (provisional at 1a, confirmed at 1b: six §5b tokens hold, domain purpose declared in `sales-rep.md` §1)
**Theme on the stand (corrected after 4a):** vc-frontend-next **PR #13** build `3.2.0-pr-13-51f3-51f327a5` — not vc-frontend. The 1a assumption "vcptcore-qa runs the module plugin, not vc-frontend-next" was wrong.

## Round 2 — stand redeployed (vc-deploy-dev#7026, merged 13:50Z; live confirmed before re-run)
Theme **vc-frontend `vc-theme-b2b-vue-2.62.0-pr-2627-92b1-92b10c04`** (host facade 0.2.7 ⇒ satisfies the plugin's `requiredHostVersion ^0.2.4`) · Store 3.1013.0 · XFrontend 3.1009.0 · SalesRep 3.1017.0-pr-31-efa5 · preflight READY. vc-frontend-next#13 is out of scope on this stand (Sales Rep ships on vc-frontend via the module plugin).

## Round 1 result — BLOCKED (build mismatch, 2026-11-03 13:28–13:38Z)
Neither half reaches a rep (rep holds `sales-rep:access`, `SalesRep.Enabled=true`): no header icon, no hub rail section, `/company/dashboard` → 404.
- PR #13's built-in sales-rep module is compiled out: `init()` returns unless `sales_rep_builtin_enabled === true`, and `settings_data.json` ships `false`.
- PR #31's plugin is listed by the store (`sales-rep 3.1017.0-pr-31-efa5`), its `mf-manifest.json` is served (200) but declares `requiredHostVersion: ^0.2.4`; the PR #13 build's host facade is 0.2.3 (per the branch's `core-api/package.json`) → `remoteEntry.js` never requested, plugin silently skipped.
- Unblock: rebuild/redeploy PR #13 on current vc-frontend-next `dev` (facade ≥ 0.2.4), or deploy a theme that can host the PR #31 plugin; then re-run C1–C21.
- C1–C12, C14–C21: BLOCKED (C7/C9/C20 observed no icon, but vacuous while the rep has none). C13: PASS on source. Evidence: `screenshots/c1-rep-desktop-header-no-hub-icon.png`, `screenshots/c3-rep-company-dashboard-404.png`.

## Personas (all probed via `/connect/token` 2026-11-03 → 200)
| Persona | Alias / login source | Lane password NAME | `sales-rep:*` in token |
|---|---|---|---|
| Rep (plain) | `@td(SR_REP_PRIMARY.email)` | `SR_REP_PASSWORD` | `sales-rep:access` |
| Rep (Advanced) | `@td(SR_REP_DOCS.email)` | `TEST_USER_PASSWORD` | `access` + `documents:read` |
| Buyer (org member) | `@td(ACME_BUYER.email)` | `USER_PASSWORD` | none |
| Org maintainer | `@td(MULTI_ORG_TF_BR_MAINTAINER.email)` | `DEFAULT_TEST_PASSWORD` | none (11 org perms) |
| Personal account | `{{USER_EMAIL}}` | `USER_PASSWORD` | none |
| Anonymous | — | — | — |

## Conditions
| # | AC | Condition | Persona | Result |
|---|---|---|---|---|
| C1 | AC1 | Desktop header icon row shows a **Sales Rep Hub** item: icon + caption "Sales Rep Hub" (exact case) | Rep | |
| C2 | AC2 | It is the **first (leftmost)** item, before Bulk order; the rest of the row keeps its order | Rep | |
| C3 | AC3 | Click → URL `/company/dashboard`, the hub Dashboard renders (hub rail section, widgets) | Rep | |
| C4 | AC3 | Item works from a non-home page (catalog/PDP, cart, an `/account/*` page) — "from any page" | Rep | |
| C5 | AC4 | Mobile (375 px): item present in the mobile menu and leads to `/company/dashboard`; enumerate the full mobile menu (ECL 7.4 row 2) | Rep | |
| C6 | AC1/AC5 | Advanced rep also sees the item (same caption/position) | Rep Advanced | |
| C7 | AC5 | **No** item on desktop or mobile | Buyer | |
| C8 | AC5 | **No** item on desktop or mobile | Org maintainer | |
| C9 | AC5 | **No** item on desktop or mobile | Anonymous | |
| C10 | AC5 | **No** item; account menu has no hub | Personal account | |
| C11 | AC6 | Direct `/company/dashboard` → redirect to `/account/dashboard`, no hub content, **no `/graphql/sales-rep` / `salesRep*` request** (BL-SR-011) | Buyer, Org maintainer | |
| C12 | AC6 | Anonymous direct `/company/dashboard` → sign-in gate (existing behaviour), no hub content | Anonymous | |
| C13 | AC7 | Item gated on `SalesRep.Enabled`: plugin loads only under `settingEnabled(SalesRep.Enabled)` + `init()` merges only when `isSalesRepUser()` | — | **PASS (source)** — `plugin.config.ts:43` `when: settingEnabled(SalesRep.Enabled)` + `useSalesRepsConfig.ts:19-20`; key in all 13 locales (operator decision 2026-11-03: no write to the shared store setting) |
| C14 | AC8 | Icon uses the header's default link colour (same computed colour as Bulk order/Cart icons), aligned with the row (BL-UI-005), light mode | Rep | |
| C15 | AC8 | Same in dark mode (`prefers-color-scheme: dark` emulation or theme's own switch, whichever the stand supports — state which) | Rep | |
| C16 | AC8 | "Every preset": only the stand's active preset is observable; other presets → evidence is that the item is a regular header menu entry (no own colour) — state what was observed | — | |
| C17 | AC9 (DRIFT) | Caption key is `sales_rep.hub.title` (not the AC's `sales_rep.hub.header_link`, per dev comment 2026-10-27); account-rail section title and hub breadcrumbs now read "Sales Rep Hub" too | Rep | |
| C18 | AC9 / BL-SR-013 | Switch to another available storefront language: caption localized, never a raw `sales_rep.*` key (also watch the first paint after reload — PR notes the key may flash) | Rep | |
| C19 | Notes | Sign-in transition: rep signs in from anonymous → item appears without a manual refresh; sign-out → item disappears | Rep | |
| C20 | Notes | Role switch in one browser: rep signs out, buyer signs in → no item | Rep → Buyer | |
| C21 | Notes | Touch target of the item at 375 px (BL-UI-006) and no overflow/clipping of the desktop row at 1280 px with the extra item | Rep | |

## Recorded axes (1b)
`layer: storefront` · `visual_surface: true` (derived, not run — FAST without `--visual`) · `contract_surface: false` (no GraphQL change) · `coverage_surface: true` (derived, not run — no `--coverage`; 52 rows in 7 sales-rep suites assert the old caption "Sales Rep hub") · `data_surface: false` (all personas resolve now; `td:validate` green) · `domain_map: PRESENT` (`sales-rep.md` rev 3).

## Regression
No C1: FAST authors nothing and `2a` did not run (no `--coverage`). Release gate: `not-assessed`.

## Round 4 — extra role + AC7 live (Next 3.2.0, 2026-11-03, orchestrator on playwright-chrome)
- **Extra rep role:** `agent-test-sr-docs-writer` (Sales Representative + Sales Rep Documents Manager; token `sales-rep:access` + `documents:write`) sees "Sales Rep Hub" first in the row → `/company/dashboard`. `screenshots/r4-docswriter-row-enabled.png`
- **C13 / AC7 live — PASS** (operator asked for it). B2B-store `SalesRep.Enabled` set false 15:39:34Z (PUT 204, storefront GraphQL confirmed `false`). Signed-in rep: no hub link in the desktop row, `/company/dashboard` → 404 (plugin not loaded), mobile menu has no hub item and no hub account section. Restored true 16:25:06Z (GraphQL `true`), re-signed in as `SR_REP_PRIMARY` → link back, first in the row. `screenshots/r4-ac7-disabled-rep-row-no-hub.png`, `r4-ac7-disabled-rep-mobile-menu-375.png`, `r4-ac7-reenabled-rep-row-hub-back.png`. Disabled window ~45 min (longer than planned).
- **Not run, by decision (operator 2026-11-04):** decoy roles without `sales-rep:access` (Sales Rep, Sales Executive, Docs Manager alone) and the custom access roles AGENT-TEST-*. The gate is the permission, not the role name (`isSalesRepUser()` = `checkPermissions("sales-rep:access")`); the four non-permission personas (C7–C10) already cover the negative, and the three rep roles cover the positive.
