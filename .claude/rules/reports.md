# Reports — Single Source of Truth

**This file is the only place the report policy lives.** All other files (`shared-instructions.md`, `evidence-capture-policy.md`, skill SKILLs, agent definitions) point here. Reports are read by humans on a deadline — long reports get skimmed and bugs get missed. Long-form reasoning, investigation logs, and progress updates belong in SendMessage to the orchestrator, never on disk.

## 1. Only Ten Report Categories Allowed

| # | Category | Path | When |
|---|----------|------|------|
| 1 | Bug report | `reports/bugs/open/` or `reports/bugs/fixed/` — **exactly one, never both** | A confirmed defect with reproducible STR. `/qa-verify-fix` **moves** `open/` → `fixed/` on a VERIFIED verdict (adding a `## Resolution` block) — it is a move, not a copy. A file present in both directories is a defect: the stale `open/` copy makes a fixed bug look outstanding and gets counted twice by any open-bug scan, including the Feature Release Gate's "0 open P0" criterion. When you find one, delete the `open/` copy |
| 2 | Test cases | `regression/suites/` (CSV) | Adding/updating test coverage. `/qa-test`-authored cases land here directly as `Automation_Status = Draft` (Step 3) and are flipped in-run to `Automated`/`Reviewed` at 5g (last, non-blocking) after execution — never a run-scoped ticket CSV |
| 3 | BA report | `reports/ba/` — optionally in a **domain subfolder** (the established convention: `Configurable products/`, `Organization roles/`, `Page Builder (CMS)/`, `Sales-rep/`…; spaces are fine, quote the path in shell) | `/ba-analyze` deliverables, `bl-proposals-<date>.md`, and **test-design models** — `reports/ba/test-models/<TICKET>-<date>.md`, the artifact `/qa-test` Step 1e now writes (target 60–140 lines, cap 200). It is a durable BA deliverable and is deliberately **exempt** from the `/qa-test` terminal-only rule below: a model that cannot be re-opened cannot be argued with, the parameter model for a surface is reused across tickets, and being a file is what lets `npm run model:lint` check it. Hand-authored standalone models may also live directly under `reports/ba/<domain>/` (the pre-existing convention) |
| 4 | Regression summary | `reports/regression/REG-*/` | One consolidated report per run |
| 5 | Monitoring summary | `reports/monitoring/MONITOR-*/` | One consolidated report per `/qa-monitoring` (App Insights) run |
| 6 | Per-ticket QA report | `reports/tickets/<Sprint>/<TICKET>/` (or `reports/tickets/<TICKET>/`) | A ticket-scoped audit that has its own standalone value beyond the run that produced it — `/qa-verify-fix`, or a ticket-scoped `/qa-design`/`/qa-accessibility`/`/qa-storybook` run. **Not** `/qa-test` — see the terminal-only carve-out below |
| 7 | BL audit report | `reports/knowledge/BL-AUDIT-<date>.md` | One audit-trail report per `/qa-review-bl` triangulation run |
| 8 | Exploratory session report | `reports/exploratory/SBTM-*.md` | One report per `/qa-sbtm` / `/qa-exploratory` charter — read back by later sessions for the 24h duplicate-charter check |
| 9 | Coverage generation report | `reports/coverage/COV-*/` | One consolidated `coverage-generation-report.md` per `/qa-coverage-generation` / `/qa-coverage-gap` run (the run's own intermediate `gap-inventory.json`/`batch-*-results.json` are pipeline working data, not narrative report bloat — §2's cap applies to the markdown digest, not those) |
| 10 | Performance investigation report | `reports/performance/{topic}-investigation-<date>.md` | A standalone performance investigation with findings worth keeping past the session that produced them. Written by **`/qa-perf-measure`** (deployed-env dependency-count / N+1 measurement); ticket-scoped runs may land as a category-6 per-ticket report instead |

