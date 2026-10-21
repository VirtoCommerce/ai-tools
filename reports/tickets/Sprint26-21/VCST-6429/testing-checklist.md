# VCST-6429 — testing checklist

Ticket: VCST-6429 (Review task) · PR VirtoCommerce/vc-module-search#157 · Flow feature-test · Path FULL
Env: vcptcore_qa1 · VirtoCommerce.Search 3.1011.0-pr-157-9278 · Platform 3.1084.0-pr-3140-9092 · provider Azure AI Search (all 7 types)
Model: reports/ba/test-models/VCST-6429-2026-10-20.md · Domain map: .claude/knowledge/domain/search.md rev 1
Test data: live-discover only (data_surface=false) — any active Product P from `GET {{BACK_URL}}/api/search/indexes` scope; an `AGENT-TEST-` product for C9
Verdict: **PASS WITH NOTES** — every PR claim testable on the stand holds on Azure AI Search AND ElasticSearch8; C10 Error log confirmed in pod logs; C11 (lock-store failure / dead holder) rests on PR unit tests only; C12 is pre-existing defect F-1

| # | Condition | Source | Covered by | Verdict | Evidence |
|---|---|---|---|---|---|
| C1 | Manual **Build** (Product) completes "Indexation completed successfully"; index doc count unchanged | dev smoke "Build"; S1; VC-SEARCH-001 | checklist + SRCHJ-001 | PASS | notif d70a85e5 / job 400273, 413/413, count 626→626; SRCHJ-001 PASS |
| C2 | A Build started right after a completed Build also completes (lock released) | PR claim 1; S1 | checklist + SRCHJ-001 | PASS | e39100c3 / 400274; ~25 runs started after a finished one all ran |
| C3 | **Delete and build** (Category) completes; count restored; storefront categories served during and after | dev smoke "Rebuild with Delete"; S2; {DOC} blue-green | checklist + SRCHJ-002 | PASS | 99d2997d / 400275, 168→168; xAPI categories 88 during and after; SRCHJ-002 PASS |
| C4 | **Single product** Build index from the product's Index widget (Admin UI) → Indexation process blade completes; product index date moves | dev smoke "Single product build"; S3; {DOC} product-indexing | checklist + SRCHJ-003 | PASS | 1 of 1, indexationdate 19:08:07→19:12:25Z; C4-product-index-widget-build-completed.png; SRCHJ-003 PASS |
| C5 | Build started while another Build runs → sealed, errorCount 1, "Indexation is already in progress."; first run completes | PR claim 2; S4 | checklist + SRCHJ-004 | PASS | 8 REST + 1 UI contended runs, every loser sealed at once; C5-ui-*.png; SRCHJ-004 PASS |
| C6 | Single product Build index during a running full Build → "already in progress" (not silent success) | S5 | checklist + SRCHJ-005 | PASS | 87a7eda2 / 400304 errorCount 1 (final text then overwritten — F-1); SRCHJ-005 PASS |
| C7 | Cancel a running Build → "Indexation has been canceled"; the next Build completes | PR claim 4 (lockToken); S7 | checklist + SRCHJ-006 | PASS | d815cfc6 / 400309 canceled at 200/413; next 53707dbd 413/413; SRCHJ-006 PASS |
| C8 | Run ending with an indexation error releases the lock | S6 | checklist (ES8, 2026-10-21) | PASS | errored run 33df81db / job 401335 "Indexation completed with errors" (unknown document type → inner catch; Hangfire Succeeded); next build d623e2b1 / 401336 completed 3/3. Error induced by an unknown document type, not by the provider — same inner catch + finally path |
| C9 | Renamed product is found by its new name in storefront search within 120 s | BL-SRCH-003; S8 | checklist only (existing SRCHA-015/025) | PASS | found after 2.1 s (0.7 s during a full build); name restored |
| C10 | Contention is logged at Error level | PR claim 2; S9 | checklist (Argo CD pod logs, 2026-10-21) | PASS | pod s69h8: `ERR Indexation skipped: the 'IndexationJob' lock is held by another run, so nothing was indexed. JobId: 401370, User: admin, DocumentTypes: Category` at 11:40:41, each preceded by `Lock status: Conflicted … vcptcore-qa1:IndexationJob`; same line for jobs 401301, 401314, 401316, 401318. No `could not run under the lock` line (no lock-store failure occurred) |
| C11 | Lock-store failure / lock lost / dead holder → job failed, notification sealed, lease expires | PR claim 3; S10/S11 | GAP (env) + one restart attempt | NOT TESTABLE (inconclusive) | POST /api/platform/modules/restart at Product 50/413 (2026-10-21 11:08:22Z): shutdown is graceful — job 401333 finished Succeeded before the process stopped, so the holder was never killed mid-run. Lock was free right after restart (next build 3/3). Redis-down / hard kill need infra access; PR unit tests only |
| C12 | The loser's notification is not overwritten with the winner's progress; the winner's own blade keeps progressing | 3x observation | checklist; tracked as VCST-6474 (no regression case — an open, pod-dependent defect would be a flaky case) | FAIL — pre-existing F-1 / VCST-6474, reproduced on released 3.1010.0 (does not fail the ticket) | 8 of ~16 contended runs; C12-ui-category-loser-400338-shows-product-413.png, C5-C12-ui-loser-blade-r3-*.png; the draft case SRCHJ-007 passed in both C1 runs (intermittent: needs both runs on one pod) and was removed from the suite |

**Existing coverage (Artifact A phase 2a):** suite 061 is legacy 11-column → `tc:scope` unscannable (0 rows scanned). Disposed by reading:
SRCHA-007..027, 041..046 — 33 CONFIRMED, 0 REPAIR, 0 RE-BASE, 0 SUPERSEDED (the PR changes lock acquisition/release and cancellation
plumbing only; no row asserts a value it alters). C1's exact set = the new SRCHJ ids only.

**C1 regression:** REG-2026-10-20-1926 (Azure) and REG-2026-10-21-1051 (ElasticSearch8) — 061b SRCHJ-001..007, 7/7 PASS each. SRCHJ-007 was later removed from the suite (targets open defect VCST-6474); the suite keeps SRCHJ-001..006. **Feature release gate:** not-assessed (no release sweep in /qa-test).
