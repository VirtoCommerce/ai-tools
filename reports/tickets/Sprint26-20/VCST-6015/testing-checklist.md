# Testing checklist — VCST-6015 (Artifact B)

Sales Rep Hub moved to a Module Federation plugin · vc-frontend#2569 + vc-module-sales-rep#13 · FULL · vcst
Build: platform 3.1083.0 · SalesRep 3.1014.0-pr-13-4fbb · theme 2.60.0-alpha.2579 · plugin `sales-rep` 0.2.5
Model: `reports/ba/test-models/VCST-6015-2026-10-15.md` (24 scenarios) · Discovery: `reports/exploratory/SBTM-VCST-6015-2026-10-15.md`
Plugin folder = `/modules/$(VirtoCommerce.SalesRep)/plugins/vc-frontend/` (literal `$(…)`). "From the plugin" = chunk URL under that folder, none from the host's `/assets/`.
Roles: rep `@td(SALES_REP)` · Advanced rep `@td(SR_REP_DOCS)` · zero-served rep `@td(SALES_REP_NOCUSTOMERS)` · buyer `@td(ACME_BUYER)` (Purchasing agent; corrected 4a — `@td(ORG_USER_DEFAULT)` is a maintainer) · maintainer non-rep `{{ORG_USER_EMAIL}}`, `@td(ORG_USER_DEFAULT)` · anonymous. Rep password key `TEST_USER_PASSWORD`.
Case column: existing `<suite>/<id>`; `SR-HD-100..115` are Draft rows authored by this run (Artifact A) and executed in C1. Verdict filled at Step 5.

## A. Delivery — the hub comes from the plugin (AC-5)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| A1 | Plugin listed | any cold load (anon + rep) | POST `/graphql` `GetStorePlugins` → entry `sales-rep`, `errors[]` absent | #1, #12 / 093/SR-HD-100, SR-HD-105 | PASS — `sales-rep` listed, no errors[] (anon + rep); `version` field = module 3.1014.0 (4a1) |
| A2 | Manifest + entry + chunks + locale load from the plugin folder | rep on `/company/dashboard` | `mf-manifest.json`, `remoteEntry.js`, page chunks, `en-*.js` all 200 from the plugin folder; JSON content-type on the manifest; no built-in hub chunk from `/assets/` | #1 / 093/SR-HD-100 (locale chunk: manual 4a) | PASS — manifest (application/json), entry, chunks, `en-*.js` all 200 from plugin folder; no hub chunk from `/assets/` (4a1) |
| A3 | No console errors on the hub (excluding unrelated image-host DNS errors) | rep, each hub page | console clean of plugin/hub errors | #1 | PASS — no plugin/hub console errors; only image-host DNS + known `firebase-messaging-sw.js` 404 (KB-EED5F6AC) (4a1) |

## B. Rep uses the Hub as before (AC-1)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| B1 | Rail "Sales Rep hub" | rep, account menu | Dashboard, My customers (badge = served-org count), Tasks; no Document library | #1 / 093 | PASS — Dashboard, My customers 5 (= 5 rows), Tasks; no Document library (4a1) |
| B2 | Dashboard renders + layout persists | `@td(SR_REP_LAYOUT)` Edit → move block → Save → reload → re-login | widgets render; one `saveSalesRepLayout`; arrangement survives reload + re-login | #2 / 093 | PASS — keyboard move → 1 `SaveSalesRepLayout`; held after reload + re-login; reset after (4a1) |
| B3 | My customers → profile → orders → an order | rep | each renders, no redirect; "My last order" date = the order's Created date | #1, #5 / 089, 091 | PASS — profile → orders → order render; "My last order" 10/13/2026 = order Created date (4a1, 3x) |
| B4 | All customer orders | rep `/company/customer-orders` | list renders (creator-agnostic) | #1 / 097 | PASS — renders incl. orders the rep did not create (4a1) |
| B5 | Tasks | rep `/company/tasks` | page renders (TaskManagement installed on vcst) | #1 / 106 | PASS — task list + due-dates calendar (4a1) |
| B6 | Document library — Advanced rep only | `@td(SR_REP_DOCS)` vs rep | Advanced: link + widget + page, Open works; plain rep: link absent and `/company/documents` redirects | #7 / 093 | PASS — Advanced: link + widget + page + Open; plain rep: no link, `/company/documents` → `/account/dashboard` (4a1) |
| B7 | List sharing to customers | rep shares a list with scope Customer → buyer of that org | buyer receives the list; provenance note renders | #4 / (VCST-5707 model) | PASS — shared with AcmeCorp; buyer notified; "Recommended by your sales representative" note from plugin chunk; list deleted (4a1) |
| B8 | Rep cold deep links (new tab each) | 5 hub URLs | real page, URL unchanged, no Not Found frame (3x: 1.07–1.64 s) | #3 / 093/SR-HD-101 | PASS — 5 cold deep links: URL kept, heading in first snapshot, no Not Found frame (4a1; 3x 1.07–1.64 s) |
| B9 | Zero-served rep | `@td(SALES_REP_NOCUSTOMERS)` My customers | "No customers found", no redirect (3x: reachable — 089/SR-FE-030 was DEPRECATED as unreachable) | #8 / 089/SR-FE-030 | PASS — "No customers found", no redirect (4a1, 3x) |

