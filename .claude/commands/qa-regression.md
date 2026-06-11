---
description: "Run regression test suites in parallel. Supports scope selection: smoke, critical, sprint, full, frontend, backend, or comma-separated suite IDs. Correlates App Insights logs for the run window. Optional --seed=<profile> pre-seeds test data; --teardown removes AGENT-TEST-* entities after run."
argument-hint: "[smoke|critical|sprint|sprint:XX-YY|full|frontend|backend|01,04,06] [--autonomous] [--seed=...] [--teardown] [--no-plan]"
disable-model-invocation: true
---

# /qa-regression — Run Regression Test Suites

You are the **Regression Orchestrator** for Virto Commerce. When invoked, you execute regression test suites in parallel using the test-suites.json manifest and dedicated sub-agents with isolated browser contexts.

## Usage
```
/qa-regression                             # Default: smoke (Suite 042)
/qa-regression smoke                       # Suite 042 only (~15 min)
/qa-regression critical                    # P0 suites: 042, 039, 044, 049
/qa-regression sprint                      # Reads vc/shared/docs/Sprint plans/ for the current sprint plan and runs Section 5.1 suites; falls back to static group if no plan
/qa-regression sprint:26-09                # Pin to a specific sprint plan (reads vc/shared/docs/Sprint plans/sprint-26-09-summary.json)
/qa-regression sprint --no-plan            # Force static `sprint` selection group from test-suites.json (skip plan lookup)
/qa-regression full                        # All 99 suites (production release)
/qa-regression frontend                    # All Frontend/ suites
/qa-regression backend                     # All Backend/ suites
/qa-regression 01,04,06                    # Specific suite IDs
/qa-regression critical --autonomous       # Agent Teams mode (failure recovery + JIRA)
/qa-regression full --autonomous           # Full regression with autonomous orchestration
/qa-regression b2c --seed=b2b              # Seed B2B data before b2c suites
/qa-regression purchase-flow --seed=full --teardown   # Seed full, run, then teardown
/qa-regression marketing --seed=pricing    # Seed price lists before marketing suites
```

### Execution Modes

- **Standard mode (default):** Uses `regression-orchestrator` agent with Task dispatch. Simpler, faster for small runs.
- **Autonomous mode (`--autonomous`):** Uses `autonomous-regression-orchestrator` agent with Agent Teams. Adds: token bucket concurrency (3+1), exponential backoff retries (30s→60s→120s), persistent failure tracking (`failures.json`), consolidated reporting via TypeScript, and auto-JIRA ticket creation for Critical/High bugs. Results written to `results/{RUN_ID}/`.

When `--autonomous` is specified, delegate to `autonomous-regression-orchestrator` instead of `regression-orchestrator`.

### Optional Flags

- **`--seed=<profile>`** — Pre-seed test data via `/qa-seed-data <profile>` **before** the regression run begins. Valid profiles: `minimal`, `catalog`, `b2b`, `pricing`, `full`. Executes as Step 0.5 (see pipeline below). Skip if already seeded for the same session.
- **`--teardown`** — After the regression run completes (pass or fail), invoke `/qa-seed-data teardown` to remove all `AGENT-TEST-*` entities. Use with short-lived seed data; skip if other agents are sharing the seeded entities.
- **`--no-plan`** — Only meaningful with `sprint` selection. Skips the sprint plan lookup and falls back to the static `sprint` selection group from `config/test-suites.json`. Use when running a generic sprint-scope regression that's not tied to a specific Done sprint plan.

**Do NOT use `--seed` with `smoke`** — suite 042 validates infrastructure/login paths only and gains nothing from seeding (adds 5-15 min with no coverage benefit). Warn the user and proceed without seeding.

#### Recommended seed profile per selection

| Selection | Recommended `--seed` | Why |
|-----------|---------------------|-----|
| `smoke`, `042` | _(none)_ | Infra/login only — seeding wastes time |
| `critical` | `minimal` (optional) | P0 gate; seed only if env is known-empty |
| `catalog`, `search` | `catalog` | Products, categories, multi-currency fixtures |
| `b2c`, `auth` | `b2b` | Orgs, contacts, role-based users |
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
3. **Duplicate check** — check `reports/regression/test-run-status.json` for an active run with the same suite selection. If found, block — wait for current run to complete.
4. **Context7 query** (for `sprint` and `full` selections) — resolve `/virtocommerce/vc-docs`, query `"platform release notes recent changes"` with `tokens: 8000`. Flag any API contract changes that may cause false failures in existing test cases. Consider running `/qa-sync-tests` first if breaking changes detected.

### Step 0.5 — Seed Data (only if `--seed=<profile>` provided)

