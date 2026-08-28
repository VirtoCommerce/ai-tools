---
description: "Run regression test suites in parallel. Supports scope selection: smoke, critical, sprint, full, frontend, backend, or comma-separated suite IDs. Correlates App Insights logs for the run window. Optional --seed=<profile> pre-seeds test data; --teardown removes AGENT-TEST-* entities after run."
argument-hint: "[smoke|critical|sprint|sprint:XX-YY|full|frontend|backend|001,004,006] [--cases <tier>] [--also-ids <ids>] [--seed=...] [--teardown] [--no-plan] [--frontend|--backend]"
disable-model-invocation: true
---

# /qa-regression — Run Regression Test Suites

You are the **Regression Orchestrator** for Virto Commerce. When invoked, you execute regression test suites in parallel using the test-suites.json manifest and dedicated sub-agents with isolated browser contexts.

## Usage
```
/qa-regression                             # Default: smoke
/qa-regression smoke                       # the smoke selection (pre-deploy gate)
/qa-regression critical                    # the P0 selection
/qa-regression sprint                      # Reads vc/shared/docs/Sprint plans/ for the current sprint plan and runs ALL Section 5.1 suites (5.1.1 Frontend + 5.1.2 Backend); falls back to static group if no plan
/qa-regression sprint --frontend           # Run only the plan's §5.1.1 Frontend suites (regression/suites/Frontend/)
/qa-regression sprint --backend            # Run only the plan's §5.1.2 Backend suites (regression/suites/Backend/)
/qa-regression sprint:XX-YY                # Pin to a specific sprint plan
/qa-regression sprint:XX-YY --frontend     # Pin to a plan AND scope to its §5.1.1 Frontend suites
/qa-regression sprint --no-plan            # Force static `sprint` selection group from test-suites.json (skip plan lookup)
/qa-regression full                        # every suite minus the manifest's excludes (production release)
/qa-regression frontend                    # All Frontend/ suites
/qa-regression backend                     # All Backend/ suites
/qa-regression 001,004,006                 # Specific suite IDs (three digits — 01 is not an id)
/qa-regression b2b --seed=b2b              # Seed B2B data before b2b suites
/qa-regression purchase-flow --seed=full --teardown   # Seed full, run, then teardown
/qa-regression marketing --seed=pricing    # Seed price lists before marketing suites
/qa-regression 004,028 --cases critical    # Only the Critical cases of those suites (change-scoped)
/qa-regression 004 --cases critical --also-ids SRCH-060,SRCH-061   # ...plus named cases, any priority
```

### `--cases <tier>` — run a slice of each suite, not the whole suite

Opt-in, and **off by default**: without it a selection runs every case, exactly as before. With it,
each suite's resolved CSV is narrowed by `npm run suites:filter` *before* `suites:lanes` classifies it
(`regression-orchestrator` Step 3a), so lanes / machine lane / merge / triage / promotion are unchanged.

- **Tiers:** `critical` · `high` · `medium` · `low`, or a comma list. `P0`/`P1`/`P2`/`P3` are accepted
  as spellings of the same four tiers — the alias table `append-test-cases-to-suite.ts` already uses.
- **`--also-ids <ids>`** keeps named cases whatever their priority. This is how `/qa-test` runs its own
  newly authored `Draft` cases alongside the Critical slice — they are in scope by construction.
- **Why:** `Critical` is 883 of the 3,969 canonical-header cases (~22%) and ~23% of the estimated
  minutes, which is what puts a change-scoped run inside a 40-minute window. Pair it with
  `npm run regression:select -- --target 40` to bound the suite list as well as the case list.
- **Nothing is dropped silently.** The run report gains a **Scope Exclusions** section naming every
  suite that contributed zero cases, every unreadable `Priority`, every legacy-header refusal, and any
  `--also-ids` that matched nothing.