## C. Buyer sees "Sales reps" (AC-2)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| C1 | Corporate link + page | buyer: Corporate → Sales reps | link label "Sales reps" (ticket's "My Sales Reps" is DRIFT — record); table Name/Email/Phone of the active org's reps | #6 / 090 | PASS — one Corporate "Sales reps" link (ticket text "My Sales Reps" = DRIFT in the ticket, not the product); table of AcmeCorp reps (4a1, ACME_BUYER + maintainer) |
| C2 | Org switch rescopes | Advanced rep (multi-org) or buyer with 2 orgs | rows change to the new org's reps | #6 / 090 | PASS — AcmeCorp → TechFlow: 6 → 5 reps, locked membership hidden for its org (4a1) |
| C3 | Exactly one link | desktop + 375px menu, after en→de SPA switch | one Corporate "Sales reps", one "Sales Rep hub" section | #22 / 093/SR-HD-115 | PASS — after en→de: exactly one "Vertriebsmitarbeiter-Hub" and one "Vertriebsmitarbeiter" at 1920 + 375, no raw key (4a1; 3x) |

## D. Non-reps are turned away (AC-3)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| D1 | Buyer: no hub | buyer account menu | no "Sales Rep hub" section | #9 / 093 | PASS — ACME_BUYER: no hub section, one "Sales reps" (4a2) |
| D2 | Buyer deep links | 5 hub URLs, cold | end on `/account/dashboard`, no transient Not Found, 0 requests to `/graphql/sales-rep`; Back leaves without a loop | #10 / 093/SR-HD-102 | **FAIL** — end state correct (6 routes × 3 → `/account/dashboard` 1.07–1.35 s, 0 `/graphql/sales-rep`, Back OK) but host **404 frame flashes 50–90 ms before redirect in 6/18 loads**; `document.title` + GA page_view record "404 Page not found" (4a2, 50 ms poll) |
| D3 | Maintainer non-rep | `{{ORG_USER_EMAIL}}` | `me` has no `sales-rep:access`, not administrator; same refusals as D2 | #11 / 093/SR-HD-103 | **FAIL** — refusals hold (no `sales-rep:access`, not admin, 0 sales-rep calls) but same transient 404 in 8/18 (`{{ORG_USER_EMAIL}}`) and 6/10 (USR-015) (4a2) |
| D4 | Anonymous | 5 hub URLs (dashboard, my-customers, customer-orders, tasks, documents) → sign-in | `/sign-in?returnUrl=…`; after rep sign-in → hub; after buyer sign-in → `/account/dashboard` | #13 / 093/SR-HD-104 | PASS with finding — anon → `/sign-in?returnUrl=<route>` for 6 routes; rep returns to hub, buyer/maintainer → `/account/dashboard`; transient 404 before sign-in redirect in 6/9 (4a2) |
| D5 | Plugin code for every visitor (H2 — record, not a verdict) | anon + buyer | count of plugin requests/bytes (3x: 13 resources, ~51 KB transferred) | #9 / — | WAIVED (record-only, no verdict) — recorded — 13 plugin resources on every cold load for anon + buyer; warm anon 0 B transferred / 49 KB decoded (4a2); cold ~51 KB (3x) |

## E. Store switch off (AC-4) — operator approved flip + restore (2026-10-15)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| E1 | `SalesRep.Enabled` = off for B2B-store | rep + buyer | no rail, no Corporate "Sales reps" link, no request under the plugin folder after `GetStorePlugins` | #14 / 093/SR-HD-106 | PASS — off at 13:31:51Z, effective ≤2 min 36 s; rep + ACME_BUYER: no rail, no Corporate link; GetStorePlugins still lists the entry but 0 requests under `/modules/` (4aE) |
| E2 | Direct URLs with the switch off | `/company/dashboard`, `/company/sales-reps` | end state recorded (account dashboard or Not Found) | #14 | PASS (recorded) — `/company/dashboard`, `/company/my-customers`, `/company/sales-reps` (rep, buyer, anon): URL kept, host 404 Page not found, no hub content (4aE) |
| E3 | Restore | Admin → store → Sales Rep | value restored to its prior state and confirmed; hub back for the rep | — | PASS — restored 13:45:05Z to `true` (= default; prior value was unset — PUT ignores null, so it is now an explicit `true`, behaviour identical) |

