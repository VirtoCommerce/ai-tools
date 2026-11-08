# VCST-5928 — BLOCKED
Significant bugs: 0 in scope, 0 outside. PR #47 (ElasticSearch8 `LoadMappingAsync` guard) on vcst build 3.1012.0-pr-47-d205 holds at unit level (head vs base, claims 1–4), but the live path is unreachable on this stand and 19 paths sit outside the write zones, so the verdict is BLOCKED. budget: 77.28M of 386.20M (20.0%) · 74.2 of 92.4 min wall (default)

| Item (no ACs, F7: rows are the checklist's C-n) | Result | Evidence |
|---|---|---|
| C-1–C-5 missing index gives "Mapping load failed"; first Build and targeted reindex into a missing index; no host in errors; no NullReferenceException (live) | BLOCKED — no index can be removed (KB-DBF2D084); a missing index never reaches the guard (source @d205e1ac, unit row M) | checklist C-1–C-5, SC-4.1/4.2, SC-7.1/7.2, SC-10.1 |
| C-6 another process or parallel cold searches keep a failed mapping (R4) | BLOCKED — struck at approval | checklist C-6 |
| C-7–C-11 503 `{}` throws and recovers without restart; reset and timeout give SearchException not NRE; valid empty mapping still cached; IndexAsync/CreateIndexAsync throw; no null dereference (suspicion S-3) | PASS (unit: real provider + Elastic transport, scripted fake Elasticsearch) | guard-proof.md claims 1–4, S-3 |
| C-12 SearchException message carries no infrastructure detail (suspicion S-2) | FAIL Low — node URL twice, response body, inner stack on reset/timeout; reaching an outside caller not shown; URL suffix predates PR #47 | guard-proof.md S-2 |

## Bugs
- None Medium or worse. The only Medium row (SC-12.4 = SC-1.2, Delete and build never swapped) is a stand deviation (held `IndexationJob` lock), NOT_REPRODUCED as a product defect — `reports/tickets/Sprint26-22/VCST-5928/vcst/investigations/SC-1.2/` (not filed)
## Write zones
- Outside, foreign (written 15:28–16:23Z by a concurrent session on VCST-6185 in this checkout, none by this run; this run's own files were moved into their zones): `config/test-suites.json` · `regression/suites/Backend/graphql/050b3-graphql-xcart-lifecycle.csv` · `regression/suites/Backend/graphql/050i-graphql-configurations.csv` · `regression/suites/Frontend/cart/030-cart-merge.csv`
- Under `reports/tickets/Sprint26-22/VCST-6185/vcst/`: `evidence.html` · `knowledge/api/graphql-schema.md` · `phase5/graphql-evidence/` CFG-GQL-046-1793719436609.json, CRL-GQL-130-1793719406672.json, CRL-GQL-131-1793719411535.json, CRL-GQL-132-1793719416377.json, CRL-GQL-133-1793719423057.json, CRL-GQL-134-1793719430106.json · `red-baseline.md` · `red-rerun-note.md` · `staged/` 030-cart-merge.staged-rows.csv, 050b3-graphql-xcart-lifecycle.staged-rows.csv, 050i-graphql-configurations.rewrite-046-047.csv · `verification-report.md` · `verification-summary.json`
## Noticed
- Suspicion S-2 (C-12): SearchException text carries the Elasticsearch node URL, response body and inner stack — guard-proof.md (Low)
- Anonymous xAPI `products` with a malformed filter answers 200 totalCount 0 — seen in the ac-checks anonymous probes (Low)
- Admin `/Modules/$(VirtoCommerce.AdminAngularJs)/logo.svg` 404 (unexpanded placeholder); a product image on a dead demo host; AGENT-TEST-CMP-PROPNAME image 404 — SC-12.5, storefront search and admin shell (Low)
- Search Index blade shows no running-build state during a Delete and build — SC-12.3, admin blade (Low, PO question)
## Not tested, and why
- Live swap/rebuild (R3, S-1: SC-1.2, SC-12.4, rest of SC-12.6): every Build, even a 12-document ContentFile control, was sealed "Indexation is already in progress"; lock still held at 15:23Z, no visible holder, clearing needs cluster/Redis access this seat lacks. A stand deviation, not a product failure. Residual risk High (R3)
- Missing-index paths on vcst (R1/R2: SC-4.1/4.2, SC-7.1/7.2, SC-10.1, S-4 steps 3–4 recovery): no document type without an index, no drop route; 503, timeout and reset not producible live (P2). Covered at unit level only. Residual risk High (R2), Medium (R1)
- Struck at approval: S-2 parallel reindex, S-3 stale edit, S-5 save with event-based indexation (needed a global window), S-6, S-8 (R4), S-9, S-11 — Medium. Not selected (budget): C-7, C-8, C-9, C-10, C-15 — Medium to Low. No AC without a row; no row needs a look
- Strategy SKIP: test model, mind map, visual lane, contract refresh, coverage triage + regression (suite 061 not run, U7, Medium), verifier — no risk on them. ES9/OpenSearch modules unchanged by PR #47
## Suspicions
- S-1 (first Build throws on a new index): not checked — C-3 BLOCKED; guard-proof row M points the other way
- S-2 (message exposes host): confirmed (C-12), Low
- S-3 (NRE on a 503 with no transport exception): refuted (C-11)
## Data
Created 0 AGENT-TEST- entities · removed 0 · settings restored and re-read: none (none changed). Product index untouched: 5195 documents, "kitchen" 159 (SC-1.3); ledger: one `other` entry for three Build requests
## Context used
Strategy test-strategy.md · Round 1 · Model SKIP — no MODEL risk · Checklist rounds/round-1/testing-checklist.md · Domain map not recorded · Mind map SKIPPED: no test model runs · Exploratory S-12 ran as the free class-3 scenario · PRs VirtoCommerce/vc-module-elastic-search-8#47
## Cost
| Step | Input-equivalent | Share | Output | Active min |
|---|---|---|---|---|
| scenario | 40.75M | 52.7% | 0.09M | 23.9 |
| orchestrator | 17.52M | 22.7% | 0.04M | 19.7 |
| investigate | 6.07M | 7.9% | 0.04M | 8.6 |
| strategy | 4.96M | 6.4% | 0.04M | 5.8 |
| ac-checks | 3.31M | 4.3% | 0.02M | 5 |
| scenarios | 2.28M | 3.0% | 0.03M | 4.2 |
| triage | 1.44M | 1.9% | 0.02M | 2.2 |
| checklist | 0.40M | 0.5% | 0.00M | 0.6 |
| context | 0.29M | 0.4% | 0.00M | 0.5 |
| change-map | 0.25M | 0.3% | 0.00M | 0.5 |
| **total** | 77.28M | 100% | 0.27M | 71 (wall 74.2) |

Subagents: read from `subagents`. budget: 77.28M of 386.20M (20.0%) · 74.2 of 92.4 min wall (default)
- S-1 · class 2 · worst BLOCKED (SC-1.2) · significant bugs 0 · tokens/min not split per scenario
- S-4 · class 2 · worst BLOCKED (SC-4.1/4.2) · 0 · not split
- S-7 · class 3 · worst BLOCKED (SC-7.1/7.2) · 0 · not split
- S-10 · class 2 · worst BLOCKED (SC-10.1) · 0 · not split
- S-12 · class 3 · worst FAIL Medium (SC-12.4, stand lock, not a bug) · 0 · not split
- Proposed 16 (12 selected + 4 not selected + 0 rejected, none added at approval) · selected 5 · run 5. run-cost has no `scenario:S-n` rows, only the aggregate `scenario` row (40.75M, 23.9 min, all five)
