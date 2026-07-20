---
name: qa-metrics
description: "[QA Method] Quality metrics & gates: pass rate, defect density, DRE, coverage tracking, quality gate enforcement."
argument-hint: "[metrics|gates|report|trends]"
disable-model-invocation: true
---

# /qa-metrics — Quality Metrics & Quality Gates

Measure test effectiveness and enforce quality gates for sprint releases, full releases, and regression runs. Use to assess current quality posture, track trends, or validate go/no-go decisions.

## Usage
```
/qa-metrics                    # Full overview (all metrics + gates)
/qa-metrics metrics            # Metric definitions and formulas
/qa-metrics gates              # Quality gate thresholds only
/qa-metrics report             # Generate quality report from latest run
/qa-metrics trends             # Analyze trends from history.json
```

## Supporting Files

- **quality-metrics-catalog.md** — All metric definitions with formulas, targets, data sources, actions, and reporting cadence
- **quality-gates.md** — Gate thresholds for smoke/sprint/release, rollback criteria, escalation matrix, gate enforcement checklist

## Execution

> **Compute the numbers deterministically — don't do the arithmetic by hand.**
> `npm run metrics:compute -- --history reports/regression/history.json [--gate smoke|sprint|release|hotfix]
> [--suite <id>] [--since <ISO>] [--p0-bugs N] [--p1-bugs N] [--json]` (`scripts/regression/compute-metrics.ts`) is the
> single source for every formula in `quality-metrics-catalog.md` (pass/fail/blocked/skip rate, velocity,
> defect density) and every trend (sprint-over-sprint delta, rolling average, consecutive drops, flakiness),
> plus the gate verdict per `quality-gates.md` §9 (PASS/FAIL or APPROVED / WITH CONDITIONS / BLOCKED). It
> exits non-zero on BLOCKED/FAIL so it can gate CI. Pass-rate criteria are computed from the run history;
> open-P0/P1 bug counts come from JIRA, so supply them via `--p0-bugs`/`--p1-bugs` (default 0). The skill's
> job is to run this, then write the narrative around the numbers — never to recompute them.

1. **Determine the context:**
   - `metrics` → Read `quality-metrics-catalog.md`, list all metric definitions
   - `gates` → Read `quality-gates.md`, show gate thresholds for the relevant release type
   - `report` → Read both files, compute metrics from latest regression results in `reports/regression/`
   - `trends` → Read `quality-metrics-catalog.md` "Using history.json" section, analyze `reports/regression/history.json`

2. **For quality reports:**
   - Read latest regression report(s) from `reports/regression/`
   - Calculate: pass rate, fail rate, blocked rate, execution velocity
   - Calculate: defect density (bugs per test case), defect detection rate
   - Compare against gate thresholds from `quality-gates.md`
   - Render verdict: APPROVED / APPROVED WITH CONDITIONS / BLOCKED

3. **For trend analysis:**
   - Read `reports/regression/history.json` (90-day rolling window)
   - Calculate sprint-over-sprint pass rate delta
   - Identify flaky tests (pass/fail oscillation)
   - Flag degradation trends (3+ consecutive drops)
   - Produce trend summary with recommendations

4. **For go/no-go decisions:**
   - Identify the release type (smoke, sprint, full, hotfix)
   - Load corresponding gate from `quality-gates.md`
   - Evaluate each gate criterion against current metrics
   - Output: gate status per criterion, overall verdict, blockers list

## Integration with Other Skills
- Use `/qa-risk` to determine which metrics matter most for current scope
- Use `/qa-evidence` for output formatting of quality reports
- Gate enforcement integrates with regression-orchestrator's final report

## Rules
- Metrics must be calculated from actual test results, never estimated
- Quality gates are non-negotiable — BLOCKED means no deployment
- APPROVED WITH CONDITIONS requires explicit risk acceptance documentation (see `/qa-risk`)
- Trend analysis requires at least 3 data points — do not extrapolate from 1-2 runs
- Always include the data timestamp and run ID in metric reports
