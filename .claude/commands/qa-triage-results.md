---
description: "Triage a completed regression run's non-passing cases (FAIL / BLOCKED / SKIPPED): collect each + its trace/screenshots/console/network evidence + the CSV row → dedup & flag cross-run flakiness → classify each into real-product-bug vs test-defect (bad steps / bad assertion / stale test data / stale test) vs flaky/env/known → live-verify the real ones → auto-apply test-case fixes (with confirmation) and draft bug reports → STOP for human (never files a tracker ticket, never triggers /qa-fix). Interactive-first; a headless ci/run-triage-results.ts twin is a later follow-up. Reuses scripts/lib/regression-triage.ts + ci/agents/regression-triage-agent.md + /qa-review-tests + /qa-investigate."
argument-hint: "[RUN_ID | latest] [--fix] [--verify]"
disable-model-invocation: true
---

# /qa-triage-results — Regression-Results Triage & Analysis

The owner of this flow is the **`qa-lead-orchestrator`** (acting here as the Triage Orchestrator) for Virto Commerce regression runs. A regression run tells you *which* tests failed; this flow works out *why* each one failed and what to do about it. It reads a completed run under `reports/regression/{RUN_ID}/`, classifies every non-passing case (FAIL, BLOCKED, SKIPPED), verifies the real bugs against the live environment, applies test-case fixes for the test-defects, drafts bug reports for confirmed product defects, and **STOPs for a human** — it never files a tracker ticket (Jira / Azure Boards) and never triggers `/qa-fix`.

This is the missing consumer between `/qa-regression` (produces the run) and `/qa-bug`→`/qa-fix` (act on a confirmed bug). It clones the proven `/qa-monitoring` skeleton — collect → dedup → triage → live-verify → report → STOP — sourced from the regression run dir instead of App Insights.

## Usage
```
/qa-triage-results                 # Triage the latest completed run (report + recommendations only)
/qa-triage-results latest --fix    # Also auto-apply test-case fixes (asks before each CSV write) + draft bug reports
/qa-triage-results REG-2026-07-14-0018          # Triage a specific run
/qa-triage-results REG-2026-07-14-0018 --verify # Force live repro for ALL real-bug candidates (not just HIGH-confidence)
/qa-triage-results latest --fix --verify        # Full: verify all candidates + apply fixes + draft bugs
```

- **`--fix`** — enables Phase 5 write actions: delegate test-defect classes to `/qa-review-tests <suite> --fix` (which asks before each CSV write) and draft `reports/bugs/` files for confirmed real bugs. **Without `--fix`, the flow is report-only** — it recommends the exact follow-up command per failure but changes nothing.
- **`--verify`** — live-reproduce **every** `REAL_BUG` candidate (default: only `CONFIDENCE: HIGH` candidates are reproduced live; MEDIUM/LOW are listed as needs-review).

> **Hard orchestration rule.** You orchestrate; you do not execute. Run the deterministic collector, delegate classification to the triage agent, delegate live verification to the QA experts, delegate CSV fixes to `/qa-review-tests`, delegate bug drafting to `/qa-bug`. You only: parse the args, run the gates, and print the verdict. **You never edit a CSV, never open a browser, never write to a bug tracker, never call `/qa-fix`.** The end state is always a report + (optionally) applied test fixes + drafted bugs awaiting human review.

---

## Phase 0 — Resolve the run
> **Owner:** `qa-lead-orchestrator`

1. Resolve the target run dir: `latest` (default) → newest `REG-*`/`SMOKE-*`/`AREG-*` under `reports/regression/`; else the given `RUN_ID`. Abort with a clear message if none exists.
2. Confirm the run is complete (`test-run-status.json` `status: completed`, or the suite result files carry `completedAt`). If a run is still in progress, warn and triage only the completed suites.

## Phase 1 — Collect failures + evidence (deterministic)
> **Owner:** `qa-lead-orchestrator` (via `scripts/lib/regression-triage.ts`)

