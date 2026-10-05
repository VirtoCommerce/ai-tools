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

- **Step 1 (reproduce)** — pass the Phase 4 **`vc-fix:qa-investigate` package** (`evidence-index.md`,
  `root-cause.md`, screenshots, trace, HAR path) and say the bug is already reproduced and investigated.
  It must reuse that package for its reproduction and its 4-layer validation, not dispatch a second repro.
- **Step 4 (write the report)** — write it to `reports/bugs/open/<severity>/` per the map above,
  not the flat `open/` its template names, and pass `found-by:agent-regression <RUN_ID>` so the report carries
  `**Found by:** agent — regression <RUN_ID>` and whoever files it later labels it `found-by-agent` + `found-in-regression`
  (`.claude/knowledge/execution/tracker-ops.md` §Labels on bugs Claude files).
- **Step 5 (create the tracker ticket)** — **skip it: stop after Step 4 and do not ask.** Step 5
  puts "Create a bug-tracker ticket?" to the human via `AskUserQuestion`, so the orchestrator
  cannot answer it for them, and a "Yes" would file a ticket from a flow that never files.

If `/qa-bug` is not available (the vc-fix plugin is not installed), **draft nothing**: list the
bug in the report's *Confirmed real bugs* table with its evidence paths and recommend installing
vc-fix and running `/qa-bug`.

## Ticket mode (`ticket <KEY>`) — returns, never writes

Called by `/qa-test` 5-triage and `/qa-test-fast` Stage 3 on the ticket's `testing-checklist.md`. This mode
writes only `triage-report.md` in the ticket folder, and the investigation packages Phase 4 produced. Everything
else is **returned** to the caller, which is the checklist's single writer and the one caller of `/vc-fix:qa-bug`:

| CLASS | Returned as | The caller then |
|---|---|---|
| `REAL_BUG`, investigated, `REPRODUCED` | confirmed bug + package path + severity + owning repo | calls `/vc-fix:qa-bug` once per bug with the package (brief above, Step 1). `found-by:agent-testing <KEY>` replaces `agent-regression`, and filing follows the caller's own rules (`/qa-test` 5-file asks first; `/qa-test-fast` asks per bug) |
| `REAL_BUG`, `NOT_REPRODUCED` or not investigated | `needs-review` + the reason | lists it, files nothing |
| `TEST_STEPS_DEFECT` · `ASSERTION_DEFECT` · `TEST_DATA_DEFECT` · `STALE_TEST` | the checklist item + `SUGGESTED_FIX` | fixes the row in `testing-checklist.md` and re-runs it once, or notes it |
| `FLAKY` · `ENV` · `KNOWN_ISSUE` | the item + reason (+ linked ticket) | writes it into the item's Result note |

## Confirmation protocol (the write discipline)

1. **No silent writes.** `--fix` is required for any test-case or bug-draft change. Without it the flow writes only its bookkeeping (above) and recommends.
2. **CSV edits go through `/qa-review-tests --fix` only** — never edit a suite CSV from this flow directly. `/qa-review-tests` shows a before/after diff and asks before each write, and re-runs structure validation after. This preserves IDs and the peer-review discipline (`Automation_Status`).
3. **Bug drafts are files, not tickets.** A confirmed `REAL_BUG` is written under `reports/bugs/open/<severity>/` via the brief above. It is **never** transitioned into Jira / Azure Boards here — a human runs `/qa-bug` (to file) then `/qa-fix` (to fix). This matches the detect-and-report discipline of `/qa-monitoring`: both flows file and transition nothing (`.claude/knowledge/execution/ticket-status-transitions.md`).
4. **Batch confirmation.** When several failures in one suite share a fix class, present them together before delegating one `/qa-review-tests --fix` pass over that suite — don't prompt per case where one pass covers them.

## Live-verification gating (Phase 4 → Phase 5)

- Only `REAL_BUG` candidates that **reproduce live** become "confirmed" and get a draft. Non-reproducing candidates → `needs-review` in the report (could be already-fixed-since-run, flaky, or env), no draft.
- `STALE_TEST` is confirmed by the cheap `/qa-review-tests suite <ID> --verify` env-check (is the control renamed/moved/removed?), not a full repro.
- Default verifies only `CONFIDENCE: HIGH` real-bug candidates; `--verify` verifies all of them.

## Report (Phase 6)

`reports/regression/{RUN_ID}/triage-report.md` — an addendum inside the regression-summary category, three tables (Confirmed real bugs · Test-case fixes applied/recommended · Dismissed), reference traces/screenshots by path, footer **"No tracker ticket filed, no fix triggered — human decides."** Size within the regression-with-failures cap (`.claude/rules/reports.md`).
