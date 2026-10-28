---
name: qa-triage-results
description: "[QA Methodology] Triage a completed regression run's non-passing cases (FAIL / BLOCKED / SKIPPED) — or, with `ticket <KEY>`, the non-passing rows of a /qa-test or /qa-test-fast testing-checklist.md (checklist, exploratory and visual findings): collect each + its evidence (trace, screenshots, console, network) + the failing CSV or checklist row, dedup + flag flaky, classify each into real-product-bug vs test-defect (bad steps / bad assertion / stale test data / stale test) vs flaky/env/known, investigate the real ones live with vc-fix:qa-investigate, then route test-defects to /qa-review-tests --fix and draft bug reports (ticket mode returns them to the caller instead). Detect-classify-verify-report only — never files a tracker ticket, never triggers /qa-fix. Used by /qa-test 5-triage, /qa-test-fast Stage 3, and when asked to triage a finished run."
argument-hint: "[RUN_ID | latest | ticket <KEY>] [--fix] [--verify] [--min-severity P0|P1|P2|P3]"
---

# /qa-triage-results — Regression-Results Triage & Analysis

The owner of this flow is **the session that invokes it (in this repository: `qa-lead-orchestrator`)** (acting here as the Triage Orchestrator) for Virto Commerce regression runs. A regression run tells you *which* tests failed; this flow works out *why* each one failed and what to do about it. It reads a completed run under `reports/regression/{RUN_ID}/`, classifies every non-passing case (FAIL, BLOCKED, SKIPPED), verifies the real bugs against the live environment, applies test-case fixes for the test-defects, drafts bug reports for confirmed product defects, and **STOPs for a human** — it never files a tracker ticket (Jira / Azure Boards) and never triggers `/qa-fix`.

## Usage
```
/qa-triage-results                 # Triage the latest completed run (report + recommendations only)
/qa-triage-results latest --fix    # Also auto-apply test-case fixes (asks before each CSV write) + draft bug reports
/qa-triage-results REG-2026-07-14-0018          # Triage a specific run
/qa-triage-results REG-2026-07-14-0018 --verify # Force live repro for ALL real-bug candidates (not just HIGH-confidence)
/qa-triage-results latest --fix --verify        # Full: verify all candidates + apply fixes + draft bugs
/qa-triage-results ticket VCST-1234 --verify    # Ticket mode: a /qa-test or /qa-test-fast run's testing-checklist.md
```

From the plugin the command is `/vc-test:qa-triage-results` (in this repository `/qa-triage-results` is a shim to it).

**Ticket mode (`ticket <KEY>`).** Checklist, exploratory and visual findings have no `RUN_ID`. They are rows of the
ticket's `testing-checklist.md`, which is why the calling flow records every lane's finding there as a row with a
verdict before it calls this. Phases 1, 3, 4 and 6 run as below on that file. **Phase 2 is skipped**, because a
checklist item has no cross-run history. **Phase 5 writes nothing**: the calling flow is the single writer of its
checklist and the one caller of `/vc-fix:qa-bug`, so this mode *returns* the confirmed bugs with their investigation
packages, plus the checklist fixes ([`routing-and-fix.md`](routing-and-fix.md) §Ticket
mode). `--fix` is ignored in this mode, and the report says so.

