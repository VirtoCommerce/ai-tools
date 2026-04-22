# Reports — Naming Conventions & Structure

```
reports/
├── bugs/                     # Bug reports & evidence
│   ├── open/                  # Active bugs
│   ├── fixed/                 # Verified fixes (regression reference)
│   ├── closed/                # Won't fix, false positive, cannot reproduce
│   ├── screenshots/           # Bug evidence screenshots
│   └── api-traces/            # API response captures
├── regression/                # Regression run outputs
│   ├── {area}-regression-report-YYYY-MM-DD.md
│   ├── REG-YYYY-MM-DD-HHMM/  # Full regression run directory
│   │   ├── XX-{suite-name}-report.md
│   │   └── REGRESSION-REPORT.md
│   └── test-run-status.json   # Current run tracking
├── tickets/                   # Per-ticket test evidence (ad-hoc, no sprint context)
│   └── VCST-XXXX/
│       ├── test-report.md
│       ├── screenshots/
│       └── *.md
├── test-lifecycle/            # Test case quality pipeline reports
│   └── TLC-YYYY-MM-DD-HHMM/
│       ├── lifecycle-report.md
│       ├── issues-summary.json
│       └── metrics.json
├── coverage/                  # Coverage gap analysis reports
│   └── COV-YYYY-MM-DD-HHMM/
│       ├── coverage-generation-report.md
│       └── gap-inventory.json
├── performance/               # Performance investigation reports
├── exploratory/               # Exploratory session reports (SBTM)
├── checklists/                # Domain test checklists, verification checklists
├── ba/                        # BA analysis reports
└── README.md                  # This file
```

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Bug report | `bugs/open/BUG-{Short-Description}.md` | `BUG-Checkout-Payment-Overlap-iOS.md` |
| Bug with JIRA ref | `bugs/open/BUG-{Description}-VCST-XXXX.md` | `BUG-Search-Clear-Button-Not-Restoring-Results-VCST-4499.md` |
| Regression report | `regression/{area}-regression-report-YYYY-MM-DD.md` | `frontend-regression-report-2026-02-09.md` |
| Full regression run | `regression/REG-YYYY-MM-DD-HHMM/` | `REG-2026-04-20-1000/` with per-suite reports |
| Ticket evidence | `tickets/VCST-XXXX/` | Directory with test-report.md + screenshots |
| Performance report | `performance/{topic}-YYYY-MM-DD.md` | `lists-page-performance-report-2026-02-11.md` |
| Exploratory session | `exploratory/SBTM-{charter}-YYYY-MM-DD.md` | `SBTM-checkout-edge-cases-2026-03-01.md` |
| Test lifecycle run | `test-lifecycle/TLC-YYYY-MM-DD-HHMM/` | `TLC-2026-03-23-1500/` with lifecycle-report.md |
| Coverage generation run | `coverage/COV-YYYY-MM-DD-HHMM/` | `COV-2026-03-23-1600/` with coverage-generation-report.md |
| Checklist | `checklists/{domain}-checklist-YYYY-MM-DD.md` | `checkout-checklist-2026-03-06.md` |
| BA report | `ba/{topic}-YYYY-MM-DD.md` | `ba-report-2026-03-04.md` |

## Rules

- All bug reports **must** use the `BUG-` prefix
- Bug lifecycle: `open/` → (verified fix) → `fixed/` | (false positive/won't fix) → `closed/`
- Screenshots go in the nearest `screenshots/` directory (bug or ticket)
- API traces go in `bugs/api-traces/`
- Raw browser artifacts (HAR, videos, console logs) go in `test-results/` (gitignored), not here
