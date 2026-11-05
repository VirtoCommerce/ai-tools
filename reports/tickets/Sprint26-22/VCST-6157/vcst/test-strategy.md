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
