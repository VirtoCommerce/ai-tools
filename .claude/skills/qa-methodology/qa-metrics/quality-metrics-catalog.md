# Quality Metrics Catalog

> Comprehensive reference for all quality metrics used across QA testing activities.
> Every metric includes: definition, formula, data source, target, and action when off-target.

---

## 1. Test Execution Metrics

Measured per suite execution or aggregated across a regression run.

| Metric | Definition | Formula | Data Source | Target | Action When Off-Target |
|--------|-----------|---------|-------------|--------|----------------------|
| **Pass Rate** | Percentage of test cases that passed | (Passed / Total Executed) x 100 | Regression report JSON/MD | >=95% sprint, >=98% release | Triage all failures, determine if bug or env issue |
| **Fail Rate** | Percentage of test cases that failed | (Failed / Total Executed) x 100 | Regression report JSON/MD | <5% sprint, <2% release | Triage all failures, file bugs, assign priority |
| **Blocked Rate** | Percentage of planned tests that could not execute | (Blocked / Total Planned) x 100 | Regression report JSON/MD | <3% | Resolve blockers (env, data, dependency) before continuing |
| **Skip Rate** | Percentage of planned tests intentionally skipped | (Skipped / Total Planned) x 100 | Regression report JSON/MD | <5% | Investigate why tests are skipped; update or remove obsolete tests |
| **Execution Velocity** | Rate of test case execution | Test cases executed / Hours elapsed | Regression report timestamps | UI: ~8/hr, API: ~20/hr | Investigate if <50% of baseline; check env performance, test complexity |

### Metric Details

**Pass Rate** is the primary health indicator. A pass rate below the target threshold triggers a gate evaluation. When calculating pass rate, only count tests that were actually executed — do not include skipped or blocked tests in the denominator.

**Fail Rate** is the inverse signal. Every failed test case must be triaged into one of:
- Confirmed bug (file bug report)
- Environment issue (document and re-run)
- Test data issue (fix data and re-run)
- Flaky test (mark for stability investigation)

**Blocked Rate** above 3% indicates systemic issues — typically environment instability, missing test data, or dependency failures. Blocked tests are excluded from pass/fail rate calculations but counted against the total planned.

**Skip Rate** above 5% requires justification. Valid skip reasons: feature not yet deployed, test case deprecated, out-of-scope for current release. Invalid: "ran out of time" (reschedule, do not skip).

**Execution Velocity** varies significantly by test type:
- UI end-to-end tests (Playwright MCP): ~6-10 test cases per hour
- API/GraphQL tests: ~15-25 test cases per hour
- Visual regression (Storybook): ~10-15 comparisons per hour
- Exploratory testing: not measured by velocity (time-boxed sessions)

---

## 2. Defect Metrics

Measured per sprint, per release, or per testing cycle.

| Metric | Definition | Formula | Data Source | Target | Action When Off-Target |
|--------|-----------|---------|-------------|--------|----------------------|
| **Defect Density (DD)** | Rate of bugs found relative to test effort | Bugs found / Total test cases executed | Bug reports + regression report | <0.1 stable, 0.1-0.3 new features | Review test coverage; high DD in stable areas signals regression |
| **Defect Detection Rate (DDR)** | Proportion of bugs caught before production | Bugs found in testing / (Bugs in testing + Bugs in production) | Bug reports + production incidents | >90% | Improve test coverage for escaping bug categories |
| **Defect Removal Efficiency (DRE)** | Effectiveness of overall QA process | (Bugs before release / (Bugs before + Bugs after release)) x 100 | Bug reports + post-release tracking | >95% | Root cause analysis on escaped defects; add regression tests |
| **Mean Time to Detect (MTTD)** | Average time from bug introduction to discovery | Sum(detection_date - introduction_date) / Bug count | JIRA ticket dates | <1 sprint | Increase testing frequency; add smoke tests for gap areas |
| **Mean Time to Resolve (MTTR)** | Average time from bug report to verified fix | Sum(verified_date - reported_date) / Bug count | JIRA ticket workflow dates | P0: <3 days, P1: <1 sprint | Escalate aging bugs; review prioritization process |

### Interpreting Defect Density

| DD Value | Interpretation | Context |
|----------|---------------|---------|
| <0.05 | Excellent — very few defects relative to test coverage | Stable, well-tested area |
| 0.05-0.10 | Good — acceptable defect rate | Mature features with minor issues |
| 0.10-0.20 | Moderate — needs attention | New features or recently refactored code |
| 0.20-0.30 | Concerning — elevated defect rate | Significant code changes or insufficient dev testing |
| >0.30 | High — quality risk | Consider blocking release; request additional dev review |

### DRE Calculation Example

Sprint testing found 18 bugs. After release, 2 bugs were reported in production.
DRE = 18 / (18 + 2) x 100 = 90%

This is below the 95% target. Action: analyze the 2 escaped bugs, determine which test cases should have caught them, add those test cases to regression suites.

