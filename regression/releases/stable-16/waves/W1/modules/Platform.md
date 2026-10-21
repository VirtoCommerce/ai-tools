# Platform — Stable 16 regression

**Run:** REG-2026-10-13-0035 (W1) · **Status:** ⚠ done, candidates open · **Bugs:** VCST-6287; cand. PLAT-069, PLAT-080

| Suite | Cases | PASS | FAIL | BLOCKED | AMB | SKIP |
|---|---|---|---|---|---|---|
| 020 Platform Users Roles & Settings | 65 | 53 | 2 | 2 | 3 | 5 |
| 049 Platform API | 52 | 39 | 9 | 2 | 1 | 1 |
| 063 Core Settings | 14 | 12 | 0 | 2 | 0 | 0 |
| 101 Platform — Sign-in Log | 46 | 43 | 0 | 0 | 0 | 3 |

API 500s on bad input are pre-existing on Stable 15; sign-in log 43/43 PASS.

Details and FAIL triage: ../../REG-2026-10-13-0035/regression-2026-10-13.md (local run folder)
