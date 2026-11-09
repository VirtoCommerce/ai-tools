# Test strategy — VCST-6157

## Round 1 of 3 — 2026-11-05

Status: APPROVED (Elena Mutykova, 2026-11-05) · Depth label: standard (computed)
Blocked: no — F6's only line ("NOT DEPLOYED: VirtoCommerce/vc-frontend#2482 — vc-frontend@2.61.0-pr-2482-8d77-8d77fd56: vc-frontend 2.61.0-pr-2482-8d77-8d77fd56 not deployed (has 2.62.0-pr-2622-caac-caac275a)…") names a PR the operator put out of scope and left undeployed (operator decision, 2026-11-05); the run proceeds on the two in-scope PRs
Build: vc-module-sales-rep#33 @ 04e4def7 · vc-module-task-management#33 @ 4865c9ca · Stand: vcst · Deployed: NO → F6 (vc-frontend#2482 only, out of scope); vc-module-sales-rep#33 YES (SalesRep 3.1018.0-pr-33-04e4), vc-module-task-management#33 YES (TaskManagement 3.1007.0-pr-33-14ff) — deploy:pr --verify 2026-11-05, re-read from /api/platform/modules 2026-11-05 · Previous: none
Floors fired: F1 (priority High) · F2 (doubt: domain map unresolved) · F3 (rendering files: sales-rep-rule-chip.vue, sales-rep-rule-chips.vue, sales-rep-task-action.vue) · F4 (revenue-critical: payment — vc-frontend#2482's billing-details-section.vue; also customer-orders.vue in sales-rep#33) · F5 (159 cases in 111 suites at risk) · F6 (NOT DEPLOYED: vc-frontend#2482) · F8 (ui-kit files of vc-frontend#2482: vc-checkbox.vue, atoms/index.ts, vc-load-more.vue) · F10 (org context: SalesRep) · F11 (hidden behaviour: default-values) · F12 (zones: H-1 access; H-2, H-3, H-4, H-6 data) · not fired: F7 (type Story), F9 (the doubt rule — applied inside each floor above)
Change map: C:/Users/mutyk/My Projects/ai-tools/.vc-fix/vc-test/VCST-6157/vcst/change-map.json

**Mission.** Find out, for the Sales Rep Hub PO and the authors of vc-module-sales-rep#33 and vc-module-task-management#33, whether the Tasks page's new Customers and Priorities filters return exactly the tasks of the customers a rep serves — no leak across reps or organizations, no fail-open list, no customer link lost by the reworked task popup — on vcst with both PRs live.

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst; SalesRep 3.1018.0-pr-33-04e4 + TaskManagement 3.1007.0-pr-33-14ff live; admin REST usable (2FA off); lanes chrome, firefox, edge free; stand writable; reps, orgs, memberships, tasks created in each case. Settings read 2026-11-05 (admin REST): `TaskManagement.TaskTypes` null (default "Registration Review"), `TaskManagement.TaskNotificationsEnabled` null (default false), `SalesRep.Enabled` store B2B-store true, `SalesRep.Statistics.*CacheExpirationMinutes` 1 (default 5). The PRs add no setting; the status filter rules come from `salesRepTaskFilterRules` (upcoming / overdue / completed), their restrictions not in any input | P2, P3, P4 |
| Product elements | xAPI `salesRepTasks` + `customerIds`, `priorities` (SalesRepTasksQueryHandler, TryParsePriority shared with create/update); TaskManagement `WorkTaskSearchCriteria` LinkedObjectType / LinkedObjectIds / Priorities + search service; storefront plugin: Customer and Priority columns, Customers / Status / Priorities filters, chips, Reset, 300 ms debounce, popup Customer for every type, customer options 100 → 1000, status tabs and counts removed | — |
| Quality criteria | AC-1…AC-8; ticket comments 112497, 112594, 112596; PR #33 claims; kb KB-EA1CB4BF, KB-4E31D091, KB-81567D01, KB-7052E6CD; design frames (4 attached PNGs; Claude Design project not exported); no BL/ECL ids (no domain given) | P5 |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | A rep naming a customer id sees tasks of an organization they do not serve, or another rep's tasks; a non-rep buyer gets tasks by naming an org id | AC-2 · AC-5 · src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepTasksQueryHandler.cs:144 · floor:F10 | 3×5=15 | High |
| R2 | A task's customer link is lost after an ordinary edit in the popup — the task disappears from that customer's filter, or loses its link to an order | AC-8 · src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/components/sales-rep-task-modal.vue:321 · KB-EA1CB4BF (prior bug) | 4×3=12 | High |
| R3 | Two open edit popups on one task: the later save silently clears the customer the first one set | AC-8 · KB-EA1CB4BF | 2×3=6 | Medium |
| R4 | A priority filter with one bad, numeric or comma name returns every task or the wrong priority; create/update stop accepting a valid priority name | AC-4 · AC-6 · src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepTasksQueryHandler.cs:104 · src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepTaskHandlerBase.cs:32 · src/VirtoCommerce.TaskManagement.Data/Services/WorkTaskSearchService.cs:69 | 3×3=9 | Medium |
| R5 | After a task changes, or for a Priority-only search, the list shows an earlier search's answer | AC-4 · src/VirtoCommerce.TaskManagement.Core/Models/WorkTaskSearchCriteria.cs:29 (H-13) · comment 112596 F1 | 3×3=9 | Medium |
| R6 | A served customer's tasks are not found on the stand's database (letter case of the id, EF translation of the linked-record filter) | AC-5 · src/VirtoCommerce.TaskManagement.Data/Services/WorkTaskSearchService.cs:55 · src/VirtoCommerce.TaskManagement.Data/Services/WorkTaskSearchService.cs:62 | 3×3=9 | Medium |
| R7 | A status filter rule combined with the new filters widens past what the rule allows, or empties a list it should not | src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepTasksQueryHandler.cs:116 · src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepTasksQueryHandler.cs:139 · default-values sales-rep-tasks-page.vue:193 · floor:F11 | 3×3=9 | Medium |
| R8 | A rep cannot find all of one customer's tasks from the Tasks page (the status tabs and counts are gone; only customer-linked tasks filter) | AC-5 · AC-6 · hidden sales-rep-task-filters.vue:24 · floor:F2 | 3×3=9 | Medium |
| R9 | The list, the calendar dots, the dashboard widget and the overdue link disagree, or paging/debounce shows an earlier pick's answer | src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/pages/sales-rep-tasks-page.vue:225 · src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/pages/sales-rep-tasks-page.vue:184 · src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/composables/useSalesRepTasks.ts:96 | 3×3=9 | Medium |
| R10 | The Customer/Priority columns, the Customers/Priorities filters or the popup Customer select look or read other than the AC and frames | AC-1 · AC-2 · AC-3 · AC-7 · AC-8 · design frames | 3×2=6 | Medium |
| R11 | An existing caller of salesRepTasks breaks on the new arguments (schema change) | src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepTasksQuery.cs:43 · CI swagger-validation failing | 2×3=6 | Medium |
| R12 | Sales Rep pages beyond Tasks (rule chips on My customers / customer orders, task action, dashboard) render differently than before | F8 (placed on in-scope files) · sales-rep-rule-chips.vue · customer-orders.vue (F4) | 3×2=6 | Medium |

Project risks: P1 vc-frontend#2482 is not deployed on vcst (F6's line) → accepted: out of scope by operator decision 2026-11-05. · P2 the stand's database provider (SQL Server or PostgreSQL) is not in the inputs → read at entry from the admin System information; S-2 states which provider it ran on. · P3 the number of platform instances behind vcst is unknown → read at entry (admin System information / deployment config); with one, R5's cross-instance half is a named deviation. · P4 no domain map and no data model (no --domain) → accepted; every scenario creates its reps, orgs, memberships and tasks in the case. · P5 the Claude Design project is not exported locally → the visual lane uses the four attached frames as the DESIGN reference; accepted.
### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Model-based ✔: R1, R7, R8 are MODEL, carried by scenarios · Reactive ✔: F1/F2/F12 fired, {HYPOTHESIS} oracles on R3, R6, R8, R10 ·
Regression-averse ✔: F5 fired — under vc-test the cases at risk are listed in Out of scope (U7) · Process-compliant —: no external standard in scope (self-test F6 contrast is older than this ticket)
### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | MODEL, DT, EP — S-4, S-5, S-6, S-7 | PR #33 "customerIds fails closed" {DOC} · comment 112497 served customers only {SPEC} · KB-81567D01 {OBSERVED} | xAPI · GraphQL | api · scenario agents | high |
| R2 | FLOW, ST — S-1, S-11 | KB-4E31D091, KB-EA1CB4BF {OBSERVED} · comment 112594 "No customer saves fine" {SPEC} | xAPI + storefront | chrome · scenario agents (S-1 api, S-11 browser) | high |
| R3 | EXPLORE, ST — S-8 | {HYPOTHESIS}: whether a stale popup may clear a customer set meanwhile → PO question | storefront · Playwright | chrome · scenario agent | medium |
| R4 | EP, BVA — S-10; ac-checks AC-4 | PR #33 "priorities fails closed, any case" {DOC} · AC-4 {SPEC} | xAPI | api · scenario agent + ac-checks | medium |
| R5 | SCALE, ST — S-3 | task-management#33 "Priority-only searches as before" {DOC} · AC-4 {SPEC} | xAPI + REST | api · scenario agent | medium |
| R6 | EP, EXPLORE — S-2 | AC-5 {SPEC} for a served id · another letter case {HYPOTHESIS} → PO question | xAPI | api · scenario agent | medium |
| R7 | MODEL, DT — S-9 | comment 112594 "filters narrow what a rule leaves; nothing for another record type" {SPEC} | xAPI | api · scenario agent | medium |
| R8 | MODEL, EXPLORE — S-12 | AC-5, AC-6 {SPEC} · surface purpose {HYPOTHESIS} (domain map unresolved) | storefront · Playwright | firefox · scenario agent | medium |
| R9 | EXPLORE, ST — S-12 | PR #33 dots follow the filters, one request pair per burst, overdue link {DOC} · comment 112594 {SPEC} | storefront · Playwright | firefox · scenario agent | medium |
| R10 | EP, VISUAL:DESIGN,CONTENT, EXPLORE — ac-checks AC-1…AC-8 | AC-1…AC-8 {SPEC} · frames {SPEC} · AC-8 search vs frame {HYPOTHESIS} → PO question | storefront · Playwright | edge · vc-test:ui-ux-expert + ac-checks | medium |
| R11 | CONTRACT — contract refresh | PR #33 "both arguments optional, no breaking change" {DOC} | xAPI schema | api · contract refresh | medium |
| R12 | VISUAL:PIXEL | base build vs PR build {OBSERVED} | storefront · PIXEL engine | edge · vc-test:ui-ux-expert | medium |

### Scenarios
| S | Class | What it does | Bug it hunts | Why likely | Score | Proof | Writes |
|---|---|---|---|---|---|---|---|
| S-1 | 2 | A task linked to a served customer, the customer then unserved, the task edited, the customer served again | After the customer becomes unserved the filter still finds the task, or an edit through the popup (customer sent as none) drops the hidden link so the task is lost to the filter when the org is served again | prior-bug (KB-EA1CB4BF), new-door (H-1) · R2 | 20 | api | — |
| S-2 | 1 | customerIds in another letter case than the stored org id, on the stand's real database | The handler accepts the id case-insensitively but the database compares ObjectId case-sensitively (PostgreSQL), so the filter returns 0, or the first casing searched answers for the other through the search cache | untested (BuildQuery translation to SQL by the EF provider: the new tests run...), new-door (H-1) · R6 | 15 | api | — |
| S-3 | 1 | Search through one door, change the task through another, search again with the same criteria | The task search cache keeps an answer the write did not invalidate, or keys a Priority-only search without the computed Priorities, so a later search returns an earlier priority's result | state-in-memory (H-13) · R5 | 12 | api | — |
| S-4 | 4 | salesRepTasks customerIds with a served id mixed with an unserved org id and an unknown id | A mixed list returns the unserved org's tasks, or the unknown id falls through to the caller's unfiltered list, instead of only the served org's tasks | new-door (H-1) · R1 | 10 | api | — |
| S-5 | 4 | Two reps serve the same customer; each filters by it | The customer filter widens the responsible scope, so rep B finds rep A's tasks for a shared customer org | new-door (H-1) · R1 | 10 | api | — |
| S-6 | 4 | A buyer without Sales Rep access and a rep serving zero customers pass customerIds | A non-rep buyer, or a rep with no served orgs, gets tasks linked to an org by naming its id, or an error instead of an empty list | new-door (H-1) · R1 | 10 | api | — |
| S-7 | 4 | A rep's locked membership in one served org, then filter by that org | GetServedOrganizationIdsAsync still counts a locked membership, so the customer filter returns tasks of an org the rep no longer reads | new-door (H-1) · R1 | 10 | api | — |
| S-8 | 5 | Two open Edit task popups on one task: one sets a customer, the other changes the title | The later save sends its stale customer (none) and unlinks the customer the first save set, silently | prior-bug (KB-EA1CB4BF) · R3 | 8 | browser | — |
| S-9 | 6 | Each status filter rule combined with priorities, customers, period and keyword | A filter rule's own priority or linked-type restriction is replaced instead of narrowed, so the combination widens past what the rule allows, or a rule that links tasks to another record type returns tasks for a customer | new-door (H-2) · R7 | 8 | api | — |
| S-10 | 3 | salesRepTasks priorities with one bad name among good ones, numeric and comma shapes | An unrecognized or numeric priority falls through to the unfiltered list, or 'Low, Normal' is read as High | new-door (H-3) · R4 | 8 | api | — |
| S-11 | 2 | A task created earlier and linked to another kind of record, edited through the popup with 'No customer' | The popup now sends customer none for every type, and the replace-style update drops the task's link to an order or other record | prior-bug (KB-EA1CB4BF) · R2 | 8 | browser | — |
| S-12 | 3 | Free exploratory session over the Tasks page filters and the new task links | Charter: explore /company/tasks Customers and Priorities filters, chips and Reset, the Customer and Priority columns, the New/Edit task Customer select, and their neighbours (dashboard Tasks widget and overdue notice, customer page Schedule call, shopping-list sharing picker that now shares the 1000-customer list, admin app Tasks list) for access leaks across reps and orgs, data a filter or edit loses or mislinks, task state the list, dots and widget disagree on, and a broken rep path | exploratory (free) · R8, R9 | 0 | browser | — |

Shared store: none · Changed rows: none

### Artifacts
| Artifact | Decision |
|---|---|
| Scenarios | RUN — S-1…S-12 |
| Exploratory | RUN — S-12, the free class-3 scenario; ALONGSIDE; charter also covers R3, R10's AC-8 question and the F12 hotspots H-1, H-2, H-3, H-4, H-6 |
| Test model | SKIP — scenarios cover the MODEL risks |
| Mind map | SKIP — the test model does not run and the domain map is unresolved |
| Checklist | RUN (always) — AC-1…AC-8 in the background AC run |
| Visual lane | RUN (F3, F8) — instruments: DESIGN, CONTENT (R10), PIXEL (R12) |
| Contract refresh | RUN — salesRepTasks gains customerIds and priorities |
| Coverage triage + regression | SKIP — vc-test runs no regression (U7); the cases at risk are in Out of scope |
| Verifier | SKIP — no Critical risk |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |

### Data
Every scenario creates in the case (FIFTH RULE; no data model): reps with `sales-rep:access`, their orgs and memberships, a buyer without Sales Rep access, tasks of each of the five priorities, tasks linked to a customer and to an order; teardown deletes them. Stand settings above are read, never written.
Must differ: two reps serving one org (S-5) · a served, an unserved and an unknown org id in one list (S-4) · an org id in another letter case (S-2) · a task linked to a customer vs one linked to another record (S-11) · two priorities inside and one outside a rule's set (S-9) · Before redeploy: none

### Out of scope
- vc-frontend#2482 (VCST-5923) — not deployed, out of scope by operator decision 2026-11-05; its hotspots untested: client-app/ui-kit/composables/useSelectAll.ts:117, client-app/ui-kit/composables/useSelectAll.ts:101, client-app/ui-kit/composables/useSelect.ts:132, client-app/ui-kit/composables/useSelect.ts:76, client-app/ui-kit/components/atoms/load-more/vc-load-more.vue:93, client-app/ui-kit/components/atoms/load-more/vc-load-more.vue:102, client-app/modules/sales-rep/components/wishlist-customer-sharing.vue:193, client-app/shared/checkout/components/billing-details-section.vue:148, client-app/core-api/package.json:3, client-app/shared/layout/components/header/_internal/mobile-menu/menus/multi-organisation-menu.vue:15, client-app/shared/layout/components/header/_internal/top-header-organizations.vue:61, client-app/ui-kit/components/molecules/menu-item/vc-menu-item.vue:100 (H-19…H-30) — F4's payment signal, F8's token audit and its ui-kit PIXEL follow it out — residual risk High, owned by VCST-5923
- F5 cases at risk, not run (U7) — follow-up `/qa-regression <suites>`. From sales-rep#33 / task-management#33 (88 cases): 003, 005, 014, 014b, 014c, 017, 017b, 018, 019, 025, 026, 027, 027b, 049, 050a, 050b1, 050b2, 050b3, 050b4, 050b5, 050c, 050d, 050e, 050f, 050g, 050h, 050i, 050j, 050k, 050l, 050m, 050m2, 050m3, 050n, 050o, 059, 059b, 059m, 059p, 061b, 070, 072, 072c, 072e, 072f, 075b, 075c, 075d, 075f, 077, 077b, 078, 078c, 083c, 085, 086, 089, 090, 091, 091c, 092, 092b, 093, 093b, 095, 096, 097, 098, 100, 101, 106, 107, 109, 112, 117, 004, 034, 042, 055, 061, 081, 103 — residual risk Medium; from vc-frontend#2482 only (out of scope): 001, 011, 011b, 012, 013, 028, 029, 030, 038, 039, 040a, 040b, 040c, 041, 048c, 060b, 060c, 062, 063, 065, 069, 073, 073a, 073b, 083b, 083d, 083e, 087, 088 — residual risk with #2482
- src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/composables/useSalesRepCustomerOptions.ts:11 (H-11) — the 1000-option list is loaded once per page in the browser, single instance (read from the diff, change map H-11); more than 1000 customers is deferred to VCST-6273 (comment 112497) — residual risk Medium
- src/VirtoCommerce.SalesRep.Web/module.manifest:21 (H-12) — prerelease pin is a release step (merge blocker R1, comment 112594); the pair is verified live — residual risk Medium (a stable publish beside TaskManagement 3.1006 ignores the filters)
- src/VirtoCommerce.TaskManagement.Data/Services/WorkTaskSearchService.cs:67 (H-14) and src/VirtoCommerce.TaskManagement.Core/Models/WorkTaskSearchCriteria.cs:15 (H-18) — admin app / REST callers, see C-13, C-14, C-15 — residual risk Medium
- Not selected C-16 (popup links a customer to a non-call task, filter finds it) — score 8 — residual risk Medium
- Not selected C-23 (TaskManagement.TaskTypes unconfigured, New task with a customer) — score 8 — residual risk Low
- Not selected C-8 (one vs several priorities / customer ids on the real database) — score 4 — residual risk Medium
- Not selected C-11 (create/update with priority '3', 'Low, Normal', ' high ', 'nope') — score 4 — residual risk Medium
- Not selected C-13 (REST search: priorities [] beside priority 'High') — score 4 — residual risk Medium
- Not selected C-14 (REST search: linkedObjectType + linkedObjectIds, a task id as linked id) — score 4 — residual risk Medium
- Not selected C-15 (admin app Tasks Priority filter: value, cleared, empty string) — score 4 — residual risk Medium
- Not selected C-10 (several hundred customers in the filter and picker, SCALE) — score 3 — residual risk Low
- Not selected C-17 (calendar dots against the filtered list) — score 2 — residual risk Low (S-12 looks)
- Not selected C-21 (picks spaced just over the debounce on a slow network) — score 2 — residual risk Low
- Not selected C-9 (does the customer filter narrow at all) — score 1 — residual risk Low (entry check below)
- Not selected C-19 (old ?filter=overdue / completed / unknown links) — score 1 — residual risk Low
- Older findings named by the self-test (comment 112596: F1 search case + cache, F3–F6 focus/contrast) and the keyword case on PostgreSQL — not this ticket's change — residual risk Low
### Criteria
Entry: /api/platform/modules shows SalesRep 3.1018.0-pr-33-04e4 and TaskManagement 3.1007.0-pr-33-14ff · `npm run env:check` green · admin REST creates reps, orgs and memberships · one salesRepTasks call with a served customerId narrows the list (C-9's check) · P2, P3 read · Suspend (BLOCKED): a module version differs, the filters do not narrow at all, or the admin API cannot create the case data
Exit: every in-scope R has a result or a named deviation · S-12's box spent · the PO questions (R3 stale popup, R6 letter case, R10 AC-8 search) are recorded with their answer or as open

### Amendments
### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|
| R1 | S-4, S-5, S-6, S-7 · MODEL, DT, EP — S-4, S-5, S-6, S-7 · api | C-2, C-3, SC-4.1, SC-4.2, SC-4.3, SC-5.1, SC-5.2, SC-6.1, SC-6.2, SC-7.1, SC-7.2, SC-7.3, SC-7.4, SC-9.3, SC-12.1, SC-12.2, SC-12.6 | PASS | — |
| R2 | S-1, S-11 · FLOW, ST — S-1, S-11 · chrome | C-12, SC-1.1, SC-1.2, SC-1.3, SC-1.4, SC-11.1, SC-11.2, SC-12.5 | PASS | — |
| R3 | S-8 · EXPLORE, ST — S-8 · chrome | SC-8.1, SC-8.2 | FAIL Medium | — |
| R4 | S-10 · EP, BVA — S-10; ac-checks AC-4 · api | C-6, C-7, SC-10.1, SC-10.2, SC-10.3, SC-10.4, SC-10.5, SC-10.6, SC-12.4, SC-12.7 | FAIL Low | — |
| R5 | S-3 · SCALE, ST — S-3 · api | SC-3.1, SC-3.2, SC-3.3, SC-3.4, SC-3.5 | PASS | — |
| R6 | S-2 · EP, EXPLORE — S-2 · api | SC-2.1, SC-2.2, SC-2.3 | BLOCKED | stand database is SqlServer (P2); its default collation is case-insensitive, so the PostgreSQL case-sensitivity half is untestable here |
| R7 | S-9 · MODEL, DT — S-9 · api | C-8, SC-9.1, SC-9.2, SC-9.3, SC-9.4, SC-9.5, SC-9.6, SC-9.7 | BLOCKED | no rule on vcst restricts priorities or linked type (SC-9.1), so the replace-instead-of-narrow path in ApplyPriorities / ApplyCustomersAsync is not reachable here; the pure-intersection results of SC-9.2 to SC-9.5 are the part the stand can decide |
| R8 | S-12 · MODEL, EXPLORE — S-12 · firefox | C-4, SC-12.1, SC-12.2, SC-12.3, SC-12.4, SC-12.5, SC-12.6, SC-12.7, SC-12.8, SC-12.9 | FAIL Low | — |
| R9 | S-12 · EXPLORE, ST — S-12 · firefox | SC-12.1, SC-12.2, SC-12.3, SC-12.4, SC-12.5, SC-12.6, SC-12.7, SC-12.8, SC-12.9 | FAIL Low | — |
| R10 | EP, VISUAL:DESIGN,CONTENT, EXPLORE — ac-checks AC-1…AC-8 · edge | C-1, C-5, C-9, C-10, C-11, VIS-1, VIS-2, VIS-3, VIS-4, VIS-5, VIS-6 | FAIL High | needs a look (U65: no ui-checks lane); needs a look (U65: no ui-checks lane); needs a look (U65: no ui-checks lane); needs a look (U65: no ui-checks lane); needs a look (U65: no ui-checks lane) |
| R11 | CONTRACT — contract refresh · api | C-19 | PASS | — |
| R12 | VISUAL:PIXEL · edge | PIX-1 | BLOCKED | no checkout of VirtoCommerce/vc-module-sales-rep: capabilities pixel.checkouts holds vc-frontend checkouts only (never cloned by this run) |

Candidate cases (→ /qa-test-lifecycle): <filled at close-out> · Carried to Round 2 / escalation: <filled at close-out>

## Round 2 of 3 — 2026-11-05

Status: AUTO (round 2 refresh, U15) · Depth label: standard (computed)
Blocked: no — F6's only NOT DEPLOYED line ("NOT DEPLOYED: VirtoCommerce/vc-frontend#2482 — vc-frontend@2.61.0-pr-2482-8d77-8d77fd56: vc-frontend 2.61.0-pr-2482-8d77-8d77fd56 not deployed (has 2.62.0-pr-2638-4506-45068bb8)…") names a PR the operator keeps out of scope and undeployed (operator decision, 2026-11-05, as in Round 1); deploy.json's other blocker ("DEPLOYMENT UNKNOWN: VirtoCommerce/vc-module-sales-rep#42 — no CI artifact resolved for this PR") is resolved by the operator: #42 was merged into #33's branch and ships inside #33's build 3.1018.0-pr-33-8d4a, verified live (deploy:pr --verify, 2026-11-05)
Build: VirtoCommerce/vc-module-sales-rep#42 @ 5438d6879409225ac568a048494d5573656ea68a · VirtoCommerce/vc-module-sales-rep#33 @ 8d4a30bd793137b25b641e4d664f9b7a1aa32060 · VirtoCommerce/vc-module-task-management#33 @ 4865c9caaa116b67841f6ac94434cad2fd96bf70 · VirtoCommerce/vc-frontend#2482 @ 8d77fd563a4efcbde198b5870bf60cd4a6da62e7 · Stand: vcst · Deployed: NO → F6 (vc-frontend#2482 only, out of scope); vc-module-sales-rep#33 YES (SalesRep 3.1018.0-pr-33-8d4a, head 8d4a30b); vc-module-sales-rep#42 UNKNOWN in deploy.json → YES inside #33's build (its commits 4880418, 5438d68 are in 8d4a30b; operator, deploy:pr --verify 2026-11-05); vc-module-task-management#33 YES (TaskManagement 3.1007.0-pr-33-14ff, unchanged) · Previous: Round 1 FAIL (operator, 2026-11-05: the write-zone BLOCKED flag dismissed), vc-module-sales-rep#33 @ 04e4def7, vc-module-task-management#33 @ 4865c9ca
Floors fired: F1 (priority High) · F2 (doubt: domain map unresolved) · F3 (rendering files: sales-rep-rule-chip.vue, sales-rep-rule-chips.vue, sales-rep-task-action.vue) · F4 (revenue-critical: payment — vc-frontend#2482's checkout files) · F5 (159 cases in 111 suites at risk) · F6 (NOT DEPLOYED: vc-frontend#2482) · F8 (ui-kit files of vc-frontend#2482: vc-checkbox.vue, atoms/index.ts, vc-load-more.vue) · F10 (org context: SalesRep) · F11 (hidden behaviour: default-values) · F12 (zones: H-1 access; H-2, H-3, H-4, H-6 data) · not fired: F7 (type Story), F9 (the doubt rule — applied inside each floor above)
Change map: .vc-fix/vc-test/VCST-6157/vcst/change-map.json

**Mission.** Find out, for the Sales Rep Hub PO and the author of the VCST-6701 / VCST-6702 fixes (vc-module-sales-rep#42, shipped in #33's build 3.1018.0-pr-33-8d4a), whether the Tasks page now shows customer names readably at 1280–1920 px and keeps the Customers, Status and Priorities filters on screen with no sideways scroll from 640 px up, and that nothing next to the two CSS changes broke — on vcst with that build live.

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst; SalesRep 3.1018.0-pr-33-8d4a (head 8d4a30b, includes #42) + TaskManagement 3.1007.0-pr-33-14ff live (deploy:pr --verify 2026-11-05); theme 2.62.0-pr-2638-4506 (not #2482); admin REST usable (2FA off); lanes chrome, firefox, edge free; stand writable; every scenario creates its reps, orgs, memberships, tasks. Settings: the diff since 04e4def7 reads or writes none (#42 hidden behaviour all "no"); Round 1's reads stand (2026-11-05: `TaskManagement.TaskTypes` null, `TaskManagement.TaskNotificationsEnabled` null, `SalesRep.Enabled` true on B2B-store, `SalesRep.Statistics.*CacheExpirationMinutes` 1). Status rules are code-defined: upcoming / overdue / completed with no priority or linked-type restriction (SalesRepTaskFilterRuleResolver at 8d4a30b). No channel to announce a settings window (window.mjs check exit 1) | P1, P2, P3, P4, P5 |
| Product elements | Since the last tested commit (sales-rep#33 04e4def7 → 8d4a30b, = #42 + a Sonar fix in a test helper): sales-rep-task-filters.vue — `sm:flex-wrap` on the filter row; sales-rep-task-list.vue — fixed table layout, `w-1/5` on the Customer column, new `sales-rep-task-list__customer-col` class; two jsdom layout tests + compiled-style.ts helper. No backend, GraphQL, REST, setting or locale change. task-management#33 unchanged; vc-frontend#2482 out of scope | — |
| Quality criteria | AC-1…AC-6 in this round's bundle numbering (AC field ×4 + description ×2; Round 1's AC-1…AC-8 came from the change map) · BL-UI-004 (content boundary, cited by both bugs) · PB-1 VCST-6701 and PB-2 VCST-6702 packages (investigations/VIS-1, VIS-2) · PR #42 claims (widths, the 1024–1279 px band "not yet checked on a deployed build") · operator: VCST-6701 trade-off accepted (Customer 1/5, Task/Notes ~48 px at 1280 px) · comment 112728's open PO questions · kb not available in this install (capabilities kb: false) — Round 1's KB ids carried | P6 |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R6 | A served customer's tasks are not found on the stand's database (letter case of the id, EF translation of the linked-record filter) | AC-5 · src/VirtoCommerce.TaskManagement.Data/Services/WorkTaskSearchService.cs:55 · src/VirtoCommerce.TaskManagement.Data/Services/WorkTaskSearchService.cs:62 · carried from Round 1 R6 | 3×3=9 | Medium |
| R7 | A status filter rule combined with the new filters widens past what the rule allows, or empties a list it should not | src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepTasksQueryHandler.cs:116 · src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepTasksQueryHandler.cs:139 · default-values sales-rep-tasks-page.vue:193 · floor:F11 · carried from Round 1 R7 | 3×3=9 | Medium |
| R12 | Sales Rep pages beyond Tasks (rule chips on My customers / customer orders, task action, dashboard) render differently than before | F8 (placed on in-scope files) · sales-rep-rule-chips.vue · customer-orders.vue (F4) · carried from Round 1 R12 | 3×2=6 | Medium |
| R13 | Customer column cut to ~64 px of text at 1280 px: every customer reads "AGENT-TEST-…" and similar names are indistinguishable (BL-UI-004, AC-1, AC-5) is fixed, and nothing next to it broke | VCST-6701 | — | High |
| R14 | At 768 px the Customers, Status and Priorities filters do not wrap: Priorities is cut off and the page scrolls sideways (BL-UI-004, AC-4, AC-6) is fixed, and nothing next to it broke | VCST-6702 | — | Medium |
| R15 | Between 1024 and 1279 px (a laptop, account sidebar open) the three filters wrap beside the search box so it is crushed, the list drops below the fold or the page scrolls sideways — a rep cannot pick a customer and read that customer's tasks on one screen | AC-2 · AC-4 · AC-5 · src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/components/sales-rep-task-filters.vue:101 · PR #42 untested band · floor:F2 | 3×3=9 | Medium |
| R16 | On the rebuilt package a rep naming a customer they do not serve, another rep's customer or an unknown id gets that customer's tasks, or a buyer without Sales Rep access gets tasks by naming an org id | AC-2 · src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepTasksQueryHandler.cs:144 · new build 3.1018.0-pr-33-8d4a · floor:F10 | 1×5=5 | Medium |
| R17 | At 1280 px a long task title or note, now cut to ~48 px of text, cannot be read anywhere (no tooltip, cut in the edit popup too), the Priority column is squeezed, or the Customer header and its cells take different widths | AC-1 · AC-3 · src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/components/sales-rep-task-list.vue:157 · src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/components/sales-rep-task-list.vue:67 · VCST-6701 fix (PR #42) | 3×2=6 | Medium |

Project risks: P1 vc-frontend#2482 is not deployed on vcst (F6's line) → accepted: out of scope by operator decision 2026-11-05. · P2 vc-module-sales-rep#42 has no CI artifact of its own (deploy.json UNKNOWN) → mitigated: it ships inside #33's build 3.1018.0-pr-33-8d4a (operator, deploy:pr --verify 2026-11-05); the entry check re-reads /api/platform/modules and the served plugin bundle. · P3 no PostgreSQL stand is available to this run (vcst runs SqlServer, read in Round 1) → accepted: R6's open half stays residual (Criteria). · P4 capabilities.json lists no vc-module-sales-rep checkout for the PIXEL engine (one now sits in .fix-workspace at 8d4a30b, never probed) → re-probe capabilities before the visual lane; none ⇒ R12 is BLOCKED and named again. · P5 no team channel to announce a settings window → accepted: no scenario writes a global setting. · P6 no domain map (no --domain) and no kb in this install → accepted; every scenario creates its data in the case.

### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔: ACs, the operator's decisions, comment 112728's PO questions · Model-based ✔: R7, R15, R16 are MODEL, carried by scenarios S-6, S-3, S-5 · Reactive ✔: F1/F2/F12 fired, {HYPOTHESIS} oracles on R6 and R15's purpose half; S-7 explores ·
Regression-averse ✔: F5 fired — under vc-test the cases at risk are listed in Out of scope (U7); PB-1 and PB-2 re-run from their packages · Process-compliant —: no external standard in scope (BL-UI-004 is an internal invariant)

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R6 | EP, EXPLORE — S-2 | AC-5 {SPEC} for a served id · another letter case {HYPOTHESIS} → PO question | xAPI | api · scenario agent | medium |
| R7 | MODEL, DT — S-9 | comment 112594 "filters narrow what a rule leaves; nothing for another record type" {SPEC} | xAPI | api · scenario agent | medium |
| R12 | VISUAL:PIXEL | base build vs PR build {OBSERVED} | storefront · PIXEL engine | edge · vc-test:ui-ux-expert | medium |
| R13 | FLOW · REGRESSION | VCST-6701's expected result {OBSERVED} | the package's layer · Playwright | chrome · qa-frontend-expert | medium |
| R14 | FLOW · REGRESSION | VCST-6702's expected result {OBSERVED} | the package's layer · Playwright | chrome · qa-frontend-expert | medium |
| R15 | MODEL, BVA, EXPLORE — S-3 | PR #42 "between 1024 and 1279 px the filter row may wrap to two or three lines beside the search box instead of squeezing it" {DOC} · no sideways page scroll, every select whole: BL-UI-004 {BL} · the page's purpose (domain map unresolved) {HYPOTHESIS} → charter | storefront · Playwright | firefox · scenario agent | medium |
| R16 | MODEL, DT — S-5 | PR #33 "customerIds fails closed: a customer the caller does not serve matches nothing" {DOC} · Round 1 S-4/S-6 on 04e4 {OBSERVED} | xAPI · GraphQL | api · scenario agent | medium |
| R17 | FLOW, EP — S-4 | PR #42 "titles still show in full in their tooltip and the edit popup" {DOC} · operator-accepted widths, Customer 1/5 and Task/Notes ~48 px at 1280 px {SPEC} · BL-UI-004 {BL} | storefront · Playwright | chrome · scenario agent | medium |

### Scenarios
| S | Class | What it does | Bug it hunts | Why likely | Score | Proof | Writes |
|---|---|---|---|---|---|---|---|
| S-1 | 1 | PB-1 re-run on the 8d4a build: Tasks page at 1280, 1366, 1440 and 1920 px with long, look-alike customer names (two AGENT-TEST- orgs sharing their first 20 characters) | The `w-1/5` width does not reach the body cells (the column component drops the new class), or the two-line clamp still cuts look-alike names at 1280 px, so customers stay indistinguishable | sales-rep-task-list.vue:157 and :67 changed, verified only in jsdom with widths measured on a stand · R13 | — | browser | — |
| S-2 | 1 | PB-2 re-run: Tasks page at 640, 678, 768 and 898 px, with and without the account sidebar, all three selects showing "N items selected", in English and in the store's longest-label language (de when the store offers it) | The filter row still overflows when a label is longer than the English one the fix was measured with, so Priorities is cut and the page scrolls sideways | sales-rep-task-filters.vue:101 `sm:flex-wrap`, widths measured in English only · R14 | — | browser | — |
| S-3 | 1 | Tasks page at 1024, 1100, 1200 and 1279 px with the sidebar: pick customers, a status and priorities, type a search term, read the list | The wrapped selects crush the search box, push the list below the fold or scroll the page sideways, so a rep cannot filter and read one customer's tasks on a laptop screen | sales-rep-task-filters.vue:101, the 1024–1279 px band the PR says was never checked on a deployed build · R15 | — | browser | — |
| S-4 | 1 | Tasks with long titles, long notes and each of the five priorities at 1280 px: hover the cut cells, open the edit popup, compare header and cell widths | With Task and Notes cut to ~48 px of text the title shows neither in a tooltip nor in full in the popup, the Priority label is cut, or Customer header and cells misalign | sales-rep-task-list.vue:157 shrank Task and Notes (width accepted, the tooltip claim untested) · R17 | — | browser | — |
| S-5 | 4 | On SalesRep 3.1018.0-pr-33-8d4a: rep A passes customerIds with a served org, rep B's org and an unknown id; rep B with zero served orgs and a buyer without Sales Rep access pass A's org | The rebuilt package lost the fail-closed path, so a mixed list returns rep B's customer's tasks, or a rep with no customers or a non-rep gets tasks by naming an org id | a new package build of the same handler (SalesRepTasksQueryHandler.cs:144), live since 2026-11-05 · R16 | — | api | — |
| S-6 | 6 | Each stock status rule (upcoming, overdue, completed) combined with priorities, customerIds, period and keyword on the 8d4a build | A combination widens past what the rule allows, or empties a list the rule and the filters both leave non-empty | the rules are code-defined with no restriction, so the intersection is the only path a stand reaches; Round 1 decided it on 04e4 only · R7 | — | api | — |
| S-7 | 3 | Free exploratory session over the rebuilt Tasks page and its neighbours | Charter: explore /company/tasks on the 8d4a build while resizing between 390 and 1920 px with filters open and chips applied — filter and chip wrap, Reset, the Customer, Priority, Task and Notes columns, the New/Edit task Customer select, the mobile card, the dashboard Tasks widget and overdue link, the customer orders rule chips — for layouts the two CSS changes broke elsewhere, text cut with no way to read it, a sideways scroll, and the open PO question on the Due today chip | exploratory (free) · R15, R17 | — | browser | — |

Shared store: none
Changed rows: S-1 added, S-2 added, S-3 added, S-4 added, S-5 added, S-6 added, S-7 added
R6's and R7's approach cells (written by `append`) carry Round 1's scenario ids S-2 and S-9; in this round R7 is hunted by S-6 and R6 has no scenario (named deviation under Criteria).

### Prior bugs
| PB | Bug | Severity | Found | Reproduction | R |
|---|---|---|---|---|---|
| PB-1 | VCST-6701 — Customer column cut to ~64 px of text at 1280 px: every customer reads "AGENT-TEST-…" and similar names are indistinguishable (BL-UI-004, AC-1, AC-5) | High | Round 1 | package reports/tickets/Sprint26-22/VCST-6157/vcst/investigations/VIS-1 | R13 |
| PB-2 | VCST-6702 — At 768 px the Customers, Status and Priorities filters do not wrap: Priorities is cut off and the page scrolls sideways (BL-UI-004, AC-4, AC-6) | Medium | Round 1 | package reports/tickets/Sprint26-22/VCST-6157/vcst/investigations/VIS-2 | R14 |

### Artifacts
| Artifact | Decision |
|---|---|
| Scenarios | RUN — S-1…S-7 |
| Exploratory | RUN — S-7, the free class-3 scenario; ALONGSIDE; charter also covers R15's purpose question and the F12 hotspots H-1, H-2, H-3, H-4, H-6 on the rebuilt package |
| Test model | SKIP — scenarios cover the MODEL risks |
| Mind map | SKIP — the test model does not run and the domain map is unresolved |
| Checklist | RUN (always) — AC-1…AC-8 in the background AC run |
| Visual lane | RUN (F3, F8) — instruments: DESIGN, CONTENT (R10), PIXEL (R12) |
| Contract refresh | RUN — salesRepTasks gains customerIds and priorities |
| Coverage triage + regression | SKIP — vc-test runs no regression (U7); the cases at risk are in Out of scope |
| Verifier | SKIP — no Critical risk |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |
| Prior bugs | RUN — 2 bugs |

### Data
Every scenario creates in the case (FIFTH RULE; no data model): a rep with `sales-rep:access` serving two orgs with long, look-alike AGENT-TEST- names, tasks of each of the five priorities with long titles and notes linked to them (S-1–S-4, S-7); a second rep, a rep with zero served orgs and a buyer without Sales Rep access (S-5); tasks spread over past, today and future due dates and one completed (S-6); teardown deletes them. Stand settings are read, never written. PB-1/PB-2 reproduce from their packages' steps on fresh data, never on Round 1's leftover AGENT-TEST- records.
Must differ: two customer names identical in their first 20 characters (S-1) · a title and a note longer than the 1280 px cell (S-4) · "N items selected" on all three selects at once, and a label language longer than English (S-2, S-3) · a served org, another rep's org and an unknown id in one list (S-5) · two priorities inside and one outside the picked set under each rule (S-6) · Before redeploy: none

### Out of scope
- vc-frontend#2482 (VCST-5923) — not deployed, out of scope by operator decision 2026-11-05 (as in Round 1); its hotspots untested: client-app/core-api/package.json:3, client-app/ui-kit/components/molecules/select/vc-select.vue:40, client-app/ui-kit/composables/useSelect.ts:148, client-app/modules/sales-rep/components/wishlist-customer-sharing.vue:198, client-app/shared/checkout/components/shipping-details-section.vue:271, client-app/ui-kit/components/atoms/load-more/vc-load-more.vue:107, client-app/ui-kit/composables/useSelectAll.ts:102, client-app/ui-kit/components/atoms/scrollbar/vc-scrollbar.vue:225, client-app/ui-kit/components/atoms/scrollbar/vc-scrollbar.vue:140, client-app/shared/layout/components/header/_internal/top-header-organizations.vue:63, client-app/shared/layout/components/header/_internal/top-header-organizations.vue:61, client-app/ui-kit/components/atoms/checkbox/vc-checkbox.vue:192 — F4's payment signal, F8's token audit and its ui-kit PIXEL follow it out — residual risk High, owned by VCST-5923
- vc-module-task-management#33 — unchanged since Round 1 (4865c9ca); Round 1's results are the baseline, not re-run: src/VirtoCommerce.TaskManagement.Core/Models/WorkTaskSearchCriteria.cs:29 (H-13, PASS), src/VirtoCommerce.TaskManagement.Data/Services/WorkTaskSearchService.cs:69 (priorities, SC-12.7 open PO question), src/VirtoCommerce.TaskManagement.Data/Services/WorkTaskSearchService.cs:67 (H-14) and src/VirtoCommerce.TaskManagement.Core/Models/WorkTaskSearchCriteria.cs:15 (H-18), the admin app and REST callers — residual risk Medium
- Single instance: H-13 (task search cache, WorkTaskSearchCriteria.cs:29) and H-11 (1000-option customer list, useSalesRepCustomerOptions.ts:11, loaded once per page in the browser) — neither changed since Round 1; the cross-instance half was BLOCKED there (no instance marker) and is not re-run; more than 1000 customers is VCST-6273 — residual risk Low
- AC-6 (New task popup Customer select, single value with search) and Round 1's PASS areas (access, popup customer link, priorities parse, search cache, contract) — no code under them changed since 04e4def7 (the delta is two CSS changes and tests); S-5 re-checks access on the rebuilt package, S-7 glances at the popup — residual risk Low
- Known residual, not fixed (operator, 2026-11-05): the search box gets ~97 px at 1024 px — not re-filed; S-3 fails only on what that residual does not already name — residual risk Medium
- The 390 px phone layout — Round 1 observed it (no sideways scroll, filters stack, popup fits, customer in full on the card) and the mobile layout is unchanged; S-7 glances only — residual risk Low
- R6's open half: the PostgreSQL case-sensitive ObjectId compare (WorkTaskSearchService.cs:55, :62) needs a PostgreSQL stand; vcst is SqlServer (P3) — residual risk Medium
- Comment 112728's open PO questions — two Edit popups clearing a customer (SC-8.1), the Due today chip kept on a customer pick (SC-12.8), REST `priorities` overriding `priority` (SC-12.7); the narrow-column question is answered by the operator's VCST-6701 trade-off — awaiting the PO, not re-run — residual risk Medium
- Out-of-scope bugs of earlier rounds: none (delta outOfScope empty)
- F5 cases at risk, not run (U7) — follow-up `/qa-regression <suites>`. From sales-rep#33 / task-management#33: 003, 005, 014, 014b, 014c, 017, 017b, 018, 019, 025, 026, 027, 027b, 049, 050a, 050b1, 050b2, 050b3, 050b4, 050b5, 050c, 050d, 050e, 050f, 050g, 050h, 050i, 050j, 050k, 050l, 050m, 050m2, 050m3, 050n, 050o, 059, 059b, 059m, 059p, 061b, 070, 072, 072c, 072e, 072f, 075b, 075c, 075d, 075f, 077, 077b, 078, 078c, 083c, 085, 086, 089, 090, 091, 091c, 092, 092b, 093, 093b, 095, 096, 097, 098, 100, 101, 106, 107, 109, 112, 117, 004, 034, 042, 055, 061, 081, 103 — residual risk Medium (the delta touches only the Tasks page layout); from vc-frontend#2482 only (out of scope): 001, 011, 011b, 012, 013, 028, 029, 030, 038, 039, 040a, 040b, 040c, 041, 048c, 060b, 060c, 062, 063, 065, 069, 073, 073a, 073b, 083b, 083d, 083e, 087, 088 — residual risk with #2482

### Criteria
Entry: /api/platform/modules shows SalesRep 3.1018.0-pr-33-8d4a and TaskManagement 3.1007.0-pr-33-14ff · the Tasks page serves the 8d4a plugin bundle (the Customer column carries `sales-rep-task-list__customer-col`) · `npm run env:check` green · admin REST creates reps, orgs, memberships and tasks · P4's re-probe done before the visual lane · Suspend (BLOCKED): a module version differs, the page still serves the 04e4 bundle, or the admin API cannot create the case data
Exit: every in-scope R has a result or a named deviation — R6 named up front (its open half needs a PostgreSQL stand, P3), R12 BLOCKED and named if P4 finds no sales-rep checkout · PB-1 and PB-2 each PASS or FAIL against their package's expected result at S-1's and S-2's widths · S-7's box spent · each open PO question recorded with its answer or as open

### Amendments

### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|
| R6 | EP, EXPLORE — S-2 · api | C-24, C-25 | PASS | — |
| R7 | S-6 · MODEL, DT — S-9 · api | C-26, C-27, SC-6.1, SC-6.2, SC-6.3, SC-6.4, SC-6.5, SC-6.6, SC-6.7 | BLOCKED | no rule on vcst restricts priorities or linked type (SC-6.1: each rule's answer holds tasks of High, Normal, Low, Lowest, Highest and the CustomerOrder-linked O1/O2), so the replace-instead-of-narrow path is not reachable on this build; the pure-intersection half is decided by SC-6.2 to SC-6.5 |
| R12 | VISUAL:PIXEL · edge | PIX-1, SC-7.6, SC-7.8 | BLOCKED | PIX-1: SKIP — operator decision 2026-11-05: Storybook pixel comparison skipped for this round |
| R13 | S-1 · FLOW · REGRESSION · chrome | PB-1, VIS-1, SC-1.1, SC-1.2, SC-1.3, SC-1.4, SC-1.5 | FAIL High | — |
| R14 | S-2 · FLOW · REGRESSION · chrome | PB-2, VIS-2, VIS-5, SC-2.1, SC-2.2, SC-2.3, SC-2.4, SC-2.5, SC-2.6 | FAIL Low | — |
| R15 | S-3, S-7 · MODEL, BVA, EXPLORE — S-3 · firefox | C-28, C-29, C-30, VIS-3, SC-3.1, SC-3.2, SC-3.3, SC-3.4, SC-3.5, SC-3.6, SC-3.7, SC-3.8, SC-7.1, SC-7.2, SC-7.3, SC-7.4, SC-7.5, SC-7.6, SC-7.7, SC-7.8, SC-7.9 | FAIL Low | needs a look (U65: no ui-checks lane); needs a look (U65: no ui-checks lane); needs a look (U65: no ui-checks lane) |
| R16 | S-5 · MODEL, DT — S-5 · api | C-31, C-32, C-33, SC-5.1, SC-5.2, SC-5.3, SC-5.4, SC-6.3 | PASS | — |
| R17 | S-4, S-7 · FLOW, EP — S-4 · chrome | C-34, C-35, C-36, VIS-4, SC-1.4, SC-4.1, SC-4.2, SC-4.3, SC-4.4, SC-4.5, SC-4.6, SC-7.1, SC-7.2, SC-7.3, SC-7.4, SC-7.5, SC-7.6, SC-7.7, SC-7.8, SC-7.9 | FAIL Low | needs a look (U65: no ui-checks lane); needs a look (U65: no ui-checks lane); needs a look (U65: no ui-checks lane) |