---

## 3. Coverage Metrics

Measured per sprint or per release cycle.

| Metric | Definition | Formula | Data Source | Target | Action When Off-Target |
|--------|-----------|---------|-------------|--------|----------------------|
| **Requirement Coverage** | Proportion of requirements with test cases | (Requirements with tests / Total requirements) x 100 | Test case mapping in TestRail/CSV | P0: 100%, P1: >=90%, P2: >=70% | Write missing test cases before sprint end |
| **Regression Suite Coverage** | Proportion of regression scenarios automated | (Regression tests / Total identified scenarios) x 100 | `regression/suites/` CSV files vs. scenario catalog | >=80% | Prioritize adding uncovered scenarios to suites |
| **Risk Coverage** | Proportion of high/critical risk items tested | (High/Critical items tested / Total high/critical items) x 100 | Risk assessment (see `/qa-risk`) + execution report | Critical: 100%, High: >=95% | Test all uncovered critical items before release |

### Coverage Priority Matrix

| Priority | Required Coverage | When to Measure | Action if Below Target |
|----------|------------------|-----------------|----------------------|
| P0 (Critical) | 100% | Every sprint + release | Block release until covered |
| P1 (High) | >=90% | Every sprint | Escalate uncovered items to next sprint |
| P2 (Medium) | >=70% | Per release | Schedule coverage improvement |
| P3 (Low) | Best effort | Quarterly | Track but do not block |

### Regression Suite Reference

The project has 36 regression suites (15 frontend + 21 backend) defined in `config/test-suites.json` with CSV files in `regression/suites/`. Coverage is measured against the E2E scenario catalog in `.claude/skills/testing/qa-plan/e2e-scenario-catalog.md`.

---

## 4. Trend Metrics

Calculated over time using historical data. Minimum 3 data points required for meaningful analysis.

| Metric | Definition | Formula | Data Source | Target | Action When Off-Target |
|--------|-----------|---------|-------------|--------|----------------------|
| **Pass Rate Trend** | Sprint-over-sprint pass rate change | Current pass rate - Previous pass rate | `reports/regression/history.json` | Stable or improving | Flag if -3% or worse; investigate root cause |
| **Defect Trend** | New bugs discovered per sprint | Count of new bugs in current sprint | Bug reports per sprint | Decreasing over time | Flag if 2x previous sprint; review code quality |
| **Escape Rate** | Production bugs as proportion of total bugs | Prod bugs / (Testing bugs + Prod bugs) per release | Bug reports + production incidents | <5% | Root cause escaped defects; strengthen pre-release testing |
| **Flakiness Rate** | Proportion of tests with inconsistent results | (Flaky test count / Total test count) x 100 | `reports/regression/history.json` | <5% | Quarantine flaky tests; fix root cause (timing, data, state) |

### Trend Thresholds and Alerts

| Condition | Severity | Action |
|-----------|----------|--------|
| Pass rate drops >=3% sprint-over-sprint | Warning | Investigate which suites degraded; check for new code regressions |
| Pass rate drops >=5% sprint-over-sprint | Critical | Escalate to dev lead; consider delaying release |
| 3+ consecutive pass rate drops (any amount) | Critical | Root cause systemic quality degradation; review process |
| Defect count 2x previous sprint | Warning | Review code review quality; check if coverage gaps exist |
| Escape rate >5% for a release | Critical | Post-mortem required; add escaped bug categories to regression |
| Flakiness rate >10% | Critical | Dedicated sprint effort to stabilize test suite |

### Identifying Flaky Tests

A test is considered flaky when it produces different results (pass/fail) across consecutive runs without any code changes. Detection method:
1. Query `history.json` for the same test case across multiple runs
2. If the test oscillates between pass and fail within a 2-week window with no code changes, mark as flaky
3. Calculate flakiness rate per suite and overall

---

## 5. Summary Table — All Metrics

