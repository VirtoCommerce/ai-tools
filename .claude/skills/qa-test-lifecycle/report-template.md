# /qa-test-lifecycle — final report

Supporting file for [`/qa-test-lifecycle`](../../commands/qa-test-lifecycle.md), moved here from the command to keep the command under its BUDGET-004 baseline. Read it at close-out, every run.

## Final Report

Generate run ID: `TLC-YYYY-MM-DD-HHMM` — used only to label the summary below and any gitignored Phase 5
screenshots (`reports/test-lifecycle/TLC-YYYY-MM-DD-HHMM/`, screenshots only). Per `.claude/rules/reports.md`
§1, this run summary is **terminal-only** — present it directly in your final chat response, do not write a
`lifecycle-report.md` or `lifecycle-summary.json` file to disk.

### Terminal summary (present in chat — do not write to disk)

```markdown
# Test Case Lifecycle Report — {RUN_ID}

## Summary
- **Input:** [original input]
- **Input Type:** change-source | direct-scope
- **Date:** YYYY-MM-DD HH:MM
- **Platform:** [PlatformVersion from packages.json]
- **Theme:** [theme version from artifact.json]
- **Module Versions:** [relevant modules with versions]
- **Verdict:** APPROVED | APPROVED WITH WARNINGS | NEEDS FIXES | BLOCKED

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | N suites affected, input type: X |
| 2. Sync | test-management-specialist | Done/Skipped | N stale updated, M broken addressed |
| 3. Analyze & Generate | test-management-specialist | Done/Skipped | N gaps found, M cases created |
| 4. Review & Fix | test-management-specialist | Done | N findings (B: X, C: Y, H: Z, M: W) |
| 5. Verify | qa-testing-expert | Done/Skipped | N verified, X changed, Y broken |
| 6. Approve | orchestrator | **VERDICT** | Gates: N/M passed |
| 6P. Promote | orchestrator | Done/No-op | N promoted → suite(s), M stayed `Draft` |

## Change Inventory (if change-driven)
| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|

## Sync Results (if Phase 2 ran)
| Case ID | Suite | Classification | Action | Before | After |
|---------|-------|---------------|--------|--------|-------|

## Coverage Delta (if Phase 3 ran)

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total cases | N | M | +X |
| BL-* coverage | X% | Y% | +Z% |
| P0 case count | N | M | +X |

## New Cases Generated
| Case ID | Suite | Title | Layer | Priority |

## Promotion (only when Phase 6P ran)
Source: in-suite `Draft` rows for VCST-XXXX, or `reports/tickets/{SPRINT}/VCST-XXXX/test-cases.csv` — N authored, M promoted, K blocked, J unroutable.

| Case ID | Target suite | Status | `Draft →` | Reason (if not promoted) |
|---------|--------------|--------|-----------|--------------------------|
| TC-XXX | 028 `Frontend/cart/028-cart-core.csv` | PROMOTED | Reviewed | — |
| TC-YYY | — | BLOCKED | stays `Draft` | unresolved `{HYPOTHESIS}` — which error wins when both predicates block |

Manifest: `config/test-suites.json` testCount updated for [suite ids]; `suites:lint` green.

## Documentation Findings
| Module | Topic Queried | Behavior Change Detected | Cases Influenced |

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1-G11 | PASS/FAIL/WARN/SKIP | ... |

## Environment Verification (if Phase 5 ran)

| Case ID | URL | Check | Result | Screenshot |
|---------|-----|-------|--------|------------|

## Remaining Items

### Must Fix (blocks regression)
| Case ID | Issue | Dimension | Suggested Fix |

### Should Fix (improves quality)
| Case ID | Issue | Dimension | Suggested Fix |

## Files Modified
- [list of CSV files with change summary]

## BL Audit (when the run surfaced BL candidates)
- K rules: X marked `SUSPECT` (bug keys); Y written from a human source (`bl/<slug>.yaml`); Z resolved; W observations sent to the `kb`. (Omit if 4c had no candidates.)

## Next Steps
- [ ] Address "Must Fix" items
- [ ] Run `/qa-regression` with reviewed suite(s)
- [ ] File JIRA tickets for environment issues
```

No `lifecycle-summary.json` is written either — nothing downstream parses it today (CI's `run-full-cycle.ts`
already consumes this agent's returned chat text directly, not a file), so the structured fields above
(`gateResults`, `casesAnalyzed`, etc.) go in the terminal summary's tables, not a separate JSON artifact.
