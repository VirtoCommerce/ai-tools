# Regression REG-2026-11-26-0955-W5 — Sprint 26-23 W5 B2B organizations, members, lists

Env vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · shared accounts (no persona set) · `--no-promote` · triage deferred to the owner.

## Frontend Suites
| Suite | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|
| 006 B2B Organization | 66 | 1 | 4 | 1 |
| 008 B2B Members | 22 | 1 | 11 | 6 |
| 007 B2B Lists & Shared | 46 | 8 | 10 | 13 |
| **Total (189)** | **134** | **10** | **25** | **20** |

Chunks of ~17 cases per runner; B2C-ORG-042 and B2C-LIST-051 re-run after lane contention. No collisions observed.

## Bugs found (preliminary, for triage)
- Known: ORG-078 (KB-D59DDAAD), MBR-031 (VCST-6823).
- Rep-shared list flow (007): LIST-051/052/053/054/070/071 — list not in recipient's lists, notification without names, recipient gets `/403` despite Write.
- Incidental: raw i18n key in `/company/members`, "Remove from cart" label on list rows, "1 items selected", unnamed icon buttons at 375px.

## NOT_DEPLOYED / environment
Empty B2B-store role whitelist blocks 11 member cases (008). Org-mate pair missing in the account pool (007, 6 cases). Runner forbids getComputedStyle / interception (3 cases).

## Promotion
Skipped — `--no-promote`.