| Category | Metric | Formula | Target | Cadence | Data Source |
|----------|--------|---------|--------|---------|-------------|
| Execution | Pass Rate | (Passed / Executed) x 100 | >=95% sprint, >=98% release | Per run | Regression report |
| Execution | Fail Rate | (Failed / Executed) x 100 | <5% sprint, <2% release | Per run | Regression report |
| Execution | Blocked Rate | (Blocked / Planned) x 100 | <3% | Per run | Regression report |
| Execution | Skip Rate | (Skipped / Planned) x 100 | <5% | Per run | Regression report |
| Execution | Execution Velocity | Cases / Hours | UI ~8/hr, API ~20/hr | Per run | Report timestamps |
| Defect | Defect Density | Bugs / Cases executed | <0.1 stable, <0.3 new | Per sprint | Bug + regression reports |
| Defect | Detection Rate (DDR) | Testing bugs / All bugs | >90% | Per release | Bug + incident reports |
| Defect | Removal Efficiency (DRE) | Pre-release bugs / Total bugs x 100 | >95% | Per release | Bug + incident reports |
| Defect | Mean Time to Detect | Avg(detect - introduce) | <1 sprint | Per sprint | JIRA dates |
| Defect | Mean Time to Resolve | Avg(verified - reported) | P0 <3d, P1 <1 sprint | Per sprint | JIRA workflow dates |
| Coverage | Requirement Coverage | Reqs with tests / Total reqs x 100 | P0:100%, P1:90%, P2:70% | Per sprint | TestRail/CSV mapping |
| Coverage | Regression Coverage | Regression tests / Total scenarios x 100 | >=80% | Per release | Suite CSVs vs. catalog |
| Coverage | Risk Coverage | High items tested / Total high items x 100 | Critical:100%, High:95% | Per release | Risk assessment + report |
| Trend | Pass Rate Trend | Current - Previous pass rate | Stable or improving | Per sprint | history.json |
| Trend | Defect Trend | New bugs per sprint | Decreasing | Per sprint | Bug reports |
| Trend | Escape Rate | Prod bugs / All bugs | <5% | Per release | Bug + incident reports |
| Trend | Flakiness Rate | Flaky tests / Total tests x 100 | <5% | Per sprint | history.json |

---

## 6. Reporting Cadence

| Frequency | Report Type | Metrics Included | Audience | Output Location |
|-----------|-------------|-----------------|----------|-----------------|
| Daily | Smoke report | Pass rate, fail count, blocked count | QA team | `reports/regression/` |
| Weekly | Sprint quality report | All execution + defect metrics | QA lead + dev lead | `reports/regression/` |
| Per-release | Release quality report | All metrics + trends + gate verdict | Product owner + stakeholders | `reports/regression/` |
| Monthly | Quality trend review | Trends, escape rate, DRE, flakiness | QA management | `reports/regression/` |

### Report Content by Type

**Daily Smoke Report** (Compact tier per `/qa-evidence`):
- Suite 01 pass/fail/blocked counts
- List of any failures with ticket references
- Environment health status
- Gate verdict: PASS or FAIL (smoke gate from `quality-gates.md`)

**Weekly Sprint Quality Report** (Detailed tier):
- Execution metrics for all suites run this week
- Defect metrics: new bugs filed, DD, outstanding P0/P1 counts
- Coverage: sprint ticket coverage percentage
- Blockers and risks
- Sprint-over-sprint pass rate delta

**Release Quality Report** (Sign-Off tier):
- All metrics from sections 1-4
- Gate evaluation against release-level thresholds
- Trend analysis (pass rate, defect trend, escape rate)
- Risk assessment summary (cross-reference `/qa-risk`)
- Final verdict: APPROVED / APPROVED WITH CONDITIONS / BLOCKED
- Evidence links for all key findings

**Monthly Trend Review**:
- 4-week rolling pass rate chart data
- DRE and escape rate per release in the period
- Flakiness rate trend with top offending tests
- Recommendations for process improvement

---

## 7. Using history.json for Trend Analysis

### File Location
`reports/regression/history.json`

### Expected Structure
```json
[
  {
    "runId": "regression-2026-02-28-smoke",
    "date": "2026-02-28T06:00:00Z",
    "suiteId": "01",
    "suiteName": "Smoke Tests",
    "environment": "qa",
    "browser": "chromium",
    "total": 12,
    "passed": 12,
    "failed": 0,
    "blocked": 0,
    "skipped": 0,
    "duration_minutes": 18,
    "bugs_found": 0,
    "pass_rate": 100.0
  }
]
```

### Analysis Workflow

1. **Read** `reports/regression/history.json`
2. **Filter** by suite ID or date range as needed
3. **Calculate per-suite metrics:**
   - Pass rate per run: `passed / (passed + failed) x 100`
   - Rolling average (last 5 runs): `sum(pass_rates) / 5`
   - Sprint-over-sprint delta: `current_avg - previous_avg`
   - Standard deviation: for flakiness detection
4. **Identify anomalies:**
   - Any run with pass rate >2 standard deviations below the rolling mean
   - Any suite with 3+ consecutive pass rate drops
   - Any suite with oscillating pass/fail patterns (flakiness indicator)
5. **Produce trend summary:**
   - Per-suite trend direction (improving, stable, degrading)
   - Overall quality trajectory
   - Specific recommendations for degrading suites

### Minimum Data Requirements

| Analysis Type | Minimum Data Points | Recommended |
|--------------|--------------------:|------------:|
| Point-in-time metric | 1 | 1 |
| Simple comparison | 2 | 3 |
| Trend direction | 3 | 5 |
| Rolling average | 5 | 10 |
| Standard deviation / flakiness | 5 | 10 |
| Seasonal pattern detection | 12 | 20+ |

**Warning:** Do not extrapolate trends from fewer than 3 data points. With 1-2 runs, report the raw numbers only — do not claim a trend direction.