Run the collector — it does all the JSON/CSV/evidence archaeology so you don't:
```
npm run triage:collect -- <RUN_ID|latest> --record
```
It emits a JSON packet of every **non-passing case** — `FAIL`, `BLOCKED`, and `SKIPPED` (each carries a `status` field; only PASS and PENDING/not-yet-executed are excluded) — each joined to its `traces/{TC-ID}-FAIL-trace.json` (network + console w/ stack frames, FAIL only), its `screenshots[]`, the lane `harPath`, the test case's authored `csvRow`, a stable `fingerprint`, and the cross-run `flaky`/`priorRuns` flags. The cases are pre-grouped into **`batches`** (by `suiteId` + `status`, largest first, chunked to `maxPerBatch` — default 25; override with `--max-batch N`) so Phase 3 makes **one classifier call per batch** instead of one per case; `issueCount` / `byStatus` / `batchCount` summarise the run. `--record` updates the fingerprint store so the next run can flag oscillation. A BLOCKED case is triaged for *why* it was blocked (env / precondition / data / real bug); a SKIPPED case for whether the feature was removed (stale test).

If `issueCount === 0` → skip to Phase 6 and emit a clean ≤15-line report.

## Phase 2 — Dedup & flakiness
> **Owner:** `qa-lead-orchestrator`

The collector already fingerprinted each failure and (via the store) marked `flaky:true` for any that has oscillated PASS↔FAIL across prior runs. Also feed the flakiness engine so trends stay honest:
```
npm run triage:history -- <RUN_ID|latest> --env <TEST_ENV>
```
This writes per-suite rows into `reports/regression/history.json` in the shape `scripts/regression/compute-metrics.ts` expects (the flaky/trend detector was previously starved). Each issue's `fingerprint` (signature-based) dedups identical failures; if the same fingerprint recurs within a batch, classify it once and apply the verdict to the duplicates rather than re-reasoning each.

## Phase 3 — Classify (one call per batch)
> **Owner:** `regression-triage-agent` (delegate **per batch**, not per case)

First run the deterministic linter on each affected suite so the classifier has static signal:
```
npm run suites:review -- <suite-csv> --json
```
Then delegate **each `batch`** from Phase 1 to **`ci/agents/regression-triage-agent.md`** — pass the batch's `issues` (incl. `status` + screenshot paths — the classifier READS them for visual/element failures, and triages BLOCKED/SKIPPED per its Step 1a) + that suite's lint output. Because a batch is one suite + one status, its cases usually share a cause, so the classifier reasons over them in one shared context (one set of oracle reads) but **emits one verdict per case** (`CASE:` + `CLASS` markers). Dispatch batches concurrently (largest first) up to a small pool; don't fan out one agent per case. Per case it emits:
`CLASS` ∈ {`REAL_BUG`, `TEST_STEPS_DEFECT`, `ASSERTION_DEFECT`, `TEST_DATA_DEFECT`, `STALE_TEST`, `FLAKY`, `ENV`, `KNOWN_ISSUE`} + (for REAL_BUG) `SEVERITY`/`ROUTE_REPO`/`REPRO_LAYER` + `CONFIDENCE` + `ROOT_CAUSE` + `SUGGESTED_FIX`.

Bias: when a case can't be confidently attributed to product-or-test, it stays `REAL_BUG` with `CONFIDENCE: LOW` (→ live repro / human review) — never downgraded to a test-defect to make it disappear. See the taxonomy + worked examples in the `/qa-triage-results` skill (`triage-taxonomy.md`).

## Phase 4 — Live-verify the real-bug candidates
> **Owner:** `qa-frontend-expert` (REPRO_LAYER frontend) / `qa-backend-expert` (backend)

For each `REAL_BUG` candidate that is `CONFIDENCE: HIGH` (or **all** of them under `--verify`): delegate a **live reproduction** to the layer's QA expert against the current env — the full `/qa-investigate` reproduce→isolate→evidence path when depth is needed.
- **Reproduced live** → `confirmed real bug`.
- **Did not reproduce** → downgrade to `needs-review` (could be already-fixed-since-run, flaky, or env). Do not draft a bug.
`STALE_TEST` candidates are confirmed cheaply via `/qa-review-tests <suite> --verify` (Dimension 8 env-check: is the control renamed/moved/removed?) rather than a full repro.

