# Test Artifact Output Paths

**Every artifact MUST be saved to the correct folder. Never mix artifact types across directories.**

| Artifact Type | Path | Examples |
|---------------|------|----------|
| **Test documentation** (plans, cases, execution reports, testrail CSVs) | `tests/SprintXX-XX/VCST-XXXX/` | `test-plan.md`, `test-cases.md`, `test-execution-report.md`, `testrail-import.csv` |
| **Test screenshots** (evidence captured during test execution) | `tests/SprintXX-XX/VCST-XXXX/screenshots/` | `desktop/feature-overview.png`, `mobile/checkout-step3.png` |
| **Bug reports — open** (active bugs) | `reports/bugs/open/` | `BUG-Checkout-Payment-Overlap-iOS.md` |
| **Bug reports — fixed** (verified fixes, kept for regression reference) | `reports/bugs/fixed/` | `BUG-Cart-Total-Reset-VCST-4700.md` |
| **Bug reports — closed** (won't fix, false positive, cannot reproduce) | `reports/bugs/closed/` | `BUG-GA4-add-payment-info.md` |
| **Bug evidence** (screenshots & API traces for bugs) | `reports/bugs/screenshots/` and `reports/bugs/api-traces/` | `payment-form-broken-ios.png`, `graphql-error-response.json` |
| **Ticket test evidence** (ad-hoc evidence with no sprint context) | `reports/tickets/VCST-XXXX/` | `test-report.md`, `screenshots/*.png` — use only for hotfix or ad-hoc verification outside a sprint |
| **Regression reports** (suite-level & consolidated reports) | `reports/regression/` | `frontend-regression-report-2026-02-09.md` |
| **Full regression runs** (multi-suite reports) | `reports/regression/REG-YYYY-MM-DD-HHMM/` | suite reports, `REGRESSION-REPORT.md` |
| **Performance reports** | `reports/performance/` | `lists-page-performance-report-2026-02-11.md` |
| **Exploratory session reports** (SBTM) | `reports/exploratory/` | `SBTM-checkout-edge-cases-2026-03-01.md` |
| **Checklists** (domain test checklists, verification checklists) | `reports/checklists/` | `checkout-checklist-2026-03-06.md`, `b2c-variations-checklist.md` |
| **BA analysis reports** (system analysis, stories, API audit) | `reports/ba/` | `ba-report-2026-03-04.md`, `checkout-stories.md` |
| **BA business logic proposals** (draft `PROPOSED-BL-*` invariants from `/ba-analyze`; human-promoted into `business-logic.md`) | `reports/ba/` | `bl-proposals-2026-04-22.md` |
| **Test lifecycle reports** (quality pipeline results — includes change-driven sync) | `reports/test-lifecycle/TLC-YYYY-MM-DD-HHMM/` | `lifecycle-report.md`, `issues-summary.json`, `metrics.json` |
| **Coverage generation reports** (gap analysis results) | `reports/coverage/COV-YYYY-MM-DD-HHMM/` | `coverage-generation-report.md`, `gap-inventory.json` |
| **Raw browser artifacts** (console logs, HAR, videos -- gitignored) | `test-results/{browser}/` | `test-results/chrome/console-*.log`, `test-results/firefox/har/` |

## Naming Conventions

- **Bug reports:** `reports/bugs/open/BUG-{Short-Description}.md` (e.g., `BUG-Guest-Checkout-Email-Validation.md`)
- **Bug reports with JIRA ref:** `reports/bugs/open/BUG-{Description}-VCST-XXXX.md`
- **Bug lifecycle:** `open/` → (verified fix) → `fixed/` | (false positive/won't fix) → `closed/`
- **Ticket evidence:** `reports/tickets/VCST-XXXX/test-report.md`
- **Screenshots:** `{component-name}-{state}-{viewport}.png` or `{test-case-id}-{description}.png`
- **Test execution reports:** `test-execution-report.md` (one per ticket folder)
- **Regression reports:** `{suite-name}-report.md` or `{area}-regression-report-YYYY-MM-DD.md`
- **Full regression run directories:** `REG-YYYY-MM-DD-HHMM/` (e.g., `REG-2026-04-20-1000/`)
- **Test lifecycle run directories:** `TLC-YYYY-MM-DD-HHMM/`
- **Test sync run directories:** `SYNC-YYYY-MM-DD-HHMM/`
- **Coverage generation run directories:** `COV-YYYY-MM-DD-HHMM/`
- **Exploratory sessions:** `SBTM-{charter}-YYYY-MM-DD.md`

## Folder Structure Per Ticket

```
tests/SprintXX-XX/VCST-XXXX-feature-name/
├── test-plan.md
├── test-cases.md
├── test-execution-report.md
├── testrail-import.csv
└── screenshots/
    ├── desktop/
    └── mobile/
```

## Important Rules

- `test-results/` is gitignored -- use it only for raw browser output (HAR, videos, console logs)
- `tests/` and `reports/` are tracked in git -- use them for all documentation artifacts
- Never save test documentation into `test-results/` and never save raw browser dumps into `tests/` or `reports/`
- **Never create `reports/VCST-XXXX/` directly** — ticket folders belong under `reports/tickets/VCST-XXXX/` or `tests/SprintXX-XX/VCST-XXXX/`
- **Default for `/qa-test` runs:** always use `tests/SprintXX-XX/VCST-XXXX/`; only use `reports/tickets/` for ad-hoc evidence with no sprint context
- See `reports/README.md` for full naming convention reference