**Per-ticket folders may hold more than one file** (e.g. a storybook/a11y/bundle-size audit alongside `/qa-verify-fix`'s own report) because each covers a distinct check run against the same ticket — that is not the same failure as splitting one report across files. Each individual file still obeys its own cap below; don't open a new file for a check that fits inside an existing one in the same folder.

**Two structured per-ticket artifacts are allowed alongside the narrative report, and are NOT counted against its line cap** — both are written by `/qa-verify-fix` (`.claude/commands/qa-verify-fix.md`), which is their contract; this rule exists so the policy and that command agree:

| Artifact | What it is | Rules |
|---|---|---|
| `verification-summary.json` | Small structured verdict record (ticket, verdict, build, deployment, evidence paths) — the `/qa-verify-fix` analogue of `/qa-test`'s `summary.json` | Structured only, no narrative prose. It does not replace the `verification-report.md` narrative (category 6) — write both |
| `evidence.html` | The RED→GREEN evidence page linked from the tracker comment | **Reference the sibling screenshots (`<img src="screenshots/NAME.png">`) — never inline them as `data:` base64 in the committed copy.** A single inlined PNG cost 124 KB on one 124 000-char line, duplicating a PNG already tracked in the same folder byte-for-byte and making the diff unreviewable. Keep the committed page **under ~40 KB**. Base64 self-containment is required only for the *published* Artifact variant, which is never committed |

Line caps in §2 apply to **narrative** files. A generated evidence page is exempt from the line cap but bound by the size + no-inlined-image rules above.

**Do NOT create files for:** per-suite intermediate JSON, coverage working files, standalone screenshot dumps, progress/status markdown, debug logs, investigation notes, per-step screenshots, side-by-side comparisons against prior runs, or anything labeled "draft"/"WIP"/"context". Return those via SendMessage. Evidence screenshots go **inline** in the bug report (not as separate `.md`).

**Not a report category — self-diagnostics artifacts.** The `vc-fix` self-diagnostics subsystem writes to `<outputRoot>/.vc-fix/diagnostics/` — the passive collector's `<session_id>.jsonl` (+ `.state.json`), the `/vc-self-check` `DIAG-*.md`, and the `deliver` `DELIVERY-*.md`. These are **gitignored diagnostic artifacts**, NOT one of the ten report categories above; the `DIAG-*.md`/`DELIVERY-*.md` still obey the monitoring-summary size discipline (§2, target 15–40, cap ~100). They are **ephemeral, not archived**: the lifecycle is log → analyze (`/vc-self-check`) → contribute (`deliver` PR/issue) → **delete**. Once a finding is contributed upstream the PR/issue is the source of truth, so `deliver` removes the processed session's own artifacts (only that session — never others); nothing is deleted when nothing was delivered. So they don't accumulate and need no manual cleanup.

**BL audit report — the receipt, not the source of truth.** `/qa-review-bl` writes `reports/knowledge/BL-AUDIT-<date>.md` — the audit trail of a BL triangulation run (per-BL verdict, 3-axis evidence refs, what was auto-applied to `business-logic.md`, what was routed to `reports/ba/bl-proposals-<date>.md`). The confirmed edits themselves land in the git-tracked `business-logic.md`; the unconfirmed drafts live in the shared `bl-proposals-<date>.md` (a BA-report artifact, category 3) — BL-AUDIT itself is just the log of that run (verdict table + Applied + Not-applied + coverage reconciliation; reference the `git diff` for the oracle change rather than inlining it).

**Terminal-only — `/qa-test-lifecycle` run summary.** The phase summary, changes inventory, coverage delta, quality-gate verdicts, and next steps are presented **directly in the chat response** — never written to `reports/test-lifecycle/` as a `lifecycle-report.md`/`lifecycle-summary.json` file. Nothing downstream reads those files today (CI's `run-full-cycle.ts` already consumes the agent's returned text, not a file on disk), so persisting them only adds tokens with no reader. Any Phase-5 environment-verification screenshots may still land under the gitignored `reports/test-lifecycle/TLC-*/` path, referenced inline from the chat summary by filename — but no narrative `.md`/`.json` is committed. This is the one pipeline output that is display-only; every other category above still writes to disk because a human or a later run needs to re-open it.

**Terminal-only — `/qa-test`'s own step artifacts.** `/qa-test` runs five steps (Context·Story·Test Model → Plan → Write·Review·Provision → Execute → Report — there is **no** separate exploratory step) that used to each write their own file into `reports/tickets/{SPRINT}/VCST-XXXX/` — `ac-analysis.md`, `testing-checklist.md`, `test-execution-report.md`. **The Step 1e Test Model is NO LONGER on this list** — it is a category-3 artifact at `reports/ba/test-models/<TICKET>-<date>.md` (see category 3 above). The reason the terminal-only rule applied to it — "nothing downstream reads those files" — stopped being true once the model became lintable and reusable across tickets; the rest of the step artifacts below still have no reader beyond their own run. None of those has a reader beyond the same run that wrote it (the AC table is built at Step 1d and reconciled from the orchestrator's own working context at Step 5b — **not** re-read from a file; the checklist is consumed by the Step 4 agent prompts in the same turn). They are now carried in-context and folded into **one** final Step 5 chat report instead. Only two things persist to `reports/tickets/{SPRINT}/VCST-XXXX/`: **`summary.json`** (small/structured — this is what the Step 1b "same ticket tested in the last 2 hours" duplicate-check scans **across all sprints**, so it has to survive the run; it is also the only durable record of the change-scoped regression result the Feature Release Gate reads; schema at `.claude/templates/qa-test-summary.schema.json`) and **evidence screenshots**. **New test cases are NOT a `/qa-test` narrative artifact and do not land in the ticket folder** — Step 3 appends them straight into `regression/suites/<layer>/<module>/*.csv` as `Automation_Status = Draft` (category 2, Test cases), and 5g flips the promotable ones to `Automated`/`Reviewed` in place after execution (last, non-blocking; reverting non-promotable rows); no run-scoped `reports/tickets/**/test-cases.csv` is written. A ticket-scoped run of a *different* skill against the same ticket (`/qa-design`, `/qa-storybook`, `/qa-verify-fix`) still writes its own category-6 report into the same folder — that report has standalone value outside `/qa-test`'s pipeline, which is the distinction that keeps it off this terminal-only list.