> **Which suites a selection expands to, and how many, is NOT documented here.**
> `config/test-suites.json` `selections` is the source of truth, and
> `npm run regression:plan -- <selection>` prints the resolved set with its case count and
> predicted makespan. A list copied into this file goes stale at the next suite change — the
> same failure `.claude/rules/regression.md` records for the retired `080` suite, which stayed
> documented for weeks after its CSV was deleted. Two of the counts that used to sit here
> disagreed with each other about the same selection.

### Execution Modes

There is **one** orchestrator: `regression-orchestrator`, dispatched via the Task tool.

> A second `--autonomous` mode (Agent Teams, `results/{RUN_ID}/`) was removed 2026-08-26. It was a
> parallel stack whose output no tooling read: no live dashboard, no `/qa-triage-results`, no
> `history.json` flakiness feed, no `reap-stalled-run` backstop, no `compute-metrics` gate. It had
> also drifted — its fallback chain still put firefox second (the order fixed on 2026-08-05 because
> firefox cannot click here), and it assigned firefox as the *preferred* browser for Smoke and
> Payment. Its two genuinely useful pieces — the graduated rate-limit guard and the 30/60s backoff
> ladder — were folded into `regression-orchestrator.md` Step 5. Its auto-JIRA filing was dropped
> deliberately: `/qa-triage-results` and `/qa-monitoring` both stop short of filing, and a
> regression run should not be the one thing that does.


### Optional Flags

