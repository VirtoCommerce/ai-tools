# VCST-6260 — Testing checklist

**Ticket:** Admin UI: classic theme update (responsive, collapse menu, global search) (Story, Highest)
**Verdict: PASS WITH NOTES** — round 1 FAST + round 2 FULL; operator: remaining findings are not bugs; Tested (comment 112269). F7, F8, F9 fixed in the PR by QA (efd7f75, 375d141, c4758cf) and verified on the deployed build 3.1088.0-pr-3134-c475; PR #3134 merged 2026-10-22.
**Flow / path:** feature-test · **FAST round 1 by operator decision** (routing §5 says FULL for a Highest Story; FULL follows as round 2) · shape class: none · layer: `admin-spa` + `api` (Settings v2)
**Env:** vcptcore_qa1 · Platform `3.1087.0-pr-3134-a3d2` (PR vc-platform#3134 head `a3d2534`, pinned via vc-deploy-dev#6971)
**Oracles:** the ticket has no ACs → the PR #3134 description is the spec `{SPEC}` · reporter comment "fast smoke: Settings, Collapse" · BL-UI-001…007 · BL-A11Y-001…004 · BL-PLAT-001 · ECL 7.1/7.3/7.4/15.1.
**Test object:** UNDECLARED — no domain map for the Admin shell (`/qa-domain-map` recommended); no prior test model.
**Test data:** live-discover; admin via `env.ADMIN`. `data_surface: false`.
**Not covered on FAST:** visual/a11y lane (`--visual` not passed — runs in FULL), authored regression cases, modern-look presets beyond a smoke.

| # | Condition | Source | Verdict | Evidence |
|---|---|---|---|---|
| M1 | Main menu: "Collapse menu" button sits at the BOTTOM of the menu; the old top toggle is gone | PR §Main menu, reporter | PASS | button at the bottom, no top toggle — BE-01 |
| M2 | Collapse → menu shrinks to icons, blades area widens; Expand restores labels; state survives navigating to another workspace | PR §Main menu | PASS | icons only + hover flyout; state kept across workspaces and reload (`MainMenu.State`, profiles/currentuser 204); 5 rapid toggles stable; Enter toggles, name flips Collapse/Expand — BE-02/03/04 |
| M3 | Menu panel does not run below the window (no 60 px overflow); in a short window the list scrolls above the footer | PR §Main menu, ECL 7.4 | PASS | 1920×600: nav ends at window bottom, list scrolls above the footer, More reachable — BE-06/07 |
| S1 | Settings workspace opens, groups list + a settings blade render; edit one harmless setting, Save → persists after reload; revert | reporter "Settings", PR §Settings v2 | PASS | Back In Stock › Batch size 1000→1001 → `POST settings/v2/global/values` 204, persisted after reload, reverted — BE-05 |
| S2 | Settings v2: saving an out-of-scope setting through `me/values` → **400** with a reason; unknown setting name → **400** (not 500) | PR §Breaking changes | PASS | me/values + Store setting → 400 "not registered for tenant type 'UserProfile'"; unknown → 400 "Unknown setting"; tenant/Store + UserProfile setting → 400; unknown tenant type → 400; empty body → 400; mixed valid+invalid → 400, nothing saved |
| S3 | Settings v2: a valid user-scoped `me/values` save and a valid store tenant save still succeed | PR §Breaking changes | PASS | me/values ShowMeridian → 204; tenant/Store/B2B-store XPickup.GlobalTransferEnabled → 204; both read back and reverted |
| H1 | Global search: Ctrl+K opens it; finds a menu item, a setting, a user and a role; Enter/click navigates; Esc closes | PR §Header | PASS | Ctrl+K focuses the field; "ord" → Menu/Settings/Users/Roles; Enter → Orders; role click → Security › Roles; Esc closes; stale requests aborted — BE-08/09. Restricted-user scoping not checked |
| H2 | License notice is a short label with the full notice as tooltip; environment label overlaps nothing at 1920 / 1280 / 900 px | PR §Header, BL-UI-004 | PASS + Low (F2) | label + full tooltip; QA tab centred, no overlap at 1920/1280/900 — BE-11/12/13. Phone: QA pill overlaps the search button tap area — BE-14 |
| H3 | Version label fits beside the logo (no truncation/overlap) | PR §Header | PASS | fits at 1920/1280/900 |
| D1 | Dashboard: no title block; widgets render, clicks on a widget navigate (mouse) | PR §Dashboard | PASS (partial) | no title block, 6 KPI + 2 charts render; mouse click on a KPI tile does not navigate (likely no target); touch not tested — BE-22 |
| R1 | Phone 393×852: menu opens as a drawer from a header button; header icons only; search is an icon | PR §Responsive, ECL 7.4 | PASS + Low (F3) | drawer with overlay; icons only; search = icon — BE-14/15/21 |
| R2 | Phone: Catalog → product → one blade at a time, parent folded to a strip; no horizontal overflow | PR §Responsive | PASS + Low (F4, F5) | one blade at a time, parent folded to a labelled strip — BE-18/19 |
| R3 | Desktop blade behaviour unchanged: two blades side by side, maximize/close work | PR §Responsive | PASS | BE-09/10 |
| T1 | Default look is Classic; no "Choose your look" dialog after sign-in; no `settings/v2/me` request for theme | PR §Modern looks | PASS | no dialog, no settings/v2/me request on load |
| T2 | Ctrl+Alt+T opens "Choose your look"; Cancel/Esc restores Classic (demo only — smoke) | PR §Modern looks | PASS | Dark previews live, Esc restores Classic — BE-23/24/25 |
| X | Console: no new errors; network: no 4xx/5xx except the expected S2 400s | always-on | PASS with notes | nothing attributable to the PR. Pre-existing: 401 WidgetColorMarkers on the login page (also on 3.1088.0-alpha), 404 app logos, duplicate AngularJS load. One `columnDefs` TypeError after a keyword search in Catalog at phone width, not reproduced on desktop — BE-17 |

## Findings

| # | Severity | Finding | Provenance |
|---|---|---|---|
| F1 | Medium | Settings v2 save: a value of the wrong type → **500** ("The input string 'notanint' was not in a correct format", `FullDateThreshold`); a value outside `allowedValues` → 204 and stored (`FullDateThresholdUnit=Fortnights`). Expected 400, like the new unknown/out-of-scope handling | PRE-EXISTING (likely) — the PR claims 400 only for unknown/out-of-scope names; old build not compared **Operator decision 2026-10-21: not a bug.** |
| F2 | Low | Phone: the QA environment pill overlaps the top 8 px of the search button (PR: "never covers anything") — BE-14 | IN-SCOPE **Operator decision 2026-10-21: not a bug.** |
| F3 | Low | Phone: settings/docs/notifications/user header icons have no accessible name (pre-existing on desktop too). Drawer Esc/focus — not a bug (operator decision 2026-10-21) | PRE-EXISTING |
| F4 | Low | Phone: long catalog names collapse to "…" only — BE-16 | IN-SCOPE |
| F5 | Low | Phone: 1 px horizontal page overflow on the product blade (394 px at 393) — BE-20 | IN-SCOPE |
| F6 | Low | Swagger for the v2 save POSTs lists 204/401/403 only — the new 400 is undocumented | IN-SCOPE |
| F7 | Low | Phone: dashboard KPI tiles and blade widgets show the value and its label side by side, top-aligned (desktop: value above label). Cause: the mobile workspace rule `.cnt .cnt-inner` (flex) also matched the widget's `.gridster-cnt .cnt-inner`. **Fix pushed to PR #3134 as efd7f75** (QA, 2026-10-21); verified by injection at 393 px — FIX-01/FIX-02. Verified on 3.1088.0-pr-3134-c475 | IN-SCOPE (reported by the operator) |
| F8 | Low | Collapsed menu: the Expand button at the bottom has only a native grey title, while menu items show the blue tooltip to the right (operator request). **Fix committed 375d141** (tooltip like the menu items, enabled only while collapsed; aria-label keeps the name); verified live by injection — FIX-03 (before) / FIX-05 (after) | IN-SCOPE (reported by the operator) |

Window 2026-10-21 13:05:39Z–13:19:25Z. Teardown verified by REST: all changed settings back to their original values, menu expanded, look Classic.

`PENDING-A`: none (FAST authors no cases). C1: skipped — `--coverage` not passed, no authored/REPAIR/RE-BASE cases.

---

## Round 2 — FULL (2026-10-21)

**Model:** `reports/ba/test-models/VCST-6260-2026-10-21.md` (19 scenarios + 3x amendments 10a–10c). **Fixtures:** `@td(SHELL_SEARCH_NOREAD.*)`, `@td(SHELL_SEARCH_READ.*)` seeded on vcptcore_qa1 (3a, `td:validate:rbac` green); admin via `env.ADMIN`. **Build:** `3.1087.0-pr-3134-a3d2`; F7 fix `efd7f75` was pushed later and verified on 3.1088.0-pr-3134-c475.
**Lanes:** 4a `qa-backend-expert` on playwright-edge (functional + REST) · 4v `ui-ux-expert` on Chrome DevTools (visual / a11y / colours) · A `test-management-specialist` (authoring, browserless) → C1.

| # | Condition | Model # | Lane | Verdict | Evidence |
|---|---|---|---|---|---|
| F-01 | [JOURNEY] collapse → Ctrl+K "settings" → open Settings → change a setting → reload → menu still collapsed + value persisted (blade + v2 GET) → restore | 1 | 4a | PASS | collapse → Ctrl+K → Settings → Batch size saved (v2 global 204) → reload: still collapsed, 1002 in blade + v1/v2 GET; restored — R2-F01-* |
| F-02 | Collapsed on desktop → 393 px → drawer shows labels, opens a workspace; back to 1920 → still collapsed | 4 | 4a | PASS | drawer at 393 shows labels after desktop collapse, Orders opens; back at 1920 still collapsed — R2-F02-* |
| F-03 | Search scoping: NOREAD → Catalog in menu group, no Orders/Pricing; Settings/Users/Roles hidden or a contained "Search failed", nothing leaked. READ → Settings/Users/Roles appear and open. Provider API status per token recorded | 7, BSC-1, BSC-2 | 4a | REST PASS · UI BLOCKED | NOREAD 403/403/403 (schema, users, roles), READ 200/200/200; UI half BLOCKED — edge MCP not reloaded with SHELL_SEARCH_PASSWORD (not submitted, no lockout) |
| F-04 | Search inputs: zero results empty state; `user:` / `role:` / unknown alias; 200-char query; emoji / `<script>`; rapid typing; Enter on an already-open blade; Ctrl+K while typing in a textarea/CodeMirror does not hijack input | 6 | 4a | FAIL (B-3, Low) | empty state, aliases, long query, XSS-safe, open-blade reuse OK; B-1 WITHDRAWN — reproduced only by Playwright fill(); a real Ctrl+A/Ctrl+V paste shows results (re-checked 2026-10-21 20:18Z, operator could not reproduce either); B-3 double-escaped query; Ctrl+K inside CodeMirror moves focus to search (dev decision) — R2-F04-* |
| F-05 | Settings v2 parity: valid save via global, `tenant/Store/{{STORE_ID}}`, `me` → read back via v1 `GET /api/platform/settings`, v2 GET and the Settings blade → restore originals | 8 | 4a | PASS with note | global/me/Store saves read back via v2/v1/blade; /api/stores Full shows a Store setting ~4 min late (B-5, pre-existing) |
| F-06 | Settings v2 NOREAD token: `me/values` UserProfile setting → 204; global / Store setting through `me/values` → 400; `global/values` → 403 | 11 | 4a | PASS | NOREAD me/values UserProfile 204; global/Store names via me → 400; global/tenant POST → 403 |
| F-07 | Settings v2 `replaceAll` on `me` only: {valid, unknown} → 400, nothing reset (10a); {valid, outside allowedValues} → status + what was reset (10b); restore every value from a saved snapshot | 10a, 10b | 4a | 10a PASS · 10b FAIL (pre-existing) | replaceAll {valid, unknown} → 400, nothing reset; replaceAll {outside allowedValues} → 204, stored + every other key reset incl. MainMenu.State (replaceAll on dev) **Operator decision 2026-10-21: not a bug.** |
| F-08 | Module blades in Classic at 1920 and 1280: Catalog product, Orders order, Customers contact, Pricing price list, Marketing promotion, Store → settings, Notifications template, Import/Export — toolbar buttons vs More, grid height, nested blade horizontal scroll, maximize | 12 | 4a | PARTIAL + B-4 | Orders/Stores/Catalog/Pricing/Marketing at 1280 OK; Settings blade puts 3 buttons under More after a hard reload (B-4); Customers/Notifications/Import-Export/1920 not run |
| F-09 | Dashboard widgets: mouse drag at 1920 moves a widget; resize < 768 → stacked, no drag; back to 1920 → layout as before the resize; restore order | 13 | 4a | PASS | mouse drag at 1920; stacked no-drag at 600; layout not rewritten after resize back; order restored — R2-F09-* |
| F-10 | Phone 393: three nested blades fold into strips; tapping a strip returns; Back from the deepest | 16 | 4a | PASS | 393: nested blades fold, strips return to root — R2-F10-* **Operator decision 2026-10-21: not a bug.** |
| F-11 | Phone 393: search icon opens search, a result opens a blade | 15 | 4a | PASS | 393: search icon → results → Catalog opens — R2-F11-* |
| V-01 | Phone 393 visual sweep: header, drawer, env pill, dialogs, grids, settings, tiles — overlap / overflow / touch targets (F2, F4, F5, F7 re-check) | 14 | 4v | FAIL (Low) | F2 pill over search (pointer-events none, taps OK); F7 repro (fixed, verified on 3.1088.0-pr-3134-c475); new controls ≥36 px — UI-* **Operator decision 2026-10-21: not a bug.** |
| V-02 | Locale de + ru at 1280 and 393: collapse footer, license label, env tab, search placeholder, group titles, spine titles — no clipping | 17 | 4v | FAIL (Low) | de/ru at 1280 OK, ru at 393 OK; de at 393 KPI label clipped — same cause as F7 |
| V-03 | Classic colour fidelity vs a build without the PR (vcptcore_dev, or login-page baseline from 3x): login, dashboard, grid selection/hover, form validation error, dialog header, filter panel, settings blade, sign-in log | 19 | 4v | PASS | dev vs PR sass with fallbacks: 0 colour diffs over 1842 selectors; live computed = original hex |
| V-04 | Keyboard / a11y of the new chrome: collapse button (name + state), search combobox (roles, aria-expanded, focus return on Esc), drawer (focus, Esc), spine buttons, icon-only header buttons; axe on dashboard + drawer + search open | 5 | 4v | FAIL (Medium, a11y) | F-UI-1 search muted text 3.36:1; F-UI-2 combobox no aria-activedescendant; F-UI-4 no focus indicator on Collapse; (F-UI-5 drawer Esc/focus withdrawn — not a bug, operator decision); + Lows — design-report.md **Operator decision 2026-10-21: not a bug.** |
| V-05 | Look dialog (demo): Ctrl+Alt+T → Dark → Apply → reload keeps Dark → back to Classic; no dialog at sign-in | 18 | 4v | PASS | Ctrl+Alt+T dialog, Dark → Apply → reload keeps → Classic; no dialog at sign-in |
| X-2 | Console / network across both lanes; served bundle is pr-3134 (VC-DEPLOY-003) | — | 4a, 4v | PASS with notes | no PR-attributable errors; 404 app logos, SignalR 1006 (env); bundle contains PR features |

**Not run, by decision:** `replaceAll` on `global` / `tenant/Store` (10c) — would reset shared settings on a shared stand; raised to the developer as a question. 10c on UserProfile already observed by 3x.
**`PENDING-A`:** closed at `3-cases` (verifier APPROVE after one REJECT round). 2a: 29 hits + 063/064/076 all CONFIRMED, no REPAIR/RE-BASE. After the operator decision (2026-10-21): PLAT-115/117 deleted; PLAT-110/116/122/123/124 revised — suite 020b (Admin Shell Classic, split out of 020 — 020 stays at 66) carries 20 Draft cases PLAT-106..114, 116, 118..127.
