# Routing & Fix — what happens to each class (Phase 5)

**Single source for Phase 5 routing** — the command points here and does not restate the table.
Every class routes to an existing skill/command. **No tracker ticket is ever filed and `/qa-fix`
is never triggered here.**

What this flow itself writes: in **both** modes its bookkeeping — the fingerprint store
(`reports/regression/.triage-fingerprints.json`, gitignored), `reports/regression/history.json`
(**tracked**) and `reports/regression/{RUN_ID}/triage-report.md`; **only under `--fix`**, the
test-case fixes (through `/qa-review-tests`) and the bug drafts (through `/qa-bug`).

## Routing table

| CLASS | `--fix` action | report-only action | Owner |
|---|---|---|---|
| `REAL_BUG` (live-confirmed) | Draft `reports/bugs/open/<severity>/BUG-*.md` via `/qa-bug` using the **brief below** — repro + evidence + a `## Fix Routing` block. **STOP.** | Recommend `/qa-bug` then `/qa-fix <ticket>` | `/qa-bug` |
| `TEST_STEPS_DEFECT` | `/qa-review-tests suite <ID> --fix` (diff + confirm per CSV write) | Recommend it + the `SUGGESTED_FIX` | `/qa-review-tests` |
| `ASSERTION_DEFECT` | `/qa-review-tests suite <ID> --fix` | same | `/qa-review-tests` |
| `TEST_DATA_DEFECT` — the CSV token is wrong | `/qa-review-tests suite <ID> --fix` to update the `{{VAR}}`/`@td()` token | same | `/qa-review-tests` |
| `TEST_DATA_DEFECT` — env unseeded / GUID drifted | Recommend `/qa-seed-data <profile>` + `npm run td:validate` (not an auto-write) | same | `/qa-seed-data` |
| `STALE_TEST` | `/qa-review-tests suite <ID> --fix` (selector/label), or `/qa-test-lifecycle suite <ID>` for a feature-change sync | same | `/qa-review-tests` / `/qa-test-lifecycle` |
| `FLAKY` | Flag for quarantine/re-run; no write | Recommend re-run | orchestrator |
| `ENV` | No write; recommend re-run after env fix | same | orchestrator |
| `KNOWN_ISSUE` | Dismiss with the linked ticket | same | orchestrator |

**Severity → folder** (`.claude/knowledge/execution/reports-policy.md` §1a): the classifier's
`SEVERITY` P0/P1 → `open/critical-high/`, P2 → `open/medium/`, P3 → `open/low/`. The severity the
draft itself declares wins over the classifier's if `/qa-bug` re-grades it.

## The `/qa-bug` brief (REAL_BUG under `--fix`)

`/qa-bug` is a vc-fix plugin command (`plugins/vc-fix/commands/qa-bug.md`) built for a fresh bug,
so three of its steps must be steered — say all three in the brief:

- **Step 1 (reproduce)** — pass the Phase 4 live-repro evidence (STR, screenshots, trace, HAR path)
  and say the bug is already reproduced; it must reuse that evidence, not dispatch a second repro.
- **Step 4 (write the report)** — write it to `reports/bugs/open/<severity>/` per the map above,
  not the flat `open/` its template names.
- **Step 5 (create the tracker ticket)** — **skip it: stop after Step 4 and do not ask.** Step 5
  puts "Create a bug-tracker ticket?" to the human via `AskUserQuestion`, so the orchestrator
  cannot answer it for them, and a "Yes" would file a ticket from a flow that never files.

If `/qa-bug` is not available (the vc-fix plugin is not installed), **draft nothing**: list the
bug in the report's *Confirmed real bugs* table with its evidence paths and recommend installing
vc-fix and running `/qa-bug`.

## Confirmation protocol (the write discipline)

1. **No silent writes.** `--fix` is required for any test-case or bug-draft change. Without it the flow writes only its bookkeeping (above) and recommends.
2. **CSV edits go through `/qa-review-tests --fix` only** — never edit a suite CSV from this flow directly. `/qa-review-tests` shows a before/after diff and asks before each write, and re-runs structure validation after. This preserves IDs and the peer-review discipline (`Automation_Status`).
3. **Bug drafts are files, not tickets.** A confirmed `REAL_BUG` is written under `reports/bugs/open/<severity>/` via the brief above. It is **never** transitioned into Jira / Azure Boards here — a human runs `/qa-bug` (to file) then `/qa-fix` (to fix). This matches the detect-and-report discipline of `/qa-monitoring`: both flows file and transition nothing (`.claude/knowledge/execution/ticket-status-transitions.md`; provenance `feedback_subagent_external_writes`).
4. **Batch confirmation.** When several failures in one suite share a fix class, present them together before delegating one `/qa-review-tests --fix` pass over that suite — don't prompt per case where one pass covers them.

## Live-verification gating (Phase 4 → Phase 5)

- Only `REAL_BUG` candidates that **reproduce live** become "confirmed" and get a draft. Non-reproducing candidates → `needs-review` in the report (could be already-fixed-since-run, flaky, or env), no draft.
- `STALE_TEST` is confirmed by the cheap `/qa-review-tests suite <ID> --verify` env-check (is the control renamed/moved/removed?), not a full repro.
- Default verifies only `CONFIDENCE: HIGH` real-bug candidates; `--verify` verifies all of them.

## Report (Phase 6)

`reports/regression/{RUN_ID}/triage-report.md` — an addendum inside the regression-summary category, three tables (Confirmed real bugs · Test-case fixes applied/recommended · Dismissed), reference traces/screenshots by path, footer **"No tracker ticket filed, no fix triggered — human decides."** Size within the regression-with-failures cap (`.claude/rules/reports.md`).