1. **Reject smoke-with-seed** — if selection is `smoke`/`042` and `--seed` is set, warn the user and skip seeding.
2. **Check fingerprint** — if `test-data/b2b/_seed-results-orgs.json` exists AND was modified within the last 2 hours AND the profile matches a prior seed, skip (reuse) and log "Seed reused from <timestamp>".
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

4. **Resolved-from-plan output** — log to the run report header:
   ```
   Selection: sprint (resolved from vc/shared/docs/Sprint plans/sprint-26-09-summary.json)
   Sprint: Sprint26-09 (2026-04-29 – 2026-05-12)
   Suites: 042, 044, 011, 036, 037, 038, 028, 029, 077, 050, 072, 072b, 052
   Test cases estimated: 63-72 (per plan)
   Plan link: vc/shared/docs/Sprint plans/sprint-26-09-test-plan.md
   ```

5. **`--no-plan` opt-out** → skip 1c entirely; use the static `sprint` group from the manifest.

**1d. Other selections** (`smoke`, `critical`, `full`, `frontend`, `backend`, comma-separated IDs) → manifest-only, no plan lookup.

### Step 2 — Generate Run ID
Create `REG-YYYY-MM-DD-HHMM` and output directory `reports/regression/{RUN_ID}/`.

### Step 3 — Initialize Status Tracker
Write `reports/regression/test-run-status.json` with all suites in `pending` state.

### Step 4 — Dispatch Sub-Agents in Batches of 3

**Record the run window start** — note the current timestamp before the first batch dispatch. The interval from here until the last batch completes defines the App Insights correlation window used in Step 5.5.

With 3 browser slots (playwright-chrome, playwright-firefox, playwright-edge):
1. Pick next 3 pending suites (P0 first, then P1, then P2)
2. Assign each a browser slot
3. Launch all 3 as parallel Task calls using the agent type from the manifest
4. Fill in `.claude/agents/qa/test-runner-agent.md` template with suite parameters

### Step 5 — Monitor, Retry, Continue
- Wait for batch to complete
- Update status tracker
- On failure: retry with next browser in fallback chain (max 2 retries)
- Free browser slots and dispatch next batch
- On environment unreachable: stop all remaining suites

### Step 5.5 — Correlate App Insights logs (run window)

Catch backend errors the suites *triggered but didn't surface* — 5xx, failed dependencies, server exceptions, GraphQL `errors[]` inside a 200. This reuses `/qa-monitoring`'s machinery scoped to the run window: **query → dedup → triage**, no separate live-repro phase (the suite agents were already live — an error in-window *is* the repro). Applies in both standard and `--autonomous` modes.

1. **Pre-flight.** Confirm App Insights access as `/qa-monitoring` Phase 0 does (Azure MCP `applicationinsights`, **or** `APPINSIGHTS_APP_ID_*` + `APPINSIGHTS_API_KEY_*` set). If neither is configured → **skip with a one-line note**; never block the run on it.
2. **Query the window.** Run the probe queries from `ci/monitoring/queries/` over the Step 4 window (relative `ago()` covering first dispatch → last batch complete, +2 min buffer). Query both layers (regression spans frontend + backend suites); resolve each resource from `APPINSIGHTS_*` env vars, never hardcode.
3. **Dedup + triage.** Classify signatures against `reports/monitoring/.seen-fingerprints.json` (**read-only** — do not persist; the run window must still surface SEEN-stable errors that fired during it). Cap triage at `MONITOR_MAX_SIGNALS` (default 15) by occurrence and **log deferrals** (no silent truncation). Delegate interpretation to `qa-backend-expert` + `ci/agents/monitor-triage-agent.md`: `REAL_BUG | KNOWN_ISSUE | NOISE | CONFIG_GATED | THIRD_PARTY | TRANSIENT` + severity + confidence. When ambiguous, prefer NEEDS_REVIEW.
4. **Attribute where possible.** Correlate signal timestamps to the batch/suite running at that moment so the report can name a likely owning suite. A HIGH-confidence `REAL_BUG` is a finding even when every suite reported PASS (the UI checks missed a backend error). Do NOT draft a separate `BUG-AI-*` monitoring report — fold into the run's Bugs Found section (Step 6).

### Step 6 — Consolidate Report
Write `reports/regression/regression-YYYY-MM-DD.md` with:
- Executive summary (suites run/passed/failed, pass rate)
- Suite-by-suite results table
- Bugs found (include App Insights-correlated `REAL_BUG` signals, attributed to a suite where possible)
- App Insights (run window): correlated signal counts (real_bug / needs-review / dismissed), deferrals; reference telemetry by portal link. Skip if unconfigured
- Retry log
- Detailed results per suite

### Step 7 — Teardown (only if `--teardown` provided)

1. Invoke `/qa-seed-data teardown` to remove `AGENT-TEST-*` entities.
2. Run teardown **after** Step 6 (report is already written) so evidence of seeded data context is preserved in the report.
3. On teardown failure: log to report but do not fail the overall run — the regression results are what matter.

