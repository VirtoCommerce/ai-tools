# Test Artifact Output Paths

**Every artifact MUST be saved to the correct folder. Never mix artifact types across directories.**

| Artifact Type | Path | Examples |
|---------------|------|----------|
| **Test documentation** (plans, cases, testrail CSVs — NOT execution reports, see below) | `reports/tickets/SprintXX-XX/VCST-XXXX/` | `test-plan.md` (`/qa-plan`), `test-cases.csv` (`/qa-test-cases-generator`), `testrail-import.csv` |
| **Test screenshots** (evidence captured during test execution) | `reports/tickets/SprintXX-XX/VCST-XXXX/screenshots/` | `desktop/feature-overview.png`, `mobile/checkout-step3.png` |
| **`/qa-test` run summary** (AC analysis, checklist, execution + change-scoped regression results) | **Terminal only** — folded into one chat report, never written as separate files (`.claude/rules/reports.md` §1) | n/a — only `summary.json` (duplicate-run marker) + `screenshots/` persist to `reports/tickets/SprintXX-XX/VCST-XXXX/`; new cases persist to `regression/suites/` |
| **Bug reports — open** (active bugs) | `reports/bugs/open/` | `BUG-Checkout-Payment-Overlap-iOS.md` |
| **Bug reports — fixed** (verified fixes, kept for regression reference) | `reports/bugs/fixed/` | `BUG-Cart-Total-Reset-VCST-4700.md` |
| **Bug reports — closed** (won't fix, false positive, cannot reproduce) | `reports/bugs/closed/` | `BUG-GA4-add-payment-info.md` |
| **Bug evidence** (screenshots & API traces for bugs) | `reports/bugs/screenshots/` and `reports/bugs/api-traces/` | `payment-form-broken-ios.png`, `graphql-error-response.json` |
| **Ticket test evidence** (ad-hoc evidence with no sprint context) | `reports/tickets/VCST-XXXX/` | `test-report.md`, `screenshots/*.png` — use only for hotfix or ad-hoc verification outside a sprint (no `SprintXX-XX/` subfolder) |
| **Regression reports** (suite-level & consolidated reports) | `reports/regression/` | `frontend-regression-report-2026-02-09.md` |
| **Full regression runs** (multi-suite reports) | `reports/regression/REG-YYYY-MM-DD-HHMM/` | suite reports, `REGRESSION-REPORT.md` |
| **Smoke test runs** (`/qa-smoke` Track A + Track B) | `reports/regression/SMOKE-YYYY-MM-DD-HHMM/` | `smoke-report.md`, `suite-01-trackA-results.json`, `suite-01-trackB-results.json`, `trackA-evidence/`, `trackB-evidence/` |
| **Performance reports** (standalone investigations worth keeping) | `reports/performance/` | `lists-page-performance-report-2026-02-11.md` |
| **Exploratory session reports** (standalone `/qa-sbtm` / `/qa-exploratory` domain charters — read back for the 24h duplicate-charter check; `/qa-test` no longer runs an exploratory charter) | `reports/exploratory/` | `SBTM-checkout-edge-cases-2026-03-01.md` |
| **Checklists** (`/qa-checklist` output) | **Terminal only** — no active writer today; `reports/checklists/` is reserved for a future durable checklist artifact | n/a |
| **BA analysis reports** (system analysis, stories, API audit) | `reports/ba/` | `ba-report-2026-03-04.md`, `checkout-stories.md` |
| **BA business logic proposals** (draft `PROPOSED-BL-*` invariants from `/ba-analyze`; human-promoted into `business-logic.md`) | `reports/ba/` | `bl-proposals-2026-04-22.md` |
| **Test lifecycle run summary** (quality pipeline results — includes change-driven sync) | **Terminal only** — presented in the chat response, never written to disk (`.claude/rules/reports.md` §1) | n/a — Phase 5 screenshots only may still land in the gitignored `reports/test-lifecycle/TLC-YYYY-MM-DD-HHMM/` |
| **Coverage generation reports** (gap analysis results) | `reports/coverage/COV-YYYY-MM-DD-HHMM/` | `coverage-generation-report.md`, `gap-inventory.json` |
| **BL audit reports** (`/qa-review-bl` triangulation trail) | `reports/knowledge/` | `BL-AUDIT-2026-07-22.md` |
| **Raw browser artifacts** (console logs, HAR, videos -- gitignored) | `test-results/{browser}/` | `test-results/chrome/console-*.log`, `test-results/firefox/har/` |

## Naming Conventions

- **Bug reports:** `reports/bugs/open/BUG-{Short-Description}.md` (e.g., `BUG-Guest-Checkout-Email-Validation.md`)
- **Bug reports with JIRA ref:** `reports/bugs/open/BUG-{Description}-VCST-XXXX.md`
- **Bug lifecycle:** `open/` → (verified fix) → `fixed/` | (false positive/won't fix) → `closed/`
- **Ticket evidence:** `reports/tickets/VCST-XXXX/test-report.md`
- **Screenshots:** `{component-name}-{state}-{viewport}.png` or `{test-case-id}-{description}.png`
- **`/qa-test` execution results:** terminal-only, no file — folded into its Step 6 chat report; only `summary.json` persists
- **Regression reports:** `{suite-name}-report.md` or `{area}-regression-report-YYYY-MM-DD.md`
- **Full regression run directories:** `REG-YYYY-MM-DD-HHMM/` (e.g., `REG-2026-04-20-1000/`)
- **Smoke run directories:** `SMOKE-YYYY-MM-DD-HHMM/` (e.g., `SMOKE-2026-05-21-1035/`) — Track A/B screenshots go under `trackA-evidence/` and `trackB-evidence/` inside the run folder, not at repo root
- **Test lifecycle run directories:** `TLC-YYYY-MM-DD-HHMM/`
- **Test sync run directories:** `SYNC-YYYY-MM-DD-HHMM/`
- **Coverage generation run directories:** `COV-YYYY-MM-DD-HHMM/`
- **Exploratory sessions:** `SBTM-{charter}-YYYY-MM-DD.md`

## Folder Structure Per Ticket

```
reports/tickets/SprintXX-XX/VCST-XXXX-feature-name/
├── summary.json            # /qa-test's only persisted file besides screenshots
├── test-cases.csv          # only if /qa-test Step 3 or /qa-test-cases-generator authored new cases
├── test-plan.md            # only if a standalone /qa-plan run targeted this ticket
├── {check-type}-report.md  # only if a different ticket-scoped skill ran here (/qa-design, /qa-storybook, /qa-verify-fix, ...)
└── screenshots/
    ├── desktop/
    └── mobile/
```

## Important Rules

- `test-results/` is gitignored -- use it only for raw browser output (HAR, videos, console logs)
- `reports/` is tracked in git -- use it for all documentation artifacts (the top-level `tests/` dir now holds only repo unit tests, not QA evidence)
- Never save test documentation into `test-results/` and never save raw browser dumps into `reports/`
- **Never create `reports/VCST-XXXX/` directly** — ticket folders belong under `reports/tickets/SprintXX-XX/VCST-XXXX/` (sprint context) or `reports/tickets/VCST-XXXX/` (ad-hoc, no sprint subfolder)
- **Default for `/qa-test` runs:** always use `reports/tickets/SprintXX-XX/VCST-XXXX/`; only use `reports/tickets/VCST-XXXX/` (no `SprintXX-XX/` subfolder) for ad-hoc evidence with no sprint context
- See `reports/README.md` for full naming convention reference
