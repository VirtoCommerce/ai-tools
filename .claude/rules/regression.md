# Regression & CI Reference

## Architecture: Testing Modes

### 1. Interactive MCP-Driven Testing (Primary)
Load a prompt template from `vc/shared/docs/prompts/`, execute via MCP browser tools with DevTools monitoring. After each flow: export HAR, capture console logs, take screenshots. Generate bug reports in `reports/bugs/`.

### 2. CI Regression via Claude Agent SDK

`ci/run-regression.ts` runs suites headless via `@anthropic-ai/claude-agent-sdk` (chrome only, up to 3 in parallel, 90-day `history.json`). The live-progress watcher, run close-out ownership and the `regression:reap` orphan backstop are specified in [`knowledge/execution/regression-pipelines.md`](../knowledge/execution/regression-pipelines.md) — read it before touching `test-run-status.json` or the watcher.

### 3. Autonomous Interactive Regression — REMOVED 2026-08-26

Do not re-create it. Why it was removed: [`docs/decisions/regression-history.md`](../../docs/decisions/regression-history.md).

### 4. Full Test Cycle CI Pipeline (Sync → Lifecycle → Regression)
`ci/run-full-cycle.ts` orchestrates a 3-phase pipeline triggered by code changes. Phase 1 (SYNC + REVIEW) uses `/qa-test-lifecycle --ci` to detect stale test cases from PRs/diffs/module updates, update Steps/Assertions, analyze coverage gaps, and run the `/qa-review-tests` **static** dimensions (1–7, 9, 10 — dim 8 needs a browser, dim 11 is the separate `ci/run-suite-audit.ts` twin). Phase 3 (REGRESSION) delegates to `ci/run-regression.ts` to execute the affected suites — the workflow's phase numbering (1 Sync · 2 Lifecycle · 3 Regression) is the one to quote. Each phase has independent skip flags and budget allocation (50%/50% of total budget). Results go to `reports/full-cycle/{RUN_ID}/`.

**Invoke:** `CHANGE_SOURCE="PR #123" npm run ci:cycle` or via `.github/workflows/full-cycle.yml`
**Triggers:** PR merge to main (auto), daily schedule (Mon-Fri 8AM UTC), manual dispatch
**npm scripts:** `ci:cycle` (full), `ci:cycle:pr` (PR-driven), `ci:cycle:sync-only` (Phase 1 only), `ci:cycle:no-sync` (skip Phase 1)

## Test Suite Manifest: `config/test-suites.json`

Central configuration for regression orchestration. Defines:
- **Browser pool**: 3 slots (playwright-chrome, playwright-firefox, playwright-edge) with fallback chain
- **Suite definitions**: one per suite in module-aligned subdirectories under `Frontend/` and `Backend/`, with id, name, CSV file path, priority, test count, assigned agent type, and tags
- **Selection groups**: `smoke`, `critical`, `sprint`, `full`, `frontend`, `backend`, plus module-specific groups (`catalog`, `search`, `orders`, `auth`, `b2b`, `marketing`, `platform`, `bopis`, `payment`, `configurable-products`, `whitelabeling`, `purchase-flow`, `loyalty`, …)
- **Defaults**: max 3 parallel agents, 2 retries, 30s retry delay, HAR capture enabled

## Regression Test Suites

Suites live in `regression/suites/`, organized by module under `Frontend/` and `Backend/`, in the enriched agent-native CSV format. **`config/test-suites.json` is the source of truth for how many there are and how many cases they hold — `npm run suites:lint` prints both.** Do not restate either number here — the two that used to sit in this paragraph were both stale when checked on 2026-09-09, which is why `DOC-006` now fails a build that reintroduces one.

### Suite inventory

Derived, not documented here — `config/test-suites.json` is the source of truth (`npm run suites:lint` prints totals). The suite-authoring RULES — globally unique case IDs, the `…A` / renumber naming convention, **XREF-001** (a dependency may not leave its suite CSV), the `078` split rationale — live in [`knowledge/execution/regression-suites.md`](../knowledge/execution/regression-suites.md). Read it before adding or splitting a suite.

**First: a suite CSV has exactly one author for the duration of a change.** Not one author per file
forever — one author per *change*: whoever is restructuring, culling or re-pointing a suite owns every
row in it until they hand it back. A second writer is forbidden even when the two are editing
"different rows", and even when both are careful. **A suite conflict is never resolved with git** —
hand it to a human or to the other author.

