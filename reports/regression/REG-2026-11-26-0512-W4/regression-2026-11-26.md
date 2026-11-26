# Regression REG-2026-11-26-0512-W4 — Sprint 26-23 W4 Sales Rep hub

Env vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · shared accounts (no persona set) · `seed:sales-rep` + `seed:sales-rep-call` before the run · `--no-promote` · triage deferred to the owner.

## Frontend Suites
| Suite | Pass | Fail | Blocked | Skipped | Ambiguous |
|---|---|---|---|---|---|
| 089 My Customers | 58 | 2 | 10 | 1 | 5 |
| 091 Customer Profile | 60 | 1 | 10 | 2 | 0 |
| 093 Hub Dashboard | 58 | 0 | 19 | 1 | 2 |
| 093b Hub Dashboard (2) | 6 | 0 | 10 | 0 | 0 |
| 116 Reports | 14 | 2 | 13 | 0 | 1 |
| **Total (275)** | **196** | **5** | **62** | **5** | **8** |

Runners exhausted their budget after ~11 cases; the unexecuted rows were re-dispatched in chunks of ~20 and merged by hand. Hub + plugin loaded on every lane (W0's chunk 404, KB-4358B2EC, did not reproduce).

## Bugs found (preliminary, for triage)
- No clear product defect. SR-RPT-012 — current-month AOV bar has no "projected" style (open spec question, KB-E6F61C02); SR-RPT-026 — Last-year toggles expose no pressed state (KB-DB9F0923, may be a snapshot limit).
- Incidental: "My activity" widget says "Some tracked activity couldn't be loaded" while SalesRepActivities answers 200; `/company/dashboard` top-seller images on an unresolvable host.
- Probably stale: 089 SR-FE-031/032/038/040/041/050/065 (communication modal redesigned, VCST-6256), 091 SR-CP-050/045 and SR-HD-020 (4 layout regions incl. `fullWidth`, KB-00179371), My Customers column names, "Sales Rep Hub" label.

## NOT_DEPLOYED / environment
`[EXCLUSIVE]` `SalesRep.Enabled=false` → WX (SR-FE-003, SR-HD-003, SR-HD-106, SR-CP-003). Runner forbids interception/API planting (31 cases in 089/091/093/093b/116). Fixtures: 116 reports need more current-month orders; no filter rules / multi-org rep; SR_REP_NOCUSTOMERS_ORGCTX has no password. Firefox `browser_resize` hung ~30 min (SR-RPT-018, SR-HD-115 not re-run).

## Promotion
Skipped — `--no-promote`.
