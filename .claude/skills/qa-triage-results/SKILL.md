---
name: qa-triage-results
description: "[QA Methodology] Triage a completed regression run's failures: collect each FAIL + its evidence (trace, screenshots, console, network) + failing CSV row, dedup + flag flaky, classify each into real-product-bug vs test-defect (bad steps / bad assertion / stale test data / stale test) vs flaky/env/known, live-verify the real ones, then route test-defects to /qa-review-tests --fix and draft bug reports. Detect-classify-verify-report only — never files a tracker ticket, never triggers /qa-fix."
argument-hint: "[RUN_ID | latest] [--fix] [--verify]"

---

# /qa-triage-results — Regression-Results Triage & Analysis

Methodology behind the [`/qa-triage-results` command](../../commands/qa-triage-results.md). **Owned by `qa-lead-orchestrator`** (orchestrate-only — it delegates classification to `regression-triage-agent`, live verification to `qa-frontend/backend-expert`, test-defect fixes to `/qa-review-tests`, and bug drafts to `/qa-bug`; it never executes, edits a CSV, opens a browser, files a ticket, or calls `/qa-fix`). A regression run answers *which* tests failed; this flow answers *why*, and hands each failure to the right follow-up. It is the missing consumer between `/qa-regression` and `/qa-bug`→`/qa-fix`, built on the proven `/qa-monitoring` skeleton: **collect → dedup → triage → live-verify → report → STOP.**

## The problem it solves

Before this, a regression FAIL had two fates: it was consolidated into a pass/fail count, or (if the runner tagged it Critical/High) blindly auto-filed as a bug — with no dedup, no tracker cross-check, and no analysis of *why* it failed. A FAIL caused by a stale assertion, a drifted `@td()` GUID, or a legitimately-changed feature was treated identically to a real product defect. That buries real bugs under test debt and files bogus tickets.

## The five buckets (the reason for the flow)

Every FAIL is one of:

1. **Bad test steps** — the script is wrong (vague/compound step, missing `[WAIT]`), the product is fine.
2. **Bad assertion** — the check is wrong or too strict (exact-value assert on drifting data), the product is fine.
3. **Test-data problem** — a referenced entity is stale/missing (drifted GUID, unseeded env), the product is fine.
4. **Stale test case** — the feature legitimately changed; the test was never updated.
5. **Real product bug** — the product genuinely misbehaves — **confirmed by a live repro** before it counts.

…plus the non-actionable `FLAKY` / `ENV` / `KNOWN_ISSUE` classes.

## Supporting files

- **`triage-taxonomy.md`** — the full 8-class taxonomy with a worked example per class (a real trace/screenshot → which class → why), and the disambiguation rules (the hard cases: bad-assertion vs real-bug, stale-test vs data-defect).
- **`routing-and-fix.md`** — the exact follow-up per class, and the Phase-5 confirmation protocol (nothing is written without a diff + a prompt; no tracker ticket, no `/qa-fix`, ever).

## Data flow

```
reports/regression/{RUN_ID}/            ← a completed /qa-regression run
  ├─ suite-*-results.json               ← per-case PASS/FAIL
  ├─ traces/{TC-ID}-FAIL-trace.json     ← per-FAIL network + console (stack frames)
  ├─ screenshots/ , evidence/           ← per-FAIL visual evidence
        │
        ▼  npm run triage:collect        (scripts/lib/regression-triage.ts — deterministic)
  batches[] grouped by (suiteId, status), each { issues: IssueInput[] }
    IssueInput { fingerprint, status(FAIL|BLOCKED|SKIPPED), trace, screenshots[], harPath, csvRow, flaky, priorRuns }
        │
        ▼  ci/agents/regression-triage-agent.md   (one call PER BATCH — judgment, oracle-grounded, READS screenshots)
  per-case: CLASS + severity/route/confidence + root cause + suggested fix
        │
        ▼  Phase 4: qa-frontend/backend-expert     (live repro of REAL_BUG candidates)
        ▼  Phase 5: /qa-review-tests --fix (test-defects) · /qa-bug draft (real bugs)   [only under --fix]
        ▼  Phase 6: reports/regression/{RUN_ID}/triage-report.md   +   STOP for human
```

## Deterministic core vs LLM judgment

The repo convention (see `compute-metrics.ts`, `lint-test-cases.ts`): **mechanics in a script, judgment in the prompt.**

| Deterministic — `scripts/lib/regression-triage.ts` | Judgment — `ci/agents/regression-triage-agent.md` + QA experts |
|---|---|
| Parse results, join each FAIL to its trace + CSV row | Classify each FAIL into the taxonomy |
| Collect screenshot/HAR **paths** (file-name matching) | **Read** the screenshot pixels; interpret the HAR |
| Fingerprint + cross-run flaky oscillation | Decide REAL_BUG vs test-defect |
| `appendSuiteHistory` → feed `compute-metrics.ts` | Route + recommend the fix |

## Evidence policy

- **Console + network** — from the trace's `consoleErrors[]` (parsed stack frames) and `networkFailures[]` (4xx/5xx + GraphQL `errors[]`). Primary signal; a real app-code exception or a genuine 5xx on a valid op ⇒ REAL_BUG lean; a benign warning / expected 401 ⇒ noise the test wrongly asserts against.
- **Screenshots** — the classifier **opens** them for any visual/element/layout assertion. A control that renders under a new name/place ⇒ STALE_TEST, not a broken product.
- **HAR** — per-browser-lane, huge — **reference by path, never inline** (`.claude/rules/reports.md`). The trace's `networkFailures[]` is the isolated per-failure slice; consult the HAR only when the trace is thin.

