# VCST-6157 — FAIL
Significant bugs: 2 in scope, 0 outside — the Tasks page Customers and Priorities filters were tested on vcst with SalesRep 3.1018.0-pr-33-04e4 and TaskManagement 3.1007.0-pr-33-14ff (vc-frontend#2482 not deployed, out of scope), and the verdict is BLOCKED because 58 files were written outside the run's write zones, while the results themselves would be FAIL on a High bug (the new Customer column is unreadable at 1280 px). budget: 188.95M of 386.20M (48.9%) · 83.2 of 92.4 min wall (default)

> **Verdict changed to FAIL by the operator (Elena Mutykova, 2026-11-05).** The write-zone check had flagged 58 files: 42 were this run's own scenario helper scripts and 16 belonged to a concurrent qa-autofix session. Neither is a product issue, so the verdict follows the results: two Medium bugs, VCST-6701 and VCST-6702.

| AC | Result | Evidence |
|---|---|---|
| AC-1 Customer column after Priority, em dash, two-line wrap | FAIL | VIS-1 High (B-1); C-1 API half PASS, layout half BLOCKED — needs a look · screenshots/vis-task-with-customer-1280b.png |
| AC-2 Customers filter returns exactly the picked served customers' tasks | PASS | C-2, C-3, SC-4.1, SC-5.1 (API); picker UI half C-9 BLOCKED — needs a look |
| AC-3 Priority column dots and labels, none reads Medium | PASS | VIS-6 colours match; C-5 API half PASS, dot rendering BLOCKED — needs a look |
| AC-4 Priorities filter, any case, bad name fails closed | PASS | C-6, C-7, SC-3.1 to SC-3.5, SC-10.1 to SC-10.6; 768 px layout FAIL Medium VIS-2 (B-2) |
| AC-5 Every task of a customer found by that customer's filter | FAIL | C-4 PASS (API); VIS-1 High at 1280 px (B-1); SC-12.8 Low |
| AC-6 Five priority names and labels | PASS | C-7, SC-12.4; VIS-2 at 768 px (B-2); C-5 BLOCKED — needs a look |
| AC-7 Multi-select with search, chips, Reset keeps search term | BLOCKED — needs a look | C-9, C-10; VIS-6 PASS; VIS-3, VIS-5 Low |
| AC-8 New/Edit task popup Customer select, every type, edit keeps link | PASS | C-12, SC-1.3, SC-11.1, SC-12.5; UI half C-11 BLOCKED — needs a look; SC-8.1 open PO question |

## Bugs
- High B-1 Customer column cut to ~64 px at 1280 px (fixed-layout table, 2-line clamp): every customer reads "AGENT-TEST-…", AcmeCorp and AcmeWest look the same (BL-UI-004, AC-1, AC-5) — reports/tickets/Sprint26-22/VCST-6157/vcst/investigations/VIS-1/ (not filed). Package gap: its evidence-index.md cites source/findings.md, absent (the write was refused); the content is in root-cause.md. Triage kept it for human review as REAL_BUG, severity written Low in its text but High in its table, against the lane's High: confirm the grade
- Medium B-2 At 768 px the Customers, Status and Priorities filters do not wrap: Priorities is cut at 860 px against a 753 px viewport and the page scrolls sideways (BL-UI-004, AC-4, AC-6) — reports/tickets/Sprint26-22/VCST-6157/vcst/investigations/VIS-2/ (not filed)
- Not counted as a bug: SC-8.1 FAIL Medium — a stale second Edit popup silently clears a customer the first popup set. Triage: KNOWN_ISSUE, current behaviour per KB-EA1CB4BF, PO question, not filed

## Noticed
- VIS-3 Customers search is typed into the select trigger and the list shows 4 of 5 options (design drift, advisory) — /company/tasks, 1280 px
- VIS-4 New task popup differs from the frame in labels, Type, Time, Priority default, counter, footer — mostly predates the PR — New task popup
- VIS-5 Trigger reads "1 items selected"; mobile card shows Customer unlabelled, no dash — /company/tasks, 375 px (ticket comment F5)
- SC-12.7 REST search `priority: High` with `priorities: []` returns all priorities; `priorities: [Low]` overrides `priority` — POST /api/task-management/search (PO question)
- SC-12.8 Default "Due today" chip stays on a customer pick, so the list says "0 tasks" while the calendar dots show that customer's tasks — /company/tasks (PO question)
- SC-7.4 A locked customer's tasks stay in the unfiltered list but vanish from the Customers filter — salesRepTasks, not a leak

## Not tested, and why
- vc-frontend#2482 (VCST-5923) — not deployed, out of scope by operator decision 2026-11-05; wishlist sharing picker, billing details, ui-kit select/load-more, org menus untested — residual risk High, owned by VCST-5923
- C-1, C-5, C-9, C-10, C-11 — BLOCKED, needs a look (U65: no ui-checks lane); the visual lane covered most; still unobserved: desktop subline without customer, Highest/Lowest dots, Reset keeping the search term, Customer select for non-Call types in the browser — residual risk Medium
- SC-2.3 (R6) — stand database is SqlServer, case-insensitive; the PostgreSQL case-sensitivity half is untestable here — residual risk Medium
- SC-9.6 (R7) — no filter rule on vcst restricts priorities or linked type; the replace-instead-of-narrow path is unreachable — residual risk Medium
- PIX-1 (R12) — BLOCKED, no checkout of vc-module-sales-rep for the pixel lane; rule chips, customer orders, task action unchecked — residual risk Medium
- C-17 (R5 across instances) — BLOCKED, no instance marker; SC-3.5 and SC-2.2 saw 4 ingress routes and passed — residual risk Low
- Not run, steps of S-12: sharing dialog picker (opened only), Due today time-zone edge, paging over 20 tasks under a customer pick — residual risk Low
- Not selected at approval (change-map candidates): C-16 popup links a customer to a non-call task, score 8, Medium · C-23 TaskTypes unconfigured, 8, Low · C-8 several priorities/customers on the real database, 4, Medium · C-11 create/update with priority '3', 'Low, Normal', ' high ', 'nope', 4, Medium · C-13 REST priorities [] beside priority, 4, Medium (SC-12.7 found it) · C-14 REST linkedObjectType + linkedObjectIds, 4, Medium · C-15 admin app Priority filter, 4, Medium (SC-12.4 looked) · C-10 several hundred customers, 3, Low · C-17 dots vs list, 2, Low · C-21 picks over the debounce, 2, Low · C-9 does the filter narrow, 1, Low (entry check) · C-19 old ?filter= links, 1, Low
- Test model, Mind map, Coverage triage + regression, Verifier — SKIP in the strategy (no domain map; U7; no Critical risk) — residual risk Medium (88 cases of 111 suites at risk, listed in the strategy's Out of scope, follow-up /qa-regression)
- Case authoring — never in the run (D2); no row of TRACE.acsWithoutRow, every AC has a result row
- Also out: H-11 (1000-option customer list, more is VCST-6273), H-12 (prerelease pin is a release step), H-14/H-18 (admin app and REST callers) — residual risk Medium

## Suspicions
- S-1 (unserved org still found, or edit drops hidden link) — refuted (C-13, SC-1.1 to SC-1.4)
- S-2 (numeric/comma priority read as a name) — refuted (C-14, SC-10.2, SC-10.3) · S-5 (empty-string REST priority) — refuted (C-15)
- S-6 (stale search cache after write) — refuted (C-16, SC-3.1 to SC-3.5); its scale twin — not checked (C-17 BLOCKED)
- S-8 (filter silently ignored on the deployed pair) — refuted (C-18)

## Data
Created AGENT-TEST- entities (count not in the inputs) · removed: the agents of S-5, S-9, S-10 and ac-checks deleted their tasks; the rest are left, human cleanup by the AGENT-TEST-* prefix · settings: none changed (read only)

## Write zones
`write-zones.json` outside is non-empty (58 paths), which makes the run BLOCKED. Of them, 42 are this run's scenario agents' helper scripts and outputs under `reports/tickets/Sprint26-22/VCST-6157/vcst/scenarios/`; the other 16 belong to a concurrent scheduled qa-autofix run in the same checkout, not to this run.
- Run's own, in `scenarios/`: S-1.pass2.mjs, S-1.pass2.out, S-1.probe.mjs, S-1.run.mjs, S-1.run.out, S-10.run.mjs, S-11.read.mjs, S-11.setup.mjs, S-12.api.mjs, S-12.api4.mjs, S-12.api5.mjs, S-12.api6.mjs, S-12.lib.mjs, S-12.rest.mjs, S-12.setup.mjs, S-2.run.mjs, S-4.cont.mjs, S-4.run.mjs, S-4.run.out.json, S-6.cont1.mjs, S-6.cont1.out, S-6.cont2.mjs, S-6.cont3.mjs, S-6.cont3.out, S-6.run.mjs, S-6.run.out, S-8.api.mjs, S-8.setup.mjs, S-9.cleanup.mjs, S-9.introspect.mjs, S-9.introspect2.mjs, S-9.introspect3.mjs, S-9.introspect4.mjs, S-9.lib.mjs, S-9.probe.mjs, S-9.run.mjs, S-9.run.out.json, S-9.run2.mjs, S-9.setup1.mjs, S-9.setup2.mjs, S-9.setup3.mjs, S-9.state.json
- Concurrent qa-autofix, `reports/fixes/FIX-2026-11-05-1145/`: PR_BODY.md, harness/base-long-name-long-roles.html, harness/base-long-name.html, harness/fixed-long-name-long-roles.html, harness/fixed-long-name.html, harness/measurements.json, harness/src/gen.mjs, harness/src/members-render-harness.test.ts.txt, harness/src/serve.mjs
- Concurrent qa-autofix, other tickets: reports/tickets/Sprint26-22/VCST-5816/baseline/baseline.md, VCST-5938/baseline/baseline.md, VCST-6476/baseline/baseline.md, VCST-6215/vcst/verification-summary.json, reports/verify-queue/VCST-5816@vcst.json, VCST-5938@vcst.json, VCST-6476@vcst.json

## Context used
Strategy reports/tickets/Sprint26-22/VCST-6157/vcst/test-strategy.md · Round 1 · Model SKIP — no MODEL risk needing one (scenarios carry it) · Checklist reports/tickets/Sprint26-22/VCST-6157/vcst/testing-checklist.md · Domain map unresolved · Mind map SKIPPED: test model does not run, domain map unresolved · Exploratory ran as S-12 (19.4 min), no SBTM file · PRs vc-module-sales-rep#33, vc-module-task-management#33 (vc-frontend#2482 out of scope, not deployed)

## Cost
| Step | Input-equivalent | Share | Output | Active min |
|---|---|---|---|---|
| scenario:S-12 | 41.15M | 21.8% | 0.06M | 19.4 |
| visual | 29.65M | 15.7% | 0.03M | 10.3 |
| orchestrator | 28.39M | 15.0% | 0.05M | 23.5 |
| investigate | 14.50M | 7.7% | 0.05M | 10.2 |
| scenario:S-8 | 8.86M | 4.7% | 0.02M | 4.1 |
| ac-checks | 7.92M | 4.2% | 0.06M | 11.5 |
| scenario:S-11 | 7.84M | 4.1% | 0.01M | 3.4 |
| strategy | 7.28M | 3.9% | 0.04M | 7.6 |
| scenario:S-9 | 5.15M | 2.7% | 0.03M | 6 |
| scenario:S-6 | 4.66M | 2.5% | 0.03M | 5.6 |
| scenario:S-1 | 4.29M | 2.3% | 0.02M | 5.6 |
| scenario:S-2 | 4.28M | 2.3% | 0.02M | 4.3 |
| scenario:S-5 | 4.19M | 2.2% | 0.02M | 3.4 |
| scenario:S-3 | 3.69M | 2.0% | 0.02M | 4.7 |
| scenarios | 3.51M | 1.9% | 0.03M | 5.5 |
| scenario:S-4 | 3.41M | 1.8% | 0.02M | 3.5 |
| context | 3.16M | 1.7% | 0.06M | 7.5 |
| scenario:S-7 | 2.79M | 1.5% | 0.01M | 2.9 |
| scenario:S-10 | 1.57M | 0.8% | 0.01M | 2.3 |
| triage | 1.44M | 0.8% | 0.02M | 2.7 |
| checklist | 0.78M | 0.4% | 0.01M | 1.3 |
| change-map | 0.47M | 0.3% | 0.02M | 1.5 |
| **total** | 188.95M | 100% | 0.65M | 146.8 (wall 83.2) |

budget: 188.95M of 386.20M (48.9%) · 83.2 of 92.4 min wall (default)

- S-1 · class 2 · PASS · 0 significant bugs · 4.29M, 5.6 min
- S-2 · class 1 · BLOCKED (SC-2.3 PostgreSQL half) · 0 · 4.28M, 4.3 min
- S-3 · class 1 · PASS · 0 · 3.69M, 4.7 min
- S-4 · class 4 · PASS · 0 · 3.41M, 3.5 min
- S-5 · class 4 · PASS · 0 · 4.19M, 3.4 min
- S-6 · class 4 · PASS · 0 · 4.66M, 5.6 min
- S-7 · class 4 · PASS · 0 · 2.79M, 2.9 min
- S-8 · class 5 · FAIL Medium (PO question, not counted) · 0 · 8.86M, 4.1 min
- S-9 · class 6 · BLOCKED (SC-9.6 no restricting rule) · 0 · 5.15M, 6 min
- S-10 · class 3 · PASS · 0 · 1.57M, 2.3 min
- S-11 · class 2 · PASS · 0 · 7.84M, 3.4 min
- S-12 · class 3 · FAIL Low (SC-12.7, SC-12.8) · 0 · 41.15M, 19.4 min

Scenarios: proposed 24 (12 selected + 12 not selected + 0 rejected, none added at approval) · selected 12 · run 12