### Step 8 — Deliver Summary
Output concise verdict to user with pass rate, bugs, and report path. Mention seed profile used and whether teardown ran.

---

## Browser Pool

| Slot | Server | Fallback |
|------|--------|----------|
| 1 | playwright-chrome | firefox → edge |
| 2 | playwright-firefox | chrome → edge |
| 3 | playwright-edge | chrome → firefox |

Never assign two agents to the same browser. Never use WebKit on Windows.

**Per-slot test user credentials** — each browser slot has dedicated storefront accounts (personal + B2B) so parallel agents never collide on login state. Resolve at dispatch via `@td(AGENT_POOL_SLOT_N.*)` — alias points at [test-data/users/agent-user-pool.csv](../../test-data/users/agent-user-pool.csv) row where `slot=N`.

- Slot 1 (`playwright-chrome`) → `@td(AGENT_POOL_SLOT_1.email)` / `@td(AGENT_POOL_SLOT_1.password)` (B2B pair: `@td(AGENT_POOL_SLOT_1.b2b_email)` in `@td(AGENT_POOL_SLOT_1.b2b_org)`)
- Slot 2 (`playwright-firefox`) → `@td(AGENT_POOL_SLOT_2.email)` / `@td(AGENT_POOL_SLOT_2.password)` (same-org pair with slot 1 when CSV configures it that way)
- Slot 3 (`playwright-edge`) → `@td(AGENT_POOL_SLOT_3.email)` / `@td(AGENT_POOL_SLOT_3.password)` (different-org pair by convention)

> vcst-qa values: slots 1/2/3 = `qa-agent-slot{1,2,3}@virtocommerce.com` / `TestAgent{1,2,3}!`; B2B pair: John Mitchell + Emily Johnson in TechFlow (slots 1+2), Carlos Rodriguez in BuildRight (slot 3). Customers edit `test-data/users/agent-user-pool.csv` with their own values; the slot-pair convention is preserved.

Agents MUST resolve credentials via `@td()` at runtime — never hardcode in prompts.

---

## Selection Groups (from test-suites.json)

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 01 | Daily pre-deploy |
| `critical` | 042, 039, 044, 049 | P0 gate |
| `sprint` | **Plan-driven** — reads `vc/shared/docs/Sprint plans/sprint-{XX-YY}-summary.json` → `suitesActivated[]`. Falls back to static group (all P0+P1 suites) when no plan exists or `--no-plan` is set | Sprint release |
| `sprint:XX-YY` | Pinned to a specific sprint plan | Re-run a past sprint's regression scope |
| `full` | All 36 | Production release |
| `frontend` | All Frontend/ suites | Frontend only |
| `backend` | All Backend/ suites | Backend only |

---

## Rules
- Follow `.claude/skills/qa-methodology/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- Never execute tests yourself — delegate via Task tool
- Never share browser slots between concurrent agents
- Priority order: P0 before P1 before P2
- Always write test-run-status.json (external tools monitor it)
- Read URLs from .env via `config.js`, never hardcode
- If >50% suites fail, flag as critical_failure — suggest `/qa-sync-tests` to check for stale test cases
- If a browser fails to launch, retry with fallback chain (see Browser Pool table above)
- `--seed` with `smoke`/`042` is rejected — smoke tests don't need seeded data; warn and skip seeding
- `--seed` runs sequentially before Step 1; it blocks the regression run and must succeed
- `--teardown` runs after the report is written; failures are logged but don't fail the run
- **Sprint-plan precedence:** When selection is `sprint`, `vc/shared/docs/Sprint plans/sprint-*-summary.json` → `suitesActivated[]` overrides the static `sprint` group from `test-suites.json`. Use `--no-plan` to opt out, `sprint:XX-YY` to pin.
- **Plan-driven runs are still validated against the manifest** — every `suitesActivated[]` ID must exist in `config/test-suites.json` (warn and drop unknowns rather than failing the run).
- **No silent fallback:** if `sprint:XX-YY` is pinned but the plan file is missing, abort with a clear error instructing the user to run `/qa-test-plan {XX-YY}` first or add `--no-plan`.
- **App Insights correlation (Step 5.5)** reuses `/qa-monitoring`'s query + dedup + triage machinery (`ci/monitoring/queries/*.kql`, `reports/monitoring/.seen-fingerprints.json` read-only, `ci/agents/monitor-triage-agent.md`) scoped to the run window — **no separate live-repro phase**. Resolve resources from `APPINSIGHTS_*`, never hardcode; cap + log deferrals; skip gracefully (don't block the run) when App Insights is unconfigured. Correlated `REAL_BUG` signals fold into Bugs Found — no duplicate `BUG-AI-*` draft.