## Fingerprint & flaky model

`fingerprintFailure(env|suiteId|caseId|normalized-signature)` — the signature is the failed assertion (else the top stack frame), normalized to strip GUIDs/numbers/URLs/quoted values so data drift doesn't perturb it. The store (`reports/regression/.triage-fingerprints.json`) records each fingerprint's per-run outcome; **flaky = has been observed both PASSing and FAILing**. The stronger cross-run signal is `compute-metrics.ts` `trends()` (oscillation ≥3 crossings over ≥4 points), fed by `appendSuiteHistory` — which fixes the prior producer/consumer schema mismatch that left the flaky engine starved.

## Guardrails (see the command `## Rules`)

- Never file a tracker ticket, never call `/qa-fix`, never merge. STOP for a human.
- Never edit a CSV directly — test fixes go through `/qa-review-tests --fix` (diff + confirm).
- Triage FAIL + BLOCKED + SKIPPED (only PASS and PENDING excluded). BLOCKED → why (env / precondition / data / real bug); SKIPPED → removed feature (stale) vs intentional gate.
- Ambiguous → `REAL_BUG` / `CONFIDENCE: LOW` → human review; never relabel uncertainty as a test-defect.

## Live (incremental) triage — DESIGN, not yet implemented

Today triage starts only after the run completes, so on a ~240-case run the whole classification
cost lands as a serial tail. Overlapping it with execution is a real wall-clock win — the evidence
is already on disk the moment a case fails (`traces/{TC-ID}-FAIL-trace.json`, screenshots, the
lane HAR). **The win is only safe for the stages that need neither a browser nor a write.**

**Split at the browser boundary:**

| Stage | Browser? | Writes? | When |
|---|---|---|---|
| `triage:collect` (deterministic evidence bundle) | No | No | **Live**, per failure |
| Classify (`regression-triage-agent`) | No | No | **Live**, batched (~5 failures/agent) |
| Cross-suite correlation + fingerprint dedup | No | No | **Live**, cheap |
| Live-verify a `REAL_BUG` | **Yes** | No | **After** the run |
| `--fix` test-case edits | No | **Yes** | After that suite is `done` |
| `/qa-bug` drafting (needs repro) | **Yes** | Yes | **After** the run |

**Mechanism.** A `Monitor` tails `reports/regression/{RUN_ID}/suite-*-results.json` for newly-added
`FAIL` rows → batches them → spawns a **browserless** classifier per batch → accumulates
`reports/regression/{RUN_ID}/triage-provisional.json`. On run completion, **reconcile** and only
then run the browser stages.

**Four hazards that make the naive "triage everything live" version worse than serial — each is why
a stage sits where it does above:**

1. **Lane contention.** Max 3 concurrent browser agents and firefox cannot click this storefront or
   the Admin SPA (`.claude/rules/agents.md`), so a full run already owns both usable lanes. A
   live-verifying agent either steals a lane from the run it is accelerating or lands on firefox and
   fails spuriously. Anything needing a browser therefore waits.
2. **Retries have not settled.** The orchestrator retries a failed suite once via the fallback chain,
   so a FAIL at T can be a PASS at T+20m. Every live verdict is **provisional** until the suite is
   `done`; the reconcile step drops failures that later passed. Skipping it drafts bugs for flakes.
3. **Cross-case correlation is lost per-case.** One root cause typically produces failures across
   several suites (a platform `TypeLoadException` surfaced as failures across 042/078/031 on
   2026-08-06). Classify in **batches with the accumulated ledger in context**, never one case in
   isolation, or you file N bugs for one cause.
4. **Write/state hazards.** `--fix` edits suite CSVs while a runner may be executing that suite (the
   runner snapshots to `suite-*-resolved.csv`, but a later `suites:sync` would disagree), and a
   `/qa-bug` repro mutates env state under the live suites. Both are gated behind suite completion.

**Acceptance criteria for the implementation:** a provisional verdict is never presented as final; the
reconcile step is mandatory and logged (how many provisional verdicts were dropped on retry); zero
browser agents are spawned while any suite is `running`; and the ledger records, per finding, the
suite state at classification time so a reader can tell what was still in flight.

## Excluding known false positives

`config/known-false-positives.json` declares cases that **cannot** pass for a non-product reason (a
case asserting a surface that does not exist, or one gated behind config that is off by design).
Consumed by `scripts/regression/generate-regression-html-report.ts` to label and group such rows.

**It is not a mute button.** An entry never deletes or hides a row: the report still renders it,
still counts it, and prints an explicit `N excluded as non-actionable` disclosure. Every entry MUST
carry `reason` **and** `source` (the memory, ticket, or doc establishing it) — entries missing either
are dropped at load, so the registry cannot weaken a report by omission. The correct long-term fix is
to repair or retire the case via `/qa-review-tests --fix`; treat the file as a ledger of known debt
with a `recheckWhen` trigger, not a destination.

## Related

| Skill/command | Relationship |
|---|---|
| `/qa-regression` | Produces the run this flow triages. |
| `/qa-review-tests` | Applies the test-defect fixes (Phase 5) + confirms STALE_TEST live (Dimension 8). |
| `/qa-investigate` | The reproduce→isolate→root-cause depth for REAL_BUG live verification (Phase 4). |
| `/qa-bug` | Drafts the confirmed real bug (Phase 5) — STOP before filing. |
| `/qa-metrics` | Consumes the corrected `history.json` this flow feeds. |
| `/qa-monitoring` | The sibling triage flow (App Insights) whose skeleton this clones. |