## F. Delivery faults (gap-ACs; client-side request interception only)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| F1 | Manifest 404 | rep + buyer | home/PDP usable; rail + link withdrawn; hub URLs show host 404 (3x) — no blank page, no uncaught error | #17 / 093/SR-HD-109 | PASS — home + PDP usable; rail + link withdrawn; hub URLs + `/company/sales-reps` = host 404, no Reload; no uncaught error; AI RemoteDependency success=false + Pageview "SalesReps" (4a2, 3x) |
| F2 | Manifest 200 HTML (missing `/modules` ingress) | same | same as F1; record console (3x: empty) and telemetry (3x: RemoteDependency success:true) | #17 / 093/SR-HD-109 | PASS — same as F1, console empty; AI RemoteDependency **success=true** + Pageview "SalesReps" — silent failure (4a2, 3x) |
| F3 | Version gate `^0.3.0` | rep | `remoteEntry.js` never requested; hub absent; site usable | #18 / 093/SR-HD-110 | PASS — `remoteEntry.js` requested 0×, hub absent, site usable, console silent (4a2, 3x) |
| F4 | remoteEntry delayed 15 s | rep deep link | Loading → slow notice + Reload by ~8 s → hub | #19 / 093/SR-HD-111 | PASS — Loading 1.3 s → slow notice + Reload 8.3 s → hub 16.5 s; a11y: `<output>` (role=status, polite), Reload Tab-reachable + Enter works; Corporate link raw key throughout (4a2) |
| F5 | remoteEntry download fails → Reload page | rep deep link | "Part of the site could not be loaded…" + Reload; Reload recovers | #23 / 093/SR-HD-113 | PASS — "Part of the site could not be loaded…" + Reload; Reload recovers 1.4 s; a11y same status region, keyboard OK (4a2) |

## G. Localization (BL-SR-013)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| G1 | de / es / culture without a plugin locale file | rep rail + hub headings, buyer Corporate link | translated (de, es) or English fallback; no raw `sales_rep.*` key | #15 / 093/SR-HD-107 | PASS settled (de/es translated, el → English fallback) — finding: raw keys flash 0.1–0.4 s on every unthrottled cold load; de rail "Meine kunden" lowercase (Low) (4a2) |
| G2 | Locale chunk slow (3x B1) | delay `assets/en-*.js` 6 s; rep `/company/dashboard`; buyer Corporate menu | no raw key at any moment (3x observed raw keys >7 s — suspected defect) | #16, #24 / 093/SR-HD-114, SR-HD-108 | **FAIL** — locale chunk +6 s: rep dashboard rail/h1/widgets raw `SALES_REP.HUB.*` 1.3–7.5 s; buyer Corporate link `Sales_rep.navigation.link` 1.2–7.6 s; `/company/sales-reps` `SALES_REP.PAGE.TITLE`, `sales_rep.table.*` (4a2, 3x B1) |

## H. Session and viewport

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| H1 | User switch in one tab | rep → sign out → buyer → sign out → Advanced rep, no reload | rail/links follow the user each time | #21 / 093/SR-HD-112 | PASS — rail follows each user without manual reload (logout itself reloads) (4a1) |
| H2 | Logout on a hub page | rep on `/company/dashboard` → sign out | lands on sign-in; record `returnUrl` (3x: carries the hub URL — B3 candidate) | — | PASS (recorded) — returnUrl carries the hub URL; next non-rep lands on `/account/dashboard` (4a1, 4a2) |
| H3 | Mobile 375px | rep + buyer | menu carries hub entries + badge (rep) and Corporate → Sales reps (buyer) | #22 / alt: 089/SR-FE-027 (rep badge, mobile), 090/SR-FE-MSR-018 (buyer Corporate link, mobile), 089/SR-FE-022 (buyer no hub) — rep Dashboard/Tasks mobile entries asserted by manual 4a only; none in C1 | PASS — 375: rep "Sales Rep hub" group (Dashboard, My customers + badge, Tasks); buyer Corporate → Sales reps (4a1) |

## I. Visual / a11y lane (4v, `ui-ux-expert`)

