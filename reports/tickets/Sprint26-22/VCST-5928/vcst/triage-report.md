# Triage — VCST-5928 (ticket mode) · vcst · 2026-11-03

Failures 15 (3 FAIL, 12 BLOCKED) · real bugs 0 · test-defects 4 · dismissed 10 · below floor 1. `--fix` is ignored in ticket mode: this report writes no checklist row and drafts no bug.
_Restored 2026-11-04: the original file was deleted from the shared checkout by another session; this copy is rebuilt from the session record._

## 1. Confirmed real bugs
None. The only Medium+ candidate (SC-1.2 = SC-12.4, a Delete and build that never ran) was NOT_REPRODUCED as a product defect. Investigation package: `investigations/SC-1.2/` (deleted with the run folder; root cause summarised below).

## 2. Test-case fixes (recommended; the caller owns the checklist)
| Case | CLASS | Fix |
|---|---|---|
| C-1 | ASSERTION_DEFECT | A missing index gives 200 with 0 hits by design (an empty mapping is cached). The guard fires only on an error status for an existing index. Prove it with an Elasticsearch fault or a unit test (done: `guard-proof.md`) |
| C-2 | ASSERTION_DEFECT | Keep "never a NullReferenceException; the document is found after reindex". Drop "SearchException on a missing index" |
| SC-4.2 | ASSERTION_DEFECT | Same wrong premise as C-1: a missing index never reaches LoadMappingAsync (S-4 source read at d205e1ac) |
| SC-12.3 | ASSERTION_DEFECT | No source says the blade shows build progress; progress goes through the push notification (KB-E4380CA9) |

## 3. Dismissed
| Case | CLASS | Reason |
|---|---|---|
| C-3, C-4, C-5, SC-4.1, SC-7.1, SC-7.2, SC-10.1, SC-12.6 | ENV | vcst has no registered document type without an index, and no REST route drops one (KB-DBF2D084) |
| SC-1.2, SC-12.4 | ENV | Every build on vcst, including a control build of the 12-document ContentFile type, was sealed at once with "Indexation is already in progress." The `IndexationJob` lock was held, and no `_bulk` or index-create call reached Elasticsearch, so PR #47's code was never reached (KB-931CC1C4). The lock cleared later; regression REG-2026-11-03-2035 then ran every build and swap through PR #47 cleanly |

## 4. Below floor (P2)
| Case | Severity | Root cause |
|---|---|---|
| SC-12.5 | P3 | Console 404s: a product image on a dead demo host, an image missing from the AGENT-TEST-CMP-PROPNAME fixture, and the admin `logo.svg` URL with an unexpanded `$(VirtoCommerce.AdminAngularJs)` placeholder |

No tracker ticket filed, no fix triggered — human decides.
