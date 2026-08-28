# Regression & CI Reference

## Architecture: Testing Modes

> Numbering is a citation, not a count: mode **3** was retired on 2026-08-26 and its slot is kept
> as a tombstone rather than renumbered, so an existing reference to "mode 4" still points at the
> pipeline it always meant. Three modes are live (1, 2, 4).

### 1. Interactive MCP-Driven Testing (Primary)
Load a prompt template from `vc/shared/docs/prompts/`, execute via MCP browser tools with DevTools monitoring. After each flow: export HAR, capture console logs, take screenshots. Generate bug reports in `reports/bugs/`.

### 2. CI Regression via Claude Agent SDK
`ci/run-regression.ts` orchestrates headless regression using `@anthropic-ai/claude-agent-sdk`. It reads suite CSVs from `regression/suites/`, injects them into prompts with the 3 regression agent definitions in `ci/agents/` (`qa-frontend-expert.md`, `qa-backend-expert.md`, `qa-testing-expert.md`), and runs suites in parallel batches (up to 3 concurrent, configurable via `MAX_PARALLEL`). Results are tracked in `reports/regression/history.json` (90-day rolling window). Teams notifications via `ci/notify-teams.ts`.

**Note:** CI mode uses only `playwright-chrome` (single headless Chromium) for all suites. The 3-browser pool (chrome/firefox/edge) applies only to interactive mode. CI environment mapping: `qa` → `FRONT_URL`/`BACK_URL`, `staging` → `VIRTO_START_FRONT`/`VIRTO_START_BACK`.

**Regression Orchestration Pipeline (interactive mode):**
1. `regression-orchestrator` agent reads `config/test-suites.json` manifest
2. Resolves suite selection (`smoke`, `critical`, `sprint`, `full`, or comma-separated IDs)
3. Assigns suites to browser pool slots (3 slots: chrome, firefox, edge)
4. Spawns sub-agents using `agents/test-runner-agent.md` template with substituted parameters (`{{SUITE_ID}}`, `{{BROWSER_SERVER}}`, `{{ENVIRONMENT_URL}}`, `{{OUTPUT_FILE}}`, etc.)
5. Each sub-agent gets an isolated browser context, executes all test cases from its CSV, writes JSON results
6. Orchestrator collects results, handles retries with browser fallback chain, produces consolidated report

**Live progress + auto-report (interactive mode):** at run start the **persistent top-level session** (the one running `/qa-regression`) launches a background watcher (`npm run report:regression:watch -- --run-id {RUN_ID}`) that opens a self-refreshing `reports/regression/{RUN_ID}/regression-report.html`. **Watcher ownership is load-bearing:** it MUST run in the persistent session's own background — **never inside a Task-dispatched sub-agent** (`regression-orchestrator`/`test-runner`), whose child processes are killed when its turn ends while the run keeps going, freezing the HTML mid-run. The owner **self-heals**: while the run is `in_progress`, if `regression-report.html` mtime is >~60s stale it relaunches the watcher (or runs one-shot `report:regression`). See `commands/qa-regression.md` Step 3. It reads `test-run-status.json` (suites flip `pending → running → done` as the orchestrator updates it) plus the per-suite `suite-*-results.json` as they land, and `<meta refresh>`-reloads until the run is `completed`, then renders the final static report and exits. **Live per-case status:** because the runner (`agents/test-runner-agent.md`) pre-seeds every case as `PENDING` at suite start and then **appends one line per case to `suite-*-cases.jsonl`** (which the reporter folds over the pre-seeded envelope while `completedAt` is empty — the old contract rewrote the whole envelope per case, which is O(n²)), a suite flagged `running` renders **pre-expanded with its cases flipping PASS/FAIL/BLOCKED/PENDING live** — you no longer wait for the whole suite to finish. The dashboard shows a run-level live banner (suites + cases evaluated, live pass/fail/blocked tally, animated in-progress bars). The HTML report is generated **automatically** — no manual `npm run report:regression` step. `scripts/regression/generate-regression-html-report.ts` also supports one-shot (`report:regression`), portable/embedded (`report:regression:portable`), and `--open`.

**Who closes a run out — and the orphan backstop.** `test-run-status.json` is written *only* by the owning orchestrator (`/qa-regression` Step 6 / `regression-orchestrator` Step 6): it creates the file `in_progress`, flips each suite `pending → running → done`, and flips the run `completed`. Runner sub-agents write only their own `suite-*-results.json`; the watcher and the reporting scripts are read-only consumers. That made a crashed orchestrator unrecoverable — the file stayed `in_progress` forever, so the watcher never reached its settle branch and Step 0's duplicate check blocked every future run. **`scripts/regression/reap-stalled-run.ts`** (`npm run regression:reap`, `regression:reap:apply`) is the deterministic backstop: it classifies a run from **file evidence** — newest mtime across the run's own results/screenshots, deliberately ignoring the watcher-written `regression-report.html`, which would otherwise make a dead run look busy forever — and marks a provably-silent one `stalled`. **`stalled` is an observation, never `completed`**: the run did not finish, and recording it as finished would put a phantom run into `history.json`. Absence of evidence never reaps (a false reap frees the interlock and lets two runs fight over the same three browser lanes), and the write re-checks the file first, so a still-alive orchestrator's own `completed` always wins. The live watcher applies the same mark when its own 45-minute idle valve trips — and that valve's stall signature folds in **per-case** counts (`watchProgressSignature`), because a single-suite run's suite count goes constant the moment the runner pre-seeds its results file.

### 3. ~~Autonomous Interactive Regression (Agent Teams)~~ — REMOVED 2026-08-26

There was a second interactive orchestrator (`autonomous-regression-orchestrator` +
`autonomous-test-runner`, ~500 lines, plus a private `scripts/regression/reporting.ts`). It is gone,
and this tombstone records why so it is not re-created:

- **Its output went where nothing reads.** It wrote `results/{RUN_ID}/`; every consumer reads
  `reports/regression/{RUN_ID}/`. So an autonomous run got no live HTML dashboard, no
  `/qa-triage-results`, no `history.json` flakiness feed, no `reap-stalled-run` backstop and no
  `compute-metrics` quality gate — it had a parallel reporting module instead.
- **It had drifted.** Its fallback chain was still `chrome → firefox → edge`; the manifest was
  reordered to put firefox LAST on 2026-08-05 precisely because firefox cannot click on this
  storefront, so firefox in second place burned a retry. It also named firefox the *preferred*
  browser for Smoke and Payment, and knew nothing of `clickDriven` or `regression:plan`.
- **Its one unique feature contradicted policy.** Auto-filing JIRA from a regression run, while
  `/qa-triage-results` and `/qa-monitoring` both deliberately stop at drafting.

What was kept: the graduated rate-limit guard and the 30/60s backoff ladder, now in
`.claude/agents/regression-orchestrator.md` Step 5. Mode 2 (headless CI) and mode 1 (interactive)
remain; the interactive one is the path in daily use.

### 4. Full Test Cycle CI Pipeline (Sync → Lifecycle → Regression)
`ci/run-full-cycle.ts` orchestrates a 3-phase pipeline triggered by code changes. Phase 1 (SYNC + REVIEW) uses `/qa-test-lifecycle --ci` to detect stale test cases from PRs/diffs/module updates, update Steps/Assertions, analyze coverage gaps, and run the `/qa-review-tests` **static** dimensions (1–7, 9, 10 — dim 8 needs a browser, dim 11 is the separate `ci/run-suite-audit.ts` twin). Phase 2 (REGRESSION) delegates to `ci/run-regression.ts` to execute the affected suites. Each phase has independent skip flags and budget allocation (50%/50% of total budget). Results go to `reports/full-cycle/{RUN_ID}/`.

