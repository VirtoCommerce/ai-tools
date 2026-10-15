# Testing checklist — VCST-6015 (Artifact B)

Sales Rep Hub moved to a Module Federation plugin · vc-frontend#2569 + vc-module-sales-rep#13 · FULL · vcst
Build: platform 3.1083.0 · SalesRep 3.1014.0-pr-13-4fbb · theme 2.60.0-alpha.2579 · plugin `sales-rep` 0.2.5
Model: `reports/ba/test-models/VCST-6015-2026-10-15.md` (24 scenarios) · Discovery: `reports/exploratory/SBTM-VCST-6015-2026-10-15.md`
Plugin folder = `/modules/$(VirtoCommerce.SalesRep)/plugins/vc-frontend/` (literal `$(…)`). "From the plugin" = chunk URL under that folder, none from the host's `/assets/`.
Roles: rep `@td(SALES_REP)` · Advanced rep `@td(SR_REP_DOCS)` · zero-served rep `@td(SALES_REP_NOCUSTOMERS)` · buyer `@td(ORG_USER_DEFAULT)` · maintainer non-rep `{{ORG_USER_EMAIL}}` · anonymous. Rep password key `TEST_USER_PASSWORD`.
Case column: existing `<suite>/<id>`, or `PENDING-A` = a 093 `SR-HD-*` Draft row Artifact A is authoring in this run (executed in C1). Verdict filled at Step 5.

## A. Delivery — the hub comes from the plugin (AC-5)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| A1 | Plugin listed | any cold load (anon + rep) | POST `/graphql` `GetStorePlugins` → entry `sales-rep`, `errors[]` absent | #1, #12 / PENDING-A | |
| A2 | Manifest + entry + chunks + locale load from the plugin folder | rep on `/company/dashboard` | `mf-manifest.json`, `remoteEntry.js`, page chunks, `en-*.js` all 200 from the plugin folder; JSON content-type on the manifest; no built-in hub chunk from `/assets/` | #1 / PENDING-A | |
| A3 | No console errors on the hub (excluding unrelated image-host DNS errors) | rep, each hub page | console clean of plugin/hub errors | #1 | |

## B. Rep uses the Hub as before (AC-1)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| B1 | Rail "Sales Rep hub" | rep, account menu | Dashboard, My customers (badge = served-org count), Tasks; no Document library | #1 / 093 | |
| B2 | Dashboard renders + layout persists | `@td(SR_REP_LAYOUT)` Edit → move block → Save → reload → re-login | widgets render; one `saveSalesRepLayout`; arrangement survives reload + re-login | #2 / 093 | |
| B3 | My customers → profile → orders → an order | rep | each renders, no redirect; "My last order" date = the order's Created date | #1, #5 / 089, 091 | |
| B4 | All customer orders | rep `/company/customer-orders` | list renders (creator-agnostic) | #1 / 097 | |
| B5 | Tasks | rep `/company/tasks` | page renders (TaskManagement installed on vcst) | #1 / 106 | |
| B6 | Document library — Advanced rep only | `@td(SR_REP_DOCS)` vs rep | Advanced: link + widget + page, Open works; plain rep: link absent and `/company/documents` redirects | #7 / 093 | |
| B7 | List sharing to customers | rep shares a list with scope Customer → buyer of that org | buyer receives the list; provenance note renders | #4 / (VCST-5707 model) | |
| B8 | Rep cold deep links (new tab each) | 5 hub URLs | real page, URL unchanged, no Not Found frame (3x: 1.07–1.64 s) | #3 / PENDING-A | |
| B9 | Zero-served rep | `@td(SALES_REP_NOCUSTOMERS)` My customers | "No customers found", no redirect (3x: reachable — 089/SR-FE-030 was DEPRECATED as unreachable) | #8 / 089/SR-FE-030 | |

## C. Buyer sees "Sales reps" (AC-2)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| C1 | Corporate link + page | buyer: Corporate → Sales reps | link label "Sales reps" (ticket's "My Sales Reps" is DRIFT — record); table Name/Email/Phone of the active org's reps | #6 / 090 | |
| C2 | Org switch rescopes | Advanced rep (multi-org) or buyer with 2 orgs | rows change to the new org's reps | #6 / 090 | |
| C3 | Exactly one link | desktop + 375px menu, after en→de SPA switch | one Corporate "Sales reps", one "Sales Rep hub" section | #22 / PENDING-A | |

