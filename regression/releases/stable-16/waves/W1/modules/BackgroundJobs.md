# BackgroundJobs — Stable 16 regression

**Run:** REG-2026-10-13-0035 (W1) · **Status:** ⚠ done, bugs filed · **Bugs:** VCST-6286, VCST-6287; cand. BGJ-053

| Suite | Cases | PASS | FAIL | BLOCKED | AMB | SKIP |
|---|---|---|---|---|---|---|
| 095 Background Jobs — Hangfire Migration | 52 | 42 | 2 | 6 | 2 | 0 |

Recurring jobs run; schedules use defaults after restart (VCST-6287).

Details and FAIL triage: ../../REG-2026-10-13-0035/regression-2026-10-13.md (local run folder)

## Re-run after fixture seeding (2026-10-13)
BGJ-018, 029, 032, 033 → PASS (PROCESSING_ORDER seeded; USER persona token fixed). PROCESSING_ORDER is now Completed after the 029→032→033 chain — reseed before reuse.
Side observation: PUT status=Cancelled leaves isCancelled=false and the payment Paid; only "Cancel document" cascades (not asserted by any case; not verified against docs).