**Invoke:** `CHANGE_SOURCE="PR #123" npm run ci:cycle` or via `.github/workflows/full-cycle.yml`
**Triggers:** PR merge to main (auto), daily schedule (Mon-Fri 8AM UTC), manual dispatch
**npm scripts:** `ci:cycle` (full), `ci:cycle:pr` (PR-driven), `ci:cycle:sync-only` (Phase 1 only), `ci:cycle:no-sync` (skip Phase 1)

## Test Suite Manifest: `config/test-suites.json`

Central configuration for regression orchestration. Defines:
- **Browser pool**: 3 slots (playwright-chrome, playwright-firefox, playwright-edge) with fallback chain
- **Suite definitions**: 126 suites in module-aligned subdirectories under `Frontend/` and `Backend/`, with id, name, CSV file path, priority, test count, assigned agent type, and tags
- **Selection groups**: 37 groups — `smoke`, `critical`, `sprint`, `full`, `frontend`, `backend`, plus module-specific groups (`catalog`, `search`, `orders`, `auth`, `b2b`, `marketing`, `platform`, `bopis`, `payment`, `configurable-products`, `whitelabeling`, `purchase-flow`, `loyalty`, …)
- **Defaults**: max 3 parallel agents, 2 retries, 30s retry delay, HAR capture enabled

## Regression Test Suites

126 suites in `regression/suites/` organized by module (50 directories) under `Frontend/` and `Backend/`. Enriched agent-native CSV format. Full definitions in `config/test-suites.json`. **Total: 4,155 test cases** (per manifest `testCount`; the source of truth is `config/test-suites.json`).

### Suite inventory