- **`--seed=<profile>`** — Pre-seed test data via `/qa-seed-data <profile>` **before** the regression run begins. Valid profiles are the ones `/qa-seed-data` declares — `bootstrap`, `minimal`, `catalog`, `b2b`, `pricing`, `inventory`, `loyalty`, `promotions`, `bopis`, `configurable`, `users`, `full` (`teardown` is the `--teardown` flag's job, not a seed profile). If that list and this one ever disagree, `/qa-seed-data` wins. Executes as Step 0.5 (see pipeline below). Skip if already seeded for the same session.
- **`--teardown`** — After the regression run completes (pass or fail), invoke `/qa-seed-data teardown` to remove all `AGENT-TEST-*` entities. Use with short-lived seed data; skip if other agents are sharing the seeded entities.
- **`--no-plan`** — Only meaningful with `sprint` selection. Skips the sprint plan lookup and falls back to the static `sprint` selection group from `config/test-suites.json`. Use when running a generic sprint-scope regression that's not tied to a specific Done sprint plan.
- **`--frontend` / `--backend`** — Only meaningful with `sprint` / `sprint:XX-YY` selection. After resolving the plan's `suitesActivated[]`, keep only the suites in that layer — `--frontend` → the plan's §5.1.1 Frontend suites (`regression/suites/Frontend/`), `--backend` → its §5.1.2 Backend suites (`regression/suites/Backend/`). Classified by the layer directory each suite's CSV lives under in `config/test-suites.json`. Mutually exclusive; omit both to run the full plan. (These are sprint-scope **modifiers** — distinct from the top-level `frontend`/`backend` selections, which run *all* suites in a layer regardless of any sprint plan.)

**Do NOT use `--seed` with `smoke`** — suite 042 validates infrastructure/login paths only and gains nothing from seeding (adds 5-15 min with no coverage benefit). Warn the user and proceed without seeding.

#### Recommended seed profile per selection

| Selection | Recommended `--seed` | Why |
|-----------|---------------------|-----|
| `smoke`, `042` | _(none)_ | Infra/login only — seeding wastes time |
| `critical` | `minimal` (optional) | P0 gate; seed only if env is known-empty |
| `catalog`, `search` | `catalog` | Products, categories, multi-currency fixtures |
| `b2b`, `auth` | `b2b` | Orgs, contacts, role-based users |
| `orders`, `purchase-flow`, `checkout` | `full` | Needs catalog + b2b + pricing together |
| `marketing` | `pricing` | Price lists / tiers for promo evaluation |
| `sprint`, `full` | `full` | Broad coverage — seed everything once upfront |
| `frontend`, `backend` | _(match by content)_ | Pick based on which modules dominate |

If the user passes an incompatible combo (e.g. `--seed=b2b` with `catalog` selection), proceed but note the mismatch in the report header.

---

## Execution Pipeline

### Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, abort — regression on a broken env wastes budget.
2. **Build & version verification** — fetch full deploy state per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa` by default; use the branch matching `TEST_ENV` for other envs)
   - Record: platform version, theme version, and all module versions
   - Include full deploy state in the regression report header (Step 6)
   - Save to `reports/deploy-state-cache.json` for cross-reference
3. **Duplicate check** — check `reports/regression/test-run-status.json` for an active run with the same suite selection. If found, block — wait for current run to complete. **First rule out an orphan:** that file is flipped to `completed` only by Step 6 of the owning orchestrator, so an orchestrator that died mid-run leaves it `in_progress` forever and blocks every future run. Run `npm run regression:reap` (read-only) — it classifies the run from file evidence (newest mtime across the run's own results/screenshots, ignoring the watcher-written `regression-report.html`). `ACTIVE` → block as above. `STALLED` → reclaim it with `npm run regression:reap:apply` (marks `status: "stalled"`, never `completed`) and proceed. `SETTLED`/`NO-STATUS` → nothing is running; proceed.
4. **Context7 query** (for `sprint` and `full` selections) — resolve `/virtocommerce/vc-docs`, query `"platform release notes recent changes"` with `tokens: 8000`. Flag any API contract changes that may cause false failures in existing test cases. Consider running `/qa-test-lifecycle diff` (or `changelog <version>`) first if breaking changes detected.

### Step 0.5 — Seed Data (only if `--seed=<profile>` provided)

1. **Reject smoke-with-seed** — if selection is `smoke`/`042` and `--seed` is set, warn the user and skip seeding.
2. **Check fingerprint** — if `test-data/b2b/.seed-fingerprint.json` exists AND was modified within the last 2 hours AND its `kind`/`env`/`storeId` match the requested profile, skip (reuse) and log "Seed reused from <timestamp>".
3. **Invoke** `/qa-seed-data <profile>` via the qa-seed-data skill. Wait for completion.
4. **Wait for reindex** — sleep 60s before starting Step 1 so storefront tests see new catalog/pricing data.
5. **On seed failure** — abort the regression run. Report the seeding error to the user with the failed profile; do not attempt to run suites against unseeded state.
6. **Record seed state** — capture seed profile + timestamp in the run report header so bug triage knows the data context.

### Step 1 — Read Manifest & Resolve Selection

**1a. Read manifest** — Load `config/test-suites.json` for suite definitions, browser pool, and selection groups.

**1b. Resolve selection into suite IDs.** Default path: look up the selection in the manifest's `selections` block.

**1c. Sprint-plan resolution** (only when selection is `sprint` or `sprint:XX-YY`, and `--no-plan` is NOT set):

The static `sprint` selection group in `test-suites.json` is a generic "all P0+P1" superset. When a sprint test plan exists for the active sprint, prefer its **Section 5.1 suite list** — it's been risk-scored and scoped to the actual Done items.

Resolution order:

1. **Explicit pin** (`sprint:XX-YY`) → read `vc/shared/docs/Sprint plans/sprint-{XX-YY}-summary.json`. If missing → abort with a clear error: "No sprint plan found for {XX-YY}. Run /qa-test-plan {XX-YY} first, or use --no-plan to fall back to the static group."

2. **Bare `sprint`** → auto-detect the active sprint plan:
   - List `vc/shared/docs/Sprint plans/sprint-*-summary.json` files
   - Pick the one whose `endDate` is closest to (but not after) today's date — i.e. the most-recent-completed sprint plan
   - If no plan files exist → fall back to the static group from `test-suites.json`, log a warning: "No sprint plan found in vc/shared/docs/Sprint plans/ — using static sprint selection group. Run /qa-test-plan to generate a plan-driven selection."

3. **Read** `summary.json` and extract `suitesActivated[]` — these are the suite IDs to run. Validate every ID exists in `test-suites.json` (warn and drop unknowns rather than failing).

3a. **Layer filter** (only if `--frontend` or `--backend` is set) — narrow `suitesActivated[]` to the requested layer by classifying each suite against the layer directory its CSV lives under in `config/test-suites.json` (`regression/suites/Frontend/` vs `Backend/`) — this matches the plan's §5.1.1 / §5.1.2 sub-tables. `--frontend` keeps Frontend suites, `--backend` keeps Backend. Log the dropped-by-layer count. If the filter leaves zero suites, abort with a clear note ("Plan {XX-YY} has no {layer} suites in §5.1"). `--frontend`/`--backend` are mutually exclusive — reject if both are passed.

4. **Resolved-from-plan output** — log to the run report header:
   ```
   Selection: sprint (resolved from vc/shared/docs/Sprint plans/sprint-26-09-summary.json)
   Sprint: Sprint26-09 (2026-04-29 – 2026-05-15)
   Suites: 042, 044, 049, 078, 082, 031, 032, 033, 020, 026, 027, … (46 from suitesActivated[])
   Test cases: <sum of the manifest testCount for the resolved set>
   Plan link: vc/shared/docs/Sprint plans/sprint-26-09-test-plan.md
   ```

5. **`--no-plan` opt-out** → skip 1c entirely; use the static `sprint` group from the manifest.

**1d. Other selections** (`smoke`, `critical`, `full`, `frontend`, `backend`, comma-separated IDs) → manifest-only, no plan lookup.

### Step 2 — Generate Run ID
Create `REG-YYYY-MM-DD-HHMM` and output directory `reports/regression/{RUN_ID}/`.

### Step 3 — Initialize Status Tracker & Launch Live Dashboard
1. Write `reports/regression/test-run-status.json` with all suites in `pending` state (run-level `status: "in_progress"`).
2. **ALWAYS launch the live HTML dashboard in the background — automatically, on EVERY run, without being asked.** This is mandatory, not optional: never wait for the user to request the dashboard, and never ask whether to launch it. It fires for every selection and every execution mode — browser-pool runs AND single runner-native suites (e.g. 050m) alike. Launch it here, right after writing `test-run-status.json` and **before dispatching any suite agent (Step 4)**:
   ```
   npm run report:regression:watch -- --run-id {RUN_ID}
   ```
   Run it **detached / in the background** (do not block on it). It opens `reports/regression/{RUN_ID}/regression-report.html` in the browser immediately (a "pending" view), regenerates every ~10s as suites complete, and — because it reads `test-run-status.json` — auto-refreshes the page (`<meta refresh>`) until the run is `completed`, then settles into the final static report and exits on its own. Spawning `npm run …` is a Node script, not a browser/UI action, so it does not trip the real-user hook.

   > **⚠ Watcher OWNERSHIP + lifecycle — the load-bearing rule (this is why the dashboard "freezes"):** the watcher MUST be launched by the **persistent session that owns the run for its whole duration** — i.e. the top-level `/qa-regression` session, using ITS OWN background mechanism. **NEVER let an ephemeral sub-agent own the watcher.** A sub-agent's background processes are **killed the instant its turn ends**, but the run outlives it (runner sub-agents keep writing `suite-*-results.json`, consolidation happens turns later) — so a watcher spawned *inside* the `regression-orchestrator`/`test-runner` sub-agent dies mid-run and the HTML goes stale even though results keep updating. Therefore:
   > - If you (the top-level session) **dispatch** suite execution to the `regression-orchestrator` sub-agent or runner sub-agents, **YOU launch the watcher here first, in your own background** — do not delegate the launch.
   > - **Self-heal (check on every wake / task-notification while the run is `in_progress`):** if `regression-report.html`'s mtime is older than ~60s while `test-run-status.json` is still `in_progress` (or any `suite-*-results.json` still shows PENDING/running), the watcher has died — **relaunch it** (same command) or run the one-shot `npm run report:regression -- --run-id {RUN_ID}` to refresh, then relaunch the watcher. Do this without being asked.
   > - The watcher is a plain Node process; the durable owner is the main-loop `run_in_background` (it survives across turns and re-notifies on exit), never a Task-dispatched agent.

### Step 4 — Get the plan, then dispatch with continuous refill

**Record the run window start** — the current timestamp, before the first dispatch. From here until
the last suite settles is the App Insights correlation window used in Step 5.5.

1. **Get the plan** (do not derive lanes, order or browser constraints by hand):
   ```bash
   npm run regression:plan -- <selection> --json
   ```
   Exit code 1 = the selection cannot run as-is (unknown suite id, missing CSV, no executor, or a
   cap that would guarantee truncation). Stop and report; do not improvise around it.

2. **Dispatch in the plan's order, keeping every slot busy.** The plan assigns each suite one of
   three lanes, which do not share slots: `browser` (3 slots), `fastpath` (up to 4, no browser at
   all), `deterministic` (the manifest's `runnerCommand`, no sub-agent and no tokens). Fill free
   slots from the head of each lane's dispatch order; **the moment ONE suite finishes, dispatch the
   next suite the freed slot can accept** — never wait for a group. A suite the plan marks
   `NOT ON <server>` queues for a different slot rather than being downgraded onto it.

2a. **A MIXED suite is split by CASE, not sent whole to the browser.** A suite is no longer the unit
   of execution: `npm run suites:lanes` classifies each case, its machine-routable cases run first
   with **no browser slot** (`suites:machine`), the browser agent gets a much smaller
   `suite-{ID}-resolved.browser.csv`, and `npm run suites:merge` folds the fragments into the
   canonical `suite-{ID}-results.json`. Such a suite's browser-slot demand is the size of its
   browser list, so packing improves for free. **This is why the lane list above is three and the
   orchestrator's is four** — `split` is a per-case decision it makes at dispatch, not a lane the
   planner assigns. Mechanics, invariants and the merge contract:
   `.claude/agents/regression-orchestrator.md` Step 3.

3. Fill `.claude/agents/test-runner-agent.md` with the suite parameters, including **`{{LANE_ID}}`** — it
   selects the credential slot, and there are only 3 seeded accounts, so two concurrent suites must
   never share one.

Full mechanics, including why each of these was a hand-derived decision that went wrong on the
record: `.claude/agents/regression-orchestrator.md` Steps 1.5–4.

> **Why not batches of 3.** Dispatching in fixed groups and waiting for the whole group means each
> group costs its SLOWEST suite while the other slots idle; continuous refill with longest-first
> order costs the packing instead. **`regression:plan` prints both numbers for the selection you are
> about to run — read them there rather than from a figure quoted here**, which is a measurement of
> one manifest state and drifts with every suite change (the pair that used to sit in this
> paragraph did). The plan also states the saving honestly when there is none: a selection whose
> critical path is a single long suite reports a saving near zero rather than implying one.

### Step 5 — Monitor, Retry, Continue
- **React to the first suite that settles, not to a batch.** Update the status tracker for that
  suite, free its slot, and immediately dispatch the next eligible one.
- On failure: retry with the next browser in the fallback chain (max 2 retries) — put the retry back
  in the queue instead of blocking the lane on it.
- On environment unreachable: stop all remaining suites.

### Step 5.5 — Correlate App Insights logs (run window)

Catch backend errors the suites *triggered but didn't surface* — 5xx, failed dependencies, server exceptions, GraphQL `errors[]` inside a 200. This reuses `/qa-monitoring`'s machinery scoped to the run window: **query → dedup → triage**, no separate live-repro phase (the suite agents were already live — an error in-window *is* the repro). Applies to every run.

1. **Pre-flight.** Confirm App Insights access as `/qa-monitoring` Phase 0 does (Azure MCP `applicationinsights`, **or** `APPINSIGHTS_APP_ID_*` + `APPINSIGHTS_API_KEY_*` set). If neither is configured → **skip with a one-line note**; never block the run on it.
2. **Query the window.** Run the probe queries from `ci/monitoring/queries/` over the Step 4 window (relative `ago()` covering first dispatch → last batch complete, +2 min buffer). Query both layers (regression spans frontend + backend suites); resolve each resource from `APPINSIGHTS_*` env vars, never hardcode.
3. **Dedup + triage.** Classify signatures against `reports/monitoring/.seen-fingerprints.json` (**read-only** — do not persist; the run window must still surface SEEN-stable errors that fired during it). Cap triage at `MONITOR_MAX_SIGNALS` (default 15) by occurrence and **log deferrals** (no silent truncation). Delegate interpretation to `qa-backend-expert` + `ci/agents/monitor-triage-agent.md`: `REAL_BUG | KNOWN_ISSUE | NOISE | CONFIG_GATED | THIRD_PARTY | TRANSIENT` + severity + confidence. When ambiguous, prefer NEEDS_REVIEW.
4. **Attribute where possible.** Correlate signal timestamps to the batch/suite running at that moment so the report can name a likely owning suite. A HIGH-confidence `REAL_BUG` is a finding even when every suite reported PASS (the UI checks missed a backend error). Do NOT draft a separate `BUG-AI-*` monitoring report — fold into the run's Bugs Found section (Step 6).

### Step 6 — Consolidate Report
Write `reports/regression/{RUN_ID}/regression-YYYY-MM-DD.md` with (the run directory from Step 2 —
not `reports/regression/` directly; the dashboard, `readRunSuites` and `/qa-triage-results` all
look inside the run folder):
- Executive summary (suites run/passed/failed, pass rate)
- Suite-by-suite results table — **split into two subsections: `Frontend Suites` (`regression/suites/Frontend/`) and `Backend Suites` (`regression/suites/Backend/`)**, classifying each suite by the layer directory its CSV lives under in `config/test-suites.json` (not by module/component). Give each subsection its own pass/fail sub-total; omit a subsection only if the run touched zero suites in that layer. Watch the loyalty split (083/083b storefront → Frontend; 075/075b/075c → Backend) and admin/GraphQL suites (050*, 0XX admin → Backend).
- Bugs found (include App Insights-correlated `REAL_BUG` signals, attributed to a suite where possible)
- App Insights (run window): correlated signal counts (real_bug / needs-review / dismissed), deferrals; reference telemetry by portal link. Skip if unconfigured
- Retry log
- Detailed results per suite

Then flip `reports/regression/test-run-status.json` to `status: "completed"` (set `finishedAt`). The Step 3 live watcher detects this, emits the final static HTML (auto-refresh removed), and exits.

**Guarantee the HTML report** (belt-and-suspenders, in case the watcher never started or was killed): run the one-shot generator once —
```
npm run report:regression -- --run-id {RUN_ID}
```
This writes `reports/regression/{RUN_ID}/regression-report.html` from the same `suite-*-results.json` files. It is idempotent with the watcher's output.

### Step 7 — Teardown (only if `--teardown` provided)

1. Invoke `/qa-seed-data teardown` to remove `AGENT-TEST-*` entities.
2. Run teardown **after** Step 6 (report is already written) so evidence of seeded data context is preserved in the report.
3. On teardown failure: log to report but do not fail the overall run — the regression results are what matter.

### Step 8 — Deliver Summary
Output concise verdict to user with pass rate, bugs, and **both report paths**:
- Markdown: `reports/regression/{RUN_ID}/regression-YYYY-MM-DD.md`
- HTML dashboard: `reports/regression/{RUN_ID}/regression-report.html` (the live dashboard, now final)

Mention seed profile used and whether teardown ran. The HTML report was generated automatically — no manual `npm run report:regression` needed.

---

## Browser Pool

Three slots. A **slot is the lane index** — it is what selects the credential row and what
`{{LANE_ID}}` carries. The browser attached to a slot is a convention, not the slot's identity
(`test-data/users/agent-user-pool.csv` binds one row per slot, and `.claude/agents/test-runner-agent.md`
treats `server_name` as advisory), so never key anything on the browser name.

| Slot | Server | Engine |
|------|--------|--------|
| 1 | playwright-chrome | chromium |
| 2 | playwright-firefox | firefox — **constrained, see below** |
| 3 | playwright-edge | chromium (`msedge` channel) |

**The fallback chain is `chrome → edge → firefox`** — read it from `config/test-suites.json`
`defaults.fallbackChain`, never from a copy. It is in that order deliberately: firefox sits **last**
because it sat second until 2026-08-05, so any suite whose first attempt failed fell straight onto
the one lane that cannot click, burning a whole retry.

> **⚠ Slot 2 (firefox) is READ-ONLY / NAVIGATION-LIGHT ONLY.** `browser_click` times out on
> Playwright's actionability "stable" gate on this storefront and across the Admin SPA, on
> fully-visible non-moving elements (confirmed independently 6×; the root cause is in the
> `@playwright/mcp` layer, not Firefox). `browser_type` and navigation work fine — it is clicking
> specifically that fails. So **never schedule a click-driven suite on firefox**: cart, checkout,
> merge, PDP interaction, sign-in, or **any** Admin SPA suite. If both Chromium slots are busy,
> **QUEUE** for the next free chrome/edge slot — a firefox placement costs a *full wasted attempt*,
> not a degraded one. This is encoded as data, not judgement: the manifest carries the slot's
> `constraint`, `clickDriven` is derived per suite at `suites:sync` time, and `regression:plan`
> marks such a suite `NOT ON <server>` so it queues instead of degrading.

**Per-slot test user credentials** — each slot has dedicated storefront accounts (personal + B2B) so
parallel agents never collide on login state. Resolve at dispatch via `@td(AGENT_POOL_SLOT_N.*)` —
the alias points at [test-data/users/agent-user-pool.csv](../../test-data/users/agent-user-pool.csv)
row where `slot` = N = `{{LANE_ID}}`.

- Slot 1 → `@td(AGENT_POOL_SLOT_1.email)` / `@td(AGENT_POOL_SLOT_1.password)` (B2B pair: `@td(AGENT_POOL_SLOT_1.b2b_email)` in `@td(AGENT_POOL_SLOT_1.b2b_org)`)
- Slot 2 → `@td(AGENT_POOL_SLOT_2.email)` / `@td(AGENT_POOL_SLOT_2.password)` (same-org pair with slot 1 when the CSV configures it that way)
- Slot 3 → `@td(AGENT_POOL_SLOT_3.email)` / `@td(AGENT_POOL_SLOT_3.password)` (different-org pair by convention)

> **There are only 3 seeded credential rows**, so two concurrent suites must never share a slot.
> Raising `MAX_PARALLEL` above 3 before rows 4–6 are seeded reintroduces account-contention BLOCKED,
> which reads as a product failure.

> **Passwords are never written here.** The CSV carries `{{VAR}}` tokens
> (`{{AGENT_SLOT1_PASSWORD}}`, `{{B2B_USER_PASSWORD}}`, …) resolved at seed/dispatch time from
> `.env.local`; safe non-prod defaults ship in `templates/.env.local.template`. This paragraph used
> to quote the literal values — in a public repo, and by then they already disagreed with the
> template. Per `.claude/rules/test-data.md`, a bare password literal in committed test data is a
> `td:reconcile` failure; that gate scans CSVs, so keeping docs clean is on the author.

Agents MUST resolve credentials via `@td()` at runtime — never hardcode in prompts.

---

## Selection Groups

**Not restated here — read them from the manifest.** `config/test-suites.json` `selections` is the
source of truth; `npm run regression:plan -- <selection>` resolves one and prints the suites, case
count and predicted makespan.

| Selection | Shape | Use Case |
|-----------|-------|----------|
| `smoke` | manifest `include` list | Daily pre-deploy |
| `critical` | manifest `include` list (P0) | P0 gate |
| `sprint` | **Plan-driven** — reads `vc/shared/docs/Sprint plans/sprint-{XX-YY}-summary.json` → `suitesActivated[]`. Falls back to the static group when no plan exists or `--no-plan` is set | Sprint release |
| `sprint:XX-YY` | Pinned to a specific sprint plan | Re-run a past sprint's regression scope |
| `full` | all suites minus the manifest's `exclude` list | Production release |
| `frontend` | `where: {layer: frontend}` minus its excludes | Frontend only |
| `backend` | `where: {layer: backend}` minus its excludes | Backend only |

> The previous version of this table hard-coded member lists and counts. It drifted far enough to
> name a suite id that does not exist (`01`) and to give `full` a count that contradicted the one in
> §Usage — two wrong numbers for the same selection in one file. Shapes are stable; membership is not.

---

## Rules
- Follow `.claude/skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- Never execute tests yourself — delegate via Task tool
- Never share browser slots between concurrent agents
- Priority order: P0 before P1 or Critical > High > Medium
- Always write test-run-status.json (external tools + the live HTML dashboard monitor it — update it at each state change so the dashboard reflects real progress)
- **Always auto-launch the live dashboard watcher (Step 3) — every run, every mode, without asking.** Spawn `npm run report:regression:watch -- --run-id {RUN_ID}` in the background immediately after writing `test-run-status.json` and before dispatching any suite agent. Never wait for the user to request it, and never ask whether to launch it — it applies to browser-pool runs and single runner-native suites (e.g. 050m) equally.
- **Split the suite-by-suite results by layer.** The Step 6 report's results table is written as two subsections — `Frontend Suites` (`regression/suites/Frontend/`) and `Backend Suites` (`regression/suites/Backend/`) — classified by the layer directory each suite's CSV lives under in `config/test-suites.json`, each with its own pass/fail sub-total. Loyalty splits across layers (083/083b → Frontend; 075/075b/075c → Backend); admin/GraphQL suites (050*, 0XX admin) → Backend.
- Read URLs from .env via `config.js`, never hardcode
- If >50% suites fail, flag as critical_failure — suggest `/qa-triage-results latest` to classify the failures (real bug vs stale test), or `/qa-test-lifecycle diff` to sync against recent code changes
- If a browser fails to launch, retry with fallback chain (see Browser Pool table above)
- `--seed` with `smoke`/`042` is rejected — smoke tests don't need seeded data; warn and skip seeding
- `--seed` runs sequentially before Step 1; it blocks the regression run and must succeed
- `--teardown` runs after the report is written; failures are logged but don't fail the run
- **Sprint-plan precedence:** When selection is `sprint`, `vc/shared/docs/Sprint plans/sprint-*-summary.json` → `suitesActivated[]` overrides the static `sprint` group from `test-suites.json`. Use `--no-plan` to opt out, `sprint:XX-YY` to pin.
- **Sprint layer modifiers:** `--frontend` / `--backend` are only valid with `sprint` / `sprint:XX-YY`; they filter the resolved `suitesActivated[]` to that layer (§5.1.1 Frontend / §5.1.2 Backend), classified by the suite's CSV layer directory in `config/test-suites.json`. Mutually exclusive; ignored (with a warning) on non-sprint selections. Do NOT confuse them with the top-level `frontend`/`backend` selections, which run every suite in a layer independent of any plan.
- **Plan-driven runs are still validated against the manifest** — every `suitesActivated[]` ID must exist in `config/test-suites.json` (warn and drop unknowns rather than failing the run).
- **No silent fallback:** if `sprint:XX-YY` is pinned but the plan file is missing, abort with a clear error instructing the user to run `/qa-test-plan {XX-YY}` first or add `--no-plan`.
- **App Insights correlation (Step 5.5)** reuses `/qa-monitoring`'s query + dedup + triage machinery (`ci/monitoring/queries/*.kql`, `reports/monitoring/.seen-fingerprints.json` read-only, `ci/agents/monitor-triage-agent.md`) scoped to the run window — **no separate live-repro phase**. Resolve resources from `APPINSIGHTS_*`, never hardcode; cap + log deferrals; skip gracefully (don't block the run) when App Insights is unconfigured. Correlated `REAL_BUG` signals fold into Bugs Found — no duplicate `BUG-AI-*` draft.