| # | Condition | Where | Expected | Verdict |
|---|---|---|---|---|
| I1 | BL-UI layout parity — hub pages rendered by the plugin | dashboard, My customers, profile, documents, tasks, `/company/sales-reps` at 1920 / 768 / 375 | no overflow/clipping/misalignment; spacing/tokens consistent with host | PASS — 7 pages × 1920/768/375: no overflow/clipping/occlusion; host-parity baseline unavailable (4v) |
| I2 | Plugin's own focus ring (`layout-block.vue` uses `--vc-focus-ring-*` vars instead of host mixin) | dashboard Edit layout, keyboard | visible focus on drag handles, matches host focus ring | PASS — `2px solid #3b82f6`, offset 2 px = host ring (4v) |
| I3 | WCAG 2.2 AA (BL-A11Y-001..004) | hub pages + placeholder states (Loading / slow notice / Reload) | axe clean of serious/critical; slow notice announced (`role=status`); Reload button keyboard-reachable | **FAIL (PRE-EXISTING)** — D1 documents meta `#a3a3a3` 2.52:1; D2 Edit-layout labels 2.41–4.25:1; identical `text-neutral-400` in the in-repo module on vc-frontend dev ⇒ carried over, not introduced; placeholder states a11y OK (via 4a2) |
| I4 | `vs. DESIGN` | — | SKIPPED — no design link on the ticket | SKIPPED — no design link (4v) |

## Uncovered (stated, not omitted)
- **V10 theme-switch matrix** (`module_federation_enabled` × `sales_rep_builtin_enabled`, incl. a customized theme lacking both keys — 1d U-1 CONTRADICTS): build-time only, no runtime override (3x). Not testable on a stand → a question for the author, not a verdict.
- **Install/version matrix** (old module + new theme, old XFrontend): needs other stands; vcst satisfies all floors.
- **Packaging** (`plugins/vc-frontend/` at module root, `BuildStorefrontPlugin` ran): inferred true from vcst serving the plugin; CI log not checked.
- **Cache after redeploy** (gap-AC-15): not reproducible without a redeploy.
- **AC-1.e Tasks link absent when TaskManagement is not installed**: vcst has it installed; not removable on a shared stand.
- **Personal (no-org) buyer** for AC-2.c: FIXTURE-GAP; probe with `{{USER_EMAIL}}` only if it resolves.

## Artifact A phase 2a — corpus disposition (persisted for the 3-cases gate)
- Scan: `npm run tc:scope -- --domain sales-rep --observable "Sales Rep Hub" --observable "My Sales Reps" --observable "My customers" --observable "sales-rep" --observable "Corporate menu" --observable "documents" --observable "tasks" --oracle BL-SR-001 --changed-files client-app/modules/sales-rep/index.ts,client-app/modules/sales-rep/routes.ts,client-app/config/settings_data.json` → 14 suites, 615 rows, **391 hits** (387 WILL_RUN, 4 NOT_EXECUTING). Unscannable: 063 (legacy 11-col header; in scope only via path token `settings`). unmatchedObservables: none.
- Dispositions: **390 CONFIRMED · 0 REPAIR · 0 RE-BASE · 1 SUPERSEDED-proposal**. Per suite (hits → CONFIRMED): 050m 155 · 050m2 1 · 064b 1 · 073b 12 · 092 13 · 092b 43 · 089 55 (54 + 1 proposal) · 090 22 · 091 10 · 093 42 · 097 8 · 106 29. Why they hold: no row asserts "My Sales Reps", a built-in chunk/`/assets/` path, or a Calendar nav label; "Last order" rows assert format only; no-raw-key rows (SR-FE-028, SR-CP-016, SR-CP-056, SR-HD-099, SR-FE-MSR-016) stay correct and would go red on 3x B1.
- NOT_EXECUTING (all Deprecated before this run): 050m SR-GQL-029 (statuses[] arg removed), SR-GQL-038, SR-GQL-053 (API-unreachable) — API-only, unchanged by this ticket; 089 SR-FE-030 — see proposal.
- **Proposal (human, TRI-006) — 089 SR-FE-030:** its "architecturally unreachable" premise is disproved (TCA-2026-09-04 / VCST-5494 and 3x: `@td(SALES_REP_NOCUSTOMERS)` sees "No customers found"); keep it Deprecated as superseded by **SR-FE-013**, which this run amended (+1 `{OBSERVED}` empty-state assertion, no expected value changed). Also: `aliases.json` `SALES_REP_NOCUSTOMERS._notes` is stale (→ test-data-engineer).
- C1 `--ids` carries **no REPAIR or RE-BASE ids** (none exist): exactly 093 SR-HD-100..115 + 089 SR-FE-013.