## Phase 5 — Route + act (only writes under `--fix`)
> **Owner:** `qa-lead-orchestrator` → delegates

Per the routing table in the skill (`routing-and-fix.md`):

| CLASS | Action (`--fix`) | Action (report-only) |
|---|---|---|
| `REAL_BUG` (confirmed) | Draft `reports/bugs/open/<severity>/BUG-*.md` via `/qa-bug` (repro + evidence + `## Fix Routing`). **STOP — do not file a tracker ticket, do not call `/qa-fix`.** | Recommend `/qa-bug` then `/qa-fix <ticket>` |
| `TEST_STEPS_DEFECT` / `ASSERTION_DEFECT` / `TEST_DATA_DEFECT` | `/qa-review-tests <suite> --fix` (asks before each CSV write) | Recommend the same command + the `SUGGESTED_FIX` |
| `STALE_TEST` | `/qa-review-tests <suite> --fix`, or `/qa-test-lifecycle <suite>` for a feature-change sync | Recommend the same |
| `TEST_DATA_DEFECT` (unseeded env / drifted GUID) | Recommend `/qa-seed-data <profile>` + `npm run td:validate`; apply alias fix via `/qa-review-tests --fix` if it's a CSV token | Recommend the same |
| `FLAKY` | Flag for quarantine/re-run; no write | Recommend re-run |
| `ENV` | No write; recommend re-run after env fix | Same |
| `KNOWN_ISSUE` | Dismiss with the linked ticket | Same |

**Confirmation protocol:** every CSV write goes through `/qa-review-tests --fix` (which shows a before/after diff and asks). Every bug draft is written to `reports/bugs/open/<severity>/` only (§1a — the severity folder matching what the draft itself declares) — **never** transitioned into a tracker here.

## Phase 6 — Triage report + verdict
> **Owner:** `qa-lead-orchestrator`

Write **`reports/regression/{RUN_ID}/triage-report.md`** — an addendum inside the existing regression-summary category (NOT a new report type). Three tables (mirrors `/qa-monitoring`):
1. **Confirmed real bugs** — case, severity, repo, root cause, draft link, trace ref.
2. **Test-case fixes** — case, CLASS, suite, the fix (applied or recommended).
3. **Dismissed** — case, CLASS (`FLAKY`/`ENV`/`KNOWN_ISSUE`), reason.

Header: run ID / date / env / #failures / #real-bugs / #test-defects / #dismissed. Reference traces + screenshots by path — never inline the JSON. Footer: **"No tracker ticket filed, no fix triggered — human decides."** Keep within the regression-with-failures size cap in `.claude/rules/reports.md`.

Deliver a concise verdict to the user: counts per bucket, the report path, and the recommended next commands.

---

## Rules
- **Never file a tracker ticket (Jira / Azure Boards), never call `/qa-fix`, never merge anything.** Detect, classify, verify, fix *tests*, draft *bugs* — then STOP for a human.
- **Never edit a CSV directly** — all test-case fixes go through `/qa-review-tests --fix` (confirmation + diff).
- **Triage FAIL + BLOCKED + SKIPPED** (only PASS and PENDING are excluded). A BLOCKED gets its documented investigation here (why it was blocked — env / precondition / data / real bug) per `feedback_blocked_is_not_terminal`; a SKIPPED is checked for a removed/renamed feature (stale test) vs an intentional gate.
- **Ambiguous → REAL_BUG / LOW confidence → human review.** Never relabel an uncertain failure as a test-defect to clear the board.
- **Read the evidence.** Open the screenshot for visual/element failures; use the trace's `networkFailures[]`/`consoleErrors[]` for network/JS failures; reference the HAR only when the trace is thin.
- **Report policy:** the triage report lives inside `reports/regression/{RUN_ID}/`; reference artifacts by path (`.claude/rules/reports.md` §8). Long reasoning goes to the user via the verdict, not to disk.
- **Deterministic core, LLM judgment.** Collection/dedup/history are `scripts/lib/regression-triage.ts`; classification is `ci/agents/regression-triage-agent.md`; verification is the QA experts. Don't re-implement any of them inline.