## D. Non-reps are turned away (AC-3)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| D1 | Buyer: no hub | buyer account menu | no "Sales Rep hub" section | #9 / 093 | |
| D2 | Buyer deep links | 5 hub URLs, cold | end on `/account/dashboard`, no transient Not Found, 0 requests to `/graphql/sales-rep`; Back leaves without a loop | #10 / PENDING-A | |
| D3 | Maintainer non-rep | `{{ORG_USER_EMAIL}}` | `me` has no `sales-rep:access`, not administrator; same refusals as D2 | #11 / PENDING-A | |
| D4 | Anonymous | 5 hub URLs → sign-in | `/sign-in?returnUrl=…`; after rep sign-in → hub; after buyer sign-in → `/account/dashboard` | #13 / PENDING-A | |
| D5 | Plugin code for every visitor (H2 — record, not a verdict) | anon + buyer | count of plugin requests/bytes (3x: 13 resources, ~51 KB transferred) | #9 / — | |

## E. Store switch off (AC-4) — operator approved flip + restore (2026-10-15)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| E1 | `SalesRep.Enabled` = off for B2B-store | rep + buyer | no rail, no Corporate "Sales reps" link, no request under the plugin folder after `GetStorePlugins` | #14 / PENDING-A | |
| E2 | Direct URLs with the switch off | `/company/dashboard`, `/company/sales-reps` | end state recorded (account dashboard or Not Found) | #14 | |
| E3 | Restore | Admin → store → Sales Rep | value restored to its prior state and confirmed; hub back for the rep | — | |

## F. Delivery faults (gap-ACs; client-side request interception only)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| F1 | Manifest 404 | rep + buyer | home/PDP usable; rail + link withdrawn; hub URLs show host 404 (3x) — no blank page, no uncaught error | #17 / PENDING-A | |
| F2 | Manifest 200 HTML (missing `/modules` ingress) | same | same as F1; record console (3x: empty) and telemetry (3x: RemoteDependency success:true) | #17 / PENDING-A | |
| F3 | Version gate `^0.3.0` | rep | `remoteEntry.js` never requested; hub absent; site usable | #18 / PENDING-A | |
| F4 | remoteEntry delayed 15 s | rep deep link | Loading → slow notice + Reload by ~8 s → hub | #19 / PENDING-A | |
| F5 | remoteEntry download fails → Reload page | rep deep link | "Part of the site could not be loaded…" + Reload; Reload recovers | #23 / PENDING-A | |

## G. Localization (BL-SR-013)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| G1 | de / es / culture without a plugin locale file | rep rail + hub headings, buyer Corporate link | translated (de, es) or English fallback; no raw `sales_rep.*` key | #15 / PENDING-A | |
| G2 | Locale chunk slow (3x B1) | delay `assets/en-*.js` 6 s; rep `/company/dashboard`; buyer Corporate menu | no raw key at any moment (3x observed raw keys >7 s — suspected defect) | #16, #24 / PENDING-A | |

## H. Session and viewport

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| H1 | User switch in one tab | rep → sign out → buyer → sign out → Advanced rep, no reload | rail/links follow the user each time | #21 / PENDING-A | |
| H2 | Logout on a hub page | rep on `/company/dashboard` → sign out | lands on sign-in; record `returnUrl` (3x: carries the hub URL — B3 candidate) | — | |
| H3 | Mobile 375px | rep + buyer | menu carries hub entries + badge (rep) and Corporate → Sales reps (buyer) | #22 / PENDING-A | |

## I. Visual / a11y lane (4v, `ui-ux-expert`)

| # | Condition | Where | Expected | Verdict |
|---|---|---|---|---|
| I1 | BL-UI layout parity — hub pages rendered by the plugin | dashboard, My customers, profile, documents, tasks, `/company/sales-reps` at 1920 / 768 / 375 | no overflow/clipping/misalignment; spacing/tokens consistent with host | |
| I2 | Plugin's own focus ring (`layout-block.vue` uses `--vc-focus-ring-*` vars instead of host mixin) | dashboard Edit layout, keyboard | visible focus on drag handles, matches host focus ring | |
| I3 | WCAG 2.2 AA (BL-A11Y-001..004) | hub pages + placeholder states (Loading / slow notice / Reload) | axe clean of serious/critical; slow notice announced (`role=status`); Reload button keyboard-reachable | |
| I4 | `vs. DESIGN` | — | SKIPPED — no design link on the ticket | |

## Uncovered (stated, not omitted)
- **V10 theme-switch matrix** (`module_federation_enabled` × `sales_rep_builtin_enabled`, incl. a customized theme lacking both keys — 1d U-1 CONTRADICTS): build-time only, no runtime override (3x). Not testable on a stand → a question for the author, not a verdict.
- **Install/version matrix** (old module + new theme, old XFrontend): needs other stands; vcst satisfies all floors.
- **Packaging** (`plugins/vc-frontend/` at module root, `BuildStorefrontPlugin` ran): inferred true from vcst serving the plugin; CI log not checked.
- **Cache after redeploy** (gap-AC-15): not reproducible without a redeploy.
- **AC-1.e Tasks link absent when TaskManagement is not installed**: vcst has it installed; not removable on a shared stand.
- **Personal (no-org) buyer** for AC-2.c: FIXTURE-GAP; probe with `{{USER_EMAIL}}` only if it resolves.
