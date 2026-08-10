# Test Artifact Output Paths

**Every artifact MUST be saved to the correct folder. Never mix artifact types across directories.**

## HARD RULE — nothing is ever written to the project root

No screenshot, HAR, video, zip, report, or scratch file may be created at the **project root**. It
is the one place with no owner and no retention policy, so anything landing there is invisible to
the report, un-gitignored, and has to be cleaned up by hand. Reports go under `reports/…`, browser
captures under `reports/bugs/screenshots/…`, scratch files in the session temp dir.

### How a browser screenshot reaches its permanent path (the mechanism)

This used to be the gap: `--output-dir` and this file's destination policy both existed, but
**nothing connected them**, so the path was guessed and captures showed up at the project root
(VCST-5582 C). The chain below connects them — but it is **NOT fully deterministic on the pinned
`@playwright/mcp` version**, so Stage 5 is a mandatory reconcile, not an after-the-fact tidy:

> **Observed on `@playwright/mcp@0.0.77` (the pinned version — VCST-5702 ITEM 4):** a
> `browser_take_screenshot` with a **bare filename** does NOT reliably resolve against the
> configured absolute `--output-dir` — it resolves against the **MCP server's own cwd**, so 11
> captures in one session landed at the project root despite a correct `--output-dir`. Treat Stage 1
> as *best-effort placement*, and Stage 5 as the step that GUARANTEES the file ends up where the
> report needs it. `gen-mcp.mjs` emits the pinned version at project-init so this mismatch is
> visible; re-verify this behaviour when the pin changes.

| # | Stage | Who | Where |
|---|-------|-----|-------|
| 1 | **Capture** — `browser_take_screenshot` with a **bare relative filename**, never a path | the QA agent | playwright-mcp *tries* `--output-dir`, but on 0.0.77 may write to the server cwd |
| 2 | **Landing zone** — `--output-dir` is pinned to an **ABSOLUTE** project path by `/project-init` (`gen-mcp.mjs`) | the MCP server | `reports/bugs/screenshots/_incoming/<browser>/` |
| 3 | **ONE deterministic move** of the 1–5 captures the report keeps | `/qa-bug` Step 4a | `reports/bugs/screenshots/<bug-slug>/` |
| 4 | **Reference** — the report cites the FINAL path only | the report | `reports/bugs/screenshots/<bug-slug>/<file>.png` |
| 5 | **MANDATORY reconcile (before use)** — immediately after each capture, if the file is **not** under the configured `--output-dir`, locate it in the MCP server's cwd (the project root) and **move** it into `_incoming/<browser>/` before referencing it | `/qa-bug` Step 4a | `reports/bugs/screenshots/_incoming/<browser>/` |

Why absolute at stage 2: playwright-mcp resolves a *relative* `--output-dir` against the MCP
server's own cwd, which the plugin does not control — that is exactly how the project root became
the effective target. Why relative at stage 1: playwright-mcp documents *"Prefer relative file
names to stay within the output directory"*; absolute filenames are undocumented and must not be
relied on. Why stage 5 is now a **reconcile, not just a report**: on 0.0.77 the file genuinely
lands in the wrong place, so naming it is not enough — the step must FIND it (newest matching PNG in
the server cwd) and MOVE it into `_incoming/<browser>/` before the report can cite it. A capture
whose file cannot be located is reported as missing, never assumed present.

`_incoming/` and `test-results/` are **gitignored landing zones**, added to the project's
`.gitignore` by `gen-mcp.mjs`. Nothing in them is evidence of record — only what stage 3 moved out.

> **In `vc-fix`:** most rows below describe the full `vc-qa` plugin's output paths (regression,
> smoke, exploratory, checklists, BA, test-lifecycle, coverage — none of that is shipped here).
> This plugin actively uses: **Bug reports** (`reports/bugs/`), **Bug evidence**
> (`reports/bugs/screenshots/`, `reports/bugs/api-traces/`), **Ticket test evidence**
> (`reports/tickets/`), **Fix reports** (`reports/fixes/FIX-*/`), and **Monitoring summaries**
> (`reports/monitoring/MONITOR-*/`). Everything else is inert reference.

