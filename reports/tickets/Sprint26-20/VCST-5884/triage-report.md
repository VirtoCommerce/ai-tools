# Triage — VCST-5884 round 3 checklist (ticket mode)

Source: `testing-checklist.md` (28 rows with a verdict; `unresulted[]` empty) · 2026-10-12 · vcst · non-passing **2** (A2 FAIL, V6 SKIPPED) · advisory **2** (A10, B8 — UNSPEC, PO) · real bugs **0**.
Phase 2 skipped (no cross-run history for checklist rows); `--fix` is ignored in ticket mode — this run's orchestrator is the checklist's only writer.

## 1. Confirmed real bugs
None.

## 2. Checklist fixes
| Row | CLASS | Fix |
|---|---|---|
| A2 | ASSERTION_DEFECT | the leg "My returns filter offers Draft" ignored vcst's `Query.returnStatuses` dictionary (no Draft, no Requested — KB-16A03137) and the checklist's own run rule 6. Rewrite as "My returns options = the stand's `returnStatuses`; org tab never offers Draft"; on vcst the leg is N/A-by-dictionary. Org-tab legs PASS. Same root cause as C1 RET-ORG-049 (fixed). |

## 3. Dismissed
| Row | CLASS | Reason |
|---|---|---|
| V6 | KNOWN_ISSUE | vs. DESIGN SKIPPED — the ticket names no design project (`visual-axis.md`) |

Advisory, counted not triaged: A10 / G.13 (org list dated and ranked by createdDate, KB-85EA02F6) · B8 / G.5 (store not compared on `return(id)`, KB-890E6A04) — both PO questions.

**No tracker ticket filed, no fix triggered — human decides.**