**`/qa-checklist` is already terminal-only** — it has never written to `reports/checklists/`; it outputs the unified checklist directly in chat. `reports/checklists/` is a reserved path (documented for a future durable checklist artifact) but has no active writer today.

## 2. Hard Size Caps (lines)

| Report type | Target | Hard cap |
|-------------|--------|----------|
| Clean regression (no failures) | **5–15** | 30 |
| Regression with failures | 40 + 15/failure | 200 |
| Simple UI/copy bug | **30–50** | 80 |
| Functional bug | 50–80 | 120 |
| Cross-layer bug | 80–120 | 150 |
| BA report | 80–150 | 250 (exec summary ≤5 sentences; diagram OR prose, not both) |
| Monitoring summary | **15–40** | 100 (confirmed / needs-review / dismissed tables; reference telemetry by portal link; a truncated top-frames stack — ≤6 lines — is OK for confirmed/needs-review items, but never full multi-frame dumps) |
| Per-ticket QA report (each file in the folder) | 30–60 | 120 (one file per check type; a bug found during the check still files separately to `reports/bugs/`, referenced by link, not inlined) |
| BL audit report | **15–40** | 100 (verdict table + Applied + Not-applied + coverage reconciliation; link the oracle diff, don't inline it) |
| Exploratory session report | **20–40** | 80 (net-new scenarios + bugs found by link + risk areas; skip a scenario list that just restates the suite CSV) |
| Coverage generation report (markdown digest only) | 40–80 | 150 (top gaps + totals by priority/domain/category; link `gap-inventory.json`/batch results, don't inline them) |
| Performance investigation report | 40–80 | 120 |
| Test-design model (`reports/ba/test-models/`) | **60–140** | 200 (five parts + the two sweeps; reference an oracle by ID, never inline it) |
| *`/qa-test-lifecycle` / `/qa-test` step artifacts (Test Model excepted)* | — | *terminal output only, no file — see §1* |

Over the hard cap is a review failure — trim before merge. If content genuinely doesn't fit, split it: keep the bug at <150 lines and link a separate investigation file.

## 3. Required Sections (everything else is optional)

**Bug report:** Title + severity tag · Env (1 line: env name + build) · Summary (≤3 sentences) · STR (numbered, start from nearest relevant state) · Expected vs Actual · 1–2 inline screenshots · optional BL/ECL refs, root cause.

**Regression summary:** Run ID/date/env/browser/selection · Counts table · Failures section (TC-ID, expected, actual, evidence ref, bug link) · Passes as one comma-separated line · Bugs Found (links only) · Quality Gate verdict.

**Monitoring summary:** Run ID/date/env/window/layers · Signature counts (seen/new/spiking/triaged/deferred) · Confirmed bugs table (severity, layer, signature, repo, draft link, telemetry link) · Needs-review table · Dismissed table (class, signature, oracle) · "no JIRA filed, no fix attempted" footer.

**BA report:** Title + scope + env · Executive summary (≤5 sentences) · One of: architecture diagram OR prose · Findings table (issue, severity, recommendation) · Open questions/follow-ups.

**Per-ticket QA report:** Ticket ID + title + check type (execution / AC-analysis / a11y / storybook / bundle-size / …) · Env (1 line) · Summary (≤3 sentences) · Findings/checks table · Verdict (PASS/FAIL/PARTIAL) · Bugs filed (links only, not inlined).

**BL audit report:** Run ID/date/scope (all / domain / BL-ID / diff) · Per-BL verdict table (CONFIRMED / DRIFT / MISSING / CONTRADICTORY / RETIRE, with the 3-axis evidence ref) · Applied section (what changed in `business-logic.md`, link the diff) · Not-applied section (link `bl-proposals-<date>.md`) · Test-case coverage reconciliation.

**Exploratory session report:** Charter + duration · Discovery technique/heuristic used (SFDPOT/CRISP) · Net-new scenarios discovered (mandatory) · Bugs found (links only) · Risk areas identified.

**Coverage generation report:** Run ID/date/scope · Gaps found (count by priority/domain/category) · Cases generated (count + suite links, not case bodies) · Validation pass results (if run) · Quality-gate verdict.

**Performance investigation report:** Title + scope + env (1 line) · Metric summary (threshold vs actual, or before/after) · Root cause · Recommendation.

**`/qa-test-lifecycle` / `/qa-test` terminal summary (chat response, not a file):** Run/ticket label · date/scope (for `/qa-test`, the fast/full path) · Phase or step summary (one line each; skipped steps marked skipped, not omitted) · Findings folded in from every step (AC coverage, checklist gaps, execution + change-scoped regression results) · Verdict · Next steps. Same content shape as the other summaries — it's just delivered in chat instead of committed to disk.

## 4. Cut These Bloat Patterns

Real examples from recent reports (BUG-IMP-049 at 315 lines vs 150 target; BA-VCST-4642 at 237):

| Pattern | Fix |
|---------|-----|
| Build/env table with 6+ rows | One line: `Env: vcst-qa @ Platform 3.1026.0, Theme 2.49.0-pr-2280` |
| Mermaid diagram + paragraph saying the same thing | Pick one |
| Executive summary > 5 sentences | ≤5 sentences, lead with the finding |
| Full API JSON response (50+ lines) | Quote the 2–3 fields that matter |
| 5+ screenshots for one bug | 1 bug state + 1 context max |
| STR starting from "Open homepage" for a checkout bug | Start from `/cart` with seeded data |
| Investigation log inside the bug report | Drop it; root cause in 2 sentences |
| "Comparison vs previous run" table | One sentence: "Same blocker as REG-X, different root cause." |
| Layer-validation table that restates the Summary | Delete the table |
| Glossary / "context" / "background" sections | Delete |
| Duplicate operator/credentials table | Reference the alias: "Operator: `@td(SUPPORT_AGENT)`" |

## 5. Screenshot Rules

**Always capture:** test FAILs, confirmed bugs (annotated), visual regressions (before/after), final state of critical flows (checkout confirmation, order created), Figma deviations, error states (console error, 500 toast).

**Skip:** every navigation step in a passing test, loading spinners, login page (unless testing auth), successful form fills mid-flow, same page across browsers when all pass, redundant confirmations of the same bug.

**Per-scope budget:**

| Scope | Target | Max |
|-------|--------|-----|
| Test case (pass) | 0–1 (final state if critical) | 2 |
| Test case (fail) | 1–3 | 4 |
| Bug report | 1–3 | 5 |
| Regression suite (20+ tests) | failures + 1 summary per area | 15–20 |
| Exploratory session | anomalies only | 10 |

**Retention:** Regression/test-lifecycle/coverage screenshots under `reports/regression/REG-*/`, `reports/test-lifecycle/TLC-*/`, `reports/coverage/COV-*/` are gitignored — disposable artifacts referenced from the permanent markdown. Bug evidence (`reports/bugs/screenshots/`) and per-ticket evidence (`reports/tickets/SprintXX-XX/VCST-XXXX/screenshots/`, `reports/tickets/VCST-XXXX/screenshots/`) stay tracked.

## 6. Console & Network Evidence

**Console — capture:** specific error messages tied to the test/bug. **Skip:** full console dumps, benign Vue warnings, favicon 404s, analytics events.
Example good: `Console Error: "Unhandled promise rejection: TypeError: Cannot read property 'price' of undefined at ProductCard.vue:47"`

**Network — capture:** 4xx/5xx, requests with `errors[]` in response, requests >2s. **Skip:** every successful 200, full HAR contents.
Format: `Failed: POST /graphql (SearchProducts) → 500 Internal Server Error`

**HAR files:** captured automatically by browser config, stored as **named `*.har` files inside** `test-results/{browser}/har/` (gitignored) — e.g. `test-results/firefox/har/session.har`. Reference by filename — never inline the data. Note: the HAR is **per-browser-lane, not per-run** — every suite on a browser writes to the same lane archive, so it is not a reliable per-failure record. The per-FAIL trace below is what isolates a single failure.

> **The `recordHar.path` must end in `.har`.** Playwright treats `recordHar.path` as a *file* path, not a directory. All three `config/mcp-playwright-*.config.json` files pointed it at `./test-results/{lane}/har` (no extension), so Playwright wrote each archive to a file literally **named `har`** — real data (1.2–1.4 MB per lane), but invisible to every `*.har` glob, so tooling and reviewers concluded HAR capture was disabled. Fixed 2026-07-30 to `./test-results/{lane}/har/session.har`; the strays were preserved as `session-legacy.har`. `scripts/lib/regression-triage.ts` `harPathForBrowser()` now resolves to the newest concrete `*.har` file and falls back to the lane directory, so a triage issue references something openable. **MCP config changes need a server restart before they take effect.**

**Failure trace (real FAIL only):** on a real `FAIL` — never `BLOCKED`/`SKIPPED`/`AMBIGUOUS` — the runner writes `reports/regression/{RUN_ID}/traces/{TC-ID}-FAIL-trace.json` (kept **with** the run report, linked from the HTML dashboard, gitignored). It carries the isolated `networkFailures[]` (4xx/5xx + GraphQL `errors[]`, with request/response body snippets) and `consoleErrors[]` **with full stack traces parsed into frames**. Secrets (Authorization/token/password/PAN) are redacted before writing — the repo is public. Schema + capture rules: `.claude/agents/test-runner-agent.md` §Failure trace file. Don't duplicate the trace contents into the markdown — reference the file.

## 7. Naming Conventions

```
Screenshots:
  {TC-ID}-FAIL-{description}.png      → TC-004-FAIL-cart-total-wrong.png
  {TC-ID}-{description}.png           → TC-001-checkout-confirmation.png
  BUG-{short-name}-{detail}.png       → BUG-price-display-configurable.png
  {component}-{state}-{viewport}.png  → product-card-hover-mobile.png

Failure traces (real FAIL only):
  {TC-ID}-FAIL-trace.json            → SMK-008-FAIL-trace.json  (in traces/)

Reports:
  Bug:           BUG-{Short-Description}.md
  Ticket check:  {check-type}-report.md  (inside reports/tickets/<Sprint>/<TICKET>/ — /qa-verify-fix, /qa-design, /qa-storybook, etc.; NOT /qa-test, see below)
  Verify-fix:    verification-report.md + verification-summary.json + evidence.html  (the /qa-verify-fix triple, same folder)
  BL audit:      BL-AUDIT-YYYY-MM-DD.md  (inside reports/knowledge/)
  Exploratory:   SBTM-{charter}-YYYY-MM-DD.md  (inside reports/exploratory/)
  Coverage:      coverage-generation-report.md  (inside reports/coverage/COV-YYYY-MM-DD-HHMM/)
  Regression:    {suite-name}-report.md  or  regression-YYYY-MM-DD.md
  Investigation: {topic}-investigation-YYYY-MM-DD.md  (reports/performance/ for perf topics, else standalone — separate from bug)

Terminal-only, no file: `/qa-test-lifecycle` (labeled TLC-YYYY-MM-DD-HHMM in chat) and `/qa-test`'s own
step artifacts (ac-analysis / testing-checklist / test-execution-report all fold into one chat report;
only summary.json + screenshots persist to reports/tickets/<Sprint>/<TICKET>/; new test cases persist to
regression/suites/ as category 2, not the ticket folder).
```

## 8. Reference, Don't Inline

| Artifact | Lives at | Cite as |
|----------|----------|---------|
| HAR files | `test-results/{browser}/har/` | "HAR: `checkout-2026-05-21.har`" |
| Failure trace (real FAIL) | `reports/regression/{RUN_ID}/traces/{TC-ID}-FAIL-trace.json` | Link from the case row; don't inline the JSON |
| Full screenshot set | `reports/bugs/screenshots/` | Link 1–2 inline; reference the folder |
| Test data | `test-data/aliases.json` | `@td(ALIAS.field)` — don't paste rows |
| BL/ECL invariants | `knowledge/oracles/business-logic.md` | Cite the ID (`BL-AUTH-005`), not the body |
| Prior runs | `reports/regression/REG-*` | Link by run ID, don't recap |
| Coverage gap inventory / batch results | `reports/coverage/COV-*/gap-inventory.json`, `batch-*-results.json` | Reference by `GAP-*` ID or batch letter, don't inline the JSON |

## 9. Retention

Report categories don't accumulate forever — each has a lifecycle:

- **Ephemeral run folders** (`reports/regression/{REG-*,SMOKE-*}`, `reports/test-lifecycle/TLC-*`,
  `reports/coverage/COV-*`, `reports/monitoring/MONITOR-*`) are **already gitignored** (`.gitignore:111`
  + the evidence-extension rules) — they only ever exist as local disk usage on whoever ran them, never
  in git history. They age out locally via `npm run reports:prune -- --apply` (default 30 days; the run
  date is parsed from the `RUN-YYYY-MM-DD-HHMM` folder name).
- **Git-tracked report folders** (`reports/tickets/<Sprint>/<TICKET>/`) age out the same way via
  `npm run reports:prune -- --target=tracked --apply` — `git rm` + one commit, gated by the last commit
  date on that path (not filesystem mtime). The current sprint is always skipped regardless of age.
- **`vc/shared/archive/sprints/`** (VC-internal, not one of the ten categories above, but the single
  largest tracked report-like tree in the repo) is pruned by the same `--target=tracked` run.
- **Durable categories never prune**: `reports/bugs/`, `reports/ba/`, `reports/knowledge/`,
  `regression/suites/` (Test cases), and `reports/exploratory/` (kept for its own 24h duplicate-charter
  check — revisit only if it grows unbounded).

Tool: `scripts/maintenance/prune-old-artifacts.mjs` (dry-run by default; `--apply` to act; `--target=local`
is the default, `--target=tracked` must be named explicitly before anything git-tracked is touched).
