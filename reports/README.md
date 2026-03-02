# Reports — Naming Conventions & Structure

```
reports/
├── bugs/                     # Bug reports & evidence
│   ├── BUG-{Short-Desc}.md   # Bug documentation (required BUG- prefix)
│   ├── screenshots/           # Bug evidence screenshots
│   └── api-traces/            # API response captures
├── regression/                # Regression run outputs
│   ├── {area}-regression-report-YYYY-MM-DD.md
│   └── full-regression-YYYY-MM-DD/
│       ├── XX-{suite-name}-report.md
│       └── REGRESSION-REPORT.md
├── tickets/                   # Per-ticket test evidence
│   └── VCST-XXXX/
│       ├── test-report.md
│       ├── screenshots/
│       └── *.md
├── performance/               # Performance investigation reports
├── exploratory/               # Exploratory session reports (SBTM)
└── README.md                  # This file
```

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Bug report | `BUG-{Short-Description}.md` | `BUG-Checkout-Payment-Overlap-iOS.md` |
| Bug with JIRA ref | `BUG-{Description}-VCST-XXXX.md` | `BUG-Search-Clear-Button-Not-Restoring-Results-VCST-4499.md` |
| Regression report | `{area}-regression-report-YYYY-MM-DD.md` | `frontend-regression-report-2026-02-09.md` |
| Full regression run | `full-regression-YYYY-MM-DD/` | Directory with per-suite reports |
| Ticket evidence | `tickets/VCST-XXXX/` | Directory with test-report.md + screenshots |
| Performance report | `performance/{topic}-YYYY-MM-DD.md` | `lists-page-performance-report-2026-02-11.md` |
| Exploratory session | `exploratory/SBTM-{charter}-YYYY-MM-DD.md` | `SBTM-checkout-edge-cases-2026-03-01.md` |

## Rules

- All bug reports **must** use the `BUG-` prefix
- Screenshots go in the nearest `screenshots/` directory (bug or ticket)
- API traces go in `bugs/api-traces/`
- Raw browser artifacts (HAR, videos, console logs) go in `test-results/` (gitignored), not here