- **`--fix`** — enables Phase 5 write actions: delegate test-defect classes to `/qa-review-tests suite <ID> --fix` (which asks before each CSV write) and draft `reports/bugs/open/<severity>/` files (inside a ticket run, the run folder's `bugs/<severity>/`) for confirmed real bugs. **Without `--fix`, the flow is report-only** — it changes no test case, bug draft or tracker and recommends the exact follow-up command per failure. Regression mode still writes its bookkeeping: the fingerprint store (`--record`, gitignored), `reports/regression/history.json` (Phase 2, **tracked**) and the Phase 6 `triage-report.md`. Ticket mode writes only `triage-report.md`.
- **`--verify`** — live-reproduce **every** `REAL_BUG` candidate (default: only `CONFIDENCE: HIGH` candidates are reproduced live; MEDIUM/LOW are listed as needs-review).
- **`--min-severity P0|P1|P2|P3`** — a severity floor for Phase 4: a `REAL_BUG` candidate whose `SEVERITY` is below it is **never reproduced live**, with or without `--verify`. It is returned as `below floor (<SEVERITY>)` with its evidence — never `needs-review`, never drafted — and listed in Phase 6's *Below floor* table. `/vc-test:qa-ticket` passes `P2`, so only Medium or worse is investigated (vc-test spec U29). Default: no floor.

> **Hard orchestration rule.** You orchestrate; you do not execute. Run the deterministic collector, delegate classification to the triage agent, delegate live verification to the QA experts, delegate CSV fixes to `/qa-review-tests`, delegate bug drafting to `/qa-bug`. You only: parse the args, run the deterministic collectors (Phases 1–2), run the gates, write the Phase 6 report, and print the verdict. **You never edit a CSV, never open a browser, never write to a bug tracker, never call `/qa-fix`.** The end state is always a report + (optionally) applied test fixes + drafted bugs awaiting human review.

## Supporting files

`<plugin>` below is the vc-test plugin root: two folders above this skill's base directory, as given when the skill loads.

- [`methodology.md`](methodology.md) — the five buckets, the data flow, deterministic core vs judgment, the evidence policy, the fingerprint & flaky model, known false positives.
- [`triage-taxonomy.md`](triage-taxonomy.md) — the 8 classes with worked examples and the disambiguation rules.
- [`routing-and-fix.md`](routing-and-fix.md) — the Phase-5 routing table, the `/qa-bug` brief, ticket mode's returns, the write list and the confirmation protocol.
- [`live-triage-design.md`](live-triage-design.md) — unimplemented design for triaging while a run is still executing.
- [`<plugin>/briefs/triage-classifier.md`](../../briefs/triage-classifier.md) — the Phase 3 classifier brief.

---

## Phase 0 — Resolve the run
> **Owner:** the session that invokes it (in this repository: `qa-lead-orchestrator`)

**Mode gate.** `ticket <KEY>` ⇒ ticket mode. Otherwise ⇒ regression mode, only when the project's `package.json` declares both `triage:collect` and `triage:history`. Else STOP: `regression mode needs the project's regression runner (package.json scripts triage:collect, triage:history) — ticket mode is /vc-test:qa-triage-results ticket <KEY>`.

1. **Ticket mode** → Phase 1 resolves the folder itself (`<plugin>/lib/triage-collect.mjs --ticket`: the bound run's folder, else the newest checklist among the ticket's run folders for this env; the packet's `ticketDir`); skip item 2. Otherwise resolve the target run dir: `latest` (default) → newest `REG-*`/`SMOKE-*`/`AREG-*` under `reports/regression/`; else the given `RUN_ID`. Abort with a clear message if none exists.
2. Confirm the run is complete (`reports/regression/test-run-status.json` `status: completed`, or the suite result files carry `completedAt`). If a run is still in progress, warn and triage only the completed suites. If it is `status: stalled` (marked by `npm run regression:reap` — the run died, it did not finish; (in this repository: `.claude/knowledge/execution/regression-pipelines.md`)), say so in the verdict and triage only the suites whose results carry `completedAt`; never report the run as completed.

## Phase 1 — Collect failures + evidence (deterministic)
> **Owner:** the session that invokes it (in this repository: `qa-lead-orchestrator`) (via `scripts/lib/regression-triage.ts`, in ticket mode `<plugin>/lib/triage-collect.mjs`)

Run the collector — it does all the JSON/CSV/evidence archaeology so you don't:
```
npm run triage:collect -- <RUN_ID|latest> --record
```
It emits a JSON packet of every **non-passing case** — `FAIL`, `BLOCKED`, and `SKIPPED` (each carries a `status` field; only PASS and PENDING/not-yet-executed are excluded) — each joined to its `traces/{TC-ID}-FAIL-trace.json` (network + console w/ stack frames, FAIL only), its `screenshots[]`, the lane `harPath`, the test case's authored `csvRow`, a stable `fingerprint`, and the cross-run `flaky`/`priorRuns` flags. The cases are pre-grouped into **`batches`** (by `suiteId` + `status`, largest first, chunked to `maxPerBatch` — default `DEFAULT_MAX_BATCH` in `scripts/lib/regression-triage.ts`; override with `--max-batch N`) so Phase 3 makes **one classifier call per batch** instead of one per case; `issueCount` / `byStatus` / `batchCount` summarise the run. `--record` updates the fingerprint store so the next run can flag oscillation. A BLOCKED case is triaged for *why* it was blocked (env / precondition / data / real bug); a SKIPPED case for whether the feature was removed (stale test).

**Ticket mode:** `node <plugin>/lib/triage-collect.mjs --ticket <KEY> [--max-batch N]` emits the same packet with `source: "checklist"`. Each FAIL / BLOCKED / NOT-RUN row becomes an issue whose `csvRow` is the checklist row, with its screenshots from the ticket's `screenshots/` and its lane HAR. Advisory rows (`DRIFT`, `UNSPEC`, `WAIVED` — [`visual-axis.md`](../qa-design/visual-axis.md) §3) are counted, not triaged. **A non-empty `unresulted[]`** (an item with no readable verdict) is a join-gate gap: STOP and hand it back to the caller. Never triage around it. `ERR_MODULE_NOT_FOUND` ⇒ the plugin's deps are missing: `npm install --omit=dev --prefix "<plugin>"` once, then rerun.

If `issueCount === 0` → skip to Phase 6 and emit a clean ≤15-line report.

## Phase 2 — Dedup & flakiness
> **Owner:** the session that invokes it (in this repository: `qa-lead-orchestrator`)

The collector already fingerprinted each failure and (via the store) marked `flaky:true` for any that has oscillated PASS↔FAIL across prior runs. Also feed the flakiness engine so trends stay honest:
```
npm run triage:history -- <RUN_ID|latest> --env <TEST_ENV>
```
This writes per-suite rows into `reports/regression/history.json` in the shape `scripts/regression/compute-metrics.ts` expects (the flaky/trend detector was previously starved). Each issue's `fingerprint` (signature-based) dedups identical failures; if the same fingerprint recurs within a batch, classify it once and apply the verdict to the duplicates rather than re-reasoning each.

## Phase 3 — Classify (one call per batch)
> **Owner:** the triage classifier (delegate **per batch**, not per case)

**The classifier runs on Sonnet** (why: [`methodology.md`](methodology.md) §Deterministic core vs LLM judgment).

**`preClassified` is not dispatched.** Those cases were recorded BLOCKED by the pre-flight and never run (lane
`preflight`); each carries the row that predicted it. Report them grouped by that row, never as a fresh finding: a `fixture:` row is `TEST_DATA_DEFECT` (unseeded or broken
alias — the same `DATA` verdict `/qa-run` records), every other row (`req:`, `secret:`, a persona's password) is `ENV`.
A case whose module is not on the stand is not here: it left the plan as `notDeployed`.

Regression mode: first run the deterministic linter on each affected suite so the classifier has static signal:
```
npm run suites:review -- <suite-csv> --json
```
Then delegate **each `batch`** from Phase 1 to the classifier. `<plugin>/briefs/triage-classifier.md` is a **brief, not an agent type**: dispatch a `general-purpose` subagent **with `model: "sonnet"`** whose prompt is "Read and follow `<plugin>/briefs/triage-classifier.md`" plus `PLUGIN` = `<plugin>`, `BASE` = the absolute folder the `screenshots[]` paths are relative to (ticket mode: the packet's `ticketDir`; else the run dir) and the batch (it needs `Read` for the screenshots) — pass the batch's `issues` (incl. `status` + screenshot paths — the classifier READS them for visual/element failures, and triages BLOCKED/SKIPPED per its Step 1a) + that suite's lint output + the **observed-behaviour instruction**: for each failing case's page path / GraphQL operation / endpoint, ask the base itself (`mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`)) before choosing a CLASS — an entry that already records the observed "actual" argues `KNOWN_ISSUE` / `STALE_TEST`, one that records the expected behaviour on the same deployment argues `REAL_BUG`. Cite the entry ids in `ROOT_CAUSE`. Because a batch is one suite + one status, its cases usually share a cause, so the classifier reasons over them in one shared context (one set of oracle reads) but **emits one verdict per case** (`CASE:` + `CLASS` markers). Dispatch batches largest first, at most 3 at a time; don't fan out one agent per case. Per case it emits:
`CLASS` ∈ {`REAL_BUG`, `TEST_STEPS_DEFECT`, `ASSERTION_DEFECT`, `TEST_DATA_DEFECT`, `STALE_TEST`, `FLAKY`, `ENV`, `KNOWN_ISSUE`} + (for REAL_BUG) `SEVERITY`/`ROUTE_REPO`/`REPRO_LAYER` + `CONFIDENCE` + `ROOT_CAUSE` + `SUGGESTED_FIX`.

Bias: when a case can't be confidently attributed to product-or-test, it stays `REAL_BUG` with `CONFIDENCE: LOW` (→ live repro / human review) — never downgraded to a test-defect to make it disappear. See the taxonomy + worked examples in the `/qa-triage-results` skill ([`triage-taxonomy.md`](triage-taxonomy.md)).

## Phase 4 — Live-verify the real-bug candidates
> **Owner:** the project's own `qa-frontend-expert` (REPRO_LAYER frontend) / `qa-backend-expert` (backend) when it defines one, else `vc-fix:qa-frontend-expert` / `vc-fix:qa-backend-expert`

For each `REAL_BUG` candidate that is `CONFIDENCE: HIGH` (or **all** of them under `--verify`), and at or above `--min-severity` when one is given: delegate a **live reproduction** to the layer's QA expert against the current env. **The brief's first instruction: invoke the Skill tool with `skill: "vc-fix:qa-investigate"`, running ahead of `/vc-fix:qa-bug`.** That makes it stop at its gate and return an evidence package (`evidence-index.md` + `root-cause.md`) instead of writing a report (its Step 8). The package goes under the packet's `ticketDir` in ticket mode, and under `reports/regression/{RUN_ID}/evidence/` otherwise. The brief carries the `Observed behaviour` line ([`known-ground.md`](../ticket-context/known-ground.md) §The `kb` half), so the repro BANKS what it establishes. One candidate per dispatch, at most 3 at a time, each on its own lane. **`vc-fix` not installed** ⇒ no investigation and no draft: the candidate is listed as `needs-review` with the install line.
- **Reproduced live** → `confirmed real bug`, with its package path.
- **Did not reproduce** → downgrade to `needs-review` (could be already-fixed-since-run, flaky, or env). Do not draft a bug.
Regression mode: `STALE_TEST` candidates are confirmed cheaply via `/qa-review-tests suite <ID> --verify` (Dimension 8 env-check: is the control renamed/moved/removed?) rather than a full repro.

## Phase 5 — Route + act (only writes under `--fix`)
> **Owner:** the session that invokes it (in this repository: `qa-lead-orchestrator`) → delegates

Route each CLASS by the **routing table in the skill's [`routing-and-fix.md`](routing-and-fix.md)** — the single source for the per-class `--fix` and report-only actions, the bug-draft path and the `/qa-bug` brief. Read it now; do not route from memory.

**Confirmation protocol:** every CSV write goes through `/qa-review-tests suite <ID> --fix` (which shows a before/after diff and asks). Every bug draft lands in `reports/bugs/open/<severity>/` (inside a ticket run, the run folder's `bugs/<severity>/`) only ([`reports.md`](../../knowledge/reports.md) §1a — the folder matching the severity the draft itself declares) — **never** transitioned into a tracker here.

## Phase 6 — Triage report + verdict
> **Owner:** the session that invokes it (in this repository: `qa-lead-orchestrator`)

Write **`reports/regression/{RUN_ID}/triage-report.md`** — an addendum inside the existing regression-summary category (NOT a new report type). **Ticket mode:** `<ticketDir>/triage-report.md` — a ticket-check report beside the checklist ([`reports.md`](../../knowledge/reports.md) §1, category 6) — and the confirmed-bugs table carries each bug's investigation-package path in place of a draft link. Three tables (mirrors `/qa-monitoring`), and a fourth under `--min-severity`:
1. **Confirmed real bugs** — case, severity, repo, root cause, draft link, trace ref.
2. **Test-case fixes** — case, CLASS, suite, the fix (applied or recommended).
3. **Dismissed** — case, CLASS (`FLAKY`/`ENV`/`KNOWN_ISSUE`), reason.
4. **Below floor** (`--min-severity` only) — case, severity, root cause, evidence path; not investigated, not drafted.

Header: run ID / date / env / #failures / #real-bugs / #test-defects / #dismissed (+ #below-floor under `--min-severity`). Reference traces + screenshots by path — never inline the JSON. Footer: **"No tracker ticket filed, no fix triggered — human decides."** Keep within the regression-with-failures size cap in [`reports.md`](../../knowledge/reports.md).

Deliver a concise verdict to the user: counts per bucket, the report path, and the recommended next commands.

---

## Rules
- **Never file a tracker ticket (Jira / Azure Boards), never call `/qa-fix`, never merge anything.** Detect, classify, verify, fix *tests*, draft *bugs* — then STOP for a human.
- **Never edit a CSV directly** — all test-case fixes go through `/qa-review-tests --fix` (confirmation + diff).
- **Triage FAIL + BLOCKED + SKIPPED** (only PASS and PENDING are excluded). A BLOCKED is not a terminal verdict: it gets its documented investigation here (why it was blocked — env / precondition / data / real bug); a SKIPPED is checked for a removed/renamed feature (stale test) vs an intentional gate.
- **Ambiguous → REAL_BUG / LOW confidence → human review.** Never relabel an uncertain failure as a test-defect to clear the board.
- **Read the evidence.** Open the screenshot for visual/element failures; use the trace's `networkFailures[]`/`consoleErrors[]` for network/JS failures; reference the HAR only when the trace is thin.
- **Report policy:** the triage report lives inside `reports/regression/{RUN_ID}/`; reference artifacts by path ([`reports.md`](../../knowledge/reports.md) §8). Long reasoning goes to the user via the verdict, not to disk.
- **Deterministic core, LLM judgment.** Collection/dedup/history are `scripts/lib/regression-triage.ts` (ticket mode: `<plugin>/lib/triage-collect.mjs`); classification is `<plugin>/briefs/triage-classifier.md`; verification is the QA experts. Don't re-implement any of them inline.
