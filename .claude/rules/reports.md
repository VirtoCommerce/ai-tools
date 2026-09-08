# Reports — the rules that apply to every write (full policy on demand)

**Full policy — single source of truth:** [`knowledge/execution/reports-policy.md`](../knowledge/execution/reports-policy.md). This stub keeps its section numbers so a `reports.md §N` citation still resolves; each §N below is the one-line rule and a pointer. Reports are read by humans on a deadline — long reports get skimmed and bugs get missed.

## 1. Only ten report categories
`bugs/` (open/<severity>/ or fixed/, never both) · `regression/suites/` CSV · `reports/ba/` (+ `test-models/`, `release-notes/`, per-ticket guides) · `reports/regression/REG-*/` · `reports/monitoring/MONITOR-*/` · `reports/tickets/<Sprint>/<TICKET>/` · `reports/knowledge/BL-AUDIT-*` · `reports/exploratory/SBTM-*` · `reports/coverage/COV-*/` · `reports/performance/`. **Anything else is not a report file** — investigation logs, progress notes, drafts, per-step screenshots and comparisons go in a SendMessage, never on disk. Table with per-category rules: policy §1.

## 1a. `reports/bugs/open/` is foldered by severity
`critical-high/` · `medium/` · `low/`; `fixed/`/`closed/`/`rejected/` stay flat. The severity DECLARED IN THE REPORT is the source of truth and the folder mirrors it; a straddling grade files at the LOWER bucket; any reader walks the tree RECURSIVELY (`open/**/*.md`). Policy §1a.

## 2. Hard size caps (lines)
Clean regression 30 · regression w/ failures 200 · UI/copy bug 80 · functional bug 120 · cross-layer bug 150 · BA 250 · release-note fragment 60 / aggregate 150 · ticket-doc comment 120 · monitoring 100 · per-ticket QA 120 · BL audit 100 · exploratory 80 · coverage 150 · perf 120 · test model 260 · testing checklist 160. Over the cap is a review failure. Policy §2.

## 3. Required sections — policy §3.  ## 4. Cut bloat — policy §4.

## 5. Screenshots
**§5.0 MANDATORY:** a tracker comment that makes a UI claim carries its screenshots INLINE (attach, then reference per `tracker-ops.md` §5c), or it is not delivered — a Markdown image path renders as nothing at `200 OK`. Verify from `renderedBody`, never from the status code. Capture/budget rules: policy §5.1.

## 6. Console & network evidence — policy §6.  ## 7. Naming — policy §7.

## 8. Reference, don't inline
HAR by filename · traces by path · screenshots 1–2 inline + folder · test data as `@td(ALIAS.field)` · BL/ECL by ID · prior runs by run id. Policy §8.

## 9. Retention — ephemeral run folders are gitignored and pruned (`reports:prune`); `bugs/`, `ba/`, `knowledge/`, `regression/suites/`, `exploratory/` never prune. Policy §9.