| Artifact Type | Path | Examples |
|---------------|------|----------|
| **Test documentation** (plans, cases, execution reports, testrail CSVs) | `reports/tickets/SprintXX-XX/VCST-XXXX/` | `test-plan.md`, `test-cases.md`, `test-execution-report.md`, `testrail-import.csv` |
| **Test screenshots** (evidence captured during test execution) | `reports/tickets/SprintXX-XX/VCST-XXXX/screenshots/` | `desktop/feature-overview.png`, `mobile/checkout-step3.png` |
| **Bug reports — open** (active bugs) | `reports/bugs/open/` | `BUG-Checkout-Payment-Overlap-iOS.md` |
| **Bug reports — fixed** (verified fixes, kept for regression reference) | `reports/bugs/fixed/` | `BUG-Cart-Total-Reset-VCST-4700.md` |
| **Bug reports — closed** (won't fix, false positive, cannot reproduce) | `reports/bugs/closed/` | `BUG-GA4-add-payment-info.md` |
| **Bug evidence** (screenshots & API traces for bugs) | `reports/bugs/screenshots/<bug-slug>/` and `reports/bugs/api-traces/` | `payment-form-broken-ios.png`, `graphql-error-response.json` |
| **Browser capture landing zone** (raw `browser_take_screenshot` output — gitignored, disposable) | `reports/bugs/screenshots/_incoming/{browser}/` | pinned as the Playwright MCP `--output-dir`; Step 4a moves the keepers out |
| **Ticket test evidence** (ad-hoc evidence with no sprint context) | `reports/tickets/VCST-XXXX/` | `test-report.md`, `screenshots/*.png` — use only for hotfix or ad-hoc verification outside a sprint |
| **Regression reports** (suite-level & consolidated reports) | `reports/regression/` | `frontend-regression-report-2026-02-09.md` |
| **Full regression runs** (multi-suite reports) | `reports/regression/REG-YYYY-MM-DD-HHMM/` | suite reports, `REGRESSION-REPORT.md` |
| **Smoke test runs** (`/qa-smoke` Track A + Track B) | `reports/regression/SMOKE-YYYY-MM-DD-HHMM/` | `smoke-report.md`, `suite-01-trackA-results.json`, `suite-01-trackB-results.json`, `trackA-evidence/`, `trackB-evidence/` |
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
- **Bug reports with a tracker ref:** `reports/bugs/open/BUG-{Description}-{KEY}.md` — `{KEY}` is the tracker's own key format (Jira `VCST-XXXX`, Azure Boards a bare numeric `12345`)
- **Bug lifecycle:** `open/` → (verified fix) → `fixed/` | (false positive/won't fix) → `closed/`
- **Ticket evidence:** `reports/tickets/{KEY}/test-report.md` (e.g. `VCST-XXXX/` on Jira, `12345/` on Azure Boards)
- **Screenshots:** `{component-name}-{state}-{viewport}.png` or `{test-case-id}-{description}.png`
- **Test execution reports:** `test-execution-report.md` (one per ticket folder)
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
├── test-plan.md
├── test-cases.md
├── test-execution-report.md
├── testrail-import.csv
└── screenshots/
    ├── desktop/
    └── mobile/
```

## Important Rules

- **No artifact is ever written to the project root** (see the HARD RULE at the top) — `/qa-bug`'s
  final sweep NAMES anything that still lands there rather than quietly moving it
- `test-results/` and `reports/bugs/screenshots/_incoming/` are gitignored landing zones for raw
  browser output (HAR, videos, console logs, un-kept captures) — never the path a report cites
- `reports/` is tracked in git -- use it for all documentation artifacts (the top-level `tests/` dir now holds only repo unit tests, not QA evidence)
- Never save test documentation into `test-results/` and never save raw browser dumps into `reports/`
- **Never create `reports/VCST-XXXX/` directly** — ticket folders belong under `reports/tickets/SprintXX-XX/VCST-XXXX/` (sprint context) or `reports/tickets/VCST-XXXX/` (ad-hoc, no sprint subfolder)
- **Default for `/qa-bug` / `/qa-fix` / `/qa-verify-fix` evidence:** use `reports/tickets/VCST-XXXX/` for ad-hoc evidence with no sprint context
- See `reports/README.md` for full naming convention reference