Why a CSV is not mergeable in practice, the disposition-is-the-artifact argument, how to fan out
analysis while serialising the write, the re-parse-after-every-write discipline (a mid-write
unparsable suite takes the manifest gate down for *everyone*), and the cross-session relay rule (a
fact sent to another session's SUBAGENT is dropped silently — the receiving session must re-issue it
in its own dispatch brief): [`knowledge/execution/regression-suites.md`](../knowledge/execution/regression-suites.md)
§Working concurrently on suites. The measured losses behind all of it:
[`docs/decisions/regression-history.md`](../../docs/decisions/regression-history.md) §Shared-tree losses.

### Selection Groups

**Membership is defined in `config/test-suites.json` `selections`, never here** — `npm run suites:lint`
prints the group count, and `npm run regression:plan -- <name>` resolves one to its actual
suite list. The table below is *when to reach for which*, which the manifest cannot tell you.

| Selection | Use Case |
|-----------|----------|
| `smoke` | Daily validation before deployment |
| `critical` | P0 suites only |
| `purchase-flow` | Cart → checkout → orders → payment, end to end |
| `catalog` · `search` · `orders` · `auth` · `b2b` · `marketing` · `platform` | One module, frontend + admin |
| `frontend` · `backend` | One layer, minus the suites the manifest excludes |
| `sprint` | **Plan-driven** — `/qa-regression sprint` reads `vc/shared/docs/Sprint plans/sprint-*-summary.json` → `suitesActivated[]` (auto-picks the most recent plan). Falls back to all P0+P1 suites when no plan exists or `--no-plan` is set |
| `sprint:XX-YY` | Re-run a past sprint's regression scope, pinned to that plan |
| `full` | Everything the manifest does not exclude — before a production release |

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

**There is no regression GitHub Actions workflow.** `regression.yml` was **removed 2026-09-08** — it ran exactly once, on 2026-02-11, from a schedule that was later commented out, and that run **failed** after 72 s. It never ran manually and never succeeded, so it documented a capability the team does not have. **The RUNNER is unaffected:** `ci/run-regression.ts` is invoked by `npm run ci:regression`, by the Docker image above, and by `full-cycle.yml` Phase 3 (Regression).

The remaining pipelines (`suite-audit.yml`, `monitor.yml`, `auto-fix.yml`, `full-cycle.yml`) still have every `cron:` **commented out**, so nothing in `ci/` runs unattended (audit 2026-09-07 §4b, D9). Re-enabling one means uncommenting its `cron:` line; until then do not describe those runs as happening.

**Teams Notifications:** After each pipeline run, `ci/notify-teams.ts` sends an Adaptive Card to the configured Teams webhook. Requires `TEAMS_WEBHOOK_URL` secret.

## On-demand references (moved out of the always-loaded tier, 2026-09-08)

Each of these is read by the step that needs it and by nothing else. Anchors (`§…`) are unchanged.

| Need | Read |
|---|---|
| Per-case lane routing (`suites:lanes` / `suites:machine` / `suites:merge`), the case filter (`suites:filter`), executability + the `EX-*` codes | [`knowledge/execution/regression-lanes.md`](../knowledge/execution/regression-lanes.md) |
| Post-run promotion `Draft → Automated` (`tc:promote`, the `PR-*` hold codes) | [`knowledge/execution/regression-promotion.md`](../knowledge/execution/regression-promotion.md) |
| Pre-authoring scaffold (`tc:alloc`, `tc:scaffold --check`, the KEEP gate) | [`knowledge/execution/regression-scaffold.md`](../knowledge/execution/regression-scaffold.md) |
| Change-scoped selection (`regression:select`), existing-coverage triage (`tc:scope`), post-run triage (`/qa-triage-results`) | [`knowledge/execution/regression-selection.md`](../knowledge/execution/regression-selection.md) |
| Storefront selectors — generated surface, `selectors:sync` / `selectors:check` | [`knowledge/execution/regression-selectors.md`](../knowledge/execution/regression-selectors.md) |
| Headless CI runner internals, the App Insights monitoring twin, the suite staleness-audit twin | [`knowledge/execution/regression-pipelines.md`](../knowledge/execution/regression-pipelines.md) |
| Suite inventory rules (unique IDs, naming, XREF-001) | [`knowledge/execution/regression-suites.md`](../knowledge/execution/regression-suites.md) |

## Prompt Templates

Key prompt templates in `vc/shared/docs/prompts/`:
- `How to test Builder.io.md` - Builder.io, Virto Pages & vc-frontend testing
- `story-testing.md` - Story-level testing prompt

> **Note:** `test-runner-agent.md` is now an agent definition at `agents/test-runner-agent.md`, not a prompt template.