**Derived, not documented here.** `config/test-suites.json` is the source of truth for every suite’s id,
name, file, domain, layer, priority, `testCount`, agent and tags (126 suites, 37 selections — the manifest's `selections` block also carries a `_doc` key that is documentation, not a group). To see the
current split: `npm run suites:lint` prints the totals, or read the manifest directly. A table copied into
this file goes stale the first time a suite is added — which is how the retired `080` release suite below
came to be documented for weeks after its CSV was deleted.

- **Release suite**: none. The master release suite `080` (`_release/080-full-regression-release.csv`) was **retired on 2026-07-31** — its CSV was deleted in commit `9dd9f3e3` and the manifest entry plus the `release` selection were removed once it was found that `release` had been resolving to a missing file (running zero cases while reporting a valid selection). For a major release, use `full` (all 119 — the 126 manifest suites minus its 7 excludes) or a plan-driven `sprint` selection. `npm run suites:lint` now hard-fails on any declared-but-absent suite CSV, so this cannot recur silently.
- **P0 suites**: 042 (Smoke), the four 078 siblings (Backend/API Smoke), 039 (CyberSource Payment), 044 (Security), 049 (Platform API)
- **The split has empirical support beyond wall-clock, measured after the fact.** `history.json`
  (108 suite rows, 19 runs, 3991 cases) shows BLOCKED rising with suite size: 13.5% at ≤15 cases,
  17.9% at 16–40, 17.7% at 41–80, **28.6% at 81+**. `078` at 115 cases sat in the worst bucket;
  four ~29-case siblings sit in the 17.9% one, so the split should recover ≈11 percentage points of
  artefactual BLOCKED on the corpus's most-run selections. That is a stronger reason to have done it
  than the 83 → 40 min it was justified by.
  **A row-range split was also actually tried** — `REG-2026-08-03-1900` carries `078-p1/p2/p3` — and
  it failed by TRUNCATION, not by dependency cascade: p1 accounted for 38 of 38 cases, p2 for 25 of
  39, p3 for **8 of 38**, with only one BLOCKED between them. Cases that simply never reported are
  the signature of a limit running out in order, which is the defect A1's derived caps exist to
  remove. It is weak evidence against sharding as such; the case against that remains the 46
  declared dependency edges and the unsatisfiable `[PRE:*]` gate.
- **`078` is four sibling suites, and the reason generalizes.** It was one 115-case / 83-minute
  suite, which made it the ENTIRE critical path of both `smoke` and `critical`: the lane pool had
  nothing to pack, so the scheduler saved 0% there while saving 42% on `full`. Splitting it took
  `smoke` from **83 min to 39** and `critical` to **60**, with no runtime code — four files where
  there was one, packed by the LPT pool that already existed.
  - **The unit of splitting is a dependency component, not a row range.** 99 of its 115 cases
    declared a dependency in `Preconditions`, 46 of them on a non-bootstrap case
    (`BSM-005 → 006 → 007`, `BSM-015 → 042 → 043`, `BSM-008 → 009 → 071`, …). A row slice cuts
    those chains and turns a slow pass into a fast cascade of BLOCKED. Computed as connected
    components of the declared graph the suite decomposes into **65 pieces, largest 13**, and those
    components line up with its Section themes — so a themed split is also dependency-closed.
  - **`[PRE:*]` coverage is the WRONG shardability gate.** `knowledge/execution/test-execution-preflight.md`
    exempts Admin SPA and API suites by design, and 078 carries zero `[PRE:*]` tags across 115
    cases. Gating on it permanently excludes exactly the suites that dominate `smoke`/`critical`.
  - **Bootstrap is replicated as state, never referenced as a case.** `BSM-001/002/011/019` (login,
    bearer token, an org exists, GraphiQL reachable) stay in `078`; the siblings restate them as
    *"Admin logged in as `{{ADMIN}}` (suite setup)"*. A case ID can live in only one file, so a
    replicated bootstrap case would break global ID uniqueness — the requirement is what travels.
  - **All four stay in `regression/suites/Backend/smoke/`.** `check-smoke-gates.ts` builds its case
    set as the UNION of the sibling CSVs in a directory, so `ADMIN-SMOKE-CHECKLIST.md` and gates
    SG-001/004/005 keep working with no checklist edit. Moving one file out silently breaks them.
- **XREF-001 — a dependency may not leave its suite CSV.** New hard gate in
  `npm run suites:lint` (`findCrossFileCaseRefs`, unit tests `scripts/unit/suite-split-integrity.test.ts`).
  A suite is the unit of dispatch: two suites can run on different lanes, in either order, or one
  without the other, so `"Admin logged in (BSM-001 passed)"` in a CSV that does not contain BSM-001
  is not a precondition, it is a wish — the case runs on whatever state the lane happens to hold.
  This is the dual of the global-ID rule above (an ID belongs to exactly one file; a dependency may
  not leave it), and it is invisible to `check-smoke-gates.ts` for the very reason that makes the
  078 split safe: that gate reads the directory's sibling CSVs as one union, so a cross-sibling
  reference passes SG-001 as valid. A token counts only when it resolves to a real case ID
  somewhere in the corpus, so prose that merely looks like one (`BL-AUTH-005`, `ECL-13.2`,
  `VCST-5089`) can never false-positive. **Ratcheted, not absolute:** 101 pre-existing violations
  across 32 suites are recorded per file in `XREF_BASELINE` — a listed file may never grow, an
  unlisted file must have zero. Same burn-down shape and same reason as `CSV_LINT_BASELINE`.
- **RESOLVED — the two `sales-rep` manifest defects flagged below are fixed** (verified 2026-08-05): the embedded-app suite was renumbered to a free id (`Backend/sales-rep/092b-sales-rep-admin-embedded-app.csv`, alongside `092-sales-rep-admin.csv`), and `Frontend/sales-rep/093-sales-rep-hub-dashboard-storefront.csv` now has a manifest entry (`id: "093"`). `config/test-suites.json` carries 126 unique ids with zero duplicates. Left here as the worked example the naming-convention rules below still reference (`092b`, `SR-EMB-*`).
- **Case IDs are globally unique across the whole corpus** — not merely unique within a suite. The runner keys per-case results and failure evidence by **bare case ID** (`suite-*-results.json` rows, `traces/{TC-ID}-FAIL-trace.json`, and `scripts/lib/regression-triage.ts` fingerprints), so two suites both declaring `CAT-001` let one run's evidence silently overwrite the other's — a real failure can read as someone else's pass. Enforced by **`npm run suites:lint`** (`findDuplicateCaseIds` in `scripts/test-cases/sync-test-suites.ts`, unit tests `scripts/unit/suite-global-case-ids.test.ts`); it scans **every CSV on disk**, orphans included, and **hard-fails** — unlike `CSV_LINT_BASELINE` there is no burn-down set, because the corpus was cleaned to zero collisions on 2026-08-03 (223 of them). IDs are harvested by the line-start scan (`extractExistingIds`), not a field parse, so the suites that aren't strictly CSV-parsable are still covered.
  **Naming convention when two suites want the same prefix** — two cases, and they are different:
  - **Re-prefix** when the suites are different *layers or domains* that merely collided on a shared prefix. The **storefront keeps the bare prefix** and the admin/back-office side takes an `…A` suffix: `CAT-*` (Frontend/catalog) vs **`CATA-*`** (051/053 admin), `ORD-*` (014 storefront) vs **`ORDA-*`** (017/018/019 admin), `SRCH-*` (004/005) vs **`SRCHA-*`** (061 admin). Where a prefix meant two unrelated things, the **documented owner keeps it**: suite 067 keeps `WL-*` (white labeling, per `knowledge/domain/white-labeling.md`) and the wishlist suite 050h became **`WISH-*`**; suite 050i keeps `CFG-GQL-*` (the gold-standard GraphQL suite) and the 9 interlopers in 072/072c became **`CFG-XAPI-*`**. Otherwise the more specific suite is qualified: 077b → **`CPN-SMK-*`**, the embedded-app half of `092` → **`SR-EMB-*`**. Re-prefixing is applied to the **whole prefix in that file**, not just the colliding rows, so each file keeps one coherent namespace and cannot collide again.
  - **Renumber into a free range** when both suites legitimately share one domain namespace and only the numbers clashed — no new prefix: `035` STORE-052…055 → 066…069, `032` AUTH-066/067 → 074/075, `003` CAT-030…040 → 068…078, plus `CFG-TEXT`/`CFG-VAR` singles.
- **Critical UI scope**: `knowledge/oracles/critical-ui-scope.md` defines the checklist of 36 components and 16 pages with applicable BL-UI invariants per cell. **Currently UNCOVERED** — its sole covering suite `048b-layout-stability.csv` (selection `layout-stability`) was removed on 2026-07-25, so all 197 applicable cells are marked `GAP`. The file is retained as the scope definition + audit-protocol reference for `/qa-design`. `npm run scope:validate` still hard-fails if a cell points at a *missing* test ID and warns on the GAP count; `--strict` makes GAPs fatal again once a replacement suite lands.

### Selection Groups

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 042, 078, 078b, 078c, 078d | Daily validation before deployment |
| `critical` | 042, 078, 078b, 078c, 078d, 039, 044, 049 | P0 suites only |
| `purchase-flow` | cart + checkout + orders-frontend + payment | Purchase flow regression |
| `catalog` | 001-003, 051, 053 | Catalog module (frontend + admin) |
| `search` | 004-005, 061 | Search module (frontend + admin) |
| `orders` | 014-019 | Orders & quotes (frontend + admin) |
| `auth` | 031-033 | Authentication module |
| `b2b` | 006-010 | B2B features |
| `marketing` | 023-025, 077 | Marketing module (admin + storefront) |
| `platform` | 020-021, 049, 063 | Platform module |
| `frontend` | All Frontend/ suites minus 3 exclusions (53) | Frontend-only regression |
| `backend` | All Backend/ suites minus 4 exclusions (63) | Backend-only regression |
| `sprint` | **Plan-driven** — `/qa-regression sprint` reads `vc/shared/docs/Sprint plans/sprint-*-summary.json` → `suitesActivated[]` (auto-picks the most recent plan). Falls back to all P0+P1 suites when no plan exists or `--no-plan` is set. | Before sprint release |
| `sprint:XX-YY` | Pinned to a specific sprint plan in `vc/shared/docs/Sprint plans/` | Re-run a past sprint's regression scope |
| `full` | All 119 (126 minus the 7 excluded) | Before production release |

## CI Regression Testing

The `ci/` directory provides Docker-based CI regression using the Claude Agent SDK:

```bash
docker build -t vc-regression -f ci/Dockerfile .
docker run --rm --shm-size=2gb --env-file .env \
  -e ANTHROPIC_API_KEY=your-key \
  -e SUITE_SELECTION=smoke \
  -e TEST_ENVIRONMENT=qa \
  -e MAX_BUDGET_USD=5.0 \
  vc-regression
```

Suite selection accepts group names (`smoke`, `critical`, `catalog`, `orders`, etc.) or comma-separated IDs (`042,039,049`). CI runs up to 3 suites in parallel (configurable via `MAX_PARALLEL`). Reports go to `reports/regression/ci-YYYY-MM-DD/` (markdown + JSON summary).

**Note:** The CI `run-regression.ts` dynamically loads suite definitions from `config/test-suites.json` at startup. Selection groups are also defined in the manifest's `selections` block.

**Scheduled Pipeline (GitHub Actions - `.github/workflows/regression.yml`):**
- **Daily smoke**: Mon-Fri at 6:00 AM UTC — runs suite 042 ($5 budget)
- **Weekly full regression**: Sunday at 2:00 AM UTC — runs all 119 `full` suites ($80 budget — the derived budget is $144; see ci/lib/suite-caps.ts)
- **Manual trigger**: Any selection, any environment, any budget via `workflow_dispatch`

**Teams Notifications:** After each pipeline run, `ci/notify-teams.ts` sends an Adaptive Card to the configured Teams webhook. Requires `TEAMS_WEBHOOK_URL` secret.

## Online Monitoring (App Insights) — the fifth pipeline twin

Beyond the testing modes above, there is an **online monitoring** pipeline that watches Azure Application Insights for live errors instead of executing test cases. Like the others it has an interactive + headless **twin** pair:

- **Interactive:** `/qa-monitoring [frontend|backend|both] [--since=MIN] [--dry-run]` (`commands/qa-monitoring.md`)
- **Headless:** `ci/run-monitor.ts` (`npm run ci:monitor` / `ci:monitor:dry`) + `.github/workflows/monitor.yml`

It queries both layers' App Insights resources (env-resolved `APPINSIGHTS_*`, never hardcoded), **deduplicates** errors via a fingerprint store (`reports/monitoring/.seen-fingerprints.json`, carried across CI runs by `actions/cache`), **triages** new/spiking signatures (`ci/agents/monitor-triage-agent.md`), **reproduces** HIGH-confidence bugs live via the QA experts, drafts bug reports with a `## Fix Routing` block, and reports to `reports/monitoring/MONITOR-*/` + Teams (`NOTIFY_MODE=monitor`). **Detect-and-report only** — it never files a tracker ticket and never auto-fixes; a human picks up the confirmed drafts via `/qa-bug` → `/qa-fix`. KQL probes live in `ci/monitoring/queries/`. Full methodology: the `/qa-monitoring` skill.

## Scheduled Test-Case Staleness Audit — the sixth pipeline twin

Suites rot silently. `lint-test-cases.ts` GRD-001 verifies an assertion **carries** a grounded provenance tag; it never verifies the tag is **true**. A `{DOC}` whose doc changed, an `{OBSERVED}` captured against a six-month-old build, a `{BL}` citing a retired invariant — all lint green. **Dimension 11** closes that hole by porting the `/qa-review-bl` triangulation mechanism to test cases, and a scheduled job works through the ~4,155-case corpus one suite at a time.

- **Interactive:** `/qa-review-tests suite <ID> --triangulate [--fix]` (skill `.claude/skills/qa-review-tests/`, judgment rules in `triangulation-criteria.md`)
- **Headless:** `ci/run-suite-audit.ts` (`npm run ci:audit` / `ci:audit:dry`) + `.github/workflows/suite-audit.yml`

Each run audits **one** suite and opens **one draft PR** — the unit of work is the unit of review, and that PR is the human gate replacing `--fix`'s interactive confirmation. Each assertion is triangulated against **docs** (VirtoOZ) + **live** (playwright) + **source** (GitHub MCP); only **CONFIRMED** (refresh the `Audited:` stamp) and **DRIFT** (rewrite the drifted assertion) are written. MISSING / CONTRADICTORY / UNGROUNDED / RETIRE are PR-body proposals that never touch a CSV — deprecation and authoring stay human. Never auto-merges.

**Rotation** (`npm run tc:audit:queue`, `scripts/test-cases/audit-queue.ts`): risk tier (P0/revenue-critical first) → unresolvable-source last → oldest `Audited:` stamp → testCount. **The stamp is the state** — it lives in the `References` cell of the row it describes, so there is no ledger to desync and a skipped day leaves that suite at the head of the queue. The queue is keyed by **file**, not id (a defensive convention retained from when manifest id `092` was briefly carried by two suites — see the resolved note above). Weekdays only ⇒ the ~14 P0/revenue-critical suites are covered in ~3 weeks; the full 126-suite cycle is ≈25 weeks, then rolls.

**Source axis** (`npm run tc:audit:source`, `scripts/test-cases/suite-source-map.ts`): suite → module → repo, derived from `config/test-suites.json` `requiresModules` → `.claude/knowledge/execution/module-suite-map.md` → `ci/config/fix-repos.json` `routing[]`. It resolves 117/126 suites and **never invents a repo name** — an unresolvable suite scores UNGROUNDED, because a wrong repo yields a confident `file:line` for unrelated code and manufactures a false CONFIRMED.

The audit's own run artifacts (`reports/suite-audit/TCA-*/`) are gitignored pipeline working data — `.claude/rules/reports.md` has no report category for a test-case review, so the narrative ships in the PR body and the only durable artifact is the CSV diff.

## Per-Case Lane Routing — a suite is no longer the unit of execution

Lane routing used to be all-or-nothing: a suite reached the runner only if **every** non-empty
`Steps` cell carried a runner op tag. That rule is right about its own risk — handing a runner a
row it cannot parse manufactures BLOCKED cases that read as product failures — but its cost is
measurable: **169 machine-ready rows in 10 suites** ride the browser lane because a handful of
their siblings are prose. Suite `050d` sends 46 runner-native cases through a browser agent on
account of the other 3; suite `087` occupies a browser slot to run **zero** browser cases (12
machine + 3 explicitly `Manual`).

**The bigger prize is verdict quality, not wall-clock.** Rows that ride a browser lane come back
BLOCKED for reasons about *how* they ran — a contaminated cart, a drifted session — rather than
about the product. Routing them to a runner turns those into real verdicts, and the nine biggest
mixed suites shrink their agent session by 80–95%, which removes the long-session context decay
that produces blanket-status JSON.

> **Measured, 2026-08-26 — and it corrects the figure this paragraph used to quote.** The old
> "~29% artefactual-BLOCKED" came from ONE run of suite 048b (47 of 161). That suite ran twice:
> `REG-2026-07-14-0018` blocked **11.8%** and `REG-2026-07-24-2121` blocked **29.2%** — the same
> 161 cases, 17 percentage points apart. So 29% was not a property of the suite, it was one run's
> value, and the higher of two. Across all of `reports/regression/history.json` (108 suite rows,
> 19 runs, 3991 cases) the BLOCKED rate is **19.9%**.
>
> The *mechanism* the figure was invoked for does hold, and more sharply than the headline: blocked
> rate rises with suite size — **13.5%** (≤15 cases) · **17.9%** (16–40) · **17.7%** (41–80) ·
> **28.6%** (81+). That gradient is the empirical case for splitting a large suite, independent of
> wall-clock: 115 cases in one file sit in the 28.6% bucket, four ~29-case siblings in the 17.9%
> one. Quote the gradient, not a single run.

Three commands, run in this order by `regression-orchestrator` Step 3:

| Command | Does |
|---|---|
| `npm run suites:filter -- <resolved.csv> --priority <tier> [--also-ids <ids>] --out <p>` | narrow a resolved CSV to a priority tier (+ named cases) **before** lanes sees it |
| `npm run suites:lanes -- <ID> --run-id <R> [--csv <resolved>]` | classify every case → `suite-{ID}-lanes.json` + `suite-{ID}-resolved.browser.csv` |
| `npm run suites:machine -- <ID> --run-id <R>` | run the machine rows via `graphql-runner.ts --case` → `suite-{ID}-results.machine.json` |
| `npm run suites:merge -- <ID> --run-id <R>` | fold the fragments → the canonical `suite-{ID}-results.json` |

`npm run suites:lanes:all` surveys the corpus and writes nothing.

### The case filter — a suite is no longer the unit of SCOPE either

Per-case *routing* (above) decided **where** a case runs. `suites:filter` decides **whether** it runs at
all in a change-scoped context, and it is the mechanism behind `/qa-regression --cases <tier>` and
`/qa-test`'s Artifact C. Selecting whole suites is what made a search-change run plan all 44 cases of
suite `004` — 6 of them Critical, 19 skipped outright.

Measured on the 117 canonical-header suites: **Critical 883 · High 1899 · Medium 1088 · Low 64 · P1 18 ·
P2 17**, and **no `P0` row exists**. Corpus-wide Critical is 918 of 4,243 (21.6%) and ~23.2% of the
estimated minutes — which is what makes a 40-minute window reachable for a single-module change.

Four rules, and three of them are the same discipline the lane classifier already follows:

- **It plugs into an existing hop, not a new one.** `regression-orchestrator` Step 3 already writes a
  per-suite `suite-{ID}-resolved.csv` before calling `suites:lanes`; the filter rewrites that file
  (Step 3a). Lanes, the machine lane, the merge, the results envelope, triage and promotion are
  untouched — they see a smaller suite, not a new mechanism.
- **A legacy 11-column header is REFUSED (exit 2), never filtered.** Same reason `plan-lanes.ts` refuses
  it: `parseSuite` maps positionally, so on those 11 suites `Priority` is not `Priority`, and filtering
  would drop real cases with total confidence.
- **`P0`–`P3` are spellings, not a second vocabulary.** The alias table is `append-test-cases-to-suite.ts`'s
  own (`PRIORITIES` / `HIGH_PRIORITIES` already pair `Critical` with `P0`), read out loud rather than
  re-decided. A parallel table that drifted would silently change what "critical" means.
- **Exclusion fails OPEN, and is always REPORTED.** This is the one place the discipline *inverts*
  relative to `case-classifier.ts`: there, doubt routes to the browser lane, because a wrongly-machined
  case manufactures a BLOCKED that reads as a product failure. Here the expensive direction is the
  other way — a case that quietly leaves the run is a coverage hole with no error anywhere. So an
  unreadable `Priority` does not run (it is not provably Critical) but **is named**, and a suite that
  contributes zero cases is stated in the run report's **Scope Exclusions** section. 11 of 128 suites
  hold no Critical case at all; a suite that vanishes without a line is indistinguishable from one that
  passed.

**Pair it with a time budget, not instead of one.** `npm run regression:select -- --target <min>` bounds
the *suite* list by predicted makespan across the three lanes and never trims the risk floor (P0 +
`critical-ui-scope`); `--cases critical` bounds the *case* list within each surviving suite. Note the
standing caveat: `estimatedMinutes` is documented in `suite-selection.ts` as wrong by ×18–×88 for
runner-native suites, so a `--target` run must **state its prediction and its exclusions** until
`npm run regression:recalibrate` has real observations to correct it.

**The classifier delegates to the executor's own parser.** `scripts/lib/case-classifier.ts` calls
`parseSteps`/`validateStepBlocks` (the modules `graphql-runner.ts` itself uses) and
`parseAssertions`/`classifyPredicateScoreability` (the modules that score its verdicts) — it does
not pattern-match tags with a private regex, because a static verdict derived from a second
similar-looking implementation is exactly how a classifier and a runtime drift apart. Reason codes
are a closed vocabulary (`EX-002` no steps · `EX-003` invalid op structure · `EX-010` a step line
the parser cannot type · `EX-011` no runner op · `EX-101` nothing scoreable to assert · `EX-102` an
assertion the runner cannot score · `EX-200` explicitly `Manual` · `EX-201` explicitly
`Deprecated` · `EX-300` compiles under the UI grammar but no `ui-runner` exists yet).

Five rules make it safe rather than merely faster:

- **Fail-closed in one direction only.** Any doubt routes to `browser`, which is the status quo —
  so a classifier bug costs the saving, never a verdict. If `graphql-runner` still exits 2
  (structure), `machine-lane.ts` **returns the case to the browser lane** and records the
  disagreement in `errors[]`. That is cheap precisely because the machine lane runs FIRST, before
  any agent is dispatched.
- **ALL assertions must be scoreable, not one of them.** The runner's verdict is
  `failed === 0 && results.length > 0`, so a case mixing one parseable predicate with three prose
  ones would PASS on the strength of the one — a green earned by not understanding the rest. Same
  "silence is never a pass" rule as `layout-runner.ts`, applied one step earlier. This is what
  catches suite `050a`'s `CAT-GQL-131`, whose assertion reads
  `data.products.sortings[0].name is non-null OR is null` — vacuously true.
- **An explicit `Manual` is respected, never overruled.** It is one of two opt-out uses of
  `Automation_Status` (which carries 23 distinct values corpus-wide, so it cannot route anything
  else). `050h`'s `WISH-009` is the worked example; it lands in the results as `SKIPPED` with its
  reason, never as a quiet absence.
- **An explicit `Deprecated` is EXCLUDED from both lanes (`EX-201`), on its own count.** A retired
  case still parsed, still ran and was still scored — `050m` in `REG-2026-08-26-1631` dispatched
  all three of its `Deprecated` rows: `SR-GQL-053` (titled *"UNREACHABLE at API layer"*) FAILed
  against the suite's pass rate and was first triaged as a fixable assertion defect, while
  `SR-GQL-029` (*"OBSOLETE (statuses[] arg removed)"*) and `SR-GQL-038` "PASSed" while asserting
  nothing anyone intends to support. Both directions are wrong, so the status is now read BEFORE
  any parsing, and — exactly like `Manual` — the case lands as `SKIPPED` with its reason, never as
  a quiet absence (`suite-results-merge.ts` materialises it from the plan). It is a **fourth lane**,
  not a variant of `manual`: `manual` means *a person runs this*, `deprecated` means *nobody does*,
  and folding them would make the `manual` count lie — the same rule that keeps UNROUTABLE out of
  `browser`. Corpus-wide this excludes **35 cases in 10 suites** (4 of them previously on the
  machine lane: `050m` ×3, `050b1` ×1; the other 31 were riding browser agents). Because excluding
  a case runs AGAINST fail-closed, the match is **exact** (trim + case-fold on the whole cell) —
  `'Deprecated pending review'` is not a match and falls through to the compiler.
- **A legacy 11-column header is REFUSED (exit 2), never classified.** `parseSuite` maps fields
  positionally, so on those 11 suites the legacy `Steps` lands in `Test_Data` and `Expected Result`
  lands in `Steps` — routing would score real cases on the wrong columns. None of the 10 mixed
  suites has that header, so refusing costs nothing.

**Fragments plus one deterministic merger, never a shared file.** Once a suite's cases span two
writers, a shared `suite-*-results.json` is a race — and the agent's own contract is "overwrite the
whole file", so asking it to preserve another writer's rows is a rule it will break under context
pressure, at which point a real failure disappears. So: one writer per fragment
(`…-results.machine.json`, `…-results.browser.json`) and `scripts/lib/suite-results-merge.ts`.
Its invariants, each unit-tested in `scripts/unit/suite-results-merge.test.ts`:

1. **No case can be lost.** The planned set comes from the lanes file, not from the fragments — so a
   lane that dies before writing surfaces as `BLOCKED` / `lane_lost: the <lane> lane did not report
   this case`, instead of producing a smaller, greener, faster-looking suite. The two
   **non-executing** lanes are the deliberate exception and are materialised from the plan as
   `SKIPPED` with their own note (`manual` → `Automation_Status=Manual (explicit)`, `deprecated` →
   `Automation_Status=Deprecated (retired …, EX-201)`) — a planned lane that never dispatches must
   not read as a lane that died, and a retired case must not be labelled as awaiting a human.
2. **No case can be counted twice.** The same id in two fragments is a hard error naming both, and
   **nothing is written** — that means the split leaked.
3. **Every row carries its `lane`**, and the envelope carries per-lane counts. Without it no
   determinism trend can be read off history.
4. **Counts are recomputed from the rows**, never summed from the fragment headers (a header is one
   writer's claim about itself). A status outside PASS/FAIL/BLOCKED/SKIPPED stays untallied, so the
   four counts summing to less than `totalCases` is how an incomplete suite stays visibly
   incomplete.
5. **Idempotent** — the orchestrator re-merges on every poll so the live dashboard is not frozen
   while both lanes work. `completedAt` stays empty until every fragment closes.

Determinism moves **9.3% → 13.3%** of the corpus (385 → 554 of 4,155 cases). It also pulls four
cases OFF the fast path that are currently fed to a runner which cannot fully parse them — one of
them, `050c`'s `ORD-GQL-TODO-001`, says so in its own steps: *"[MANUAL-BLOCKED] … Do NOT run via
graphql-runner"*, and today the runner runs it and reports `EMPTY` → exit 1 → a FAIL on a
placeholder row.

## Storefront Selectors — generated, gated, and measured against the source

`.claude/knowledge/automation/storefront-selectors.md` (455 lines) and
`.claude/knowledge/execution/test-execution-preflight.md` hand-listed the storefront's
`data-test-id` surface. Both were verified live on their capture dates and were correct then.
Diffed against `vc-frontend@dev` (`17c99c7`, 2026-08-26): of the 78 distinct selectors they assert,
most match exactly, a couple are plausible instantiations of a real template, and a minority match
nothing — while over a hundred real selectors are undocumented.

> **The precise split first published here (54 / 2 / 22) was measured before the generator read
> the UI-kit prop form, so the "matches nothing" figure was an over-count by at least six.**
> `sign-up-first-name-input`, `sign-up-email-input`, `sign-up-confirm-password-input`,
> `global-search-query-input`, `search-keyword-input` and `payment-method-selector` were all real
> the whole time — declared via `test-id-input=` / `test-id-dropdown=` rather than the
> `data-test-id` attribute (see the two-ways bullet below). Reading both forms took the static
> surface from 161 to **194**. The exact re-split is deliberately not restated: the original 78
> was a careful hand harvest, and a fresh automated one picks up CSS classes, attribute names and
> MCP server names, so a number from it would look more precise than it is. What is defensible and
> load-bearing: the drift is real, the direction is right, and `isKnownSelector` is the check —
> not any count written in prose.

**The drift landed on the load-bearing document.** `test-execution-preflight.md`'s selector table
specified the sign-in and sign-out controls, reached by `[PRE:SIGNIN_AS]` / `[PRE:SIGNOUT]` from
~1,572 cases. `main-layout.top-header.account-menu-button` is now `account-menu`;
`main-layout.top-header.account-menu.sign-out-button` is now `sign-out-button`; the `main-layout.`
prefix survives in exactly one unrelated place in the whole source. An agent looking for an element
that is no longer rendered either fails the precondition or falls back to guessing by text — a live
contributor to the measured artefactual-BLOCKED rate (19.9% corpus-wide, 28.6% on suites of 81+
cases — see the note under §Per-Case Lane Routing; the once-quoted flat 29% was a single run).

So the surface is generated, not transcribed — the same shape as `tokens:sync`, and for the same
reason (`.claude/rules/test-data.md` §GOLDEN RULE):

| Command | Does |
|---|---|
| `npm run selectors:sync` | rewrite the committed `scripts/lib/storefront-selectors.generated.ts` |
| `npm run selectors:sync -- --from ../vc-frontend` | read a local checkout instead of cloning |
| `npm run selectors:check` | CI drift gate — **exit 2 on an unreachable source, never a silent pass** |

Four rules make it trustworthy rather than another list:

- **It clones; it cannot fetch files.** Unlike `sync-design-tokens.mjs`, which reads four named
  files, this has to ENUMERATE a tree (454 `.vue` + 916 `.ts`) — `raw.githubusercontent.com` cannot
  list a directory. So the source is a shallow, blobless, sparse clone, or `--from`. (Incidentally
  this makes `selectors:check` usable where `tokens:check` is not: the git proxy serves clones while
  `raw.githubusercontent`/`unpkg` are policy-blocked.)
- **A template is a PREFIX, never a literal.** `:data-test-id="`filter-${facet.paramName}`"` yields
  the prefix `filter-`, and `SELECTOR_PATTERNS` records the template. Writing `filter-price` as a
  literal is the transcription error this file exists to stop — and `filter-price` is in the docs.
  Conversely, `isKnownSelector("filter-price")` is **true**: it is a plausible instantiation, so
  calling it a phantom (as a naive diff against static values does) is the same overreach reversed.
- **`isKnownSelector` false means UNVERIFIED, not invalid.** Twenty bindings are bare expressions
  (`:data-test-id="item.dataTestId"`) whose runtime value cannot be read statically.
  `UNRESOLVED_BINDINGS` records each with its reason and location, so the gap is visible rather
  than silently absent.
- **A test id reaches the DOM two ways, and reading only one of them is how a generator lies.**
  There is the `data-test-id="literal"` **attribute**, and there is a UI-kit **prop**
  (`test-id-input`, `test-id-dropdown`, …): `vc-input.vue` declares `testIdInput?: string` and
  renders `:data-test-id="testIdInput"` on the inner `<input>`, so
  `test-id-input="sign-up-password-input"` puts `data-test-id="sign-up-password-input"` in the DOM
  — the prop value IS the rendered id, verbatim, and just as statically readable. The first version
  of this generator scanned only the attribute, missing **39 real selectors** across the sign-in
  form, the entire sign-up form, the search bar, the address form, the bank-card form and the
  checkout method selectors — exactly the form controls a smoke suite drives. It then wrote the
  absence up as a finding ("`sign-up.vue` does not pass it"), which was measurably false. Fixed
  2026-08-26: 161 → **194** static ids, with a unit test pinning the prop coverage. A generator
  that silently covers half its surface is the same failure as a hand-maintained list, only harder
  to notice — which is the whole reason this section exists.
- **Prefer a test id over a label.** A label is an i18n key (`common.labels.email`), so a
  label-based locator is locale-dependent — and the language selector is itself under test. Where
  no test id exists, `name="email"` is the next-best anchor because it is locale-independent too.

**`data-testid` (no dash) does not exist.** `test-execution-preflight.md` used to say "a few legacy
spots may use `data-testid` … either should work with Playwright locators". Measured across
`client-app/`: zero occurrences, static or bound. The hedge was not a safe fallback; it was a way to
write a locator that always fails.

**Still hand-maintained:** the ~400 rows of `storefront-selectors.md` covering the non-`data-test-id`
layers (`.vc-*` component classes, page-scoped BEM). The generator cannot see those, and re-pointing
them needs a live re-check per row — authoring, not mechanics. The file now carries an audit header
saying so.

## Executability — what a runner can execute, and what would move it

`npm run suites:executability` is the reporting half of `scripts/lib/case-classifier.ts`. It adds
no judgement of its own and deliberately shares the classifier with the lane planner, because a
report that disagreed with the routing would be worse than no report.

| Command | Answers |
|---|---|
| `npm run suites:executability` | per-suite machine/browser/manual/**unroutable** + the `EX-*` histogram |
| `… -- --suite <ID>` | per case, with the blocker codes and the offending token |
| `… -- --burn-down` | the backlog, cheapest first |
| `npm run suites:executability:check` | **ratchet: fails only when a suite LOSES machine cases** |

**`--check` is not the question `suites:lint` asks.** That one asks *"is the manifest in sync?"* and
fails on drift in either direction. This one asks *"did determinism regress?"* and fails **only on a
drop**, so a change that makes cases unroutable cannot ride in behind a routine `suites:sync`.

**It is deliberately NOT a gate on prose.** 84% of the corpus is prose by design — these are cases an
LLM agent drives, and most should stay that way. A gate that failed on "not machine-executable"
would be red forever, everyone would learn to pass `--warn-only`, and the signal would be dead.

**Per-suite lane counts are recorded in the manifest** (`lanes: {machine, browser, manual}` plus
`deprecated` when non-zero, reconciled by `suites:sync` exactly like `testCount` and `clickDriven`,
present only when a suite has at least one machine case). So the planner and the report read one
recorded answer instead of each re-classifying 127 CSVs — and a drop shows up as manifest drift as
well as a ratchet failure. **Not every drop is lost determinism:** a case retired to `Deprecated`
(EX-201) leaves the machine lane by design, so `--check` naming a suite whose only loss is an
EX-201 is drift to *record*, not a regression to fix — which is why the failure text says so and
why `deprecated` is recorded separately rather than melted into `manual`.

**UNROUTABLE is its own count, never folded into `browser`.** The 11 surviving legacy 11-column
suites (274 cases) are not "browser suites" — they are suites nothing can classify, because
`parseSuite` maps positionally and on them the legacy `Steps` lands in `Test_Data`. Counting them as
browser would hide 274 cases behind a number that reads like a deliberate choice.

### The measured correction to the burn-down economics

Determinism is **555 / 4,231 = 13.1%**. The backlog splits, against the grammar the GraphQL/REST
runner actually parses:

| cases | bucket |
|---|---|
| **2** | steps compile, assertions are prose |
| **46** | assertions compile, steps need normalising |
| **2,481** | prose on both sides — not a project; taken suite by suite in `/qa-review-tests` |
| **838** | explicitly `Manual` — out of scope by intent |
| **35** | explicitly `Deprecated` — retired; out of scope by *definition*, never converted (EX-201) |
| **274** | UNROUTABLE — legacy header; a suite-level migration, and authoring |

**Read the small number as a finding, not an under-count.** An earlier estimate put ~365 cases one
assertion-rewrite away from determinism and ~739 one step-normalisation away. Those came from a proxy
metric — *does the assertion CONTAIN a comparison operator* — and do not survive the executor's own
parser: a storefront case asserting `[DOM] cart icon visible` can never be scoreable by a GraphQL
predicate scorer, however well it is written. Worked examples of the real cheap tranche: `050a`'s
`CAT-GQL-131`, whose assertion reads `data.products.sortings[0].name is non-null OR is null`
(vacuously true), and `027b`'s `ORGROLE-001..003`, which carry a `[NAV]` step inside an otherwise
GraphQL-shaped case.

**So the next real gain is not an authoring push — it is a DOM predicate grammar (a `ui-runner`).**
Rewriting assertions buys about **1 percentage point**; giving the browser lane a runner of its own
is what addresses the other 2,508. That reorders the plan: the authoring burn-down is a tail task,
not the next step.

## Change-Scoped Selection — not running a suite beats running it fast

`npm run regression:select -- --repo <name> [--diff <range> | --changed-files <f> | --path <p>…]
[--target <min>] [--json]` (core `scripts/lib/suite-selection.ts`, CLI
`scripts/regression/select-suites.ts`) answers "which suites does this change need?" without an
LLM. Measured on the real manifest: a single-module change selects ~24 of 127 suites, ~149
predicted minutes against ~1010 for the whole corpus.

**It exists to replace a hallucination.** `ci/run-full-cycle.ts` asked an agent to print
`AFFECTED_SUITES: <ids>` and parsed it with a regex — and the `REG-2026-08-24-1806` notes carry 32
claimed case ids that do not exist, each exactly the next sequential number after a real suite's
maximum. A model asked to name ids names plausible ones. The selector cannot: every id it prints
came out of `config/test-suites.json`, which is a unit-tested property. Phase 1 now uses the
selector and reads the agent's line only to LOG a disagreement — an id the selector did not choose
is either a hallucination or a mapping gap, and both want looking at rather than running on.

Four rules, and the first inverts the discipline the rest of this file follows:

- **It fails OPEN.** `case-classifier.ts` fails closed (doubt → the browser lane), because
  claiming a case is machine-ready when it is not manufactures a BLOCKED that reads as a product
  failure. Here the expensive direction reverses: an unnecessary suite costs its
  `estimatedMinutes`, a missing one ships a regression. So doubt WIDENS — to the whole layer the
  changed repo touches, with the unmatched paths reported in `unmappedPaths`.
- **The complete signal is primary, the precise-looking one is a bonus.** `resolveSuiteSource`
  yields modules for 117 of 127 suites but **repos for only 44**, because `reposForModule` reports
  router-matched names only — `vc-frontend` names 7 suites while 53 carry `layer: frontend`. So
  selection is driven by the manifest's own `domain`/`tags` vocabulary (present on every suite) and
  the repo index only ADDS; it can never filter out a vocabulary hit. Gating the fail-open fallback
  on the repo index having contributed was a real bug, caught by its own test: one hit from an
  index that covers a third of the corpus is not evidence the index is complete.
- **No hand-written path map.** `client-app/shared/checkout/…` → `checkout` because some suite is
  tagged `checkout`; a `.NET` path is split on dots, `-`, `_`, CamelCase and the structural
  `Module`/`Service`/`Controller` suffix, then matched EXACTLY (a prefix match would let `cart`
  capture `cartridge`). A transcribed table would fail silently on a renamed directory — the
  `.claude/rules/test-data.md` §GOLDEN RULE case, with a narrower selection as the failure mode.
- **The risk floor is never trimmed.** P0 plus `critical-ui-scope` survive any `--target`, and an
  unreachable target reports the overrun honestly instead of dropping the P0 gate. Everything the
  target does drop is printed as **coverage debt**, the opposite of the budget guard that truncates
  silently and reports the remainder as `blocked`.

**An unplaceable change is refused, not guessed.** `ci/lib/affected-suites.ts` `placeChange` maps
`module <name>` and `diff [range]`; a PR reference, a changelog version and a ticket key return
**null**, so the caller keeps its configured `SUITE_SELECTION`. Resolving a PR's file list needs a
GitHub call this module deliberately does not make, and an unplaceable change is exactly when a
wrong-but-plausible selection is least likely to be questioned.

**Not the default for anything, deliberately.** Whether a scoped selection catches what `full`
catches is a question about MISSED regressions, and answering it needs run history that does not
exist yet (`history.json` is un-ignored per A4, but no run has written one — so the history rule is
a documented no-op and the CLI says so). Run it in shadow beside a periodic `full` for several
cycles and compare what it would have skipped. Making it the default now would trade a measured
cost for an unmeasured risk.

## Post-Run Results Triage — `/qa-triage-results`

A regression run tells you *which* tests failed; **`/qa-triage-results [RUN_ID|latest] [--fix] [--verify]`** works out *why* each one failed and what to do. **Owned by `qa-lead-orchestrator`** (orchestrate-only Triage Orchestrator — delegates classification to `regression-triage-agent`, live verification to `qa-frontend/backend-expert`, test fixes to `/qa-review-tests`, bug drafts to `/qa-bug`; never edits a CSV, files a ticket, or calls `/qa-fix`). It reads a completed run under `reports/regression/{RUN_ID}/`, and — cloning the `/qa-monitoring` skeleton (collect → dedup → triage → live-verify → report → STOP) — classifies every FAIL into **real product bug** vs a **test defect** (`TEST_STEPS_DEFECT` / `ASSERTION_DEFECT` / `TEST_DATA_DEFECT` / `STALE_TEST`) vs `FLAKY` / `ENV` / `KNOWN_ISSUE`.

- **Collect (deterministic):** `npm run triage:collect -- <RUN_ID|latest> --record` (`scripts/lib/regression-triage.ts`) assembles each non-passing case — **FAIL, BLOCKED, and SKIPPED** (each with a `status`; only PASS and PENDING excluded) — with its `traces/*-FAIL-trace.json` (network + console w/ stack frames, FAIL only), `screenshots[]`, lane HAR path, the CSV row, a stable fingerprint, and the cross-run flaky flag. A BLOCKED is triaged for *why* (env / precondition / data / real bug); a SKIPPED for a removed feature (stale test) vs an intentional gate.
- **Classify (judgment):** `ci/agents/regression-triage-agent.md` reads the evidence (incl. **opening the screenshot** for visual/element failures) against the oracles and emits `CLASS` + severity/route/confidence + suggested fix. Ambiguous → `REAL_BUG`/`LOW` (→ live repro / human review), never relabelled as a test-defect.
- **Verify + act:** HIGH-confidence real bugs are reproduced live by `qa-frontend/backend-expert`; under `--fix`, test-defects route to `/qa-review-tests <suite> --fix` (diff + confirm) and confirmed bugs are drafted to `reports/bugs/`. **STOP** — never files a tracker ticket, never triggers `/qa-fix`.
- **Report:** `reports/regression/{RUN_ID}/triage-report.md` (three tables: confirmed bugs / test-case fixes / dismissed).
- **Flakiness feed:** `npm run triage:history` writes per-suite rows into `reports/regression/history.json` in the shape `scripts/regression/compute-metrics.ts` expects (previously the flaky/trend detector was starved — the CI runner wrote a run-level shape it couldn't read; that run-level cost log now lives in `history-ci-runs.json`).

Full methodology: the `/qa-triage-results` skill (`triage-taxonomy.md` + `routing-and-fix.md`). Interactive-first; a headless `ci/run-triage-results.ts` twin is a documented follow-up.

## Post-Run Promotion — `Draft → Automated`, derived from the run

A run produces the only evidence that can justify calling a case `Automated`, and until
2026-08-26 nothing consumed it. The promotion rule was written down three times (`/qa-test`
5g, `/qa-test-lifecycle` 6P, `test-case-template.md` §Automation_Status) and performed by
hand: an agent re-read a report, decided which cases "ran green", and edited the
`Automation_Status` cell. `suites:lint` S-006 only ever checked the **vocabulary** — that
`Automated` is a legal word, never that it is a justified one — so a promotion could not be
re-derived by anyone, including the person who made it. That matters more than an ordinary
bookkeeping error because promotion is **one-way in practice**: an `Automated` case is
regression-eligible forever, so a wrong flip is permanent coverage resting on a verdict that
was never recorded.

| Command | Does |
|---|---|
| `npm run tc:promote -- [RUN_ID\|latest] [--suite <ID>]` | dry run: print the per-case decision and the reason for every hold |
| `npm run tc:promote:apply -- <RUN_ID> [--suite <ID>]` | write the CSVs, then `suites:sync` + `suites:lint` |
| `… -- --min-green-runs <N>` | require N trailing green runs, not just this one |
| `… -- --stamp VCST-1234` | stamp `References` with a ticket key instead of the RUN_ID |
| `… -- --json` | machine-readable decisions, for a skill to relay |

Core `scripts/test-cases/promote-cases.ts`; unit tests `scripts/unit/promote-cases.test.ts`.
It **never demotes**, never touches a row that is not exactly `Draft`, and never invents a
verdict for a case the run did not report — the flip is the only write it can make.

**A case is promoted only when every one of these holds**, and each has a reason code so a
hold is attributable rather than narrated (`PR-002` absent from the run · `PR-003` verdict
is not PASS · `PR-004` non-executing lane · `PR-005` flaky · `PR-006` too few green runs ·
`PR-007` GRD-001 at the target status · `PR-008` a Critical structural finding · `PR-009`
the run reported the id twice · `PR-010`/`PR-011`/`PR-012` the row or file cannot be read ·
`PR-013` the run never completed · `PR-014` the CSV changed after the run finished).

Five decisions are worth stating, because each one was a live fork:

- **Fail-closed in one direction only.** Every doubt leaves the case at `Draft`, which is the
  status quo. A missed promotion costs one more run; a wrong one puts an ungrounded case into
  permanent coverage. Same asymmetry, and the same resolution, as `case-classifier.ts`
  routing doubt to the browser lane.
- **The row is linted at its TARGET status, not its current one.** `lint-test-cases.ts`
  GRD-001 escalates a `{HYPOTHESIS}` assertion to Blocker only in a **promoted** (past-`Draft`)
  case — that IS the rule "a hypothesis may not survive promotion", and asking it of the row
  as it stands always answers yes. So the promoter lints the row with `Automation_Status`
  already set to `Automated`, reusing the ONE declared gate. Restating the gate here is how
  two enforcers come to disagree; the worked example is `050m`'s `SR-GQL-056`, green in the
  run and correctly held on `[ERRORS label=main] errors[] empty {HYPOTHESIS}`.
- **A browser-lane PASS counts.** `Automated` means "MCP-executable by an agent"
  (`test-case-template.md` §Automation_Status), and the browser lane is an LLM agent driving
  Playwright MCP, not a human. A PASS on the `manual` or `deprecated` lane, by contrast, is
  **incoherent** rather than weak evidence — those lanes never dispatch — so it is refused
  (`PR-004`), not discounted.
- **The current run counts as one green run.** The fingerprint store is filled by a separate
  `triage:collect --record` that may not have run yet, so reading the streak off the store
  alone found zero and the default `--min-green-runs 1` held every case in an unrecorded run
  — a green run counting as no green runs. The canonical `suite-*-results.json` outranks the
  store for the run being read. Flakiness still comes from the store, folded **across
  environments on purpose**: `Automated` is a claim about the case, and a case that only holds
  on one environment is the kind that later reads as a product failure.
- **The CSV is edited surgically, not rewritten.** Re-serialising a suite renormalises the
  quoting of every untouched row (an unreviewable diff), and several suites carry inner-quote
  irregularities a strict re-write mangles. Each edited record is located by its own raw
  source text, only the bytes of the changed fields are replaced, and the result is re-parsed
  and compared field-by-field against the original — anything that moved where it should not
  aborts the whole write. Measured on `050m`: 39 promotions produced a 39-insertion /
  39-deletion diff and nothing else. `References` gains a `Promoted: <label> (<date>)` stamp
  appended beside the existing `Synced:` / `Audited:` ones, never clobbering them.

**It is a tool, not an automatic step.** Promotion out of `Draft` stays a human /
`qa-lead-orchestrator` decision — the promoter makes that decision *checkable* and its write
*safe*, which is the half that was missing. `/qa-test` 5g and `/qa-test-lifecycle` 6P remain
the flows that decide; they now call this instead of hand-editing the cell.

## Prompt Templates

Key prompt templates in `vc/shared/docs/prompts/`:
- `How to test Builder.io.md` - Builder.io, Virto Pages & vc-frontend testing
- `story-testing.md` - Story-level testing prompt

> **Note:** `test-runner-agent.md` is now an agent definition at `agents/test-runner-agent.md`, not a prompt template.
