---
name: qa-triage-results
description: "[QA Methodology] Triage a completed regression run's failures: collect each FAIL + its evidence (trace, screenshots, console, network) + failing CSV row, dedup + flag flaky, classify each into real-product-bug vs test-defect (bad steps / bad assertion / stale test data / stale test) vs flaky/env/known, live-verify the real ones, then route test-defects to /qa-review-tests --fix and draft bug reports. Detect-classify-verify-report only — never files a tracker ticket, never triggers /qa-fix."
argument-hint: "[RUN_ID | latest] [--fix] [--verify]"

---

# /qa-triage-results — Regression-Results Triage & Analysis

Methodology behind the [`/qa-triage-results` command](../../commands/qa-triage-results.md). A regression run answers *which* tests failed; this flow answers *why*, and hands each failure to the right follow-up. It is the missing consumer between `/qa-regression` and `/qa-bug`→`/qa-fix`, built on the proven `/qa-monitoring` skeleton: **collect → dedup → triage → live-verify → report → STOP.**

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

## Related

| Skill/command | Relationship |
|---|---|
| `/qa-regression` | Produces the run this flow triages. |
| `/qa-review-tests` | Applies the test-defect fixes (Phase 5) + confirms STALE_TEST live (Dimension 8). |
| `/qa-investigate` | The reproduce→isolate→root-cause depth for REAL_BUG live verification (Phase 4). |
| `/qa-bug` | Drafts the confirmed real bug (Phase 5) — STOP before filing. |
| `/qa-metrics` | Consumes the corrected `history.json` this flow feeds. |
| `/qa-monitoring` | The sibling triage flow (App Insights) whose skeleton this clones. |
