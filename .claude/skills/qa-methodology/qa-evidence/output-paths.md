# Test Artifact Output Paths

**Every artifact MUST be saved to the correct folder. Never mix artifact types across directories.**

| Artifact Type | Path | Examples |
|---------------|------|----------|
| **Test documentation** (plans, cases, execution reports, testrail CSVs) | `tests/SprintXX-XX/VCST-XXXX/` | `test-plan.md`, `test-cases.md`, `test-execution-report.md`, `testrail-import.csv` |
| **Test screenshots** (evidence captured during test execution) | `tests/SprintXX-XX/VCST-XXXX/screenshots/` | `desktop/feature-overview.png`, `mobile/checkout-step3.png` |
| **Bug reports** (detailed bug documentation) | `reports/bugs/` | `BUG-Checkout-Payment-Overlap-iOS.md` |
| **Bug evidence** (screenshots & API traces for bugs) | `reports/bugs/screenshots/` and `reports/bugs/api-traces/` | `payment-form-broken-ios.png`, `graphql-error-response.json` |
| **Ticket test evidence** (per-ticket reports & screenshots) | `reports/tickets/VCST-XXXX/` | `test-report.md`, `screenshots/*.png` |
| **Regression reports** (suite-level & consolidated reports) | `reports/regression/` | `frontend-regression-report-2026-02-09.md` |
| **Full regression runs** (multi-suite reports) | `reports/regression/full-regression-YYYY-MM-DD/` | suite reports, `REGRESSION-REPORT.md` |
| **Performance reports** | `reports/performance/` | `lists-page-performance-report-2026-02-11.md` |
| **Exploratory session reports** (SBTM) | `reports/exploratory/` | `SBTM-checkout-edge-cases-2026-03-01.md` |
| **Raw browser artifacts** (console logs, HAR, videos -- gitignored) | `test-results/{browser}/` | `test-results/chrome/console-*.log`, `test-results/firefox/har/` |

## Naming Conventions

- **Bug reports:** `BUG-{Short-Description}.md` (e.g., `BUG-Guest-Checkout-Email-Validation.md`)
- **Bug reports with JIRA ref:** `BUG-{Description}-VCST-XXXX.md`
- **Ticket evidence:** `reports/tickets/VCST-XXXX/test-report.md`
- **Screenshots:** `{component-name}-{state}-{viewport}.png` or `{test-case-id}-{description}.png`
- **Test execution reports:** `test-execution-report.md` (one per ticket folder)
- **Regression reports:** `{suite-name}-report.md` or `{area}-regression-report-YYYY-MM-DD.md`
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
- See `reports/README.md` for full naming convention reference
