# W0 — Smoke gate · REG-2026-11-26-0225-W0

Owner Elena Kutasina · vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · persona set S1 · 2026-11-26 night run.

| Suite | Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| 042 Smoke Tests | 34 | 28 | 0 | 1 | 5 (manual) |

**Gate: GREEN** — no FAIL; W1–W6 may start.

## Pre-flight note
The wave pre-flight ran without `--release`: `release:delivery` reports VCST-6935 and VCST-6129 as PARTIAL, but the missing halves are backports to `support/*` lines (vc-platform#3171, #3172, #3170), not code the stand's line needs — reviewed in `PLAN.md` §Not delivered. Every other pre-flight check ran (READY; UNKNOWN only: admin lookups 403).

## Before morning triage (owner)
- 1 BLOCKED without a ledger row: SMK-034 — the S1 slot-1 clone has no saved Skyflow card.
- Runner notes for triage: SMK-002/003 "user name in header" after registration looks stale (lands unauthenticated on /successful-registration); SalesRep plugin chunk 404 + "Part of the site could not be loaded" banner on every page (KB-4358B2EC) — check before W4; seed product images from an unresolvable host.
- Cleanup left on vcst: slot-1 clone profile renamed "SmokeTest Runner"; test addresses; AGENT-TEST-smk002/003 registrations. Order CO261125-00012 placed (CyberSource).
