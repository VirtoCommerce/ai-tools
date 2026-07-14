# Routing & Fix — what happens to each class (Phase 5)

Every class routes to an existing skill/command — the triage flow itself writes
nothing except the report and (under `--fix`) drafted bug files. **No tracker
ticket is ever filed and `/qa-fix` is never triggered here.**

## Routing table

| CLASS | `--fix` action | report-only action | Owner |
|---|---|---|---|
| `REAL_BUG` (live-confirmed) | Draft `reports/bugs/BUG-*.md` via `/qa-bug` — repro + evidence + a `## Fix Routing` block. **STOP.** | Recommend `/qa-bug` then `/qa-fix <ticket>` | `/qa-bug` |
| `TEST_STEPS_DEFECT` | `/qa-review-tests <suite> --fix` (diff + confirm per CSV write) | Recommend it + the `SUGGESTED_FIX` | `/qa-review-tests` |
| `ASSERTION_DEFECT` | `/qa-review-tests <suite> --fix` | same | `/qa-review-tests` |
| `TEST_DATA_DEFECT` (CSV token) | `/qa-review-tests <suite> --fix` to update the `{{VAR}}`/`@td()` token | same | `/qa-review-tests` |
| `TEST_DATA_DEFECT` (unseeded / drifted GUID) | Recommend `/qa-seed-data <profile>` + `npm run td:validate` (not an auto-write) | same | `/qa-seed-data` |
| `STALE_TEST` | `/qa-review-tests <suite> --fix` (selector/label), or `/qa-test-lifecycle <suite>` for a feature-change sync | same | `/qa-review-tests` / `/qa-test-lifecycle` |
| `FLAKY` | Flag for quarantine/re-run; no write | Recommend re-run | orchestrator |
| `ENV` | No write; recommend re-run after env fix | same | orchestrator |
| `KNOWN_ISSUE` | Dismiss with the linked ticket | same | orchestrator |

## Confirmation protocol (the write discipline)

1. **No silent writes.** `--fix` is required for *any* change. Without it the flow only reports + recommends.
2. **CSV edits go through `/qa-review-tests --fix` only** — never edit a suite CSV from this flow directly. `/qa-review-tests` shows a before/after diff and asks before each write, and re-runs structure validation after. This preserves IDs and the peer-review discipline (`Automation_Status`).
3. **Bug drafts are files, not tickets.** A confirmed `REAL_BUG` is written to `reports/bugs/` via `/qa-bug`'s drafting path. It is **never** transitioned into Jira / Azure Boards here — a human runs `/qa-bug` (to file) then `/qa-fix` (to fix). This matches the detect-and-report discipline of `/qa-monitoring` and the no-auto-file norm (`feedback_subagent_external_writes`).
4. **Batch confirmation.** When several failures in one suite share a fix class, present them together before delegating one `/qa-review-tests --fix` pass over that suite — don't prompt per case where one pass covers them.

## Live-verification gating (Phase 4 → Phase 5)

- Only `REAL_BUG` candidates that **reproduce live** become "confirmed" and get a draft. Non-reproducing candidates → `needs-review` in the report (could be already-fixed-since-run, flaky, or env), no draft.
- `STALE_TEST` is confirmed by the cheap `/qa-review-tests --verify` env-check (is the control renamed/moved/removed?), not a full repro.
- Default verifies only `CONFIDENCE: HIGH` real-bug candidates; `--verify` verifies all of them.

## Report (Phase 6)

`reports/regression/{RUN_ID}/triage-report.md` — an addendum inside the regression-summary category, three tables (Confirmed real bugs · Test-case fixes applied/recommended · Dismissed), reference traces/screenshots by path, footer **"No tracker ticket filed, no fix triggered — human decides."** Size within the regression-with-failures cap (`.claude/rules/reports.md`).
